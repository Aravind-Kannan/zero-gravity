# ZeroGravity — Project Context for Gemini

Use this document as system or project context when assisting with the ZeroGravity codebase. Paste the full file, or relevant sections, into Gemini conversations.

---

## One-line summary

ZeroGravity is a live satellite tracker: a React + Three.js 3D globe UI backed by a Node.js ingestor/API pair and Valkey cache, deployed on Zerops for the WeMakeDevs × Zerops Hackathon.

**Live demo:** https://frontend-14c-3000.sea1.zerops.app

---

## What the product does

- Renders Earth in 3D with day/night shader, satellite markers, orbital paths, and station meshes
- Search and filter satellites by type: `station`, `visual`, `science`, `weather`
- Shows telemetry for the selected object: latitude, longitude, altitude, velocity, inclination
- Lists astronauts currently in orbit (ISS + Tiangong when Open Notify data is available)
- Polls live NORAD TLE data from CelesTrak and crew roster from Open Notify

---

## Architecture

```
CelesTrak (NORAD groups)     Open Notify (astros.json)
         │                              │
         └──────────┬───────────────────┘
                    ▼
              ingestor (Node 22)
              polls every 30s
                    │
                    ▼ writes JSON + TTL
              cache (Valkey 7.2)
                    │
                    ▼ reads
                 api (Express)
              orbital propagation
                    │
                    ▼ REST
              frontend (Vite + React)
              react-globe.gl / Three.js
```

| Service    | Hostname (Zerops) | Port | Role |
|------------|-------------------|------|------|
| `cache`    | managed Valkey    | 6379 | Shared cache; keys expire after 300s |
| `ingestor` | `ingestor`        | —    | Background worker; no public HTTP |
| `api`      | `api`             | 3000 | REST API; reads cache, propagates orbits |
| `frontend` | `frontend`        | 3000 | Serves SPA; proxies `/api/*` → `api:3000` |

---

## Repository layout

```
.
├── ingestor/              # CelesTrak + Open Notify poller
│   ├── index.js
│   └── zerops.yaml
├── api/                   # Express REST + satellite.js propagation
│   ├── index.js
│   └── zerops.yaml
├── frontend/              # Vite React app + production static server
│   ├── src/
│   │   ├── App.jsx                    # Main UI shell, globe, panels
│   │   ├── globeDayNight.js           # Day/night Earth shader
│   │   ├── globeSatelliteLayer.js     # List merge, filter, mesh registry
│   │   ├── globeObjectUpdate.js       # Placement, selection highlight
│   │   ├── globeColors.js             # Group colors (reads design tokens)
│   │   ├── designTokens.js            # CSS var → JS color bridge
│   │   ├── orbitPath.js               # Altitude bands, orbit paths, proximity
│   │   ├── satelliteTypes.js          # station / visual / science / weather meta
│   │   ├── satelliteMesh.js           # Generic satellite 3D mesh
│   │   ├── stationMesh.js             # ISS / Tiangong station meshes
│   │   ├── transmissionPing.js        # Downlink ping animation
│   │   ├── mockData.js                # Dev fallback when API unavailable
│   │   └── index.css                  # zg-* component classes
│   ├── tokens.css                     # Canonical design tokens (CSS vars)
│   ├── server.js                      # Express: static + /api proxy
│   ├── vite.config.js
│   └── zerops.yaml
├── zerops.yaml            # Root service definitions (mirrors per-service yamls)
├── design.md              # Frontend design system (read before UI work)
├── README.md
└── GEMINI.md              # This file
```

---

## Data flow & cache keys

### Ingestor (`ingestor/index.js`)

- Poll interval: **30 seconds**
- CelesTrak groups fetched (priority order): `stations`, `visual`, `science`, `weather`
- Max satellites cached: **350** (deduped by `NORAD_CAT_ID`, sorted by group priority)
- HTTP: native `https` with User-Agent `ZeroGravity/1.0`, 3 retries, 60s timeout

| Redis key          | Source                                      | TTL  |
|--------------------|---------------------------------------------|------|
| `satellites:live`  | CelesTrak `gp.php?GROUP={slug}&FORMAT=json` | 300s |
| `iss:crew`         | `https://api.open-notify.org/astros.json`   | 300s |

