const fs = require('node:fs');
const path = require('node:path');
const Redis = require('ioredis');
const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

const SATELLITES_SEED_PATH = path.join(__dirname, 'data', 'satellites-seed.json');
const CREW_SEED_PATH = path.join(__dirname, 'data', 'crew-seed.json');

const USER_AGENT = 'ZeroGravity/1.0 (Zerops hackathon; +https://github.com/Aravind-Kannan/zero-gravity)';
const REQUEST_TIMEOUT_MS = 60_000;
const CELESTRAK_TIMEOUT_MS = 30_000;
const CELESTRAK_PROBE_TIMEOUT_MS = 15_000;
const CELESTRAK_MIN_POLL_MS = Number(process.env.CELESTRAK_POLL_MS || 2 * 60 * 60 * 1000);
const CELESTRAK_GROUP_DELAY_MS = Number(process.env.CELESTRAK_GROUP_DELAY_MS || 15_000);
const CELESTRAK_CACHE_TTL_SEC = Number(process.env.CELESTRAK_CACHE_TTL_SEC || 7200);
const CELESTRAK_BLOCK_BACKOFF_MS = Number(process.env.CELESTRAK_BLOCK_BACKOFF_MS || 2 * 60 * 60 * 1000);
const CELESTRAK_OVERLOAD_BACKOFF_MS = 30 * 60 * 1000;
const CREW_POLL_INTERVAL_MS = 60_000;
const CELESTRAK_BLOCK_KEY = 'celestrak:blocked_until';
const CELESTRAK_LAST_FETCH_KEY = 'celestrak:last_fetch_at';
const INGESTOR_DEBUG =
  process.env.INGESTOR_DEBUG === '1' || process.env.INGESTOR_DEBUG === 'true';

function debug(...args) {
  if (INGESTOR_DEBUG) console.log('[Ingestor][debug]', ...args);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function classifyCelesTrakError(err) {
  const msg = formatFetchError(err);
  if (/HTTP 403/.test(msg)) return 'blocked';
  if (/HTTP 301|HTTP 404/.test(msg)) return 'bad_url';
  if (/HTTP 50\d/.test(msg)) return 'server_overload';
  if (/connect\/headers|ECONNREFUSED|ETIMEDOUT|ECONNRESET|ENOTFOUND/.test(msg)) {
    return 'likely_blocked';
  }
  return 'transient';
}

async function getBlockedUntil() {
  const value = await redis.get(CELESTRAK_BLOCK_KEY);
  return value ? Number(value) : 0;
}

async function markBlocked(reason, backoffMs = CELESTRAK_BLOCK_BACKOFF_MS) {
  const until = Date.now() + backoffMs;
  await redis.set(CELESTRAK_BLOCK_KEY, String(until), 'EX', Math.ceil(backoffMs / 1000));
  console.error(
    `[Ingestor] CelesTrak access paused (${reason}) until ${new Date(until).toISOString()} — do not retry before then`,
  );
  return until;
}

async function clearBlockState() {
  await redis.del(CELESTRAK_BLOCK_KEY);
}

function readSeedJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`seed file empty or invalid: ${filePath}`);
  }
  return parsed;
}

async function seedSatellitesFromFile({ force = false } = {}) {
  if (!fs.existsSync(SATELLITES_SEED_PATH)) {
    debug(`Satellite seed file missing: ${SATELLITES_SEED_PATH}`);
    return false;
  }

  if (!force) {
    const existing = await redis.get('satellites:live');
    if (existing) {
      debug('Satellite seed skipped — cache already populated');
      return false;
    }
  }

  const satellites = readSeedJson(SATELLITES_SEED_PATH);
  await redis.set('satellites:live', JSON.stringify(satellites), 'EX', CELESTRAK_CACHE_TTL_SEC);
  console.log(
    `[Ingestor] Seeded ${satellites.length} satellites from bundled CelesTrak snapshot (${path.basename(SATELLITES_SEED_PATH)})`,
  );
  return true;
}

