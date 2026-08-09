/** Demo orbital dataset for local dev when API/cache unavailable */

const DEMO_SEED = [
  { id: 25544, name: 'ISS (ZARYA)', catId: 25544, inclination: 51.64, raan: 18, argP: 90, meanAnomaly: 12, meanMotion: 15.49, altBase: 420, group: 'station' },
  { id: 48274, name: 'CSS (TIANGONG)', catId: 48274, inclination: 41.5, raan: 72, argP: 40, meanAnomaly: 88, meanMotion: 15.58, altBase: 390, group: 'station' },
  { id: 20580, name: 'HST (HUBBLE)', catId: 20580, inclination: 28.47, raan: 130, argP: 20, meanAnomaly: 200, meanMotion: 15.09, altBase: 535, group: 'visual' },
  { id: 25989, name: 'TERRA', catId: 25989, inclination: 98.2, raan: 210, argP: 0, meanAnomaly: 45, meanMotion: 14.57, altBase: 705, group: 'science' },
  { id: 27424, name: 'AQUA', catId: 27424, inclination: 98.19, raan: 280, argP: 15, meanAnomaly: 120, meanMotion: 14.57, altBase: 705, group: 'science' },
  { id: 43013, name: 'TESS', catId: 43013, inclination: 28.5, raan: 310, argP: 60, meanAnomaly: 300, meanMotion: 15.08, altBase: 500, group: 'science' },
  { id: 37820, name: 'NOAA-19', catId: 37820, inclination: 99.1, raan: 45, argP: 0, meanAnomaly: 180, meanMotion: 14.35, altBase: 870, group: 'weather' },
  { id: 43689, name: 'STARLINK-1130', catId: 43689, inclination: 53.0, raan: 95, argP: 0, meanAnomaly: 250, meanMotion: 15.05, altBase: 550, group: 'visual' },
  { id: 44713, name: 'STARLINK-1246', catId: 44713, inclination: 53.0, raan: 98, argP: 0, meanAnomaly: 20, meanMotion: 15.05, altBase: 548, group: 'visual' },
  { id: 33591, name: 'GOES-14', catId: 33591, inclination: 0.4, raan: 75, argP: 180, meanAnomaly: 0, meanMotion: 1.0027, altBase: 35786, group: 'weather' },
  { id: 41866, name: 'GOES-16', catId: 41866, inclination: 0.1, raan: -75, argP: 0, meanAnomaly: 90, meanMotion: 1.0027, altBase: 35786, group: 'weather' },
  { id: 28884, name: 'ENVISAT', catId: 28884, inclination: 98.55, raan: 160, argP: 30, meanAnomaly: 70, meanMotion: 14.36, altBase: 770, group: 'visual' },
  { id: 39634, name: 'SENTINEL-1A', catId: 39634, inclination: 98.18, raan: 340, argP: 0, meanAnomaly: 140, meanMotion: 14.59, altBase: 693, group: 'science' },
  { id: 44385, name: 'SENTINEL-6', catId: 44385, inclination: 66.0, raan: 220, argP: 45, meanAnomaly: 310, meanMotion: 12.0, altBase: 1336, group: 'visual' },
  { id: 41765, name: 'CYGNUS OA-6', catId: 41765, inclination: 51.6, raan: 25, argP: 110, meanAnomaly: 55, meanMotion: 15.48, altBase: 410, group: 'visual' },
  { id: 49260, name: 'SOYUZ MS-25', catId: 49260, inclination: 51.6, raan: 22, argP: 95, meanAnomaly: 160, meanMotion: 15.49, altBase: 415, group: 'visual' },
  { id: 44333, name: 'CREW DRAGON', catId: 44333, inclination: 51.6, raan: 20, argP: 85, meanAnomaly: 220, meanMotion: 15.49, altBase: 418, group: 'visual' },
  { id: 53021, name: 'NAUKA (MLM)', catId: 53021, inclination: 51.6, raan: 19, argP: 100, meanAnomaly: 280, meanMotion: 15.49, altBase: 422, group: 'station' },
  { id: 43700, name: 'COSMOS 2558', catId: 43700, inclination: 97.4, raan: 55, argP: 0, meanAnomaly: 190, meanMotion: 14.8, altBase: 450, group: 'visual' },
  { id: 39155, name: 'LANDSAT 8', catId: 39155, inclination: 98.2, raan: 115, argP: 0, meanAnomaly: 330, meanMotion: 14.57, altBase: 705, group: 'science' },
  { id: 40967, name: 'WORLDVIEW-3', catId: 40967, inclination: 97.9, raan: 185, argP: 0, meanAnomaly: 15, meanMotion: 14.6, altBase: 617, group: 'visual' },
  { id: 43205, name: 'FENGYUN-3D', catId: 43205, inclination: 98.5, raan: 250, argP: 0, meanAnomaly: 75, meanMotion: 14.55, altBase: 836, group: 'visual' },
  { id: 44804, name: 'YAOGAN-34', catId: 44804, inclination: 63.4, raan: 305, argP: 0, meanAnomaly: 240, meanMotion: 13.2, altBase: 1100, group: 'visual' },
  { id: 40128, name: 'IRIDIUM 98', catId: 40128, inclination: 86.4, raan: 140, argP: 0, meanAnomaly: 105, meanMotion: 14.34, altBase: 780, group: 'visual' },
  { id: 43476, name: 'JASON-3', catId: 43476, inclination: 66.0, raan: 265, argP: 0, meanAnomaly: 350, meanMotion: 12.0, altBase: 1330, group: 'visual' },
  { id: 25338, name: 'GPS IIF-12', catId: 25338, inclination: 55.0, raan: 200, argP: 0, meanAnomaly: 60, meanMotion: 2.0, altBase: 20200, group: 'visual' },
  { id: 37763, name: 'GLONASS-M', catId: 37763, inclination: 64.8, raan: 330, argP: 0, meanAnomaly: 130, meanMotion: 2.01, altBase: 19100, group: 'visual' },
  { id: 43226, name: 'BEIDOU-3 M17', catId: 43226, inclination: 55.0, raan: 45, argP: 0, meanAnomaly: 270, meanMotion: 2.0, altBase: 21500, group: 'visual' },
];

