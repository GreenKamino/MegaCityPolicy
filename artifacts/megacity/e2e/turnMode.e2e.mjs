// End-to-end UI test for the TURN-BASED play mode (Task #439).
//
// Drives the running MEGACITY Expo-web app in a real headless browser and
// asserts the full player-facing turn-based flow that the engine unit tests
// (engine/__tests__/turnMode.test.ts) cannot exercise:
//   1. Create a commander profile, start a NEW game, pick the TURN-BASED play
//      mode in the char-create modal, and launch.
//   2. Confirm the Overview shows the "Turn-Based Command" panel with an
//      "END TURN" button and NO live speed controls.
//   3. Press END TURN and confirm the first turn of a genuinely fresh game
//      runs CLEAN — the recap must read "TURN COMPLETE", never "TURN
//      INTERRUPTED" (Task #453). Asserted for BOTH start styles: VETERAN
//      (FLOW 1) and GUIDED via the skipped orientation (FLOW 1b). This is the
//      UI-level pin of the first-turn phantom-crisis fix locked at the engine
//      level by engine/__tests__/firstTurnCleanStart.test.ts.
//   4. Seed a blocking crisis and confirm the panel shows "RESOLVE CRISIS TO
//      CONTINUE" (no END TURN) and routes to the Events screen.
//   5. Dismiss that crisis on the Events screen, return to the Overview, and
//      confirm END TURN is available again and still advances the sim — i.e. a
//      resolved crisis un-blocks turn advancement (Task #444).
//   6. Arm the ?midturncrisis=1 fixture, confirm a crisis spawning MID-turn
//      interrupts and pauses the turn (Task #445), then confirm ONE dismissal
//      buys the rest of the interrupted day: the resumed End Turn finishes the
//      REMAINDER of the day (recap reads JAN 02 — 00:00, never a restarted
//      day — Task #451) and the dismissed crisis does NOT re-interrupt every
//      tick (per-id trigger cooldown — Task #452).
//
// Requires the "artifacts/megacity: expo" workflow to be running. Uses the
// root puppeteer + system chromium (no extra deps). Run with:
//   node e2e/turnMode.e2e.mjs
//
// Base URL resolves from $REPLIT_EXPO_DEV_DOMAIN (Expo apps bypass the shared
// proxy) or an explicit E2E_BASE_URL override.

import { execSync } from "node:child_process";
import puppeteer from "puppeteer";

const BASE_URL =
  process.env.E2E_BASE_URL ||
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:8081");

