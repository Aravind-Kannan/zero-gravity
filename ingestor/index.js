const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL;
const redisHost = process.env.REDIS_HOST || 'cache';
const redisPort = Number(process.env.REDIS_PORT || 6379);
const redisPassword = process.env.REDIS_PASSWORD || undefined;

const CELESTRAK_GROUPS = [
  { slug: 'stations', group: 'station', priority: 0 },
  { slug: 'visual', group: 'visual', priority: 1 },
  { slug: 'science', group: 'science', priority: 2 },
  { slug: 'weather', group: 'weather', priority: 3 },
];

const MAX_SATELLITES = 350;

const redis = redisUrl
  ? new Redis(redisUrl)
  : new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
    });

redis.on('connect', () => console.log('[Ingestor] Connected to KeyDB/Valkey cache successfully'));
redis.on('error', (err) => console.error('[Ingestor] Redis Client Error:', err.message));

async function fetchGroup(slug) {
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${slug}&FORMAT=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${slug} HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchSatellites() {
  try {
    console.log('[Ingestor] Fetching live satellite telemetry from CelesTrak...');
    const results = await Promise.allSettled(
      CELESTRAK_GROUPS.map(({ slug }) => fetchGroup(slug)),
    );

    const map = new Map();

    CELESTRAK_GROUPS.forEach(({ slug, group, priority }, idx) => {
      const result = results[idx];
      if (result.status !== 'fulfilled') {
        console.warn(`[Ingestor] CelesTrak group "${slug}" failed:`, result.reason?.message);
        return;
      }

      for (const sat of result.value) {
        if (!sat?.NORAD_CAT_ID || map.has(sat.NORAD_CAT_ID)) continue;
        sat._group = group;
        sat._priority = priority;
        map.set(sat.NORAD_CAT_ID, sat);
      }
    });

    const combined = Array.from(map.values())
      .sort((a, b) => (a._priority ?? 9) - (b._priority ?? 9))
      .slice(0, MAX_SATELLITES);

    if (combined.length > 0) {
      await redis.set('satellites:live', JSON.stringify(combined), 'EX', 90);
      console.log(`[Ingestor] Cached ${combined.length} satellites (stations + visual + science + weather)`);
    } else {
      console.warn('[Ingestor] Empty response from all CelesTrak groups');
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
        await redis.set('iss:crew', JSON.stringify(data.people), 'EX', 90);
        console.log(`[Ingestor] Successfully cached ${data.people.length} crew members into 'iss:crew' (TTL 90s)`);
      }
    }
  } catch (err) {
    console.error('[Ingestor] Failed fetching crew roster:', err.message);
  }
}

async function poll() {
  await Promise.allSettled([fetchSatellites(), fetchCrew()]);
}

poll();
setInterval(poll, 30000);
