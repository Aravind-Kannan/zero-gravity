/** Altitude bands & orbit helpers — compressed scale for readable globe depth */

/** three-globe / globe.gl default scene radius */
export const GLOBE_RADIUS = 100;

function normLng(lng) {
  let v = lng;
  while (v > 180) v -= 360;
  while (v < -180) v += 360;
  return v;
}

/**
 * Map real altitude (km) → globe.gl units (fraction of globe radius above surface).
 * Log-compressed banding: LEO floats visibly above surface, GEO higher still.
 */
function orbitBandT(sat) {
  const alt = Math.max(sat?.alt ?? 400, 180);
  return Math.min(Math.max(Math.log10(alt / 180) / Math.log10(36000 / 180), 0), 1);
}

/** Orbit anchor — points, rings, path, stem tip */
export function orbitAnchorAltitude(sat) {
  const t = orbitBandT(sat);
  return 0.09 + t * 0.24;
}

/** @deprecated alias — same as orbit anchor */
export function satelliteDisplayAltitude(sat) {
  return orbitAnchorAltitude(sat);
}

/** 3D mesh body — suspended above anchor (stem hangs down to orbit level) */
export function meshObjectAltitude(sat) {
  const anchor = orbitAnchorAltitude(sat);
  const lift = sat?.group === 'station' ? 0.058 : 0.042;
  return anchor + lift;
}

/** Label pill — below mesh body, above anchor */
export function meshLabelAltitude(sat) {
  const mesh = meshObjectAltitude(sat);
  const drop = sat?.group === 'station' ? 0.022 : 0.018;
  return mesh - drop;
}

/** Local -Y stem tip on mesh — downlink attaches here */
export function stemAnchorLocalY(group) {
  return group === 'station' ? 0.76 : 0.44;
}

/** Downlink length (local mesh units) so stream reaches globe surface */
export function downlinkReachLength(sat, scale = 3.6) {
  const meshAlt = meshObjectAltitude(sat);
  const toSurface = meshAlt * GLOBE_RADIUS;
  const anchor = stemAnchorLocalY(sat?.group);
  const local = toSurface / Math.max(scale, 0.01) - anchor;
  return Math.max(0.5, local);
}

export function altitudeBand(sat) {
  const alt = sat?.alt ?? 400;
  if (alt >= 10000) return 'geo';
  if (alt >= 2000) return 'meo';
  return 'leo';
}

export function altitudeBandLabel(sat) {
  const band = altitudeBand(sat);
  if (band === 'geo') return 'GEO / HEO';
  if (band === 'meo') return 'MEO';
  return 'LEO';
}

export function buildOrbitPath(sat, steps = 72) {
  if (!sat) return [];

  const inc = ((sat.inclination ?? 51.6) * Math.PI) / 180;
  const startLng = sat.lng ?? 0;
  const pathAlt = satelliteDisplayAltitude(sat);
  const points = [];

  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    const t = frac * 2 * Math.PI;
    const lat = Math.asin(Math.max(-1, Math.min(1, Math.sin(inc) * Math.sin(t)))) * (180 / Math.PI);
    const lng = normLng(startLng + frac * 360);
    points.push([lat, lng, pathAlt]);
  }

  return points;
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function proximityDegrees(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return (2 * Math.asin(Math.sqrt(Math.min(1, a))) * 180) / Math.PI;
}

export function findNearestSatellite(lat, lng, satellites, maxDegrees = 6) {
  if (lat == null || lng == null || !satellites?.length) return null;
  let nearest = null;
  let minDist = maxDegrees;
  for (const sat of satellites) {
    const dist = proximityDegrees(lat, lng, sat.lat, sat.lng);
    if (dist < minDist) {
      minDist = dist;
      nearest = sat;
    }
  }
  return nearest;
}

export function buildPointTooltip(d) {
  const name = escapeHtml(d.name);
  const alt = d.alt != null ? `${d.alt} km` : '—';
  const band = altitudeBandLabel(d);
  return `<div class="zg-globe-tooltip"><strong>${name}</strong><span>${alt} · ${band}</span></div>`;
}
