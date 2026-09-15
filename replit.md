# Overview

"MEGACITY" is a pnpm monorepo TypeScript project for a text-heavy, menu-driven dystopian mega-city management mobile game. It offers a fully offline, single-player experience with strategic decision-making, resource management, dynamic events, and deep simulation mechanics. The game aims to deliver an immersive offline mobile strategy experience with significant market potential, featuring extensive research trees and complex economic and social systems for Android and iOS.

# User Preferences

I want iterative development and prefer detailed explanations of changes. Ask before making major changes. I prefer simple language in our communication.

# System Architecture

The project is structured as a pnpm workspace monorepo, with the core game, "MEGACITY," built as an Expo mobile application. The `api-server` uses Express 5 with PostgreSQL and Drizzle ORM. The game features extensive simulation mechanics including resource management, dynamic events, contracts, economics, and a game clock with offline catch-up.

**Core Technologies:**
- **Monorepo:** pnpm workspaces
- **Language:** TypeScript
- **Package Manager:** pnpm
- **API Framework:** Express 5
- **Database:** PostgreSQL with Drizzle ORM
- **Validation:** Zod
- **API Codegen:** Orval

**Game Architecture (`MEGACITY`):**
- **State Management:** React Context for global game state.
- **Persistence:** `AsyncStorage` for offline gameplay with multiple save slots.
- **UI/UX Design:** Dystopian terminal aesthetic (Matrix green on near-black), custom modals, animated numbers, toast notifications, dark/light theme, smooth screen transitions, and standardized headers. Hand-drawn pencil sketch portraits and SVG insignias are used.
- **World & Factions:** Features a world map of the Americas continent with 9 active factions (+2 hidden), 12 external megacities, 120+ notable locations, and 33+ townships. The map uses an equal-scale equirectangular projection and includes terrain decoration with lore tooltips and 10 weather hazard zones.
- **Core Systems:** Faction civil wars, wasteland expeditions, seasonal/cyclical events, citizen class system, district specialization, prestige legacy paths, resource trading AI, and an extensive supply chain (160+ production recipes).
- **Player Systems:** Deep character progression with unlockable traits, dynamic titles, perks, and a 12-option starting-region picker with unique lore dossiers. Includes personal journal, goals, trophy wall, logbook (codex), and propaganda feed.
- **Quality-of-Life & Polish:** Tutorial replay, photo mode, accessibility pack (colorblind palettes, font scaling, reduced motion), replay timeline, end-of-run summary, Honor Mode (perma-death option), starting-region bonuses, credits modal, Logbook search, tips review screen, native lifecycle guards, and a What's-New modal. Haptic feedback is integrated. First-run onboarding flow (5 beats: arrival, build, edict, dispatch, recap) gated by a `hasCompletedOnboarding` flag, with replay support from the in-game More tab. Tutorial hint catalog covers 20 screens.
- **Economic Systems:** Financial systems with banks, loans, credit rating, and economic trends visualization. Includes new wildlands buildings and biological commodities.
- **Combat System:** Hybrid 3-layer combat (auto-resolve, tactical doctrine, zone control) with multiple templates and options.
- **Endgame & Replayability:** Prestige system with legacy bonuses, rebirth cycle, Mega-Projects, and Officer Missions.
- **Advanced Systems:** Droid units, edicts, tourism, cybernetics, officer system, medical system, contraband, citizen traits, spy operations, military systems, and nuclear stockpile.
- **Political & Diplomatic Systems:** Commander reputation, dynamic titles, approval ratings, power decrees, Inner Circle, Bodyguard Retinue, City Software Upgrades, and an overhauled diplomacy system with dynamic NPC and partner-city interactions.
- **Retinue Squad System:** Hierarchical retinue with Captains leading Squads of Troops.
- **Desktop Features:** Responsive layout, desktop-specific polish (document title, auto-pause on blur, Ctrl+S quick-save), and an in-game changelog screen.
- **Visuals & Audio:** Terminal-style UI components and procedurally generated sound effects via `expo-audio`. All static art assets are optimized as WebP.
- **Build Processes:** Scripts for offline PWA builds and sideloadable Android APKs via EAS.

# External Dependencies