async function seedCrewFromFile({ force = false } = {}) {
  if (!fs.existsSync(CREW_SEED_PATH)) {
    debug(`Crew seed file missing: ${CREW_SEED_PATH}`);
    return false;
  }

  if (!force) {
    const existing = await redis.get('iss:crew');
    if (existing) {
      debug('Crew seed skipped — cache already populated');
      return false;
    }
  }

  const crew = readSeedJson(CREW_SEED_PATH);
  await redis.set('iss:crew', JSON.stringify(crew), 'EX', 300);
  console.log(
    `[Ingestor] Seeded ${crew.length} crew members from bundled snapshot (${path.basename(CREW_SEED_PATH)})`,
  );
  return true;
}

async function shouldSkipCelesTrakFetch() {
  const blockedUntil = await getBlockedUntil();
  if (Date.now() < blockedUntil) {
    console.warn(
      `[Ingestor] CelesTrak fetch skipped — backoff active until ${new Date(blockedUntil).toISOString()}`,
    );
    return true;
  }

  const lastFetch = await redis.get(CELESTRAK_LAST_FETCH_KEY);
  if (lastFetch) {
    const elapsedMs = Date.now() - Number(lastFetch);
    if (elapsedMs < CELESTRAK_MIN_POLL_MS) {
      const nextFetchAt = new Date(Number(lastFetch) + CELESTRAK_MIN_POLL_MS).toISOString();
      debug(`CelesTrak fetch skipped — next allowed at ${nextFetchAt}`);
      return true;
    }
  }

  return false;
}

async function httpsGetJson(url, { timeoutMs = REQUEST_TIMEOUT_MS, label } = {}) {
  const parsed = new URL(url);
  const transport = parsed.protocol === 'http:' ? http : https;
  const startedAt = Date.now();
  const tag = label ? ` (${label})` : '';

  debug(`GET ${parsed.hostname}${parsed.pathname}${parsed.search}${tag} timeout=${timeoutMs}ms`);

  return new Promise((resolve, reject) => {
    let settled = false;
    let headersAt;
    let deadline;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      fn(value);
    };

    const req = transport.request(
      {
        hostname: parsed.hostname,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
      },
      (res) => {
        headersAt = Date.now();
        debug(
          `HTTP ${res.statusCode} headers in ${headersAt - startedAt}ms${tag} bytes=${res.headers['content-length'] ?? 'unknown'}`,
        );

        if (res.statusCode < 200 || res.statusCode >= 300) {
          finish(reject, new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          try {
            debug(`Body ${body.length} bytes in ${Date.now() - startedAt}ms${tag}`);
            finish(resolve, JSON.parse(body.toString('utf8')));
          } catch (err) {
            finish(reject, err);
          }
        });
        res.on('error', (err) => finish(reject, err));
      },
    );

    deadline = setTimeout(() => {
      const phase = headersAt ? 'body read' : 'connect/headers';
      req.destroy(new Error(`request timeout during ${phase} after ${Date.now() - startedAt}ms`));
    }, timeoutMs);

    req.on('error', (err) => finish(reject, err));
    req.end();
  });
}

async function fetchJson(
  url,
  { retries = 3, backoffMs = 2000, timeoutMs = REQUEST_TIMEOUT_MS, label } = {},
) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const attemptStartedAt = Date.now();
    try {
      const data = await httpsGetJson(url, { timeoutMs, label });
      debug(`${label || url} succeeded on attempt ${attempt}/${retries} in ${Date.now() - attemptStartedAt}ms`);
      return data;
    } catch (err) {
      lastErr = err;
      const elapsedMs = Date.now() - attemptStartedAt;
      console.warn(
        `[Ingestor] Fetch attempt ${attempt}/${retries} failed${label ? ` (${label})` : ''} after ${elapsedMs}ms:`,
        formatFetchError(err),
      );
      if (attempt < retries) {
        const waitMs = backoffMs * attempt;
        debug(`Retrying in ${waitMs}ms${label ? ` (${label})` : ''}`);
        await sleep(waitMs);
      }
    }
  }
  throw lastErr;
}

