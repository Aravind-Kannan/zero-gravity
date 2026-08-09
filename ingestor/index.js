const Redis = require('ioredis');
const https = require('node:https');
const { URL } = require('node:url');

const USER_AGENT = 'ZeroGravity/1.0 (Zerops hackathon; +https://github.com/Aravind-Kannan/zero-gravity)';
const REQUEST_TIMEOUT_MS = 60_000;

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

function formatFetchError(err) {
  const cause = err.cause?.code || err.cause?.message;
  return cause ? `${err.message} (${cause})` : err.message;
}

async function httpsGetJson(url, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const parsed = new URL(url);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (err) {
            reject(err);
          }
        });
        res.on('error', reject);
      },
    );

    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function fetchJson(url, { retries = 3, backoffMs = 2000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await httpsGetJson(url);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs * attempt));
      }
    }
  }
  throw lastErr;
}

async function fetchGroup(slug) {
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${slug}&FORMAT=json`;
  const data = await fetchJson(url);
  return Array.isArray(data) ? data : [];
}

async function fetchSatellites() {
  try {
    console.log('[Ingestor] Fetching live satellite telemetry from CelesTrak...');
    const map = new Map();

    for (const { slug, group, priority } of CELESTRAK_GROUPS) {
      try {
        const sats = await fetchGroup(slug);
        for (const sat of sats) {
          if (!sat?.NORAD_CAT_ID || map.has(sat.NORAD_CAT_ID)) continue;
          sat._group = group;
          sat._priority = priority;
          map.set(sat.NORAD_CAT_ID, sat);
        }
      } catch (err) {
        console.warn(
          `[Ingestor] CelesTrak group "${slug}" failed:`,
          formatFetchError(err),
        );
      }
    }

    const combined = Array.from(map.values())
      .sort((a, b) => (a._priority ?? 9) - (b._priority ?? 9))
      .slice(0, MAX_SATELLITES);

    if (combined.length > 0) {
      await redis.set('satellites:live', JSON.stringify(combined), 'EX', 300);
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
    const data = await fetchJson('https://api.open-notify.org/astros.json');
    if (data && Array.isArray(data.people)) {
      await redis.set('iss:crew', JSON.stringify(data.people), 'EX', 300);
      console.log(`[Ingestor] Successfully cached ${data.people.length} crew members into 'iss:crew' (TTL 300s)`);
    }
  } catch (err) {
    console.error('[Ingestor] Failed fetching crew roster:', formatFetchError(err));
  }
}

async function poll() {
  await Promise.allSettled([fetchSatellites(), fetchCrew()]);
}

poll();
setInterval(poll, 30000);
