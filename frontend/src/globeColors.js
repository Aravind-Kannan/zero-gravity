/** WebGL-safe colors for globe.gl — hex / rgba only (no oklch) */

export const TYPE_HEX = {
  station: '#f0aa55',
  visual: '#6eb5e8',
  science: '#a892e8',
  weather: '#5ecfaa',
};

export const STREAM_RGBA = {
  station: 'rgba(240, 170, 85, 0.95)',
  visual: 'rgba(110, 181, 232, 0.88)',
  science: 'rgba(168, 146, 232, 0.88)',
  weather: 'rgba(94, 207, 170, 0.88)',
};

/** @deprecated */
export const RING_RGBA = STREAM_RGBA;

export const GLOBE_UI = {
  atmosphere: '#d4954f',
  selected: '#f5f4fa',
  hover: '#fffaf2',
  pathStation: 'rgba(232, 160, 74, 0.45)',
  pathSatellite: 'rgba(232, 160, 74, 0.55)',
};

export function typeHex(group) {
  return TYPE_HEX[group] || TYPE_HEX.visual;
}

export function streamRgba(group) {
  return STREAM_RGBA[group] || STREAM_RGBA.visual;
}

export function ringRgba(group) {
  return streamRgba(group);
}
