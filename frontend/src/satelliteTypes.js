/** Satellite group colors & type metadata */

import { streamRgba, typeHex } from './globeColors.js';

export const GROUP_META = {
  station: { label: 'Station' },
  visual: { label: 'Visual' },
  science: { label: 'Science' },
  weather: { label: 'Weather' },
};

const DEFAULT_GROUP = 'visual';

export function getSatelliteGroup(sat) {
  const group = sat?.group;
  return GROUP_META[group] ? group : DEFAULT_GROUP;
}

export function getGroupColor(sat) {
  return typeHex(getSatelliteGroup(sat));
}

export function streamRgbaForSat(sat) {
  return streamRgba(getSatelliteGroup(sat));
}

export function getGroupLabel(sat) {
  return GROUP_META[getSatelliteGroup(sat)].label;
}

export function getGroupAbbrev(sat) {
  const abbrevs = { station: 'Sta', visual: 'Vis', science: 'Sci', weather: 'Wx' };
  return abbrevs[getSatelliteGroup(sat)] || 'Vis';
}
