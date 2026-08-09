/** Read canonical colors from tokens.css — single source for CSS + globe/Three.js */

const FALLBACK = {
  atmosphere: 'oklch(62% 0.12 48)',
  selected: 'oklch(93% 0.008 250)',
  hover: 'oklch(98% 0.006 48)',
  pathStation: 'oklch(74% 0.18 48 / 0.33)',
  pathSatellite: 'oklch(74% 0.18 48 / 0.6)',
  types: {
    station: 'oklch(72% 0.17 48)',
    visual: 'oklch(68% 0.12 230)',
    science: 'oklch(62% 0.14 290)',
    weather: 'oklch(68% 0.12 155)',
  },
  rings: {
    station: 'oklch(72% 0.17 48 / 0.6)',
    visual: 'oklch(68% 0.12 230 / 0.53)',
    science: 'oklch(62% 0.14 290 / 0.53)',
    weather: 'oklch(68% 0.12 155 / 0.53)',
  },
};

let probe;
let cache;

function ensureProbe() {
  if (typeof document === 'undefined') return null;
  if (!probe) {
    probe = document.createElement('span');
    probe.hidden = true;
    document.documentElement.appendChild(probe);
  }
  return probe;
}

/** Resolve a CSS custom property to a computed color string (rgb/oklch). */
export function readTokenColor(name, fallback = '') {
  const el = ensureProbe();
  if (!el) return fallback;
  el.style.color = `var(${name})`;
  const value = getComputedStyle(el).color;
  return value && value !== 'rgba(0, 0, 0, 0)' ? value : fallback;
}

export function getDesignTokens() {
  if (cache) return cache;

  cache = {
    atmosphere: readTokenColor('--color-globe-atmo', FALLBACK.atmosphere),
    selected: readTokenColor('--color-globe-select', FALLBACK.selected),
    hover: readTokenColor('--color-globe-hover', FALLBACK.hover),
    pathStation: readTokenColor('--color-path-station', FALLBACK.pathStation),
    pathSatellite: readTokenColor('--color-path-satellite', FALLBACK.pathSatellite),
    types: {
      station: readTokenColor('--color-type-station', FALLBACK.types.station),
      visual: readTokenColor('--color-type-visual', FALLBACK.types.visual),
      science: readTokenColor('--color-type-science', FALLBACK.types.science),
      weather: readTokenColor('--color-type-weather', FALLBACK.types.weather),
    },
    rings: {
      station: readTokenColor('--color-type-station-ring', FALLBACK.rings.station),
      visual: readTokenColor('--color-type-visual-ring', FALLBACK.rings.visual),
      science: readTokenColor('--color-type-science-ring', FALLBACK.rings.science),
      weather: readTokenColor('--color-type-weather-ring', FALLBACK.rings.weather),
    },
  };

  return cache;
}

export function refreshDesignTokens() {
  cache = null;
  return getDesignTokens();
}