export const DEMO_CREW = [
  { name: 'Oleg Kononenko', craft: 'ISS' },
  { name: 'Nikolai Chub', craft: 'ISS' },
  { name: 'Tracy Caldwell Dyson', craft: 'ISS' },
  { name: 'Matthew Dominick', craft: 'ISS' },
  { name: 'Michael Barratt', craft: 'ISS' },
  { name: 'Jeanette Epps', craft: 'ISS' },
  { name: 'Sunita Williams', craft: 'ISS' },
  { name: 'Butch Wilmore', craft: 'ISS' },
  { name: 'Li Guangsu', craft: 'Tiangong' },
  { name: 'Li Cong', craft: 'Tiangong' },
  { name: 'Ye Guangfu', craft: 'Tiangong' },
];

function deg(n) { return (n * 180) / Math.PI; }

function normLng(lng) {
  let v = lng;
  while (v > 180) v -= 360;
  while (v < -180) v += 360;
  return v;
}

/** Propagate circular-ish orbits for a lively local demo */
export function propagateDemoSatellites(now = new Date()) {
  const t = now.getTime() / 1000;

  return DEMO_SEED.map((seed) => {
    const inc = (seed.inclination * Math.PI) / 180;
    const raan = (seed.raan * Math.PI) / 180;
    const argP = (seed.argP * Math.PI) / 180;
    const n = (seed.meanMotion * 2 * Math.PI) / 86400;
    const M0 = (seed.meanAnomaly * Math.PI) / 180;
    const M = M0 + n * t;
    const u = argP + M;
    const r = 6371 + seed.altBase;

    const x = r * (Math.cos(u) * Math.cos(raan) - Math.sin(u) * Math.sin(raan) * Math.cos(inc));
    const y = r * (Math.cos(u) * Math.sin(raan) + Math.sin(u) * Math.cos(raan) * Math.cos(inc));
    const z = r * (Math.sin(u) * Math.sin(inc));

    const lat = deg(Math.asin(Math.max(-1, Math.min(1, z / r))));
    const lng = normLng(deg(Math.atan2(y, x)));
    const alt = Number(seed.altBase.toFixed(1));
    const velocity = Number(Math.sqrt(398600.4418 / r).toFixed(2));

    return {
      id: seed.catId || seed.id,
      name: seed.name,
      catId: seed.catId,
      lat: Number(lat.toFixed(4)),
      lng: Number(lng.toFixed(4)),
      alt,
      inclination: seed.inclination,
      velocity,
      group: seed.group,
    };
  });
}

export function getDemoPayload(now = new Date()) {
  return {
    satellites: propagateDemoSatellites(now),
    crew: DEMO_CREW,
    source: 'demo',
  };
}
