# Threat Model

## Project Overview

MEGACITY is a pnpm-monorepo TypeScript game project with three production-relevant runtimes: an Expo/React Native client (`artifacts/megacity`), a lightweight static web server for Expo web builds (`artifacts/megacity/server/serve.js`), and a Steam/Electron desktop wrapper (`artifacts/megacity/steam`). There is also a small Express API server (`artifacts/api-server`) that currently exposes only unauthenticated health and privacy endpoints.

The primary users are single-player game users on mobile, web, and desktop. The application is mostly offline-first. Save data is stored locally and, on Steam builds, mirrored to Steam Cloud. The mockup sandbox is development-only and out of scope unless production reachability is demonstrated.

Assumptions for this scan:
- Production deployments run with `NODE_ENV=production`.
- Replit provides TLS termination for deployed traffic.
- `artifacts/mockup-sandbox` is not deployed to production.
- Only vulnerabilities that matter in production are in scope.

## Assets

- **Player save data and profiles** — local save slots, profile metadata, and Steam Cloud copies. Corruption or unauthorized modification can destroy progress or expose player data.
- **Desktop bridge capabilities** — Electron main-process access to Steam achievements, Steam Cloud, and native desktop APIs. If renderer-controlled input crosses this boundary unsafely, a compromise can become local file or desktop-impacting.
- **Build and publishing credentials** — Expo build/publish credentials and any platform tokens used during packaging or release. Leakage can let an attacker ship malicious builds or tamper with release infrastructure.
- **Deployment integrity** — the static landing page and web bundle served by `serve.js`, plus the Electron wrapper used for Steam distribution. Attackers must not be able to inject script or redirect users through server-controlled responses.
- **Application reputation and store presence** — Steam stats, achievements, and storefront-linked flows are lower sensitivity than secrets, but abuse still affects integrity and user trust.

## Trust Boundaries

- **Client / local persistence boundary** — imported save JSON, local AsyncStorage, and restored backup data cross from untrusted bytes into trusted in-memory game state.
- **Renderer / Electron main-process boundary** — code running in the desktop renderer can call the preload bridge, which forwards requests to privileged Electron IPC handlers.
- **Application / Steam SDK boundary** — Steam Cloud, achievements, rich presence, and stats are controlled through native SDK bindings that must not receive unsafe attacker-controlled parameters.
- **Browser / static server boundary** — HTTP request metadata, especially URL and proxy headers, enters `artifacts/megacity/server/serve.js` and is reflected into HTML served to users.
- **Repository / build-service boundary** — checked-in config and build scripts can expose credentials or release controls outside the runtime itself.
- **Public / internal boundary** — `artifacts/api-server` is public-facing, but currently contains only low-sensitivity public endpoints. Any future authenticated or database-backed routes would raise this boundary significantly.

## Scan Anchors

- **Production entry points:** `artifacts/megacity/server/serve.js`, `artifacts/megacity/steam/main.js`, `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`
- **Highest-risk code areas:** `artifacts/megacity/steam/`, `artifacts/megacity/context/GameContext.tsx`, `artifacts/megacity/engine/saveLoad.ts`, `artifacts/megacity/engine/saveExport.ts`, `artifacts/megacity/engine/sanitizer.ts`, `.replit`
- **Public surfaces:** Expo landing page/static web server, Steam desktop renderer, Express `/api/healthz` and `/api/privacy`
- **Authenticated/admin surfaces:** none currently visible in production server code
- **Usually dev-only / ignore unless proven reachable:** `artifacts/mockup-sandbox/`, `.canvas/`, build/test scripts, CI helpers

## Threat Categories

### Spoofing

The project has almost no traditional account system on the production server side, so spoofing risk is concentrated in desktop and build channels rather than web sessions. The Electron bridge and Steam integration must only expose the intended capabilities to the packaged renderer, and release credentials must not be embedded in tracked config where an attacker can impersonate the project in Expo or related distribution flows.

### Tampering

Imported save files, Steam Cloud data, and local storage are untrusted inputs. The game must continue to validate and sanitize imported or restored state before applying it. On desktop, IPC parameters that cross into the Electron main process must be strictly constrained so renderer-controlled input cannot tamper with local files, Steam Cloud state outside intended keys, or privileged desktop behavior.

### Information Disclosure

The main disclosure risk is secret leakage from the repository or build configuration, not from the current API surface. Build tokens, signing material, and any future API credentials must live in Replit Secrets or equivalent secret storage, never in tracked files. Error pages and public endpoints must avoid leaking internal paths, secrets, or sensitive environment details.

### Denial of Service

This is mostly an offline game, so classic internet-scale DoS risk is low. Relevant denial risks are malformed save imports or oversized local/cloud state causing crashes, storage exhaustion, or repeated startup failure. Save restore and sanitizer paths must stay defensive against malformed or adversarial inputs.

### Elevation of Privilege

The highest privilege boundary is the Electron main process. A renderer compromise must not be able to turn preload-exposed APIs into arbitrary file access, unsafe navigation, or broader native capability use. On the server side, any future expansion of `artifacts/api-server` must add explicit authentication, authorization, and parameterized database access instead of relying on the current minimal public-only posture.