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
} from 'lucide-react';
import {
  createDayNightGlobeMaterial,
  updateGlobeSun,
  updateGlobeRotation,
} from './globeDayNight.js';

/* Globe colors — mirror frontend/tokens.css (Midnight) */
const GLOBE = {
  atmosphere: '#c4893a',
  station: '#e8a04a',
  satellite: '#8a7355',
  selected: '#ebeaf0',
  ringIss: '#e07040',
  ringStation: '#e8a04a',
};

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

  const [satellites, setSatellites] = useState([]);
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

  const configureGlobeControls = (rotate) => {
    if (!globeEl.current) return;
    const controls = globeEl.current.controls?.();
    if (!controls) return;
    controls.autoRotate = rotate;
    controls.autoRotateSpeed = 0.6;
  };

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
    try {
      const [satRes, crewRes] = await Promise.all([
        fetch('/api/satellites').then(r => r.json()),
        fetch('/api/crew').then(r => r.json()),
      ]);

      if (satRes?.satellites) {
        setSatellites(satRes.satellites);
        setSource(satRes.source || 'live');
        if (!selectedSat && satRes.satellites.length > 0) {
          const iss = satRes.satellites.find(s => s.name.includes('ISS')) || satRes.satellites[0];
          setSelectedSat(iss);
        } else if (selectedSat) {
          const updated = satRes.satellites.find(s => s.id === selectedSat.id);
          if (updated) setSelectedSat(updated);
        }
      }

      if (crewRes?.crew) {
        setCrew(crewRes.crew);
      }

      setLastSync(new Date());
    } catch (err) {
      console.error('Error fetching orbital data:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

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
    if (!globeReady || !globeMaterial) return;
    let frame;
    const tick = () => {
      const pov = globeEl.current?.pointOfView?.();
      if (pov) updateGlobeRotation(globeMaterial, pov.lng, pov.lat);
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [globeReady, globeMaterial]);

  const handleGlobeZoom = useCallback(({ lng, lat }) => {
    updateGlobeRotation(globeMaterial, lng, lat);
  }, [globeMaterial]);

  const filteredSatellites = useMemo(() => {
    return satellites.filter(s => {
      const matchesFilter = filter === 'all' || s.group === filter;
      const matchesSearch = !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        String(s.catId).includes(search);
      return matchesFilter && matchesSearch;
    });
  }, [satellites, filter, search]);

  const pathData = useMemo(() => {
    return filteredSatellites.slice(0, 80).map(sat => {
      const points = [];
      const steps = 60;
      const incRad = (sat.inclination || 51.6) * (Math.PI / 180);
      const altNorm = Math.min(Math.max((sat.alt || 400) / 2000, 0.05), 0.5);

      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * 2 * Math.PI;
        const lat = Math.asin(Math.sin(incRad) * Math.sin(t)) * (180 / Math.PI);
        const lng = (sat.lng + (i / steps) * 360) % 360 - 180;
        points.push([lat, lng, altNorm]);
      }

      return {
        id: sat.id,
        color: sat.group === 'station' ? GLOBE.station : GLOBE.satellite,
        points,
      };
    });
  }, [filteredSatellites]);

  const ringData = useMemo(() => {
    return satellites
      .filter(s => s.group === 'station' || s.name.includes('ISS') || s.name.includes('TIANGONG'))
      .map(s => ({
        lat: s.lat,
        lng: s.lng,
        maxR: 8,
        propagationSpeed: 3,
        repeatPeriod: 1500,
        color: s.name.includes('ISS') ? GLOBE.ringIss : GLOBE.ringStation,
      }));
  }, [satellites]);

  const focusSat = useCallback((sat) => {
    setSelectedSat(sat);
    if (globeEl.current && sat) {
      globeEl.current.pointOfView(
        { lat: sat.lat, lng: sat.lng, altitude: 1.8 },
        1200,
      );
    }
  }, []);

  const handleFilterChange = (id) => {
    setFilter(id);
  };

  const stationsCount = satellites.filter(s => s.group === 'station').length;
  const visualCount = satellites.filter(s => s.group === 'visual').length;

  const renderMarker = useCallback((d) => {
    const el = document.createElement('div');
    const isSelected = selectedSat?.id === d.id;
    const isStation = d.group === 'station';
    el.className = [
      'zg-marker',
      isSelected ? 'is-selected' : '',
      isStation ? 'is-station' : '',
    ].filter(Boolean).join(' ');
    el.innerHTML = `<span>${getSatelliteFlag(d)}</span><span>${d.name}</span>`;
    el.onclick = (e) => {
      e.stopPropagation();
      focusSat(d);
    };
    return el;
  }, [selectedSat, focusSat]);

  const trackPanel = (
    <>
      <div className="zg-input-wrap">
        <Search className="w-4 h-4 zg-icon" aria-hidden="true" />
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
          { id: 'all', label: `All ${satellites.length}` },
          { id: 'station', label: `Sta ${stationsCount}` },
          { id: 'visual', label: `Vis ${visualCount}` },
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
            {tab.label}
          </button>
        ))}
      </div>

      {selectedSat && (
        <div className="zg-inspect">
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden="true">{getSatelliteFlag(selectedSat)}</span>
            <span className={`zg-tag${selectedSat.group === 'station' ? ' zg-tag--station' : ''}`}>
              {selectedSat.group}
            </span>
          </div>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="zg-inspect__name">{selectedSat.name}</h3>
              <p className="zg-panel__hint">NORAD #{selectedSat.catId || selectedSat.id}</p>
            </div>
            <button
              type="button"
              className="zg-btn zg-btn--icon zg-btn--ghost"
              onClick={() => focusSat(selectedSat)}
              aria-label="Lock camera on target"
            >
              <Compass className="w-4 h-4 zg-icon" />
            </button>
          </div>
          <div className="zg-grid">
            <div className="zg-stat">
              <div className="zg-stat__label">Latitude</div>
              <div className="zg-stat__value">{selectedSat.lat?.toFixed(4)}°</div>
            </div>
            <div className="zg-stat">
              <div className="zg-stat__label">Longitude</div>
              <div className="zg-stat__value">{selectedSat.lng?.toFixed(4)}°</div>
            </div>
            <div className="zg-stat">
              <div className="zg-stat__label">Altitude</div>
              <div className="zg-stat__value">{selectedSat.alt ?? '—'} km</div>
            </div>
            <div className="zg-stat">
              <div className="zg-stat__label">Velocity</div>
              <div className="zg-stat__value">
                {selectedSat.velocity != null ? `${selectedSat.velocity} km/s` : '—'}
              </div>
            </div>
          </div>
          {selectedSat.inclination != null && (
            <p className="zg-panel__hint mt-2">
              Inclination {selectedSat.inclination}°
            </p>
          )}
        </div>
      )}

      <div className="zg-list" role="list">
        <p className="zg-panel__hint px-1">
          {filteredSatellites.length} objects in view
        </p>
        {filteredSatellites.slice(0, 50).map(sat => (
          <button
            key={sat.id}
            type="button"
            role="listitem"
            className={`zg-list-item${selectedSat?.id === sat.id ? ' is-active' : ''}`}
            onClick={() => focusSat(sat)}
          >
            <span className="flex items-center gap-2 min-w-0 truncate">
              <span aria-hidden="true">{getSatelliteFlag(sat)}</span>
              <span className="zg-sat-name truncate">{sat.name}</span>
            </span>
            <span className={`zg-tag${sat.group === 'station' ? ' zg-tag--station' : ''}`}>
              {sat.alt}km
            </span>
          </button>
        ))}
      </div>
    </>
  );

  const crewPanel = (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 className="zg-panel__head">Crew roster</h2>
        <span className="zg-tag">{crew.length} onboard</span>
      </div>
      <div className="zg-list">
        {crew.length > 0 ? (
          crew.map((ast, idx) => (
            <div key={idx} className="zg-crew-row">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base shrink-0" aria-hidden="true">{getCrewFlag(ast)}</span>
                <div className="min-w-0">
                  <div className="zg-crew-row__name truncate">{ast.name}</div>
                  <div className="zg-panel__hint">Astronaut</div>
                </div>
              </div>
              <span className="zg-tag">{ast.craft || 'ISS'}</span>
            </div>
          ))
        ) : (
          <p className="zg-panel__hint p-2 text-center">Loading roster…</p>
        )}
      </div>
    </>
  );

  return (
    <div className="zg-shell">
      {/* Hallmark · genre: atmospheric · macrostructure: Workbench · theme: Midnight · enrichment: none · nav: N9 · footer: Ft2 */}

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
          atmosphereColor={GLOBE.atmosphere}
          atmosphereAltitude={0.18}
          pointsData={filteredSatellites}
          pointLat="lat"
          pointLng="lng"
          pointAltitude={d => Math.min(Math.max((d.alt || 400) / 2000, 0.05), 0.5)}
          pointColor={d => (d.id === selectedSat?.id ? GLOBE.selected : d.group === 'station' ? GLOBE.station : GLOBE.satellite)}
          pointRadius={d => (d.id === selectedSat?.id ? 0.9 : d.group === 'station' ? 0.65 : 0.4)}
          pointResolution={16}
          onPointClick={focusSat}
          htmlElementsData={filteredSatellites.filter(s => s.group === 'station' || s.id === selectedSat?.id)}
          htmlLat="lat"
          htmlLng="lng"
          htmlAltitude={d => Math.min(Math.max((d.alt || 400) / 2000, 0.05), 0.5) + 0.03}
          htmlElement={renderMarker}
          pathsData={pathData}
          pathPoints="points"
          pathPointLat={p => p[0]}
          pathPointLng={p => p[1]}
          pathPointAlt={p => p[2]}
          pathColor="color"
          pathStroke={1.1}
          pathDashLength={0.15}
          pathDashGap={0.05}
          pathDashAnimateTime={5000}
          ringsData={ringData}
          ringColor="color"
          ringMaxRadius="maxR"
          ringPropagationSpeed="propagationSpeed"
          ringRepeatPeriod="repeatPeriod"
        />
      </div>

      <header className="zg-nav">
        <div className="zg-brand">
          <h1 className="zg-brand__title">ZeroGravity</h1>
          <p className="zg-brand__sub">Live NORAD telemetry</p>
        </div>

        <div className="zg-metrics" aria-label="Summary metrics">
          <span className="zg-metric">
            <Satellite className="w-3.5 h-3.5 zg-icon zg-icon--accent" aria-hidden="true" />
            <strong>{satellites.length}</strong>
            <span className="zg-metric__label">tracked</span>
          </span>
          <span className="zg-metric">
            <Radio className="w-3.5 h-3.5 zg-icon" aria-hidden="true" />
            <strong>{stationsCount}</strong>
            <span className="zg-metric__label">stations</span>
          </span>
          <span className="zg-metric zg-metric--live">
            <Users className="w-3.5 h-3.5 zg-icon" aria-hidden="true" />
            <strong>{crew.length}</strong>
            <span className="zg-metric__label">crew</span>
          </span>
          <span className="zg-metric">
            <ShieldCheck className="w-3.5 h-3.5 zg-icon" aria-hidden="true" />
            <span className="zg-metric__label">source</span>
            <span className="zg-metric__value">{source}</span>
          </span>
          <button
            type="button"
            className="zg-btn zg-btn--icon zg-btn--ghost"
            onClick={fetchData}
            aria-label="Refresh telemetry"
          >
            <RefreshCw className="w-4 h-4 zg-icon" />
          </button>
        </div>

        <div className="zg-nav__actions">
          <button
            type="button"
            className="zg-btn zg-btn--icon zg-btn--ghost"
            onClick={fetchData}
            aria-label="Refresh telemetry"
          >
            <RefreshCw className="w-4 h-4 zg-icon" />
          </button>
        </div>

        <div className="zg-mobile-metrics" aria-label="Summary metrics">
          <span className="zg-mobile-metric">
            <Satellite className="w-3.5 h-3.5 zg-icon zg-icon--accent" aria-hidden="true" />
            <strong>{satellites.length}</strong>
            <span>tracked</span>
          </span>
          <span className="zg-mobile-metric">
            <Radio className="w-3.5 h-3.5 zg-icon" aria-hidden="true" />
            <strong>{stationsCount}</strong>
            <span>stations</span>
          </span>
          <span className="zg-mobile-metric zg-mobile-metric--live">
            <Users className="w-3.5 h-3.5 zg-icon" aria-hidden="true" />
            <strong>{crew.length}</strong>
            <span>crew</span>
          </span>
          <span className="zg-mobile-metric">
            <ShieldCheck className="w-3.5 h-3.5 zg-icon" aria-hidden="true" />
            <span className="zg-mobile-metric__value">{source}</span>
          </span>
        </div>
      </header>

      <aside
        className={`zg-rail zg-rail--left${mobileView !== 'track' ? ' is-hidden' : ''}`}
        aria-label="Satellite tracking"
      >
        <div className="zg-panel flex-1 min-h-0 overflow-hidden">
          {trackPanel}
        </div>
      </aside>

      <aside
        className={`zg-rail zg-rail--right${mobileView === 'crew' ? ' is-open' : ''}`}
        aria-label="Crew roster"
      >
        <div className="zg-panel flex-1 min-h-0 overflow-hidden">
          {crewPanel}
        </div>
      </aside>

      <footer className="zg-footer">
        <span className="flex items-center gap-2">
          <span className="zg-live-dot" aria-hidden="true" />
          <span className="hidden sm:inline zg-footer__status">Orbital feed active</span>
          <span className="sm:hidden zg-footer__status">Live</span>
          <span className="hidden md:inline zg-footer__sync">· sync {lastSync.toLocaleTimeString()}</span>
        </span>
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
