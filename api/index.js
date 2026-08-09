const express = require('express');
const cors = require('cors');
const Redis = require('ioredis');
const satellite = require('satellite.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const redisUrl = process.env.REDIS_URL;
const redisHost = process.env.REDIS_HOST || 'cache';
const redisPort = Number(process.env.REDIS_PORT || 6379);
const redisPassword = process.env.REDIS_PASSWORD || undefined;

const redis = redisUrl
  ? new Redis(redisUrl)
  : new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
    });

redis.on('connect', () => console.log('[API] Connected to KeyDB/Valkey cache'));
redis.on('error', (err) => console.error('[API] Redis Client Error:', err.message));

const FALLBACK_SATELLITES = [
  { id: 25544, name: 'ISS (ZARYA)', catId: 25544, lat: 28.5383, lng: -80.6489, alt: 420.5, inclination: 51.64, group: 'station', velocity: 7.66 },
  { id: 48274, name: 'CSS (TIANGONG)', catId: 48274, lat: -15.2341, lng: 110.4321, alt: 390.2, inclination: 41.52, group: 'station', velocity: 7.68 },
  { id: 20580, name: 'HST (HUBBLE)', catId: 20580, lat: 12.3412, lng: -45.1290, alt: 535.0, inclination: 28.47, group: 'visual', velocity: 7.59 },
  { id: 25989, name: 'TERRA', catId: 25989, lat: -60.4123, lng: 30.1245, alt: 705.1, inclination: 98.21, group: 'visual', velocity: 7.50 },
  { id: 27424, name: 'AQUA', catId: 27424, lat: 55.2341, lng: -120.3412, alt: 705.3, inclination: 98.20, group: 'visual', velocity: 7.50 },
  { id: 43013, name: 'TESS', catId: 43013, lat: 40.1298, lng: -105.2389, alt: 500.4, inclination: 28.50, group: 'visual', velocity: 7.61 }
];

const FALLBACK_CREW = [
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
  { name: 'Ye Guangfu', craft: 'Tiangong' }
];

function keplerToLatSpace(item, now = new Date()) {
  const inc = (item.INCLINATION || 51.6) * (Math.PI / 180);
  const raan = (item.RA_OF_ASC_NODE || 0) * (Math.PI / 180);
  const argP = (item.ARG_OF_PERICENTER || 0) * (Math.PI / 180);
  const meanM = (item.MEAN_ANOMALY || 0) * (Math.PI / 180);
  const meanMotion = item.MEAN_MOTION || 15.5;
  
  const nRadSec = (meanMotion * 2 * Math.PI) / 86400;
  const a = Math.cbrt(398600.4418 / (nRadSec * nRadSec));
  const alt = Math.max(a - 6371, 350);

  const gmst = satellite.gstime(now);

  const epochDate = item.EPOCH ? new Date(item.EPOCH) : now;
  const dt = (now - epochDate) / 1000;
  const currentMeanAnomaly = (meanM + nRadSec * dt) % (2 * Math.PI);

  const e = item.ECCENTRICITY || 0.001;
  const trueAnomaly = currentMeanAnomaly + 2 * e * Math.sin(currentMeanAnomaly);
  const u = argP + trueAnomaly;

  const r = a * (1 - e * Math.cos(currentMeanAnomaly));

  const xECI = r * (Math.cos(u) * Math.cos(raan) - Math.sin(u) * Math.sin(raan) * Math.cos(inc));
  const yECI = r * (Math.cos(u) * Math.sin(raan) + Math.sin(u) * Math.cos(raan) * Math.cos(inc));
  const zECI = r * (Math.sin(u) * Math.sin(inc));

  const geodetic = satellite.eciToGeodetic({ x: xECI, y: yECI, z: zECI }, gmst);
  const lat = satellite.degreesLat(geodetic.latitude);
  const lng = satellite.degreesLong(geodetic.longitude);
  const vel = Math.sqrt(398600.4418 / a);

  return {
    lat: Number(lat.toFixed(4)),
    lng: Number(lng.toFixed(4)),
    alt: Number(alt.toFixed(1)),
    velocity: Number(vel.toFixed(2))
  };
}

function propagateSatellites(rawList) {
  const now = new Date();
  const processed = [];

  for (const item of rawList) {
    try {
      const orb = keplerToLatSpace(item, now);
      if (isNaN(orb.lat) || isNaN(orb.lng)) continue;

      processed.push({
        id: item.NORAD_CAT_ID || item.OBJECT_ID || Math.floor(Math.random() * 100000),
        name: item.OBJECT_NAME || 'Orbital Platform',
        catId: item.NORAD_CAT_ID,
        lat: orb.lat,
        lng: orb.lng,
        alt: orb.alt,
        inclination: item.INCLINATION ? Number(item.INCLINATION.toFixed(2)) : 51.64,
        velocity: orb.velocity,
        group: item._group || (item.OBJECT_NAME && item.OBJECT_NAME.includes('ISS') ? 'station' : 'visual'),
      });
    } catch (e) {
      // skip item if math fails
    }
  }
  return processed;
}

app.get('/', (req, res) => {
  res.json({ service: 'zero-gravity-api', status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/status', (req, res) => {
  res.json({ status: 'ok', service: 'api' });
});

app.get('/api/satellites', async (req, res) => {
  try {
    const data = await redis.get('satellites:live');
    if (data) {
      const rawList = JSON.parse(data);
      if (Array.isArray(rawList) && rawList.length > 0) {
        const computed = propagateSatellites(rawList);
        return res.json({
          source: 'cache',
          count: computed.length,
          satellites: computed
        });
      }
    }
    console.log('[API] Cache empty/warming, serving fallback satellite dataset');
    res.json({ source: 'fallback', count: FALLBACK_SATELLITES.length, satellites: FALLBACK_SATELLITES });
  } catch (err) {
    console.error('[API] GET /api/satellites error:', err.message);
    res.json({ source: 'fallback', count: FALLBACK_SATELLITES.length, satellites: FALLBACK_SATELLITES });
  }
});

app.get('/api/crew', async (req, res) => {
  try {
    const data = await redis.get('iss:crew');
    if (data) {
      const crewList = JSON.parse(data);
      if (Array.isArray(crewList) && crewList.length > 0) {
        return res.json({ source: 'cache', count: crewList.length, crew: crewList });
      }
    }
    console.log('[API] Cache empty/warming, serving fallback crew roster');
    res.json({ source: 'fallback', count: FALLBACK_CREW.length, crew: FALLBACK_CREW });
  } catch (err) {
    console.error('[API] GET /api/crew error:', err.message);
    res.json({ source: 'fallback', count: FALLBACK_CREW.length, crew: FALLBACK_CREW });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[API] Server initialized & listening on http://0.0.0.0:${PORT}`);
});
