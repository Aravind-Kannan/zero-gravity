const Redis = require('ioredis');

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

redis.on('connect', () => console.log('[Ingestor] Connected to KeyDB/Valkey cache successfully'));
redis.on('error', (err) => console.error('[Ingestor] Redis Client Error:', err.message));

async function fetchSatellites() {
  try {
    console.log('[Ingestor] Fetching live satellite telemetry from CelesTrak...');
    const [resStations, resVisual] = await Promise.allSettled([
      fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json').then(r => r.json()),
      fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json').then(r => r.json()),
    ]);

    const stations = resStations.status === 'fulfilled' && Array.isArray(resStations.value) ? resStations.value : [];
    const visual = resVisual.status === 'fulfilled' && Array.isArray(resVisual.value) ? resVisual.value : [];

    const map = new Map();
    for (const sat of stations) {
      if (sat && sat.NORAD_CAT_ID) {
        sat._group = 'station';
        map.set(sat.NORAD_CAT_ID, sat);
      }
    }
    for (const sat of visual) {
      if (sat && sat.NORAD_CAT_ID && !map.has(sat.NORAD_CAT_ID)) {
        sat._group = 'visual';
        map.set(sat.NORAD_CAT_ID, sat);
      }
    }

    const combined = Array.from(map.values());
    if (combined.length > 0) {
      await redis.set('satellites:live', JSON.stringify(combined), 'EX', 60);
      console.log(`[Ingestor] Successfully cached ${combined.length} satellites into 'satellites:live' (TTL 60s)`);
    } else {
      console.warn('[Ingestor] Empty response from CelesTrak APIs');
    }
  } catch (err) {
    console.error('[Ingestor] Failed fetching satellites:', err.message);
  }
}

async function fetchCrew() {
  try {
    console.log('[Ingestor] Fetching ISS astronaut crew roster from Open Notify...');
    const res = await fetch('http://api.open-notify.org/astros.json');
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.people)) {
        await redis.set('iss:crew', JSON.stringify(data.people), 'EX', 60);
        console.log(`[Ingestor] Successfully cached ${data.people.length} crew members into 'iss:crew' (TTL 60s)`);
      }
    }
  } catch (err) {
    console.error('[Ingestor] Failed fetching crew roster:', err.message);
  }
}

async function poll() {
  await Promise.allSettled([fetchSatellites(), fetchCrew()]);
}

// Initial ingestion on boot & scheduled 30s tick
poll();
setInterval(poll, 30000);
