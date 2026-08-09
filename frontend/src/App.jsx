import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Globe from 'react-globe.gl';
import {
  Satellite,
  Users,
  Search,
  Compass,
  RefreshCw,
  Radio,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  createDayNightGlobeMaterial,
  updateGlobeSun,
  updateGlobeRotation,
} from './globeDayNight.js';
import { getDemoPayload, propagateDemoSatellites } from './mockData.js';
import { satelliteDisplayAltitude, meshObjectAltitude, altitudeBandLabel, findNearestSatellite } from './orbitPath.js';
import { getGroupColor, getGroupLabel, getGroupAbbrev, GROUP_META } from './satelliteTypes.js';
import { GLOBE_UI } from './globeColors.js';
import { tickDownlinkOnObject, retuneDownlinkOnObject } from './transmissionPing.js';
import { getGlobeSatObject } from './globeObjectCache.js';
import { placeOnGlobe, applySelectionScale, applySelectionHighlight } from './globeObjectUpdate.js';
import { mergeSatelliteList, mergeSatelliteListInPlace, filterSatellites, catalogKey, registerGlobeMesh, forEachGlobeMesh, pruneGlobeMeshRegistry } from './globeSatelliteLayer.js';
import { downlinkReachLength } from './orbitPath.js';

const IS_DEV = import.meta.env.DEV;
const PROXIMITY_DEG = 7;
const ZOOM = { min: 0.35, max: 4.5, step: 0.28, default: 2.5 };
const DEMO_TICK_MS = 5000;
const UI_SYNC_MS = 5000;
const FETCH_MS = IS_DEV ? 30000 : 10000;

function clampZoom(alt) {
  return Math.min(ZOOM.max, Math.max(ZOOM.min, alt));
}

function zoomToSlider(alt) {
  const t = (ZOOM.max - clampZoom(alt)) / (ZOOM.max - ZOOM.min);
  return Math.round(t * 100);
}

function sliderToZoom(value) {
  return clampZoom(ZOOM.max - (value / 100) * (ZOOM.max - ZOOM.min));
}

function useMobileGlobe() {
  const [mobile, setMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 47.99rem), (pointer: coarse)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 47.99rem), (pointer: coarse)');
    const update = () => setMobile(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return mobile;
}

function getSatelliteFlag(sat) {
  const name = (sat?.name || '').toUpperCase();
  if (name.includes('ISS') || name.includes('ZARYA')) return '🌐';
  if (name.includes('TIANGONG') || name.includes('TIANHE') || name.includes('WENTIAN') || name.includes('MENGTIAN') || name.includes('SHENZHOU') || name.includes('TIANZHOU') || name.includes('CZ-') || name.includes('YAOGAN') || name.includes('GXIBA')) return '🇨🇳';
  if (name.includes('POISK') || name.includes('NAUKA') || name.includes('PROGRESS') || name.includes('SOYUZ') || name.includes('COSMOS') || name.includes('KOSMOS') || name.includes('RUBIN') || name.includes('FREGAT')) return '🇷🇺';
  if (name.includes('SENTINEL') || name.includes('ENVISAT') || name.includes('ARIANE') || name.includes('PROBA') || name.includes('METOP') || name.includes('LEOPARD')) return '🇪🇺';
  if (name.includes('ALOS') || name.includes('HTV') || name.includes('IBUKI') || name.includes('KIKU')) return '🇯🇵';
  if (name.includes('CARTOSAT') || name.includes('GSAT') || name.includes('INSAT') || name.includes('PSLV') || name.includes('RISAT')) return '🇮🇳';
  if (name.includes('KNACKSAT')) return '🇹🇭';
  if (name.includes('HMU-SAT')) return '🇻🇳';
  if (name.includes('RADARSAT')) return '🇨🇦';
  return '🇺🇸';
}

function getCrewFlag(person) {
  const name = (person?.name || '').toLowerCase();
  const craft = (person?.craft || '').toLowerCase();

  if (craft.includes('tiangong') || name.includes('li ') || name.includes('ye ') || name.includes('fei ') || name.includes('deng ') || name.includes('zhang ')) return '🇨🇳';
  if (name.includes('kononenko') || name.includes('chub') || name.includes('grebenkin') || name.includes('prokopiev') || name.includes('petelin') || name.includes('borisov') || name.includes('sergey') || name.includes('oleg') || name.includes('dmitry') || name.includes('nikolai') || name.includes('alexander')) return '🇷🇺';
  if (name.includes('pesquet')) return '🇫🇷';
  if (name.includes('cristoforetti')) return '🇮🇹';
  if (name.includes('mogensen')) return '🇩🇰';
  if (name.includes('furukawa') || name.includes('wakata') || name.includes('onishi')) return '🇯🇵';
  return '🇺🇸';
}