Each satellite record in cache is raw CelesTrak JSON plus `_group` and `_priority` fields added by ingestor.

### API (`api/index.js`)

- Reads `satellites:live`, runs `propagateSatellites()` to compute current lat/lng/alt/velocity
- Uses `satellite.js` for GMST and ECI→geodetic conversion; simplified Kepler fallback in `keplerToLatSpace()`
- If cache empty or error: serves **hardcoded fallback** datasets (`FALLBACK_SATELLITES`, `FALLBACK_CREW`)
- Redis connection: `REDIS_URL` or `REDIS_HOST` + `REDIS_PORT` + `REDIS_PASSWORD` (default host `cache`)

---

## API contract

Base URL (deployed): `https://api-14c-3000.sea1.zerops.app`

Frontend proxies via same-origin `/api/*` in production.

### `GET /api/satellites`

```json
{
  "source": "cache | fallback",
  "count": 42,
  "satellites": [
    {
      "id": 25544,
      "name": "ISS (ZARYA)",
      "catId": 25544,
      "lat": 28.5383,
      "lng": -80.6489,
      "alt": 420.5,
      "inclination": 51.64,
      "velocity": 7.66,
      "group": "station"
    }
  ]
}
```

`group` values: `station`, `visual`, `science`, `weather`

### `GET /api/crew`

```json
{
  "source": "cache | fallback",
  "count": 11,
  "crew": [
    { "name": "Oleg Kononenko", "craft": "ISS" }
  ]
}
```

### Health endpoints

- `GET /` — API metadata
- `GET /health`, `GET /status` — on api and frontend services

---

## Frontend architecture

### Stack

- React 18, Vite 5, Express static server in production
- `react-globe.gl` + Three.js 0.185 for the globe
- Lucide React icons
- Tailwind present but most styling is custom `zg-*` classes in `index.css`
- No router — single-page instrument UI

### Key behaviors (`App.jsx`)

- Fetches `/api/satellites` and `/api/crew` on interval (10s prod, 30s dev)
- Default visible types: only `station` on; others off until toggled
- Globe uses custom day/night material (`globeDayNight.js`), not a static night texture alone
- Selection drives telemetry panel, orbit path, downlink ping, station mesh highlight
- Mobile detection via `(max-width: 47.99rem), (pointer: coarse)` — adjusts layout
- Dev mode (`import.meta.env.DEV`) can fall back to `mockData.js` when fetch fails
- Zoom range: 0.35–4.5; default 2.5

### Globe rendering modules

| Module                  | Purpose |
|-------------------------|---------|
| `globeDayNight.js`      | Shader material, sun position, Earth rotation |
| `globeSatelliteLayer.js`| Merge/filter satellite lists; mesh registry lifecycle |
| `globeObjectUpdate.js`  | Lat/lng/alt placement; selection scale + halo |
| `orbitPath.js`          | Orbit arc geometry, altitude bands, nearest-sat lookup |
| `transmissionPing.js`   | Animated downlink line from satellite to surface |
| `stationMesh.js`        | Distinct 3D mesh for ISS vs Tiangong |
| `satelliteMesh.js`      | Generic satellite point/mesh |
| `globeColors.js`        | Group color map; reads CSS tokens via `designTokens.js` |

### Design system (canonical: `design.md` + `frontend/tokens.css`)

- **Theme:** Terminal — near-black canvas, phosphor yellow-green accent (~127° hue)
- **Typography:** JetBrains Mono everywhere (display + body); tabular nums for telemetry
- **Principles:**
  - Globe is the product; panels are flat bordered panes (`paper-2`), no glassmorphism
  - Missing API values render as `—`, never invented numbers
  - Nav: `Zero Gravity · norad telemetry` + `[ sync ]` — no CLI flag chrome
  - Component prefix: `zg-` in CSS
  - Colors only via CSS custom properties; JS reads via `designTokens.js`
- **Motion:** live dot pulse, nav caret blink; respects `prefers-reduced-motion`
- **CTA voice:** `[ label ]` bracket syntax or `--flag` style buttons