async function fetchGroup(slug) {
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${slug}&FORMAT=json`;
  const data = await fetchJson(url, {
    retries: 1,
    timeoutMs: CELESTRAK_TIMEOUT_MS,
    label: `CelesTrak/${slug}`,
  });
  return Array.isArray(data) ? data : [];
}

async function probeCelesTrakAccess() {
  if (await shouldSkipCelesTrakFetch()) {
    return 'backoff';
  }

  console.log('[Ingestor] Probing CelesTrak access (single stations request)...');
  try {
    await fetchJson('https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json', {
      retries: 1,
      timeoutMs: CELESTRAK_PROBE_TIMEOUT_MS,
      label: 'CelesTrak/probe',
    });
    await clearBlockState();
    console.log('[Ingestor] CelesTrak probe OK — egress works, IP not blocked');
    return 'ok';
  } catch (err) {
    const kind = classifyCelesTrakError(err);
    const detail = formatFetchError(err);

    if (kind === 'blocked' || kind === 'likely_blocked') {
      await markBlocked(kind === 'blocked' ? 'HTTP 403 from CelesTrak' : `connect timeout (${detail})`);
      console.error('[Ingestor] CelesTrak probe FAILED — IP likely blocked at CelesTrak firewall');
      return 'blocked';
    }

    if (kind === 'bad_url') {
      console.error(`[Ingestor] CelesTrak probe FAILED — invalid URL (${detail})`);
      return 'bad_url';
    }

    if (kind === 'server_overload') {
      await markBlocked('CelesTrak server overload', CELESTRAK_OVERLOAD_BACKOFF_MS);
      return 'server_overload';
    }

    console.warn(`[Ingestor] CelesTrak probe inconclusive (${detail})`);
    return 'transient';
  }
}

async function fetchSatellites() {
  try {
    if (await shouldSkipCelesTrakFetch()) {
      return;
    }

    console.log('[Ingestor] Fetching live satellite telemetry from CelesTrak...');
    const map = new Map();
    const cycleStartedAt = Date.now();

    for (let index = 0; index < CELESTRAK_GROUPS.length; index += 1) {
      const { slug, group, priority } = CELESTRAK_GROUPS[index];
      if (index > 0) {
        debug(`Waiting ${CELESTRAK_GROUP_DELAY_MS}ms before next CelesTrak group`);
        await sleep(CELESTRAK_GROUP_DELAY_MS);
      }

      try {
        debug(`Fetching CelesTrak group "${slug}"`);
        const sats = await fetchGroup(slug);
        for (const sat of sats) {
          if (!sat?.NORAD_CAT_ID || map.has(sat.NORAD_CAT_ID)) continue;
          sat._group = group;
          sat._priority = priority;
          map.set(sat.NORAD_CAT_ID, sat);
        }

        if (sats.length === 0) {
          console.warn(`[Ingestor] CelesTrak group "${slug}" returned no satellites`);
        } else {
          debug(`CelesTrak group "${slug}" returned ${sats.length} satellites`);
        }
      } catch (err) {
        const kind = classifyCelesTrakError(err);
        console.warn(`[Ingestor] CelesTrak group "${slug}" failed:`, formatFetchError(err));

        if (kind === 'blocked' || kind === 'likely_blocked') {
          await markBlocked(
            kind === 'blocked' ? 'HTTP 403 from CelesTrak' : 'connect timeout (firewall block)',
          );
          break;
        }

        if (kind === 'bad_url') {
          console.error('[Ingestor] CelesTrak URL rejected — stopping further group fetches');
          break;
        }

        if (kind === 'server_overload') {
          await markBlocked('CelesTrak server overload', CELESTRAK_OVERLOAD_BACKOFF_MS);
          break;
        }
      }
    }

    debug(`CelesTrak cycle finished in ${Date.now() - cycleStartedAt}ms with ${map.size} unique satellites`);

    const combined = Array.from(map.values())
      .sort((a, b) => (a._priority ?? 9) - (b._priority ?? 9))
      .slice(0, MAX_SATELLITES);

    if (combined.length > 0) {
      await redis.set('satellites:live', JSON.stringify(combined), 'EX', CELESTRAK_CACHE_TTL_SEC);
      await redis.set(CELESTRAK_LAST_FETCH_KEY, String(Date.now()), 'EX', CELESTRAK_CACHE_TTL_SEC);
      await clearBlockState();
      console.log(
        `[Ingestor] Cached ${combined.length} satellites (TTL ${CELESTRAK_CACHE_TTL_SEC}s, next fetch in ${CELESTRAK_MIN_POLL_MS / 1000}s)`,
      );
    } else {
      console.warn('[Ingestor] Empty response from all CelesTrak groups');
      await seedSatellitesFromFile({ force: true });
    }
  } catch (err) {
    console.error('[Ingestor] Failed fetching satellites:', err.message);
  }
}

const CREW_SOURCES = [
  {
    label: 'Open Notify',
    url: 'http://api.open-notify.org/astros.json',
    normalize(data) {
      return Array.isArray(data?.people) ? data.people : null;
    },
  },
  {
    label: 'ISS APIs (corquaid)',
    url: 'https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json',
    normalize(data) {
      if (!Array.isArray(data?.people)) return null;
      return data.people.map((person) => ({
        name: person.name,
        craft: person.iss ? 'ISS' : 'Tiangong',
      }));
    },
  },
];

async function fetchCrew() {
  for (const source of CREW_SOURCES) {
    try {
      console.log(`[Ingestor] Fetching crew roster from ${source.label}...`);
      const data = await fetchJson(source.url, { label: source.label });
      const people = source.normalize(data);
      if (people?.length) {
        await redis.set('iss:crew', JSON.stringify(people), 'EX', 300);
        console.log(
          `[Ingestor] Cached ${people.length} crew members from ${source.label} into 'iss:crew' (TTL 300s)`,
        );
        return;
      }
      console.warn(`[Ingestor] Crew source "${source.label}" returned no people`);
    } catch (err) {
      console.warn(`[Ingestor] Crew source "${source.label}" failed:`, formatFetchError(err));
    }
  }
  console.error('[Ingestor] All crew sources failed');
  await seedCrewFromFile({ force: true });
}

function guardedPoll(name, fn) {
  let inProgress = false;

  return async function poll() {
    if (inProgress) {
      console.warn(`[Ingestor] Skipping ${name} poll — previous cycle still running`);
      return;
    }

    inProgress = true;
    try {
      await fn();
    } finally {
      inProgress = false;
    }
  };
}

const pollCrew = guardedPoll('crew', fetchCrew);
const pollSatellites = guardedPoll('satellite', fetchSatellites);

async function main() {
  debug(
    `Config: celestrakPoll=${CELESTRAK_MIN_POLL_MS}ms groupDelay=${CELESTRAK_GROUP_DELAY_MS}ms cacheTtl=${CELESTRAK_CACHE_TTL_SEC}s blockBackoff=${CELESTRAK_BLOCK_BACKOFF_MS}ms crewPoll=${CREW_POLL_INTERVAL_MS}ms`,
  );

  await seedSatellitesFromFile();
  await seedCrewFromFile();
  await probeCelesTrakAccess();

  pollCrew();
  pollSatellites();
  setInterval(pollCrew, CREW_POLL_INTERVAL_MS);
  setInterval(pollSatellites, CELESTRAK_MIN_POLL_MS);
}

main().catch((err) => {
  console.error('[Ingestor] Startup failed:', err.message);
  process.exit(1);
});
