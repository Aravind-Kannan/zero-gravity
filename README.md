# 🛰️ ZeroGravity — 3D Live Orbital Satellite Surveillance Platform

**ZeroGravity** is a real-time, 3D interactive satellite tracking and orbital surveillance platform built with a 4-service microservices architecture deployed on **Zerops**.

![ZeroGravity Architecture](https://img.shields.io/badge/Platform-Zerops-blueviolet?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-v22-green?style=for-the-badge&logo=node.js)
![React](https://img.shields.io/badge/React-v18-blue?style=for-the-badge&logo=react)
![Three.js](https://img.shields.io/badge/Three.js-3D-black?style=for-the-badge&logo=three.js)
![Valkey](https://img.shields.io/badge/Valkey-KeyDB-red?style=for-the-badge&logo=redis)

---

## 🌐 Live Service Endpoints

- **3D Globe Web Platform:** [https://frontend-14c-3000.sea1.zerops.app](https://frontend-14c-3000.sea1.zerops.app)
- **API Satellite Telemetry:** [https://api-14c-3000.sea1.zerops.app/api/satellites](https://api-14c-3000.sea1.zerops.app/api/satellites)
- **API ISS Crew Roster:** [https://api-14c-3000.sea1.zerops.app/api/crew](https://api-14c-3000.sea1.zerops.app/api/crew)

---

## 🏛️ Microservices Architecture

The system comprises four decoupled, single-responsibility services running on Zerops private network:

```
┌─────────────────────────────────────────────────────────────┐
│                    External Telemetry APIs                   │
│   • CelesTrak NORAD (gp.php?GROUP=stations & visual)        │
│   • Open-Notify Astros (astros.json)                        │
└──────────────────────────────┬──────────────────────────────┘
                               │ (Polling every 30s)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                       ingestor service                      │
│                  (Node.js Background Worker)                │
└──────────────────────────────┬──────────────────────────────┘
                               │ (Stores JSON with 60s TTL)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                        cache service                        │
│                (Zerops Managed Valkey / KeyDB)              │
└──────────────────────────────┬──────────────────────────────┘
                               │ (Private Network ENV)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                          api service                        │
│                    (Node.js Express Server)                 │
└──────────────────────────────┬──────────────────────────────┘
                               │ (Internal DNS http://api:3000)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                       frontend service                      │
│            (Vite + React + Tailwind + Three.js)             │
└─────────────────────────────────────────────────────────────┘
```

---

## ⚙️ Service Specifications

### 1. `cache` (Managed Valkey Service)
- **Type:** `valkey:single@7.2` (Profile: `hobby`)
- Stores normalized satellite telemetry key `satellites:live` and astronaut roster key `iss:crew`.
- Auto-expiring TTL (60 seconds) ensuring cache freshness and resilience.

### 2. `ingestor` (Node.js Background Worker)
- **Type:** `ubuntu/nodejs@22`
- Runs continuous 30-second polling tasks against NORAD CelesTrak and Open-Notify APIs.
- Deduplicates and structures satellite orbital data before writing to `cache`.

### 3. `api` (Node.js Express Server)
- **Type:** `ubuntu/nodejs@22`
- **Port:** `3000` (CORS-enabled)
- Reads cached data from `cache` via Zerops private environment variables (`REDIS_URL`).
- Performs real-time **Keplerian orbital propagation math** to calculate current satellite latitude, longitude, altitude (km), and orbital velocity (km/s).

### 4. `frontend` (Vite + React + Tailwind + Three.js)
- **Type:** `ubuntu/nodejs@22`
- **Port:** `3000`
- Features a dark space theme (`#05070f`) with glassmorphism HUD design.
- Renders an interactive 3D Earth globe (`react-globe.gl` + Three.js) with:
  - 3D satellite node points & pulsing space station markers.
  - Orbital trajectory paths & inclination rings.
  - Selected satellite telemetry inspector (Lat/Lng, Altitude, Speed, Period).
  - Live ISS astronaut crew roster card.
  - Instant satellite search and category filters (`ALL`, `STATIONS`, `VISUAL`).
  - Native proxy routing `/api/*` to internal DNS `http://api:3000`.

---

## 📄 Infrastructure Configuration (`zerops.yaml`)

```yaml
zerops:
  - setup: ingestor
    build:
      base: nodejs@22
      buildCommands:
        - npm install
      deployFiles:
        - .
    run:
      base: nodejs@22
      envVariables:
        REDIS_URL: ${cache_connectionString}
        REDIS_HOST: ${cache_hostname}
        REDIS_PORT: ${cache_port}
        REDIS_PASSWORD: ${cache_password}
      start: node index.js

  - setup: api
    build:
      base: nodejs@22
      buildCommands:
        - npm install
      deployFiles:
        - .
    run:
      base: nodejs@22
      ports:
        - port: 3000
          httpSupport: true
      envVariables:
        REDIS_URL: ${cache_connectionString}
        REDIS_HOST: ${cache_hostname}
        REDIS_PORT: ${cache_port}
        REDIS_PASSWORD: ${cache_password}
      start: node index.js

  - setup: frontend
    build:
      base: nodejs@22
      buildCommands:
        - npm install
        - npm run build
      deployFiles:
        - .
    run:
      base: nodejs@22
      ports:
        - port: 3000
          httpSupport: true
      envVariables:
        API_HOST: http://api:3000
      start: node server.js
```

---

## 🚀 Deployment

The project is configured for automated build and sequential deployment on Zerops.

To deploy any service manually via Zerops CLI (`zcli`):

```bash
# Deploy ingestor worker
zcli push ingestor

# Deploy API server
zcli push api

# Deploy frontend application
zcli push frontend
```

---

## 📜 License

MIT License. Designed for live orbital telemetry visualization.