> Note: README still mentions an older "Midnight / Syne + Figtree" theme. **`design.md` and `tokens.css` are authoritative** — Terminal + JetBrains Mono.

---

## Environment variables

| Variable         | Service(s)      | Purpose |
|------------------|-----------------|---------|
| `REDIS_URL`      | ingestor, api   | Full Valkey connection string (Zerops `${cache_connectionString}`) |
| `REDIS_HOST`     | ingestor, api   | Default `cache` |
| `REDIS_PORT`     | ingestor, api   | Default `6379` |
| `REDIS_PASSWORD` | ingestor, api   | From `${cache_password}` |
| `API_HOST`       | frontend        | Default `http://api:3000`; proxy target for `/api/*` |
| `PORT`           | api, frontend   | Default `3000` |

---

## Local development

Requirements: Node.js 22, Redis/Valkey on port 6379.

```bash
# Terminal 1 — cache (Valkey/Redis locally)
# Terminal 2 — API
cd api && npm install && REDIS_HOST=127.0.0.1 npm start

# Terminal 3 — Ingestor (optional, populates cache)
cd ingestor && npm install && REDIS_HOST=127.0.0.1 node index.js

# Terminal 4 — Frontend
cd frontend && npm install
# vite.config.js proxies /api → http://api:3000; change to http://127.0.0.1:3000 for local
npm run dev
```

Production frontend build:

```bash
cd frontend && npm run build && API_HOST=http://127.0.0.1:3000 npm start
```

---

## Deployment (Zerops)

```bash
zcli push ingestor
zcli push api
zcli push frontend
```

Cache is a managed Valkey service; connection vars injected as `${cache_*}` in `zerops.yaml`.

Each service directory has its own `zerops.yaml`; root file mirrors all three runtimes.

---

## Dependencies

| Package        | Where     | Use |
|----------------|-----------|-----|
| `express`      | api, frontend | HTTP server |
| `ioredis`      | api, ingestor | Valkey client |
| `satellite.js` | api       | Orbital math |
| `cors`         | api       | CORS middleware |
| `react-globe.gl` | frontend | 3D globe |
| `three`        | frontend  | WebGL / meshes |
| `lucide-react` | frontend  | Icons |

---

## Conventions for contributors / AI assistants

1. **Read `design.md` before any frontend UI change** — do not reintroduce gradient text, non-mono fonts, or inline hex colors
2. **Token changes go in `frontend/tokens.css` first**, then verify `designTokens.js` / `globeColors.js` pick them up
3. **Keep fallback data in api** — frontend should degrade gracefully, not fabricate telemetry
4. **Minimize scope** — match existing module split (globe logic stays out of `App.jsx` when possible)
5. **Zerops is the target runtime** — internal DNS uses service hostnames (`cache`, `api`); local dev uses `127.0.0.1`
6. **No secrets in code** — Redis credentials come from env only
7. **Component classes:** `zg-` prefix; layout utilities: `zg-row`, `zg-icon-sm`, `zg-panel--flex`

---

## Hackathon & attribution

- Built for **WeMakeDevs × Zerops Hackathon**
- Hosting: [Zerops](https://zerops.io/) with managed Valkey
- Data: [CelesTrak](https://celestrak.org/) (NORAD), [Open Notify](http://open-notify.org/) (crew)
- UI design: [Hallmark](https://github.com/nutlope/hallmark) Terminal mood redesign
- License: MIT

---

## Suggested Gemini prompts

When starting a task, you can say:

> "I'm working on ZeroGravity (satellite tracker). Context is in GEMINI.md. [Describe task]. Follow design.md for UI. Match existing module patterns in frontend/src/."

For API work:

> "ZeroGravity api/index.js reads Valkey key `satellites:live` and propagates with satellite.js. [Describe change]. Keep fallback behavior."

For UI work:

> "ZeroGravity frontend uses react-globe.gl, Terminal theme (JetBrains Mono, phosphor green). See design.md and tokens.css. [Describe change]."

---

## Known gaps / doc drift

- README design section references superseded Midnight theme — use `design.md`
- README says cache TTL 60s; ingestor actually sets **300s** EX on keys
- Vite dev proxy defaults to Zerops internal hostname `http://api:3000`; local dev needs edit or env override
