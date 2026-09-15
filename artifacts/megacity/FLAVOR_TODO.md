# MEGACITY — Free Flavor Wins TODO

Implemented in this pass:
- #1 LoadingScreen messages: 10 → 40 entries (in-voice authoritarian boot strings).
- #2 NewsTicker AMBIENT_HEADLINES: +30 entries (now ~87 ambient + 200+ dark humor).
- #3 Browser tab title (web only): already handled by `useDesktopPolish`
  (`MEGACITY · CITY · SCREEN · SPEED`, with `▮▮ ` paused indicator). No new
  code needed — verified existing implementation in
  `hooks/useDesktopPolish.helpers.ts::buildDocumentTitle`.
- #8 NPC / business name pools expanded:
  - `engine/officers.ts` FIRST_NAMES +32, LAST_NAMES +24
  - `engine/namedCharacters.ts` LAST_NAMES 30 → 54
  - `engine/independentEnterprises.ts` DIVERSE_SURNAMES +30, DIVERSE_FIRSTS +12,
    ANGLO_SURNAMES +24, ANGLO_FIRSTS +16, SATIRICAL_PREFIXES +11, SATIRICAL_SUFFIXES +12
- #9 Contextual web cursors per screen (military/wildlands/scavenging → crosshair,
  codex/lore/diplomacy → help, districts/construction/atlas/worldmap → cell,
  blackmarket/trade → copy). Pressable `cursor: "pointer"` overrides remain.
- #10 Citizen dossier footers: 30-entry pool in `engine/dossierFooters.ts`,
  surfaced under player BACKSTORY (deterministic per-character via name+backstory hash).

## Deferred (not yet implemented)

### #4 Real-world date easter eggs
Pop seasonal flavor on splash / loading screen / news ticker keyed to the
player's local `Date`. Examples:
- New Year (Jan 1): "ANNUAL COMPLIANCE REVIEW BEGINS — RESOLUTIONS MANDATORY"
- Halloween (Oct 31): "GHOST SIGHTINGS UP 400% — ALL UNCONFIRMED — SECTOR CHAPLAINS DEPLOYED"
- Friday the 13th: "MAINTENANCE WINDOW EXTENDED — DO NOT INVESTIGATE THE BASEMENT"
- Apr 1: "COMPLAINTS DEPARTMENT RELOCATED — PERMANENTLY"
Implementation: small helper in `engine/dateEasterEggs.ts` returning headline
arrays keyed by month/day; merge into ambient pool in `useNewsHeadlines.ts`
when active.

### #5 Dev console boot ASCII
On `__DEV__` web boot, `console.log` a multi-line ASCII MEGACITY banner +
build/version/seed line. Add to `app/_layout.tsx` inside the `SplashScreen.hideAsync`
effect, gated on `__DEV__ && Platform.OS === "web"`. Zero gameplay impact.

### #6 Game-over flavor screen
The current game-over flow is utilitarian. Add a randomized one-paragraph
"final dispatch" written in newsroom voice (e.g. "MARSHAL [NAME] WAS RELIEVED
OF DUTY AT 0347 HOURS. THE SECTOR HAS ALREADY FORGOTTEN."), seeded by
final state (cause of failure, faction in power, year). Pool of ~12 paragraphs
keyed by failure type. Lives in `engine/gameOverFlavor.ts`, surfaced from
the existing game-over screen.

### #7 Tick-report cold opens
Each tick summary currently jumps straight into numbers. Lead with a single
in-voice sentence ("Sector quiet. Dispatcher caught up on filing.",
"Three arrests before breakfast.") drawn from a ~40-entry pool, varied
by tick mood (peaceful vs. crisis). Pool + selector in `engine/tickColdOpens.ts`,
mood-weighted by approval / unrest / crime deltas. Render in the tick summary
modal above the existing stat blocks.