function resolveChromium() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try {
    return execSync("which chromium", { encoding: "utf8" }).trim();
  } catch {
    return execSync("which chromium-browser", { encoding: "utf8" }).trim();
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForText(page, text, timeout = 20000) {
  console.log(`  … waiting for "${text}"`);
  const deadline = Date.now() + timeout;
  let beat = 0;
  while (Date.now() < deadline) {
    if (await hasText(page, text)) return; // hasText is case-insensitive
    await sleep(1000);
    // Heartbeat keeps stdout alive (the harness kills idle shells) and shows
    // progress during long game-load waits.
    if (++beat % 3 === 0) console.log(`     … still waiting for "${text}" (${beat}s)`);
  }
  throw new Error(`waitForText: "${text}" not found within ${timeout}ms`);
}

async function dumpOnFailure(page, label) {
  try {
    const txt = await page.evaluate(() =>
      document.body ? document.body.innerText.slice(0, 2500) : "(no body)",
    );
    console.error(`\n[e2e] page text at failure (${label}) url=${page.url()}:\n---\n${txt}\n---`);
  } catch {
    /* ignore */
  }
}

// Case-insensitive: RN-Web SectionHeaders and many labels apply
// text-transform: uppercase, so the rendered innerText ("TURN-BASED COMMAND")
// differs in case from the source title prop ("Turn-Based Command").
async function hasText(page, text) {
  return page.evaluate(
    (t) => !!document.body && document.body.innerText.toUpperCase().includes(t.toUpperCase()),
    text,
  );
}

// Click the smallest (leaf-most) element whose trimmed text matches. RN-Web
// renders Pressables as divs; clicking the inner text bubbles to the handler.
async function clickText(page, text, { exact = true, timeout = 20000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    // Locate the leaf element inside the page, tag it with a data attribute,
    // and scroll it into view. Returning the tag (not the element itself) and
    // re-grabbing the handle via page.$ avoids an evaluateHandle element-return
    // quirk that intermittently yields null for off-screen nodes.
    const marked = await page.evaluate(
      (text, exact) => {
        const nodes = Array.from(
          document.querySelectorAll('div, span, a, button, [role="button"]'),
        );
        // Use rendered innerText (respects text-transform / letter-spacing);
        // fall back to textContent for nodes not in layout. Compare
        // case-insensitively (labels may be uppercased via CSS).
        const target = text.toUpperCase();
        const textOf = (n) => ((n.innerText ?? n.textContent) || "").trim().toUpperCase();
        let matches = nodes.filter((n) => {
          const t = textOf(n);
          return exact ? t === target : t.includes(target);
        });
        // If an exact match found nothing, retry as a substring match so quirks
        // in leaf-node splitting don't hide an otherwise-visible label.
        if (exact && matches.length === 0) {
          matches = nodes.filter((n) => textOf(n).includes(target));
        }
        matches.sort((a, b) => textOf(a).length - textOf(b).length);
        const el = matches[0];
        if (!el) return false;
        document
          .querySelectorAll("[data-e2e-target]")
          .forEach((n) => n.removeAttribute("data-e2e-target"));
        el.setAttribute("data-e2e-target", "1");
        el.scrollIntoView({ block: "center", inline: "center" });
        return true;
      },
      text,
      exact,
    );
    if (marked) {
      const handle = await page.$("[data-e2e-target]");
      if (handle) {
        await sleep(350);
        await handle.click();
        await sleep(500);
        await page.evaluate(() =>
          document
            .querySelectorAll("[data-e2e-target]")
            .forEach((n) => n.removeAttribute("data-e2e-target")),
        );
        return;
      }
    }
    await sleep(250);
  }
  throw new Error(`clickText: element not found: "${text}"`);
}

// Fire a full pointer+mouse press directly on the element carrying `label`.
// Needed for controls nested inside another Pressable (e.g. the EventCard
// dismiss "x" sits inside the card's own Pressable): a coordinate-based
// puppeteer click there is captured by the OUTER Pressable's RN-Web responder,
// so the inner onPress never runs. Dispatching on the resolved element skips
// hit-testing entirely and drives whichever event RN-Web's PressResponder
// listens to (pointer or mouse). Returns false when no such element exists
// (e.g. after the incident is already cleared). Best-effort — pairs with a
// state assertion, never trusted on its own.
async function pressAriaLabel(page, label) {
  return await page.evaluate((label) => {
    const target = label.trim().toUpperCase();
    const el = Array.from(document.querySelectorAll("[aria-label]")).find(
      (n) => (n.getAttribute("aria-label") || "").trim().toUpperCase() === target,
    );
    if (!el) return false;
    el.scrollIntoView({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
    };
    el.dispatchEvent(new PointerEvent("pointerdown", { ...base, buttons: 1 }));
    el.dispatchEvent(new MouseEvent("mousedown", { ...base, buttons: 1 }));
    el.dispatchEvent(new PointerEvent("pointerup", { ...base, buttons: 0 }));
    el.dispatchEvent(new MouseEvent("mouseup", { ...base, buttons: 0 }));
    el.dispatchEvent(new MouseEvent("click", { ...base, buttons: 0 }));
    return true;
  }, label);
}

// Dispatch a full pointer+mouse press on the LAST leaf element whose trimmed
// rendered text exactly matches. Needed for the GameModal confirm buttons:
// RN-Web renders <Modal> into a portal appended at the END of the body, so
// when the onboarding header's "SKIP" button and the confirm modal's "SKIP"
// button coexist, the modal's is the last match. A coordinate-based click on
// the first match would be swallowed by the modal overlay anyway; dispatching
// directly on the element (same technique as pressAriaLabel) sidesteps
// hit-testing. Returns false when no such element exists.
async function pressLastText(page, text) {
  return await page.evaluate((text) => {
    const target = text.trim().toUpperCase();
    const nodes = Array.from(
      document.querySelectorAll('div, span, a, button, [role="button"]'),
    );
    const textOf = (n) => ((n.innerText ?? n.textContent) || "").trim().toUpperCase();
    const matches = nodes.filter((n) => textOf(n) === target);
    const el = matches[matches.length - 1];
    if (!el) return false;
    el.scrollIntoView({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
    };
    el.dispatchEvent(new PointerEvent("pointerdown", { ...base, buttons: 1 }));
    el.dispatchEvent(new MouseEvent("mousedown", { ...base, buttons: 1 }));
    el.dispatchEvent(new PointerEvent("pointerup", { ...base, buttons: 0 }));
    el.dispatchEvent(new MouseEvent("mouseup", { ...base, buttons: 0 }));
    el.dispatchEvent(new MouseEvent("click", { ...base, buttons: 0 }));
    return true;
  }, text);
}

// Click a label and confirm it produced the expected transition, retrying if
// not. RN-Web's responder system can swallow the very first pointer gesture
// after load, and animated modals occasionally need a second tap; this makes
// each navigational step deterministic.
async function tapUntil(page, clickLabel, expectText, { tries = 4, exact = true } = {}) {
  for (let i = 0; i < tries; i++) {
    await clickText(page, clickLabel, { exact });
    // Poll (case-insensitive) for the transition; retry the tap if it never
    // lands within the short window.
    const stepDeadline = Date.now() + 5000;
    let seen = false;
    while (Date.now() < stepDeadline) {
      if (await hasText(page, expectText)) {
        seen = true;
        break;
      }
      await sleep(300);
    }
    if (seen) {
      console.log(`  ✓ tap "${clickLabel}" → "${expectText}"`);
      return;
    }
  }
  throw new Error(`tapUntil: "${clickLabel}" never revealed "${expectText}"`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

let currentPage = null;

async function run() {
  console.log(`[e2e] base URL: ${BASE_URL}`);
  const browser = await puppeteer.launch({
    executablePath: resolveChromium(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  // Each flow runs in its own browser context so it starts with EMPTY storage.
  // FLOW 1 creates a commander profile + save slot; GameContext auto-loads the
  // newest saved slot on boot whenever a profile exists, which would silently
  // override the ?demo=… seed on a later page in the same context (the demo
  // fixture only wins when no saved profile/slot is present). Isolated contexts
  // keep FLOW 2's seeded crisis authoritative. (createIncognitoBrowserContext
  // was renamed to createBrowserContext in Puppeteer 20+; fall back for safety.)
  const newContext = () =>
    browser.createBrowserContext?.() ?? browser.createIncognitoBrowserContext();

  // Drive the REAL unified setup from empty storage to the start-style/mode
  // controls. Commander identity and city choices now live on one scroll page.
  const startNewGameToModePicker = async (page) => {
    // First load compiles the Metro bundle in a cold browser and shows a
    // "LOADING ASSETS." splash, so give the initial render a generous window.
    // Fresh profile storage → one commander-and-city setup page.
    await waitForText(page, "NEW COMMANDER", 120000);
    await tapUntil(page, "NEW COMMANDER", "COMMANDER & CITY SETUP");
    assert(await hasText(page, "COMMANDER IDENTITY"), "unified setup shows commander identity");
    assert(await hasText(page, "ATTRIBUTES"), "unified setup shows commander attributes");
    assert(await hasText(page, "TRAITS"), "unified setup shows commander traits");
    assert(await hasText(page, "CITY & SECTOR COMMAND"), "unified setup shows city command choices");
    assert(await hasText(page, "START STYLE"), "unified setup shows START STYLE");
  };

  // Poll for whichever turn recap renders first. Checks INTERRUPTED before
  // COMPLETE so a genuine interrupt can never be misread as clean.
  const firstRecap = async (page, timeout = 20000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await hasText(page, "TURN INTERRUPTED")) return "TURN INTERRUPTED";
      if (await hasText(page, "TURN COMPLETE")) return "TURN COMPLETE";
      await sleep(500);
    }
    return null;
  };

  // Best-effort clear of first-run aid overlays (coach tips) that could
  // intercept a tap on END TURN.
  const clearCoachTips = async (page) => {
    for (let i = 0; i < 3 && (await hasText(page, "GOT IT")); i++) {
      try {
        await clickText(page, "GOT IT");
      } catch {}
      await sleep(400);
    }
  };

  try {
    // ── FLOW 1: create commander → new turn-based game → END TURN recap ──
    const page = await browser.newPage();
    currentPage = page;
    await page.setViewport({ width: 420, height: 900 });
    await page.goto(BASE_URL + "/", { waitUntil: "domcontentloaded", timeout: 60000 });

    console.log("[e2e] FLOW 1 — new turn-based game via the real mode picker");
    await startNewGameToModePicker(page);

    // City char-create modal — pick Veteran (skips onboarding) + Turn-Based.
    await clickText(page, "VETERAN");
    await clickText(page, "TURN-BASED");
    // Launch closes the modal and routes to the Overview; give the game screen
    // a long window to mount (a single click — the modal is gone on retry).
    await clickText(page, "CREATE COMMANDER & LAUNCH CITY");
    await waitForText(page, "Turn-Based Command", 20000);
    assert(await hasText(page, "Turn-Based Command"), "overview shows Turn-Based Command panel");
    assert(await hasText(page, "END TURN"), "END TURN button is present");
    assert(
      !(await hasText(page, "Simulation Speed")),
      "no Simulation Speed panel (live clock is gone)",
    );

    // Task #453: the FIRST End Turn of a genuinely fresh game must run CLEAN
    // to the end of the day — "TURN COMPLETE", never "TURN INTERRUPTED". The
    // phantom first-turn crisis (herbivore die-offs rolled from biomes with no
    // herbivore species) hit ~60% of fresh games, guided and veteran alike,
    // before the engine fix pinned by
    // engine/__tests__/firstTurnCleanStart.test.ts; this asserts the same
    // contract through the real UI so a UI-level regression cannot pass
    // silently.
    await clickText(page, "END TURN");
    const recap = await firstRecap(page);
    assert(!!recap, "END TURN advances and shows a turn recap");
    assert(
      recap === "TURN COMPLETE",
      `first END TURN of a fresh VETERAN game runs clean (recap: ${recap})`,
    );
    assert(await hasText(page, "Advanced"), "recap reports how many ticks the turn advanced");
    await page.close();

    // ── FLOW 1b: fresh GUIDED game — first END TURN is also clean ──
    // Same first-turn contract as FLOW 1 but for the GUIDED start style, which
    // routes through the first-run orientation before the Overview. The
    // orientation is skipped via its header SKIP control (+ confirm modal) —
    // skipping flips hasCompletedOnboarding without advancing any ticks, so
    // the END TURN below is still turn #1 of a genuinely fresh guided state.
    console.log("[e2e] FLOW 1b — fresh GUIDED game: first END TURN runs clean");
    const ctx1b = await newContext();
    const page1b = await ctx1b.newPage();
    currentPage = page1b;
    await page1b.setViewport({ width: 420, height: 900 });
    await page1b.goto(BASE_URL + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await startNewGameToModePicker(page1b);

    // GUIDED is the default start style, but select it explicitly so the flow
    // stays valid if the default ever changes.
    await clickText(page1b, "GUIDED");
    await clickText(page1b, "TURN-BASED");
    await clickText(page1b, "CREATE COMMANDER & LAUNCH CITY");

    // Guided launches into the first-run orientation wizard.
    await waitForText(page1b, "FIRST-RUN ORIENTATION", 20000);
    // Skip it: header SKIP opens the "SKIP ORIENTATION?" confirm modal whose
    // destructive button is ALSO labelled SKIP — pressLastText resolves the
    // ambiguity because the RN-Web modal portal renders after the header.
    let onOverview = false;
    for (let i = 0; i < 8 && !onOverview; i++) {
      if (
        (await hasText(page1b, "SKIP ORIENTATION?")) ||
        (await hasText(page1b, "FIRST-RUN ORIENTATION"))
      ) {
        await pressLastText(page1b, "SKIP");
      }
      await sleep(1200);
      onOverview = await hasText(page1b, "Turn-Based Command");
    }
    assert(onOverview, "skipping the orientation lands on the Turn-Based Command panel");

    // Post-orientation first-run aids (coach tips) may overlay the panel on a
    // guided start — clear them so the END TURN tap cannot be intercepted.
    await clearCoachTips(page1b);
    assert(await hasText(page1b, "END TURN"), "END TURN button is present on the guided start");
    assert(
      !(await hasText(page1b, "RESOLVE CRISIS TO CONTINUE")),
      "no crisis prompt before the first guided turn",
    );

    await clickText(page1b, "END TURN");
    const recap1b = await firstRecap(page1b);
    assert(!!recap1b, "END TURN advances and shows a turn recap (guided)");
    assert(
      recap1b === "TURN COMPLETE",
      `first END TURN of a fresh GUIDED game runs clean (recap: ${recap1b})`,
    );
    assert(await hasText(page1b, "Advanced"), "guided recap reports how many ticks advanced");
    await ctx1b.close();

    // ── FLOW 1c: GUIDED game PLAYED through the orientation — first END TURN
    // is still clean (Task #457) ──
    // FLOW 1b reaches the Overview by header-SKIPPING the orientation, which
    // performs NO in-game actions. A player who actually walks the five beats
    // takes REAL actions before their first END TURN: a Worker Housing Stacks
    // build (Construction), an Emergency Rations edict (Law), and reading the
    // Sector Command welcome dispatch (Inbox). If any of those onboarding
    // actions ever armed a first-turn crisis or wedged the Turn-Based Command
    // panel, no other flow would catch it. This flow performs each beat's
    // GENUINE action (never SKIP BEAT — the banner must auto-advance from the
    // detected action) and then asserts the same first-turn contract:
    // "TURN COMPLETE", never "TURN INTERRUPTED".
    console.log("[e2e] FLOW 1c — GUIDED game played through the orientation");
    const ctx1c = await newContext();
    const page1c = await ctx1c.newPage();
    currentPage = page1c;
    await page1c.setViewport({ width: 420, height: 900 });
    await page1c.goto(BASE_URL + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await startNewGameToModePicker(page1c);

    await clickText(page1c, "GUIDED");
    await clickText(page1c, "TURN-BASED");
    await clickText(page1c, "CREATE COMMANDER & LAUNCH CITY");

    // Beat 01 (arrival) — the orientation screen. BEGIN ORIENTATION routes to
    // Construction, where the beat-02 banner mounts.
    await waitForText(page1c, "FIRST-RUN ORIENTATION", 20000);
    await tapUntil(page1c, "BEGIN ORIENTATION", "AUTHORIZE A WORKER HOUSING STACK");

    // Beat 02 (build) — perform the REAL build. Construction opens on the
    // ENERGY category, so first select the HOUSING tab (the banner copy tells
    // the player to do exactly this); the WORKER HOUSING STACKS card is not
    // even in the DOM before that (FlatList virtualization). Tapping the card
    // opens the CONSTRUCT confirm modal; its confirm button is "BUILD 1"
    // (batch size 1 on a fresh game). The banner watches state.buildings and
    // auto-advances to Law once the count rises, where the beat-03 banner
    // title renders. A screen tip ("GOT IT") can overlay the list — clear it.
    {
      let onEdictBeat = false;
      for (let i = 0; i < 8 && !onEdictBeat; i++) {
        if (await hasText(page1c, "CONSTRUCT 1X WORKER HOUSING STACKS")) {
          await pressLastText(page1c, "BUILD 1");
        } else if (await hasText(page1c, "AUTHORIZE A WORKER HOUSING STACK")) {
          if (await hasText(page1c, "GOT IT")) {
            try {
              await clickText(page1c, "GOT IT");
            } catch {}
          }
          try {
            if (await hasText(page1c, "WORKER HOUSING STACKS")) {
              await clickText(page1c, "WORKER HOUSING STACKS");
            } else {
              await clickText(page1c, "HOUSING");
            }
          } catch {}
        }
        await sleep(1200);
        onEdictBeat = await hasText(page1c, "ISSUE EMERGENCY RATIONS");
      }
      assert(onEdictBeat, "authorising the build auto-advances to the edict beat (Law)");
    }

    // Beat 03 (edict) — issue the REAL edict. The emergency_rations catalog
    // entry renders as the EMERGENCY RATION DISTRIBUTION card (do NOT tap
    // "EMERGENCY RATIONS" — that matches the banner title, not the card).
    // Tapping the card opens the "ISSUE: EMERGENCY RATION DISTRIBUTION?"
    // modal whose confirm button is AUTHORIZE (destructive). The banner
    // watches activeEdicts and auto-advances to Inbox, where the beat-04
    // banner title renders.
    {
      let onDispatchBeat = false;
      for (let i = 0; i < 6 && !onDispatchBeat; i++) {
        if (await hasText(page1c, "ISSUE: EMERGENCY RATION DISTRIBUTION?")) {
          await pressLastText(page1c, "AUTHORIZE");
        } else if (await hasText(page1c, "ISSUE EMERGENCY RATIONS")) {
          if (await hasText(page1c, "GOT IT")) {
            try {
              await clickText(page1c, "GOT IT");
            } catch {}
          }
          try {
            await clickText(page1c, "EMERGENCY RATION DISTRIBUTION");
          } catch {}
        }
        await sleep(1200);
        onDispatchBeat = await hasText(page1c, "READ THE SECTOR COMMAND DISPATCH");
      }
      assert(onDispatchBeat, "issuing the edict auto-advances to the dispatch beat (Inbox)");
    }

    // Beat 04 (dispatch) — READ the welcome message. Tapping the message card
    // marks it read; the banner watches state.messages and auto-advances to
    // the summary beat back on the onboarding screen.
    {
      let onSummaryBeat = false;
      for (let i = 0; i < 6 && !onSummaryBeat; i++) {
        if (await hasText(page1c, "READ THE SECTOR COMMAND DISPATCH")) {
          if (await hasText(page1c, "GOT IT")) {
            try {
              await clickText(page1c, "GOT IT");
            } catch {}
          }
          try {
            await clickText(page1c, "SECTOR COMMAND — INCOMING TRANSMISSION", {
              exact: false,
            });
          } catch {}
        }
        await sleep(1200);
        onSummaryBeat = await hasText(page1c, "ORIENTATION COMPLETE");
      }
      assert(onSummaryBeat, "reading the dispatch auto-advances to the summary beat");
    }

    // Beat 05 (summary) — ENTER MEGACITY flips hasCompletedOnboarding and
    // lands on the Overview.
    await tapUntil(page1c, "ENTER MEGACITY", "Turn-Based Command");
    assert(
      await hasText(page1c, "Turn-Based Command"),
      "completing the orientation lands on the Turn-Based Command panel",
    );

    // Post-orientation coach tips can overlay the panel — clear them so the
    // END TURN tap cannot be intercepted (same guard as FLOW 1b).
    await clearCoachTips(page1c);
    assert(
      await hasText(page1c, "END TURN"),
      "END TURN button is present after playing the orientation",
    );
    // The onboarding actions (build + edict + read) must NOT have armed a
    // blocking crisis before the very first turn.
    assert(
      !(await hasText(page1c, "RESOLVE CRISIS TO CONTINUE")),
      "no crisis prompt before the first post-orientation turn",
    );

    await clickText(page1c, "END TURN");
    const recap1c = await firstRecap(page1c);
    assert(!!recap1c, "END TURN advances and shows a turn recap (played orientation)");
    assert(
      recap1c === "TURN COMPLETE",
      `first END TURN after actually playing the orientation runs clean (recap: ${recap1c})`,
    );
    assert(
      await hasText(page1c, "Advanced"),
      "played-orientation recap reports how many ticks advanced",
    );
    await ctx1c.close();

    // ── FLOW 2: crisis branch blocks END TURN and routes to Events ──
    console.log("[e2e] FLOW 2 — crisis branch routes to Events");
    const ctx2 = await newContext();
    const page2 = await ctx2.newPage();
    currentPage = page2;
    await page2.setViewport({ width: 420, height: 900 });
    await page2.goto(BASE_URL + "/?demo=1&mode=turnbased&crisis=1", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await waitForText(page2, "Turn-Based Command");
    assert(
      await hasText(page2, "RESOLVE CRISIS TO CONTINUE"),
      "crisis panel shows RESOLVE CRISIS TO CONTINUE",
    );
    assert(!(await hasText(page2, "END TURN")), "END TURN is hidden while a crisis is active");

    // Clear any first-run coach-tip overlay so it can't intercept a tap, and so
    // it soaks up RN-Web's occasional first-gesture swallow. The ?demo seed
    // lands with the onboarding aids still on (hasCompletedOnboarding is true,
    // but the starter tip shows), so dismiss it before navigating.
    for (let i = 0; i < 2 && (await hasText(page2, "GOT IT")); i++) {
      try {
        await clickText(page2, "GOT IT");
      } catch {}
      await sleep(400);
    }

    // Navigate to the Events screen via the crisis panel. The crisis ALSO
    // renders on the Overview, so a "crisis text is visible" check passes even
    // when the tap was swallowed and we never left the Overview. Retry the tap
    // until the route genuinely changes so FLOW 3 truly runs on /events.
    let onEvents = false;
    for (let i = 0; i < 6 && !onEvents; i++) {
      if (await hasText(page2, "RESOLVE CRISIS TO CONTINUE")) {
        try {
          await clickText(page2, "RESOLVE CRISIS TO CONTINUE");
        } catch {}
      }
      await sleep(1200);
      onEvents = page2.url().includes("/events");
    }
    assert(onEvents, "RESOLVE CRISIS routes to the Events screen");

    // ── FLOW 3: resolve the crisis and confirm turns can advance again ──
    // Task #444: the earlier flows never verified that a *resolved* crisis
    // un-blocks END TURN. Dismiss the seeded event here on the Events screen,
    // return to the Overview via the persistent CITY tab, and confirm the panel
    // re-enables END TURN and that pressing it advances the sim again.
    console.log("[e2e] FLOW 3 — resolve crisis, return to overview, advance turn");
    await waitForText(page2, "DEBUG: Sector Uprising");
    assert(
      await hasText(page2, "DEBUG: Sector Uprising"),
      "crisis is listed on the Events screen before dismissal",
    );
    // The dismiss control is an icon-only button nested INSIDE the EventCard's
    // own Pressable, so a coordinate-based click is captured by the outer
    // responder and never fires onDismiss. Dispatch the press directly on the
    // element (see pressAriaLabel) and retry until the incident actually clears.
    let cleared = false;
    for (let i = 0; i < 5 && !cleared; i++) {
      if (await hasText(page2, "DEBUG: Sector Uprising")) {
        await pressAriaLabel(page2, "Dismiss DEBUG: Sector Uprising");
      }
      await sleep(1000);
      cleared =
        (await hasText(page2, "ALL SYSTEMS NOMINAL")) ||
        !(await hasText(page2, "DEBUG: Sector Uprising"));
    }
    assert(cleared, "crisis is cleared from the Events screen after dismissal");
    await waitForText(page2, "ALL SYSTEMS NOMINAL", 10000);

    // Return to the Overview via the persistent CITY tab. Client-side nav keeps
    // the seeded in-memory game state; a full reload would re-inject the crisis.
    await tapUntil(page2, "CITY", "Turn-Based Command");
    assert(
      await hasText(page2, "END TURN"),
      "END TURN is available again once the crisis is resolved",
    );
    assert(
      !(await hasText(page2, "RESOLVE CRISIS TO CONTINUE")),
      "the crisis prompt is gone from the Turn-Based Command panel",
    );

    // The re-enabled END TURN still advances the sim. A fresh crisis can
    // interrupt the turn, so accept either recap — both prove it advanced.
    await clickText(page2, "END TURN");
    const recap2Deadline = Date.now() + 15000;
    let recap2 = null;
    while (Date.now() < recap2Deadline) {
      if (await hasText(page2, "TURN COMPLETE")) {
        recap2 = "TURN COMPLETE";
        break;
      }
      if (await hasText(page2, "TURN INTERRUPTED")) {
        recap2 = "TURN INTERRUPTED";
        break;
      }
      await sleep(500);
    }
    assert(!!recap2, `END TURN advances again after the crisis is resolved (${recap2})`);
    assert(await hasText(page2, "Advanced"), "recap reports how many ticks the turn advanced");
    await ctx2.close();

    // ── FLOW 4: a crisis spawning MID-TURN interrupts and pauses the turn ──
    // Task #445: FLOW 2/3 cover a crisis that exists BEFORE End Turn; this flow
    // covers the other branch — the turn is running fine, a high/critical event
    // spawns partway through, and advanceTurn must halt early with the
    // "TURN INTERRUPTED" recap naming the crisis. The ?midturncrisis=1 seed
    // (engine/demoSeeder.ts) arms a state with NO active crisis where the
    // critical "ECOSYSTEM COLLAPSE WARNING" event deterministically fires on
    // the first tick of the next turn (biosphere pinned under the collapse
    // threshold + calm-start window zeroed); the engine-level guarantee is
    // locked by engine/__tests__/demoSeeder.test.ts against the real tick
    // pipeline.
    console.log("[e2e] FLOW 4 — mid-turn crisis interrupts and pauses the turn");
    const ctx3 = await newContext();
    const page3 = await ctx3.newPage();
    currentPage = page3;
    await page3.setViewport({ width: 420, height: 900 });
    await page3.goto(BASE_URL + "/?demo=1&mode=turnbased&midturncrisis=1", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await waitForText(page3, "Turn-Based Command");
    // Precondition: unlike FLOW 2, the board starts CLEAN — End Turn available,
    // no crisis prompt. Otherwise this would just re-test the pre-existing
    // crisis branch.
    assert(await hasText(page3, "END TURN"), "END TURN is available before the mid-turn crisis");
    assert(
      !(await hasText(page3, "RESOLVE CRISIS TO CONTINUE")),
      "no crisis prompt before the turn starts",
    );
    assert(
      !(await hasText(page3, "TURN INTERRUPTED")),
      "no interrupt recap before the turn starts",
    );

    // Clear the first-run coach tip so it cannot intercept the END TURN tap
    // (same guard as FLOW 2).
    for (let i = 0; i < 2 && (await hasText(page3, "GOT IT")); i++) {
      try {
        await clickText(page3, "GOT IT");
      } catch {}
      await sleep(400);
    }

    // End the turn: the armed crisis spawns on the first tick, so the recap
    // must be the INTERRUPTED variant — never TURN COMPLETE.
    await clickText(page3, "END TURN");
    await waitForText(page3, "TURN INTERRUPTED", 15000);
    assert(await hasText(page3, "TURN INTERRUPTED"), "recap card reads TURN INTERRUPTED");
    assert(
      !(await hasText(page3, "TURN COMPLETE")),
      "recap is not TURN COMPLETE (the turn genuinely stopped early)",
    );
    // The recap names the interrupting crisis.
    assert(await hasText(page3, "Stopped for:"), "recap shows the Stopped for: line");
    assert(
      await hasText(page3, "ECOSYSTEM COLLAPSE WARNING"),
      "recap names the interrupting crisis (ECOSYSTEM COLLAPSE WARNING)",
    );
    // And the panel pauses the game on the player's decision: no END TURN
    // until the crisis is dealt with.
    assert(
      await hasText(page3, "RESOLVE CRISIS TO CONTINUE"),
      "panel shows RESOLVE CRISIS TO CONTINUE after the interrupt",
    );

    // ── FLOW 5: one dismissal buys the rest of the day (Task #451 + #452) ──
    // Task #451 proved resumed turns finish the interrupted DAY; Task #452
    // changed the second half of the fixture's behavior: dismissing the
    // collapse now stamps a per-id trigger cooldown (clearEventAndHealBiome →
    // processBiosphere's canTrigger), so the SAME crisis must NOT re-interrupt
    // on every tick anymore even though the biosphere stays pinned under the
    // threshold. Expected happy path: ONE dismissal, then ONE End Turn walks
    // the remaining three ticks straight to the day boundary (JAN 02 — 00:00).
    // Unrelated random incidents can still legitimately interrupt (e.g.
    // HERBIVORE DIE-OFF on the ecology tick), so the loop below tolerates and
    // resolves those — but if the ECOSYSTEM COLLAPSE card ever comes back
    // before the day rolls (well under the 12-tick re-raise cooldown), that is
    // exactly the resolve → END TURN → 1-tick re-interrupt regression this
    // task fixed, and the flow fails hard. The engine-level timing contract
    // (1 tick + 3 ticks, hours 06→00, cooldown length, eventual re-raise) is
    // locked by engine/__tests__/demoSeeder.test.ts and
    // engine/__tests__/crisisRetriggerCooldown.test.ts.
    console.log("[e2e] FLOW 5 — a dismissed crisis stops re-interrupting the day");

    // The demo city's inflated stats unlock a batch of achievements on the
    // very first tick, and the AchievementReport modal slides in a beat AFTER
    // the recap renders — sitting over the whole screen and swallowing every
    // tap underneath (this is exactly what blocked the first version of this
    // flow). A coach tip ("GOT IT") can do the same. Clear whichever is up
    // before pressing anything.
    const clearOverlays = async () => {
      for (let i = 0; i < 4; i++) {
        if (await hasText(page3, "ACKNOWLEDGED")) {
          try {
            await clickText(page3, "ACKNOWLEDGED");
          } catch {}
          await sleep(600);
          continue;
        }
        if (await hasText(page3, "GOT IT")) {
          try {
            await clickText(page3, "GOT IT");
          } catch {}
          await sleep(600);
          continue;
        }
        break;
      }
    };

    // Clear ALL blocking incident cards on the Events screen and return to the
    // Overview with END TURN re-enabled. Same swallowed-tap guards as FLOW 2/3.
    //
    // NOTE on the "cleared" signal. Two text-based signals are unusable here:
    // (1) hasText scans the whole document, and the Overview's recap card
    // ("Stopped for: ECOSYSTEM COLLAPSE WARNING") stays in the DOM behind the
    // Events screen, so "collapse text gone" never fires. (2) "ALL SYSTEMS
    // NOMINAL" only renders when the incident list is EMPTY, and a tick can
    // legitimately spawn an unrelated random incident alongside the collapse.
    // Each card's own dismiss control disappearing is the right per-card
    // signal — but ONLY after it was first seen PRESENT: under CPU load the
    // Events screen renders late, and a bare absence check passes trivially
    // before any dismissal happened (this false positive failed a real run).
    // The authoritative outcome is therefore END TURN reappearing on the
    // panel, with the whole dismiss cycle retried until it does.
    const listDismissLabels = () =>
      page3.evaluate(() =>
        Array.from(document.querySelectorAll("[aria-label]"))
          .map((n) => (n.getAttribute("aria-label") || "").trim())
          .filter((l) => l.toUpperCase().startsWith("DISMISS ")),
      );
    const COLLAPSE_DISMISS_LABEL = "DISMISS ECOSYSTEM COLLAPSE WARNING";
    let collapseDismissed = false;
    const resolveBlockingCrises = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        await clearOverlays();
        // Already cleared (e.g. by a prior attempt)? Then we are done.
        if (await hasText(page3, "END TURN")) return;
        // Reach the Events screen via the panel's RESOLVE CRISIS button.
        let onEvents3 = false;
        for (let i = 0; i < 6 && !onEvents3; i++) {
          await clearOverlays();
          if (await hasText(page3, "RESOLVE CRISIS TO CONTINUE")) {
            try {
              await clickText(page3, "RESOLVE CRISIS TO CONTINUE");
            } catch {}
          }
          await sleep(1200);
          onEvents3 = page3.url().includes("/events");
        }
        if (!onEvents3) continue; // recheck END TURN at the top of the loop
        // Wait for at least one incident card to actually RENDER before
        // trusting any absence signal (slow renders otherwise fake a cleared
        // state).
        let labels = [];
        for (let i = 0; i < 10 && labels.length === 0; i++) {
          labels = await listDismissLabels();
          if (labels.length === 0) await sleep(1000);
        }
        // THE regression guard of this flow (Task #452): once the collapse
        // has been dismissed, it must NOT reappear within this day — the
        // per-id cooldown (12 ticks) comfortably covers the <= 3 ticks left,
        // so a returning card here is always the per-tick re-fire bug.
        if (
          collapseDismissed &&
          labels.some((l) => l.toUpperCase() === COLLAPSE_DISMISS_LABEL)
        ) {
          throw new Error(
            "REGRESSION (Task #452): ECOSYSTEM COLLAPSE WARNING re-fired within the same day after being dismissed",
          );
        }
        for (const label of labels) {
          for (let i = 0; i < 6; i++) {
            await pressAriaLabel(page3, label);
            await sleep(1000);
            const remaining = await listDismissLabels();
            if (!remaining.some((l) => l.toUpperCase() === label.toUpperCase())) break;
          }
          if (label.toUpperCase() === COLLAPSE_DISMISS_LABEL) {
            collapseDismissed = true;
          }
        }
        // Outcome check on the panel itself: END TURN back means the blocking
        // crises are really gone. If not, retry the whole cycle.
        await clearOverlays();
        await tapUntil(page3, "CITY", "Turn-Based Command");
        const panelDeadline = Date.now() + 8000;
        while (Date.now() < panelDeadline) {
          if (await hasText(page3, "END TURN")) return;
          await clearOverlays();
          await sleep(500);
        }
      }
      throw new Error(
        "resolveBlockingCrises: END TURN never re-enabled after 3 dismiss cycles",
      );
    };

    // Finish the interrupted day. FLOW 4 ended at 06:00 (tick 1 of 4). The
    // happy path is a single press: dismiss the collapse once, END TURN, and
    // the turn walks 12:00 → 18:00 → 00:00 in one go — the recap
    // deterministically reads "JAN 02 — 00:00" (demo fixture starts 2030
    // JAN 01, 00:00), proving the day was COMPLETED, never restarted, and the
    // dismissed crisis stayed quiet. Unrelated random incidents may still cut
    // a resumed turn short, so allow a few extra resolve+press cycles — the
    // collapse-reappearance guard inside resolveBlockingCrises stays armed
    // the whole time.
    let dayRolled = false;
    for (let press = 0; press < 4 && !dayRolled; press++) {
      await resolveBlockingCrises();
      assert(
        await hasText(page3, "END TURN"),
        `END TURN is available again after resolving (press ${press + 1})`,
      );
      await clearOverlays();
      try {
        await clickText(page3, "END TURN");
      } catch {}
      // Wait for the press to settle: either the day rolled (done) or a NEW
      // blocking crisis re-raised the RESOLVE prompt (loop back and clear it).
      // "RESOLVE CRISIS TO CONTINUE" only renders while a blocking crisis is
      // live, so — unlike recap text, which lingers from the previous turn —
      // it cannot false-positive off stale DOM.
      const pressDeadline = Date.now() + 20000;
      while (Date.now() < pressDeadline && !dayRolled) {
        dayRolled = await hasText(page3, "JAN 02 — 00:00");
        if (dayRolled) break;
        if (await hasText(page3, "RESOLVE CRISIS TO CONTINUE")) break;
        await sleep(500);
      }
    }
    assert(collapseDismissed, "the FLOW 4 collapse was dismissed through the Events screen");
    assert(
      dayRolled,
      "the interrupted day completes (JAN 02 — 00:00) without the dismissed collapse re-interrupting",
    );

    // No further UI step here on purpose: the day-boundary tick can spawn an
    // unrelated random incident, which keeps the crisis prompt up and would
    // make any "Turn 2" subtitle assertion flaky. The JAN 02 — 00:00 recap
    // above IS the completion proof; the exact turn arithmetic (1 tick +
    // 3 ticks, totalTicks === TICKS_PER_TURN) and the cooldown's eventual
    // re-raise are locked by engine/__tests__/demoSeeder.test.ts and
    // engine/__tests__/crisisRetriggerCooldown.test.ts.
    await ctx3.close();

    console.log("\n[e2e] ✅ ALL TURN-BASED FLOWS PASSED");
  } catch (err) {
    // Dump the current screen *before* the finally block closes the browser.
    if (currentPage) await dumpOnFailure(currentPage, "run");
    throw err;
  } finally {
    await browser.close();
  }
}

run().catch(async (err) => {
  console.error("\n[e2e] ❌ FAILED:", err.message);
  if (currentPage) await dumpOnFailure(currentPage, "run");
  process.exit(1);
});