export default function App() {
  const globeEl = useRef();
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  const [crew, setCrew] = useState([]);
  const [source, setSource] = useState('connecting');
  const [selectedSat, setSelectedSat] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [lastSync, setLastSync] = useState(new Date());
  const [autoRotate, setAutoRotate] = useState(true);
  const [globeReady, setGlobeReady] = useState(false);
  const [globeMaterial, setGlobeMaterial] = useState(null);
  const [mobileView, setMobileView] = useState('globe');
  const [isDemo, setIsDemo] = useState(false);
  const [hoverSat, setHoverSat] = useState(null);
  const [fetchState, setFetchState] = useState('idle');
  const [zoomAlt, setZoomAlt] = useState(ZOOM.default);
  const [uiTick, setUiTick] = useState(0);
  const isMobileGlobe = useMobileGlobe();
  const selectedSatRef = useRef(null);
  const selectedIdRef = useRef(null);
  const satellitesMaster = useRef([]);

  useEffect(() => {
    selectedSatRef.current = selectedSat;
    selectedIdRef.current = selectedSat?.id ?? null;
  }, [selectedSat]);

  const applyDemoData = useCallback((now = new Date()) => {
    const demo = getDemoPayload(now);
    const merged = mergeSatelliteList(satellitesMaster.current, demo.satellites);
    satellitesMaster.current = merged;
    setUiTick(t => t + 1);
    setCrew(demo.crew);
    setSource('demo');
    setIsDemo(true);
    setLastSync(now);

    const current = selectedSatRef.current;
    if (!current && merged.length > 0) {
      setSelectedSat(merged.find(s => s.name.includes('ISS')) || merged[0]);
    } else if (current) {
      const updated = merged.find(s => s.id === current.id);
      if (updated && updated !== current) setSelectedSat(updated);
    }
  }, []);

  const configureGlobeControls = (rotate) => {
    if (!globeEl.current) return;
    const controls = globeEl.current.controls?.();
    if (!controls) return;
    controls.autoRotate = rotate;
    controls.autoRotateSpeed = 0.6;
  };

  const setGlobeAltitude = useCallback((alt, { animate = false } = {}) => {
    if (!globeEl.current) return;
    const next = clampZoom(alt);
    const pov = globeEl.current.pointOfView?.() || { lat: 0, lng: 0, altitude: ZOOM.default };
    globeEl.current.pointOfView(
      { lat: pov.lat, lng: pov.lng, altitude: next },
      animate ? 350 : 0,
    );
    setZoomAlt(next);
  }, []);

  const nudgeZoom = useCallback((direction) => {
    setGlobeAltitude(zoomAlt - direction * ZOOM.step, { animate: true });
  }, [zoomAlt, setGlobeAltitude]);

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchData = async () => {
    setFetchState('loading');
    try {
      const [satRes, crewRes] = await Promise.all([
        fetch('/api/satellites').then(r => {
          if (!r.ok) throw new Error(`satellites ${r.status}`);
          return r.json();
        }),
        fetch('/api/crew').then(r => {
          if (!r.ok) throw new Error(`crew ${r.status}`);
          return r.json();
        }),
      ]);

      if (satRes?.satellites?.length) {
        mergeSatelliteListInPlace(satellitesMaster.current, satRes.satellites);
        setUiTick(t => t + 1);
        setSource(satRes.source || 'live');
        setIsDemo(false);
        const merged = satellitesMaster.current;
        const current = selectedSatRef.current;
        if (!current) {
          setSelectedSat(merged.find(s => s.name.includes('ISS')) || merged[0]);
        } else {
          const updated = merged.find(s => s.id === current.id);
          if (updated && updated !== current) setSelectedSat(updated);
        }
      } else if (IS_DEV) {
        applyDemoData();
      }

      if (crewRes?.crew?.length) {
        setCrew(crewRes.crew);
      }

      setLastSync(new Date());
      setFetchState('idle');
    } catch (err) {
      console.warn('API unavailable — using demo orbital data', err.message);
      if (IS_DEV) applyDemoData();
      setFetchState('idle');
      if (!IS_DEV) setSource('offline');
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, FETCH_MS);
    return () => clearInterval(interval);
  }, [applyDemoData]);

  useEffect(() => {
    if (!isDemo) return undefined;
    const tick = () => {
      mergeSatelliteListInPlace(satellitesMaster.current, propagateDemoSatellites(new Date()));
    };
    const uiSync = () => {
      setLastSync(new Date());
      setUiTick(t => t + 1);
    };
    tick();
    const orbitInterval = setInterval(tick, DEMO_TICK_MS);
    const uiInterval = setInterval(uiSync, UI_SYNC_MS);
    return () => {
      clearInterval(orbitInterval);
      clearInterval(uiInterval);
    };
  }, [isDemo]);

  useEffect(() => {
    if (globeReady) {
      configureGlobeControls(autoRotate);
    }
  }, [autoRotate, globeReady]);

  useEffect(() => {
    let cancelled = false;
    createDayNightGlobeMaterial().then((material) => {
      if (!cancelled) setGlobeMaterial(material);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!globeMaterial) return;
    updateGlobeSun(globeMaterial, lastSync);
  }, [globeMaterial, lastSync]);

  useEffect(() => {
    if (!globeReady) return undefined;
    const pov = globeEl.current?.pointOfView?.();
    if (pov?.altitude != null) setZoomAlt(clampZoom(pov.altitude));

    const controls = globeEl.current?.controls?.();
    if (!controls) return undefined;

    const onChange = () => {
      const current = globeEl.current?.pointOfView?.();
      if (current?.altitude != null) setZoomAlt(clampZoom(current.altitude));
    };
    controls.addEventListener('change', onChange);
    return () => controls.removeEventListener('change', onChange);
  }, [globeReady]);

  useEffect(() => {
    let frame;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = (now) => {
      const globe = globeEl.current;
      if (globeMaterial) {
        const pov = globe?.pointOfView?.();
        if (pov) updateGlobeRotation(globeMaterial, pov.lng, pov.lat);
      }
      if (globe && globeReady) {
        const selectedId = selectedIdRef.current;
        forEachGlobeMesh(({ obj, sat }) => {
          if (sat.lat == null || sat.lng == null) return;
          placeOnGlobe(obj, globe, sat.lat, sat.lng, meshObjectAltitude(sat));
          const isSelected = sat.id === selectedId;
          applySelectionScale(obj, isSelected, { station: sat.group === 'station' });
          applySelectionHighlight(obj, isSelected, { station: sat.group === 'station', timeMs: now });
          const scale = obj.scale.x || 3.6;
          retuneDownlinkOnObject(obj, sat, scale, downlinkReachLength(sat, scale));
          if (!reducedMotion) tickDownlinkOnObject(obj, now);
        });
      }
      frame = requestAnimationFrame(tick);
    };
    tick(performance.now());
    return () => cancelAnimationFrame(frame);
  }, [globeReady, globeMaterial]);

  const handleGlobeZoom = useCallback(({ lng, lat }) => {
    updateGlobeRotation(globeMaterial, lng, lat);
  }, [globeMaterial]);

  const layerCatalogKey = useMemo(
    () => catalogKey(satellitesMaster.current, filter, search),
    [uiTick, filter, search],
  );

  const filteredSatellites = useMemo(
    () => filterSatellites(satellitesMaster.current, filter, search),
    [layerCatalogKey, filter, search, uiTick],
  );

  const globeLayerData = useMemo(
    () => filteredSatellites,
    [layerCatalogKey],
  );

  const selectedDisplay = useMemo(() => {
    if (!selectedSat) return null;
    return satellitesMaster.current.find(s => s.id === selectedSat.id) ?? selectedSat;
  }, [selectedSat, uiTick]);

  useEffect(() => {
    pruneGlobeMeshRegistry(new Set(filteredSatellites.map(s => s.id)));
  }, [layerCatalogKey, filteredSatellites]);

  const customThreeObject = useCallback((d) => {
    const mesh = getGlobeSatObject(d, false);
    mesh.userData.satId = d.id;
    mesh.userData.baseScale = mesh.scale.x;
    registerGlobeMesh(d.id, mesh, d);
    return mesh;
  }, []);

  const customThreeObjectUpdate = useCallback((obj, d) => {
    registerGlobeMesh(d.id, obj, d);
    const globe = globeEl.current;
    if (globe && d.lat != null && d.lng != null) {
      placeOnGlobe(obj, globe, d.lat, d.lng, meshObjectAltitude(d));
    }
  }, []);

  const pointColorFn = useCallback((d) => {
    if (d.id === selectedSat?.id) return GLOBE_UI.selected;
    if (d.id === hoverSat?.id) return GLOBE_UI.hover;
    return getGroupColor(d);
  }, [selectedSat, hoverSat]);

  useEffect(() => {
    if (!globeReady || !globeMaterial) return undefined;
    const renderer = globeEl.current?.renderer?.();
    if (!renderer) return undefined;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    globeMaterial.userData?.tuneRenderer?.(renderer);
    return undefined;
  }, [globeReady, globeMaterial]);

  useEffect(() => {
    if (!globeReady || isMobileGlobe) {
      setHoverSat(null);
      return undefined;
    }

    const onMove = (event) => {
      const globe = globeEl.current;
      if (!globe?.toGlobeCoords) return;
      const coords = globe.toGlobeCoords({ x: event.clientX, y: event.clientY });
      if (!coords) {
        setHoverSat(null);
        return;
      }
      setHoverSat(findNearestSatellite(coords.lat, coords.lng, satellitesMaster.current, PROXIMITY_DEG));
    };

    const onLeave = () => setHoverSat(null);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
    };
  }, [globeReady, isMobileGlobe, filteredSatellites]);

  const selectSat = useCallback((sat) => {
    if (!sat) return;
    setSelectedSat(sat);
    setAutoRotate(false);
    const controls = globeEl.current?.controls?.();
    if (controls) controls.autoRotate = false;
    setMobileView('track');
  }, []);

  const focusSat = useCallback((sat) => {
    selectSat(sat);
    if (globeEl.current && sat) {
      const targetAlt = 1.8;
      globeEl.current.pointOfView(
        { lat: sat.lat, lng: sat.lng, altitude: targetAlt },
        1200,
      );
      setZoomAlt(targetAlt);
    }
  }, [selectSat]);

  const handleFilterChange = (id) => {
    setFilter(id);
  };

  const stationsCount = satellitesMaster.current.filter(s => s.group === 'station').length;
  const visualCount = satellitesMaster.current.filter(s => s.group !== 'station').length;
  const trackedCount = satellitesMaster.current.length;

  const refreshBtnClass = `zg-btn zg-btn--icon zg-btn--ghost${fetchState === 'loading' ? ' is-loading' : ''}${fetchState === 'error' ? ' is-error' : ''}`;

  const trackPanel = (
    <>
      <div className="zg-panel__bar">
        <h2 className="zg-panel__head">Orbital track</h2>
        {source === 'demo' && <span className="zg-demo-badge">Demo data</span>}
        {source === 'fallback' && <span className="zg-demo-badge">Cache warming</span>}
      </div>

      <div className="zg-panel__controls">
        <div className="zg-input-wrap">
          <Search className="zg-icon zg-icon-md" aria-hidden="true" />
          <input
            type="search"
            className="zg-input"
            placeholder="Name or NORAD ID"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search satellites"
          />
        </div>

        <div className="zg-tabs" role="tablist" aria-label="Satellite filters">
          {[
            { id: 'all', short: `All ${trackedCount}`, long: `All ${trackedCount}` },
            { id: 'station', short: `Sta ${stationsCount}`, long: `Stations ${stationsCount}` },
            { id: 'visual', short: `Sats ${visualCount}`, long: `Sats ${visualCount}` },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filter === tab.id}
              className={`zg-tab${filter === tab.id ? ' is-active' : ''}`}
              onClick={(e) => {
                handleFilterChange(tab.id);
                e.currentTarget.focus({ preventScroll: true });
              }}
            >
              <span className="zg-tab__short">{tab.short}</span>
              <span className="zg-tab__long">{tab.long}</span>
            </button>
          ))}
        </div>
      </div>

      {selectedDisplay && (
        <div className="zg-inspect">
          <div className="zg-row zg-row--start">
            <span className="zg-flag" aria-hidden="true">{getSatelliteFlag(selectedDisplay)}</span>
            <span className={`zg-tag zg-tag--${selectedDisplay.group || 'visual'}`}>
              {getGroupLabel(selectedDisplay)}
            </span>
          </div>
          <div className="zg-row zg-row--between">
            <div className="zg-min-w-0">
              <h3 className="zg-inspect__name">{selectedDisplay.name}</h3>
              <p className="zg-panel__hint zg-inspect__meta">NORAD #{selectedDisplay.catId || selectedDisplay.id}</p>
            </div>
            <button
              type="button"
              className="zg-btn zg-btn--icon zg-btn--ghost zg-shrink-0"
              onClick={() => focusSat(selectedDisplay)}
              aria-label="Lock camera on target"
            >
              <Compass className="zg-icon zg-icon-md" />
            </button>
          </div>
          <div className="zg-grid">
            <div className="zg-stat">
              <div className="zg-stat__label">Latitude</div>
              <div className="zg-stat__value">{selectedDisplay.lat?.toFixed(4)}°</div>
            </div>
            <div className="zg-stat">
              <div className="zg-stat__label">Longitude</div>
              <div className="zg-stat__value">{selectedDisplay.lng?.toFixed(4)}°</div>
            </div>
            <div className="zg-stat">
              <div className="zg-stat__label">Altitude</div>
              <div className="zg-stat__value">{selectedDisplay.alt ?? '—'} km</div>
            </div>
            <div className="zg-stat">
              <div className="zg-stat__label">Orbit band</div>
              <div className="zg-stat__value">{altitudeBandLabel(selectedDisplay)}</div>
            </div>
            <div className="zg-stat">
              <div className="zg-stat__label">Velocity</div>
              <div className="zg-stat__value">
                {selectedDisplay.velocity != null ? `${selectedDisplay.velocity} km/s` : '—'}
              </div>
            </div>
          </div>
          {selectedDisplay.inclination != null && (
            <p className="zg-panel__hint">
              Inclination {selectedDisplay.inclination}°
            </p>
          )}
        </div>
      )}

      <div className="zg-panel__list">
        <p className="zg-list__meta">
          {filteredSatellites.length} objects in view
        </p>
        <div className="zg-list" role="list">
          {filteredSatellites.slice(0, 50).map(sat => (
            <button
              key={sat.id}
              type="button"
              role="listitem"
              className={`zg-list-item${selectedSat?.id === sat.id ? ' is-active' : ''}`}
              onClick={() => focusSat(sat)}
            >
              <span className="zg-row zg-row--start zg-min-w-0 zg-truncate">
                <span aria-hidden="true">{getSatelliteFlag(sat)}</span>
                <span className="zg-sat-name zg-truncate">{sat.name}</span>
              </span>
              <span className="zg-row zg-row--end zg-shrink-0">
                <span className={`zg-tag zg-tag--${sat.group || 'visual'}`}>
                  {getGroupAbbrev(sat)}
                </span>
                <span className="zg-list-item__alt">{sat.alt} km</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );

  const crewPanel = (
    <>
      <div className="zg-panel__bar">
        <h2 className="zg-panel__head">Crew roster</h2>
        <span className="zg-tag">{crew.length} onboard</span>
      </div>
      <div className="zg-panel__list">
        <div className="zg-list">
          {crew.length > 0 ? (
            crew.map((ast, idx) => (
              <div key={idx} className="zg-crew-row">
                <div className="zg-row zg-row--start zg-min-w-0">
                  <span className="zg-flag zg-shrink-0" aria-hidden="true">{getCrewFlag(ast)}</span>
                  <div className="zg-min-w-0">
                    <div className="zg-crew-row__name zg-truncate">{ast.name}</div>
                    <div className="zg-panel__hint">{ast.craft || '—'}</div>
                  </div>
                </div>
                <span className="zg-tag zg-shrink-0">{ast.craft || 'ISS'}</span>
              </div>
            ))
          ) : (
            <p className="zg-panel__hint zg-p-sm zg-text-center">Loading roster…</p>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="zg-shell">
      <div className="zg-canvas-wrap">
        <div className="zg-canvas" aria-hidden="true">
        <Globe
          ref={globeEl}
          width={dimensions.width}
          height={dimensions.height}
          globeMaterial={globeMaterial}
          backgroundImageUrl="/textures/night-sky.png"
          onGlobeReady={() => {
            setGlobeReady(true);
            configureGlobeControls(autoRotate);
          }}
          onZoom={handleGlobeZoom}
          showAtmosphere
          atmosphereColor={GLOBE_UI.atmosphere}
          atmosphereAltitude={0.22}
          pointsData={globeLayerData}
          pointLat="lat"
          pointLng="lng"
          pointAltitude={(d) => satelliteDisplayAltitude(d)}
          pointColor={pointColorFn}
          pointRadius={() => 0}
          pointResolution={8}
          onPointClick={(d) => focusSat(d)}
          customLayerData={globeLayerData}
          customThreeObject={customThreeObject}
          customThreeObjectUpdate={customThreeObjectUpdate}
          onCustomLayerClick={(d) => focusSat(d)}
          onCustomLayerHover={(d) => {
            if (!isMobileGlobe) setHoverSat(d || null);
          }}
        />
        </div>
        <div className="zg-canvas-vignette" aria-hidden="true" />

        <div className="zg-zoom" aria-label="Globe zoom">
          <button
            type="button"
            className="zg-btn zg-btn--icon zg-zoom__btn"
            onClick={() => nudgeZoom(1)}
            aria-label="Zoom in"
          >
            <ZoomIn className="zg-icon zg-icon-md" />
          </button>
          <input
            type="range"
            className="zg-zoom__range"
            min={0}
            max={100}
            value={zoomToSlider(zoomAlt)}
            onChange={(e) => setGlobeAltitude(sliderToZoom(Number(e.target.value)))}
            aria-label="Zoom level"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={zoomToSlider(zoomAlt)}
          />
          <button
            type="button"
            className="zg-btn zg-btn--icon zg-zoom__btn"
            onClick={() => nudgeZoom(-1)}
            aria-label="Zoom out"
          >
            <ZoomOut className="zg-icon zg-icon-md" />
          </button>
        </div>
      </div>

      <header className="zg-nav">
        <div className="zg-brand">
          <h1 className="zg-brand__title">
            Zero<span className="zg-brand__accent">Gravity</span>
          </h1>
          <p className="zg-brand__sub">Live NORAD telemetry</p>
          {isDemo && <span className="zg-demo-badge zg-demo-badge--inline">Local demo mode</span>}
          {source === 'fallback' && !isDemo && (
            <span className="zg-demo-badge zg-demo-badge--inline">Limited fallback feed</span>
          )}
        </div>

        <div className="zg-metrics" aria-label="Summary metrics">
          <span className="zg-metric">
            <Satellite className="zg-icon zg-icon-sm zg-icon--accent" aria-hidden="true" />
            <strong>{trackedCount}</strong>
            <span className="zg-metric__label">tracked</span>
          </span>
          <span className="zg-metric">
            <Radio className="zg-icon zg-icon-sm" aria-hidden="true" />
            <strong>{stationsCount}</strong>
            <span className="zg-metric__label">stations</span>
          </span>
          <span className="zg-metric zg-metric--live">
            <Users className="zg-icon zg-icon-sm" aria-hidden="true" />
            <strong>{crew.length}</strong>
            <span className="zg-metric__label">crew</span>
          </span>
          <span className={`zg-metric${fetchState === 'error' ? ' zg-metric--error' : ''}`}>
            <ShieldCheck className="zg-icon zg-icon-sm" aria-hidden="true" />
            <span className="zg-metric__label">source</span>
            <span className={`zg-metric__value${isDemo ? ' zg-metric__value--demo' : ''}${fetchState === 'error' ? ' zg-metric__value--error' : ''}`}>{source}</span>
          </span>
          <button
            type="button"
            className={refreshBtnClass}
            onClick={fetchData}
            disabled={fetchState === 'loading'}
            aria-busy={fetchState === 'loading'}
            aria-label="Refresh telemetry"
          >
            <RefreshCw className={`zg-icon zg-icon-md${fetchState === 'loading' ? ' zg-icon--spin' : ''}`} />
          </button>
        </div>

        <div className="zg-nav__actions">
          <button
            type="button"
            className={refreshBtnClass}
            onClick={fetchData}
            disabled={fetchState === 'loading'}
            aria-busy={fetchState === 'loading'}
            aria-label="Refresh telemetry"
          >
            <RefreshCw className={`zg-icon zg-icon-md${fetchState === 'loading' ? ' zg-icon--spin' : ''}`} />
          </button>
        </div>

        <div className="zg-mobile-metrics" aria-label="Summary metrics">
          <span className="zg-mobile-metric">
            <Satellite className="zg-icon zg-icon-sm zg-icon--accent" aria-hidden="true" />
            <strong>{trackedCount}</strong>
            <span>tracked</span>
          </span>
          <span className="zg-mobile-metric">
            <Radio className="zg-icon zg-icon-sm" aria-hidden="true" />
            <strong>{stationsCount}</strong>
            <span>stations</span>
          </span>
          <span className="zg-mobile-metric zg-mobile-metric--live">
            <Users className="zg-icon zg-icon-sm" aria-hidden="true" />
            <strong>{crew.length}</strong>
            <span>crew</span>
          </span>
          <span className={`zg-mobile-metric${fetchState === 'error' ? ' zg-mobile-metric--error' : ''}`}>
            <ShieldCheck className="zg-icon zg-icon-sm" aria-hidden="true" />
            <span className={`zg-mobile-metric__value${fetchState === 'error' ? ' zg-mobile-metric__value--error' : ''}`}>{source}</span>
          </span>
        </div>
      </header>

      <aside
        className={`zg-rail zg-rail--left${mobileView !== 'track' ? ' is-hidden' : ''}`}
        aria-label="Satellite tracking"
      >
        <div className="zg-panel zg-panel--flex">
          {trackPanel}
        </div>
      </aside>

      <aside
        className={`zg-rail zg-rail--right${mobileView === 'crew' ? ' is-open' : ''}`}
        aria-label="Crew roster"
      >
        <div className="zg-panel zg-panel--flex">
          {crewPanel}
        </div>
      </aside>

      <footer className="zg-footer">
        <span className="zg-row zg-row--start">
          <span className="zg-live-dot" aria-hidden="true" />
          <span className="zg-footer__status zg-hide-sm">Orbital feed active</span>
          <span className="zg-footer__status zg-show-sm">Live</span>
          <span className="zg-footer__sync zg-hide-md">· sync {lastSync.toLocaleTimeString()}</span>
        </span>
        <div className="zg-type-legend zg-type-legend--desktop" aria-label="Satellite types">
          {Object.entries(GROUP_META).map(([key, meta]) => (
            <span key={key} className="zg-type-legend__item">
              <i className={`zg-type-legend__dot zg-type-legend__dot--${key}`} />
              {meta.label}
            </span>
          ))}
        </div>
        <div className="zg-type-legend zg-type-legend--mobile" aria-label="Satellite types">
          {Object.entries(GROUP_META).map(([key, meta]) => (
            <span key={key} className="zg-type-legend__item" title={meta.label}>
              <i className={`zg-type-legend__dot zg-type-legend__dot--${key}`} />
              <span className="zg-type-legend__abbr">{meta.label.slice(0, 3)}</span>
            </span>
          ))}
        </div>
        <button
          type="button"
          className={`zg-btn zg-btn--compact${autoRotate ? ' zg-btn--active' : ''}`}
          onClick={() => setAutoRotate(v => !v)}
        >
          <span className="zg-footer__rotate-label">Auto-rotate </span>
          {autoRotate ? 'on' : 'off'}
        </button>
      </footer>

      <div className="zg-mobile-tabs" role="tablist" aria-label="Panels">
        <button
          type="button"
          role="tab"
          aria-selected={mobileView === 'globe'}
          className={`zg-btn${mobileView === 'globe' ? ' zg-btn--active' : ''}`}
          onClick={() => setMobileView('globe')}
        >
          Globe
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileView === 'track'}
          className={`zg-btn${mobileView === 'track' ? ' zg-btn--active' : ''}`}
          onClick={() => setMobileView('track')}
        >
          Track
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileView === 'crew'}
          className={`zg-btn${mobileView === 'crew' ? ' zg-btn--active' : ''}`}
          onClick={() => setMobileView('crew')}
        >
          Crew
        </button>
      </div>
    </div>
  );
}
