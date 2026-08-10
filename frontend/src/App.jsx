import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Globe from 'react-globe.gl';
import {
  Search,
  Compass,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronLeft,
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
const TYPE_KEYS = ['station', 'visual', 'science', 'weather'];
const DEFAULT_VISIBLE_TYPES = {
  station: true,
  visual: false,
  science: false,
  weather: false,
};
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

function getCrewCraftForSat(sat) {
  if (!sat || sat.group !== 'station') return null;
  const name = (sat.name || '').toUpperCase();
  if (
    name.includes('TIANHE')
    || name.includes('TIANGONG')
    || name.includes('CSS')
    || name.includes('WENTIAN')
    || name.includes('MENGTIAN')
  ) {
    return 'Tiangong';
  }
  if (
    name.includes('ISS')
    || name.includes('ZARYA')
    || name.includes('POISK')
    || name.includes('NAUKA')
  ) {
    return 'ISS';
  }
  return null;
}

function crewMatchesCraft(personCraft, stationCraft) {
  const person = (personCraft || '').toLowerCase();
  const station = (stationCraft || '').toLowerCase();
  if (station === 'iss') return person === 'iss';
  if (station === 'tiangong') return person.includes('tiangong');
  return person === station;
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
  const [visibleTypes, setVisibleTypes] = useState(DEFAULT_VISIBLE_TYPES);
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

  const typeCounts = useMemo(() => {
    const counts = { station: 0, visual: 0, science: 0, weather: 0 };
    for (const sat of satellitesMaster.current) {
      const group = sat.group || 'visual';
      if (group in counts) counts[group] += 1;
    }
    return counts;
  }, [uiTick]);

  const layerCatalogKey = useMemo(
    () => catalogKey(satellitesMaster.current, visibleTypes, search),
    [uiTick, visibleTypes, search],
  );

  const filteredSatellites = useMemo(
    () => filterSatellites(satellitesMaster.current, visibleTypes, search),
    [layerCatalogKey, visibleTypes, search, uiTick],
  );

  const globeLayerData = useMemo(
    () => filteredSatellites,
    [layerCatalogKey],
  );

  const selectedDisplay = useMemo(() => {
    if (!selectedSat) return null;
    return satellitesMaster.current.find(s => s.id === selectedSat.id) ?? selectedSat;
  }, [selectedSat, uiTick]);

  const stationCrew = useMemo(() => {
    if (!selectedDisplay) return { craft: null, members: [] };
    const craft = getCrewCraftForSat(selectedDisplay);
    if (!craft) return { craft: null, members: [] };
    const members = crew.filter((person) => crewMatchesCraft(person.craft, craft));
    return { craft, members };
  }, [selectedDisplay, crew]);

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
      setHoverSat(findNearestSatellite(coords.lat, coords.lng, filteredSatellites, PROXIMITY_DEG));
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
    if (isMobileGlobe) setMobileView('detail');
  }, [isMobileGlobe]);

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

  const toggleType = useCallback((typeKey) => {
    setVisibleTypes((prev) => {
      const next = { ...prev, [typeKey]: !prev[typeKey] };
      if (!TYPE_KEYS.some((key) => next[key])) return prev;
      return next;
    });
  }, []);

  const toggleAutoRotate = useCallback(() => {
    setAutoRotate((prev) => {
      const next = !prev;
      configureGlobeControls(next);
      return next;
    });
  }, []);

  const stationsCount = typeCounts.station;
  const trackedCount = satellitesMaster.current.length;
  const visibleCount = filteredSatellites.length;

  const inspectSummary = selectedDisplay ? (
    <div className="zg-inspect zg-inspect--summary">
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
  ) : null;

  const inspectCrewPane = stationCrew.craft ? (
    <div className="zg-inspect__crew zg-inspect__crew--pane">
      <div className="zg-inspect__crew-head">
        <h4 className="zg-inspect__crew-title">
          Crew onboard · {stationCrew.craft}
        </h4>
        <span className="zg-tag">{stationCrew.members.length}</span>
      </div>
      {stationCrew.members.length > 0 ? (
        <div className="zg-inspect__crew-list" role="list">
          {stationCrew.members.map((person) => (
            <div key={person.name} className="zg-crew-row zg-crew-row--compact" role="listitem">
              <span className="zg-flag zg-shrink-0" aria-hidden="true">{getCrewFlag(person)}</span>
              <span className="zg-crew-row__name zg-truncate">{person.name}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="zg-panel__hint zg-inspect__crew-empty">
          {crew.length > 0 ? 'No roster for this station' : 'Loading roster…'}
        </p>
      )}
    </div>
  ) : null;

  const inspectContent = selectedDisplay ? (
    <>
      {inspectSummary}
      {inspectCrewPane}
    </>
  ) : (
    <div className="zg-inspect-empty">
      <Compass className="zg-icon zg-icon-md zg-inspect-empty__icon" aria-hidden="true" />
      <p className="zg-inspect-empty__title">no target selected</p>
      <p className="zg-panel__hint zg-inspect-empty__hint">
        select from catalog or tap globe object
      </p>
    </div>
  );

  const catalogPanel = (
    <>
      <div className="zg-panel__bar">
        <h2 className="zg-panel__head">catalog</h2>
        {source === 'demo' && <span className="zg-term-badge">[DEMO]</span>}
        {source === 'seed' && <span className="zg-term-badge">[SNAPSHOT]</span>}
        {source === 'fallback' && <span className="zg-term-badge">[CACHE]</span>}
      </div>

      <div className="zg-panel__controls">
        <div className="zg-input-wrap">
          <Search className="zg-icon zg-icon-md" aria-hidden="true" />
          <input
            type="search"
            className="zg-input"
            placeholder="filter: name | norad_id"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search satellites"
          />
        </div>

        <div className="zg-type-toggles" role="group" aria-label="Satellite type visibility">
          {TYPE_KEYS.map((typeKey) => {
            const meta = GROUP_META[typeKey];
            const count = typeCounts[typeKey];
            const on = visibleTypes[typeKey];
            return (
              <button
                key={typeKey}
                type="button"
                aria-pressed={on}
                className={`zg-type-toggle zg-type-toggle--${typeKey}${on ? ' is-active' : ''}`}
                onClick={() => toggleType(typeKey)}
              >
                <i className={`zg-type-legend__dot zg-type-legend__dot--${typeKey}`} aria-hidden="true" />
                <span className="zg-type-toggle__label">{meta.label}</span>
                <span className="zg-type-toggle__count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="zg-panel__list">
        <p className="zg-list__meta">
          showing {visibleCount}/{trackedCount} objects
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

  const inspectPanel = (
    <>
      <div className="zg-panel__bar">
        <div className="zg-row zg-row--start zg-min-w-0">
          {isMobileGlobe && (
            <button
              type="button"
              className="zg-btn zg-btn--icon zg-btn--ghost zg-shrink-0 zg-show-sm-only"
              onClick={() => setMobileView('track')}
              aria-label="Back to catalog"
            >
              <ChevronLeft className="zg-icon zg-icon-md" />
            </button>
          )}
          <h2 className="zg-panel__head">target.inspect</h2>
        </div>
        {selectedDisplay && (
          <span className={`zg-tag zg-tag--${selectedDisplay.group || 'visual'}`}>
            {getGroupAbbrev(selectedDisplay)}
          </span>
        )}
      </div>
      <div className="zg-panel__body zg-panel__body--inspect">
        {inspectContent}
      </div>
    </>
  );

  const globeControls = (
    <div className="zg-globe-controls" aria-label="Globe controls">
      <div className="zg-globe-controls__zoom" aria-label="Globe zoom">
        <button
          type="button"
          className="zg-btn zg-btn--icon zg-zoom__btn"
          onClick={() => nudgeZoom(-1)}
          aria-label="Zoom out"
        >
          <ZoomOut className="zg-icon zg-icon-md" />
        </button>
        <input
          type="range"
          className="zg-zoom__range zg-zoom__range--horizontal"
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
          onClick={() => nudgeZoom(1)}
          aria-label="Zoom in"
        >
          <ZoomIn className="zg-icon zg-icon-md" />
        </button>
      </div>
      <span className="zg-globe-controls__sep" aria-hidden="true" />
      <button
        type="button"
        role="switch"
        aria-checked={autoRotate}
        aria-label={`Auto-rotate globe, currently ${autoRotate ? 'on' : 'off'}`}
        title={autoRotate ? 'Pause globe rotation' : 'Resume globe rotation'}
        className={`zg-rotate-toggle${autoRotate ? ' is-active' : ''}`}
        onClick={toggleAutoRotate}
      >
        <RotateCw
          className={`zg-icon zg-icon-sm zg-rotate-toggle__icon${autoRotate ? ' zg-icon--spin-slow' : ''}`}
          aria-hidden="true"
        />
        <span className="zg-rotate-toggle__label">auto-rotate</span>
        <span className="zg-rotate-toggle__track" aria-hidden="true">
          <span className="zg-rotate-toggle__thumb" />
        </span>
      </button>
    </div>
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
        {globeControls}
      </div>

      <header className="zg-nav">
        <div className="zg-brand">
          <h1 className="zg-brand__title">
            <span className="zg-brand__name">Zero Gravity</span>
            <span className="zg-brand__sep" aria-hidden="true"> · </span>
            <span className="zg-brand__tag">norad telemetry</span>
          </h1>
          {isDemo && <span className="zg-term-badge zg-term-badge--inline">[DEMO]</span>}
          {source === 'seed' && !isDemo && (
            <span className="zg-term-badge zg-term-badge--inline">[SNAPSHOT]</span>
          )}
          {source === 'fallback' && !isDemo && (
            <span className="zg-term-badge zg-term-badge--inline">[CACHE]</span>
          )}
        </div>

        <button
          type="button"
          className={`zg-nav__sync${fetchState === 'loading' ? ' is-loading' : ''}${fetchState === 'error' ? ' is-error' : ''}`}
          onClick={fetchData}
          disabled={fetchState === 'loading'}
          aria-busy={fetchState === 'loading'}
          aria-label="Sync telemetry"
        >
          [ sync ]
        </button>
      </header>

      <aside
        className={`zg-rail zg-rail--left${mobileView !== 'track' ? ' is-hidden' : ''}`}
        aria-label="Satellite catalog"
      >
        <div className="zg-panel zg-panel--flex">
          {catalogPanel}
        </div>
      </aside>

      <aside
        className={`zg-rail zg-rail--right${mobileView === 'detail' ? ' is-open' : ''}`}
        aria-label="Satellite inspect"
      >
        <div className="zg-panel zg-panel--flex">
          {inspectPanel}
        </div>
      </aside>

      <footer className="zg-footer zg-footer--dense" aria-label="Feed status">
        <p className="zg-footer__colophon">
          <span className="zg-live-dot" aria-hidden="true" />
          <span className="zg-footer__token">FEED_OK</span>
          <span className="zg-footer__sep" aria-hidden="true">·</span>
          <span className="zg-footer__token">SYNC {lastSync.toLocaleTimeString()}</span>
          <span className="zg-footer__sep" aria-hidden="true">·</span>
          <span className="zg-footer__token">TRK={trackedCount}</span>
          <span className="zg-footer__sep" aria-hidden="true">·</span>
          <span className="zg-footer__token">STA={stationsCount}</span>
          <span className="zg-footer__sep" aria-hidden="true">·</span>
          <span className="zg-footer__token">CRW={crew.length}</span>
          <span className="zg-footer__sep" aria-hidden="true">·</span>
          <span className={`zg-footer__token${fetchState === 'error' ? ' zg-footer__token--error' : ''}${isDemo ? ' zg-footer__token--demo' : ''}`}>
            SRC={source}
          </span>
          <span className="zg-footer__sep" aria-hidden="true">·</span>
          <span className="zg-footer__token">LAYERS[</span>
          {TYPE_KEYS.map((key, idx) => {
            const meta = GROUP_META[key];
            const on = visibleTypes[key];
            return (
              <React.Fragment key={key}>
                {idx > 0 && <span className="zg-footer__sep" aria-hidden="true"> </span>}
                <button
                  type="button"
                  aria-pressed={on}
                  title={meta.label}
                  className={`zg-footer__layer${on ? ' is-on' : ' is-off'}`}
                  onClick={() => toggleType(key)}
                >
                  {meta.label.slice(0, 3).toUpperCase()}
                </button>
              </React.Fragment>
            );
          })}
          <span className="zg-footer__token">]</span>
        </p>
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
          catalog
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileView === 'detail'}
          className={`zg-btn${mobileView === 'detail' ? ' zg-btn--active' : ''}`}
          onClick={() => setMobileView('detail')}
        >
          inspect
        </button>
      </div>
    </div>
  );
}