- **Expo:** Mobile application development platform.
- **React Native:** UI components.
- **React Query:** API client interactions.
- **AsyncStorage:** Client-side data persistence.
- **PostgreSQL:** Relational database.
- **Drizzle ORM:** Object-Relational Mapper.
- **Zod:** Schema validation.
- **Orval:** OpenAPI client code generator.
- **Express:** Web application framework.
- **pnpm:** Package manager.
- **esbuild:** JavaScript bundler.
- **expo-audio:** Audio playback.
- **expo-haptics:** Haptic feedback.
- **expo-clipboard:** Clipboard access.
- **lz-string:** Save compression.

# Project Conventions

**Repository layout (pnpm monorepo):**
- `artifacts/megacity` — main Expo/RN game (mobile + web). All gameplay code lives here.
- `artifacts/megacity-desktop` — desktop wrapper view of the same game.
- `artifacts/api-server` — Express 5 + Drizzle backend.
- `artifacts/mockup-sandbox` — isolated component preview server for Canvas iframes.

**Engine vs UI:**
- Pure game logic lives under `artifacts/megacity/engine/` and must be free of React Native imports so it can be unit-tested in node-env vitest. If a helper needs to live near a component but should also be testable, extract the pure part into `engine/` (see `engine/demoSeeder.ts` for the pattern).
- React/RN code lives under `app/`, `components/`, and `context/`.

**setState rules (important):**
- **Never** invoke side effects (toast setters, popup pushes, navigation, analytics) inside a functional `setState(prev => …)` updater. React may invoke updaters twice in Strict/Concurrent mode and the side effect will fire twice.
- Compute the next state up-front (read latest via `stateRef.current` or via the captured `state` value), commit a *pure* `setState(next)`, then fire side effects after.

**Tests:**
- Vitest, node environment by default, located in `**/__tests__/**/*.test.ts(x)`.
- Engine tests must not import RN modules (no `Platform`, no `react-native`). If you need a window stub, set `globalThis.window = { location: { search: "..." } }` directly.
- Run: `pnpm --filter @workspace/megacity exec vitest run`.

**Performance regression guard (`perf` validation step):**
- The `perf` validation step runs `pnpm --filter @workspace/megacity run validate:perf`, which executes the three engine performance tests: `tickBudget` (self-calibrating per-tick budget — fails if a tick gets slower, e.g. a re-introduced full-state clone, `unshift` log prepend, or uncached `Object.entries` walk), plus `perfStress` and `lateGameStress` (loose O(n²) blow-up ceilings under load).
- Purpose: catch per-tick slowdowns automatically on every code change instead of relying on someone remembering to run them. To re-baseline after an intentional perf change, see the methodology header in `engine/__tests__/tickBudget.test.ts`.
- The script runs vitest with `--no-file-parallelism` **on purpose**: these are wall-clock timing tests, so the three files must run one at a time. Running them in parallel — especially while the full `test` suite and `typecheck` run concurrently during a combined validation pass — oversubscribes the CPU and inflates measured per-tick cost into false failures. Keep this flag. If you add another timing-sensitive test to this step, do not parallelize it.

**Demo / screenshot mode (`?demo=1`):**
- Visiting `/?demo=1` on the web build (dev only) seeds a fully-bootstrapped MEGACITY JUAN city in memory so screenshot tooling can land directly on any `(game)/*` tab.
- Add `&go=<tab>` (e.g. `?demo=1&go=law`, `?demo=1&go=overview`, `?demo=1&go=wildlands`) to route straight to that tab. Changing `go` re-routes without re-seeding.
- The seeder is **in-memory only**. It must NEVER call `startNewGame` or write to AsyncStorage — that would clobber the user's save slot 1. The contract is locked in by `engine/__tests__/demoSeeder.test.ts`.
- Source of truth: `engine/demoSeeder.ts`. Re-routing logic: `app/index.tsx`. The route push uses `useGlobalSearchParams` so it reacts to URL changes.

**Workflows of note:**
- `typecheck` — `tsc --noEmit` on the megacity artifact.
- `test` — full vitest suite (~1500 tests).
- The `artifacts/megacity: expo` workflow runs Metro in CI mode (no watch) so the headless screenshot pipeline gets a stable bundle. Don't remove `CI=true` from `artifact.toml`.