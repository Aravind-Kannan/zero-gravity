import React, { useState, useEffect, useRef, useMemo } from 'react';
import Globe from 'react-globe.gl';
import { 
  Globe as GlobeIcon, 
  Satellite, 
  Users, 
  Search, 
  Compass, 
  RefreshCw, 
  Radio,
  ShieldCheck,
  Zap,
  Navigation
} from 'lucide-react';

// Helper function to resolve Satellite Country Flag Emoji
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

// Helper function to resolve Astronaut Country Flag Emoji
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
    height: typeof window !== 'undefined' ? window.innerHeight : 800
  });

  const [satellites, setSatellites] = useState([]);
  const [crew, setCrew] = useState([]);
  const [source, setSource] = useState('connecting');
  const [selectedSat, setSelectedSat] = useState(null);
  const [filter, setFilter] = useState('all'); // all, station, visual
  const [search, setSearch] = useState('');
  const [lastSync, setLastSync] = useState(new Date());
  const [autoRotate, setAutoRotate] = useState(true);

  // Responsive window resize handler
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch telemetry & crew from API endpoint
  const fetchData = async () => {
    try {
      const [satRes, crewRes] = await Promise.all([
        fetch('/api/satellites').then(r => r.json()),
        fetch('/api/crew').then(r => r.json())
      ]);

      if (satRes && satRes.satellites) {
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

      if (crewRes && crewRes.crew) {
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

  // Configure Globe camera auto rotation
  useEffect(() => {
    if (globeEl.current) {
      globeEl.current.controls().autoRotate = autoRotate;
      globeEl.current.controls().autoRotateSpeed = 0.6;
    }
  }, [autoRotate]);

  // Filtered satellite dataset
  const filteredSatellites = useMemo(() => {
    return satellites.filter(s => {
      const matchesFilter = filter === 'all' || s.group === filter;
      const matchesSearch = !search || 
        s.name.toLowerCase().includes(search.toLowerCase()) || 
        String(s.catId).includes(search);
      return matchesFilter && matchesSearch;
    });
  }, [satellites, filter, search]);

  // Prepare orbital trajectory arcs for 3D Globe
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
        color: sat.group === 'station' ? '#ff0055' : '#00f0ff',
        points
      };
    });
  }, [filteredSatellites]);

  // Pulsing target rings for space stations
  const ringData = useMemo(() => {
    return satellites
      .filter(s => s.group === 'station' || s.name.includes('ISS') || s.name.includes('TIANGONG'))
      .map(s => ({
        lat: s.lat,
        lng: s.lng,
        maxR: 8,
        propagationSpeed: 3,
        repeatPeriod: 1500,
        color: s.name.includes('ISS') ? '#ff0055' : '#10b981'
      }));
  }, [satellites]);

  // Center camera on chosen satellite
  const focusSat = (sat) => {
    setSelectedSat(sat);
    if (globeEl.current && sat) {
      globeEl.current.pointOfView(
        { lat: sat.lat, lng: sat.lng, altitude: 1.8 },
        1200
      );
    }
  };

  const stationsCount = satellites.filter(s => s.group === 'station').length;
  const visualCount = satellites.filter(s => s.group === 'visual').length;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#05070f] text-slate-100 font-sans select-none">
      
      {/* BACKGROUND 3D GLOBE CANVAS */}
      <div className="absolute inset-0 z-0">
        <Globe
          ref={globeEl}
          width={dimensions.width}
          height={dimensions.height}
          globeImageUrl="https://unpkg.com/three-globe/example/img/earth-night.jpg"
          bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
          backgroundImageUrl="https://unpkg.com/three-globe/example/img/night-sky.png"
          showAtmosphere={true}
          atmosphereColor="#00f0ff"
          atmosphereAltitude={0.2}

          // Points Layer
          pointsData={filteredSatellites}
          pointLat="lat"
          pointLng="lng"
          pointAltitude={d => Math.min(Math.max((d.alt || 400) / 2000, 0.05), 0.5)}
          pointColor={d => (d.id === selectedSat?.id ? '#ffffff' : d.group === 'station' ? '#ff0055' : '#00f0ff')}
          pointRadius={d => (d.id === selectedSat?.id ? 0.9 : d.group === 'station' ? 0.65 : 0.4)}
          pointResolution={16}
          onPointClick={focusSat}

          // HTML Elements Marker Layer with Flags
          htmlElementsData={filteredSatellites.filter(s => s.group === 'station' || s.id === selectedSat?.id)}
          htmlLat="lat"
          htmlLng="lng"
          htmlAltitude={d => Math.min(Math.max((d.alt || 400) / 2000, 0.05), 0.5) + 0.03}
          htmlElement={d => {
            const el = document.createElement('div');
            const isSelected = selectedSat?.id === d.id;
            const flag = getSatelliteFlag(d);
            el.className = 'flex items-center gap-1.5 cursor-pointer transform -translate-x-1/2 -translate-y-1/2';
            el.innerHTML = `
              <div class="px-2 py-1 bg-slate-950/90 border ${isSelected ? 'border-cyan-400 text-cyan-300 shadow-[0_0_12px_#22d3ee]' : 'border-rose-500/60 text-rose-300'} rounded-xl text-xs font-mono flex items-center gap-1.5 backdrop-blur-md">
                <span class="text-sm">${flag}</span>
                <span class="font-bold text-[11px]">${d.name}</span>
              </div>
            `;
            el.onclick = () => focusSat(d);
            return el;
          }}

          // Orbital Trajectory Lines
          pathsData={pathData}
          pathPoints="points"
          pathPointLat={p => p[0]}
          pathPointLng={p => p[1]}
          pathPointAlt={p => p[2]}
          pathColor="color"
          pathStroke={1.2}
          pathDashLength={0.15}
          pathDashGap={0.05}
          pathDashAnimateTime={5000}

          // Pulsing Target Rings
          ringsData={ringData}
          ringColor="color"
          ringMaxRadius="maxR"
          ringPropagationSpeed="propagationSpeed"
          ringRepeatPeriod="repeatPeriod"
        />
      </div>

      {/* TOP HEADER / TELEMETRY HUD */}
      <header className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-4 p-4 glass-panel rounded-2xl border border-cyan-500/20 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="relative p-2.5 bg-cyan-950/60 border border-cyan-500/40 rounded-xl text-cyan-400 glow-cyan">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-cyan-300 font-mono">
                ZERO GRAVITY
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-mono tracking-widest uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-full">
                Orbital HQ
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Live NORAD Telemetry & Astronaut Roster
            </p>
          </div>
        </div>

        {/* METRICS HUD CHIPS */}
        <div className="flex items-center flex-wrap gap-3 font-mono text-xs">
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/80 border border-slate-700/60 rounded-xl">
            <Satellite className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-400">TRACKED:</span>
            <span className="font-bold text-white text-sm">{satellites.length}</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/80 border border-slate-700/60 rounded-xl">
            <Radio className="w-4 h-4 text-rose-400" />
            <span className="text-slate-400">STATIONS:</span>
            <span className="font-bold text-rose-300 text-sm">{stationsCount}</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/80 border border-slate-700/60 rounded-xl">
            <Users className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-400">CREW:</span>
            <span className="font-bold text-emerald-300 text-sm">{crew.length}</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/80 border border-slate-700/60 rounded-xl">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-400">CACHE:</span>
            <span className={`font-bold ${source === 'cache' ? 'text-emerald-400' : 'text-amber-400'}`}>
              {source.toUpperCase()}
            </span>
          </div>

          <button 
            onClick={fetchData}
            title="Force telemetry sync"
            className="p-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-xl transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* LEFT PANEL: SEARCH & TELEMETRY INSPECTOR */}
      <div className="absolute top-28 left-4 z-10 w-80 max-h-[calc(100vh-140px)] flex flex-col gap-4 overflow-hidden">
        
        {/* Search & Filter Tabs */}
        <div className="glass-panel p-3.5 rounded-2xl flex flex-col gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search satellite name or NORAD ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-700/60 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          <div className="flex gap-1.5 p-1 bg-slate-950/60 rounded-xl border border-slate-800">
            {[
              { id: 'all', label: `ALL (${satellites.length})` },
              { id: 'station', label: `STATIONS (${stationsCount})` },
              { id: 'visual', label: `VISUAL (${visualCount})` }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`flex-1 py-1.5 text-[10px] font-mono font-medium rounded-lg transition-all ${
                  filter === tab.id 
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Selected Satellite Telemetry Inspector */}
        {selectedSat ? (
          <div className="glass-panel p-4 rounded-2xl border-l-4 border-l-cyan-400 flex flex-col gap-3 font-mono shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{getSatelliteFlag(selectedSat)}</span>
                  <span className="px-2 py-0.5 text-[9px] uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded">
                    {selectedSat.group}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mt-1 flex items-center gap-2">
                  {selectedSat.name}
                </h3>
                <p className="text-[11px] text-slate-400">NORAD ID: #{selectedSat.catId || selectedSat.id}</p>
              </div>
              <button
                onClick={() => focusSat(selectedSat)}
                className="p-2.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-xl text-xs flex items-center gap-1 transition-all"
                title="Lock camera on target"
              >
                <Compass className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-800">
              <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800">
                <div className="text-[10px] text-slate-400">LATITUDE</div>
                <div className="font-bold text-cyan-300">{selectedSat.lat?.toFixed(4)}°</div>
              </div>
              <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800">
                <div className="text-[10px] text-slate-400">LONGITUDE</div>
                <div className="font-bold text-cyan-300">{selectedSat.lng?.toFixed(4)}°</div>
              </div>
              <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800">
                <div className="text-[10px] text-slate-400">ALTITUDE</div>
                <div className="font-bold text-emerald-400">{selectedSat.alt} km</div>
              </div>
              <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800">
                <div className="text-[10px] text-slate-400">VELOCITY</div>
                <div className="font-bold text-emerald-400">{selectedSat.velocity || 7.66} km/s</div>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 flex justify-between pt-1">
              <span>INCLINATION: <strong className="text-white">{selectedSat.inclination}°</strong></span>
              <span>ORBITAL PERIOD: <strong className="text-white">~92 min</strong></span>
            </div>
          </div>
        ) : null}

        {/* Directory List of Satellites */}
        <div className="glass-panel p-3 rounded-2xl flex-1 overflow-y-auto max-h-64 flex flex-col gap-1.5">
          <div className="text-[10px] font-mono text-slate-400 px-1 py-0.5 uppercase tracking-wider">
            Live Satellites Directory ({filteredSatellites.length})
          </div>
          {filteredSatellites.slice(0, 50).map(sat => (
            <button
              key={sat.id}
              onClick={() => focusSat(sat)}
              className={`flex items-center justify-between p-2 rounded-xl text-left font-mono text-xs transition-all ${
                selectedSat?.id === sat.id 
                  ? 'bg-cyan-500/20 text-white border border-cyan-500/40' 
                  : 'hover:bg-slate-800/40 text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 truncate pr-2">
                <span className="text-base select-none">{getSatelliteFlag(sat)}</span>
                <div className="truncate">
                  <div className="font-medium truncate">{sat.name}</div>
                  <div className="text-[10px] text-slate-400">#{sat.catId || sat.id}</div>
                </div>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                sat.group === 'station' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              }`}>
                {sat.alt}km
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT PANEL: ASTRONAUT CREW ROSTER */}
      <div className="absolute top-28 right-4 z-10 w-72 glass-panel p-4 rounded-2xl flex flex-col gap-3 font-mono">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">ISS Crew Roster</h2>
          </div>
          <span className="px-2 py-0.5 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full font-bold">
            {crew.length} Onboard
          </span>
        </div>

        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
          {crew.length > 0 ? (
            crew.map((ast, idx) => (
              <div 
                key={idx} 
                className="flex items-center justify-between p-2.5 bg-slate-900/60 border border-slate-800/80 rounded-xl hover:border-slate-700 transition-all text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-slate-950 border border-cyan-500/30 flex items-center justify-center text-sm">
                    {getCrewFlag(ast)}
                  </div>
                  <div>
                    <div className="font-medium text-slate-100 flex items-center gap-1.5">
                      <span>{ast.name}</span>
                    </div>
                    <div className="text-[10px] text-slate-400">Astronaut</div>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 bg-slate-800 text-cyan-300 rounded font-semibold border border-slate-700">
                  {ast.craft || 'ISS'}
                </span>
              </div>
            ))
          ) : (
            <div className="text-xs text-slate-400 p-3 text-center">Loading astronaut roster...</div>
          )}
        </div>
      </div>

      {/* BOTTOM CONTROL FOOTER */}
      <footer className="absolute bottom-4 left-4 right-4 z-10 flex items-center justify-between p-3 glass-panel rounded-xl font-mono text-xs">
        <div className="flex items-center gap-4 text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            ORBITAL SURVEILLANCE ACTIVE
          </span>
          <span className="hidden sm:inline">|</span>
          <span className="hidden sm:inline text-slate-400">
            SYNC: {lastSync.toLocaleTimeString()}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${
              autoRotate 
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm' 
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            AUTO ROTATE: {autoRotate ? 'ON' : 'OFF'}
          </button>
        </div>
      </footer>
    </div>
  );
}
