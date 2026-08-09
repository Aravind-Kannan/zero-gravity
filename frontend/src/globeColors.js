/** WebGL-safe colors for globe.gl — hex / rgba only (no oklch) */

export const TYPE_HEX = {
  station: '#9ae600',
  visual: '#38bdf8',
  science: '#c084fc',
  weather: '#facc15',
};

export const STREAM_RGBA = {
  station: 'rgba(154, 230, 0, 0.95)',
  visual: 'rgba(56, 189, 248, 0.88)',
  science: 'rgba(192, 132, 252, 0.88)',
  weather: 'rgba(250, 204, 21, 0.88)',
};

/** @deprecated */
export const RING_RGBA = STREAM_RGBA;

export const GLOBE_UI = {
  atmosphere: '#9ae600',
  selected: '#ecfccb',
  hover: '#f7fee7',
  pathStation: 'rgba(154, 230, 0, 0.45)',
  pathSatellite: 'rgba(154, 230, 0, 0.55)',
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
