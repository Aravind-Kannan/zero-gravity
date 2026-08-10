#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

const USER_AGENT = 'ZeroGravity/1.0 (Zerops hackathon; +https://github.com/Aravind-Kannan/zero-gravity)';
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const API_DIR = path.join(ROOT, '..', 'api');
const MAX_SATELLITES = 350;

const GROUPS = [
  { slug: 'stations', group: 'station', priority: 0 },
  { slug: 'visual', group: 'visual', priority: 1 },
  { slug: 'science', group: 'science', priority: 2 },
  { slug: 'weather', group: 'weather', priority: 3 },
];

function fetchJson(url) {
  const parsed = new URL(url);
  const transport = parsed.protocol === 'http:' ? http : https;
  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        hostname: parsed.hostname,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      },
      (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
      },
    );
    req.on('error', reject);
    req.setTimeout(30_000, () => req.destroy(new Error(`timeout for ${url}`)));
    req.end();
  });
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const map = new Map();
  for (const { slug, group, priority } of GROUPS) {
    const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${slug}&FORMAT=json`;
    console.log(`Fetching ${slug}...`);
    const data = await fetchJson(url);
    for (const sat of data) {
      if (!sat?.NORAD_CAT_ID || map.has(sat.NORAD_CAT_ID)) continue;
      sat._group = group;
      sat._priority = priority;
      map.set(sat.NORAD_CAT_ID, sat);
    }
  }

  const satellites = Array.from(map.values())
    .sort((a, b) => (a._priority ?? 9) - (b._priority ?? 9))
    .slice(0, MAX_SATELLITES);

  const satellitePaths = [
    path.join(DATA_DIR, 'satellites-seed.json'),
    path.join(API_DIR, 'fallback-satellites.json'),
  ];
  for (const filePath of satellitePaths) {
    fs.writeFileSync(filePath, `${JSON.stringify(satellites, null, 2)}\n`);
    console.log(`Wrote ${satellites.length} satellites -> ${filePath}`);
  }

  console.log('Fetching crew from Open Notify...');
  const crewData = await fetchJson('http://api.open-notify.org/astros.json');
  const crew = crewData.people;
  const crewPaths = [path.join(DATA_DIR, 'crew-seed.json'), path.join(API_DIR, 'fallback-crew.json')];
  for (const filePath of crewPaths) {
    fs.writeFileSync(filePath, `${JSON.stringify(crew, null, 2)}\n`);
    console.log(`Wrote ${crew.length} crew -> ${filePath}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
