// Browser e2e for the commander profile create/delete flows (Task: confirm
// creating and deleting commanders works end to end in the running game).
// Drives the REAL menu UI in app/index.tsx through:
//   FLOW 1: fresh context -> creation wizard -> first commander created
//   FLOW 2: roster "NEW COMMANDER" -> two more commanders (active switches)
//   FLOW 3: delete a NON-ACTIVE commander from the roster
//   FLOW 4: delete the ACTIVE commander -> menu falls back to profile picker
//   FLOW 5: delete the LAST commander -> creation wizard auto-reopens
//   FLOW 6: commander cap -> CREATE COMMANDER surfaces the CREATION FAILED
//           modal with the slots-in-use message (wizard stays open)
// Requires the "artifacts/megacity: expo" workflow. Run on demand:
//   node e2e/commanderProfiles.e2e.mjs
// (Not registered as an always-on validation command on purpose — see the
// multi-turn e2e notes: concurrent validation saturates cores and reloads
// the dev app mid-flow.)
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

// Case-insensitive whole-document text probe. The demo-free menu route can
// client-side navigate on boot, which can detach the frame mid-evaluate;
// treat that as "not yet" so callers can retry.
async function hasText(page, text) {
  try {
    return await page.evaluate(
      (t) => !!document.body && document.body.innerText.toUpperCase().includes(t.toUpperCase()),
      text,
    );
  } catch {
    return false;
  }
}

async function waitForText(page, text, timeout = 20000) {
  console.log(`  … waiting for "${text}"`);
  const deadline = Date.now() + timeout;
  let beat = 0;
  while (Date.now() < deadline) {
    if (await hasText(page, text)) return;
    await sleep(1000);
    if (++beat % 5 === 0) console.log(`     … still waiting for "${text}" (${beat}s)`);
  }
  throw new Error(`waitForText: "${text}" not found within ${timeout}ms`);
}

async function waitForGone(page, text, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!(await hasText(page, text))) return;
    await sleep(500);
  }
  throw new Error(`waitForGone: "${text}" still present after ${timeout}ms`);
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

// Click the smallest (leaf-most) VISIBLE element whose trimmed rendered text
// matches. RN-Web renders Pressables as divs; clicking the inner text bubbles
// to the handler.
async function clickText(page, text, { exact = true, timeout = 20000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const marked = await page.evaluate(
      (text, exact) => {
        const nodes = Array.from(
          document.querySelectorAll('div, span, a, button, [role="button"]'),
        );
        const target = text.toUpperCase();
        const textOf = (n) => ((n.innerText ?? n.textContent) || "").trim().toUpperCase();
        const visible = (n) => {
          const r = n.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        let matches = nodes.filter((n) => {
          const t = textOf(n);
          return (exact ? t === target : t.includes(target)) && visible(n);
        });
        if (exact && matches.length === 0) {
          matches = nodes.filter((n) => textOf(n).includes(target) && visible(n));
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
        await sleep(300);
        await handle.click().catch(() => {});
        await sleep(400);
        await page.evaluate(() =>
          document
            .querySelectorAll("[data-e2e-target]")
            .forEach((n) => n.removeAttribute("data-e2e-target")),
        );
        return;
      }
    }
    await sleep(500);
  }
  throw new Error(`clickText: "${text}" not found within ${timeout}ms`);
}

// Dispatch a full pointer+mouse press on the LAST leaf element whose trimmed
// rendered text exactly matches. GameModal renders into a portal appended at
// the END of the body, so when a roster card's "DELETE" button and the
// confirm modal's "DELETE" button coexist, the modal's is the last match.
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

// Direct-dispatch press on the FIRST matching leaf. Needed for the menu's
// profile button: a coordinate click opens the roster on pointer-up, but the
// trailing click event then hit-tests against the newly opened modal and can
// land on the roster card with the SAME commander name — which selects it and
// closes the modal again. Direct dispatch keeps every event on the menu leaf.
async function pressFirstText(page, text) {
  return await page.evaluate((text) => {
    const target = text.trim().toUpperCase();
    const nodes = Array.from(
      document.querySelectorAll('div, span, a, button, [role="button"]'),
    );
    const textOf = (n) => ((n.innerText ?? n.textContent) || "").trim().toUpperCase();
    const visible = (n) => {
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const el = nodes.find((n) => textOf(n) === target && visible(n));
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

// Press the DELETE button INSIDE the roster card whose title matches
// cardName. The card's DELETE is a Pressable nested inside the card's own
// Pressable, and several cards render "DELETE" at once — so scope the search
// to the ancestor card that contains the name, then dispatch the press
// directly on that card's DELETE leaf (coordinate clicks on nested RN-Web
// Pressables are unreliable).
async function pressDeleteOnCard(page, cardName) {
  return await page.evaluate((cardName) => {
    const target = cardName.trim().toUpperCase();
    const textOf = (n) => ((n.innerText ?? n.textContent) || "").trim().toUpperCase();
    const visible = (n) => {
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const leaves = Array.from(document.querySelectorAll("div, span")).filter(
      (n) => textOf(n) === target && visible(n),
    );
    for (const leaf of leaves) {
      // Walk up until we hit a container that also holds a DELETE leaf.
      let node = leaf.parentElement;
      let deleteLeaf = null;
      while (node && node !== document.body && !deleteLeaf) {
        const dels = Array.from(node.querySelectorAll("div, span")).filter(
          (n) => textOf(n) === "DELETE" && visible(n),
        );
        // Leaf-most DELETE inside this candidate card container.
        if (dels.length) {
          deleteLeaf = dels[0];
          for (const d of dels) if (deleteLeaf.contains(d) && d !== deleteLeaf) deleteLeaf = d;
        } else {
          node = node.parentElement;
        }
      }
      if (!deleteLeaf) continue;
      deleteLeaf.scrollIntoView({ block: "center", inline: "center" });
      const r = deleteLeaf.getBoundingClientRect();
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
      deleteLeaf.dispatchEvent(new PointerEvent("pointerdown", { ...base, buttons: 1 }));
      deleteLeaf.dispatchEvent(new MouseEvent("mousedown", { ...base, buttons: 1 }));
      deleteLeaf.dispatchEvent(new PointerEvent("pointerup", { ...base, buttons: 0 }));
      deleteLeaf.dispatchEvent(new MouseEvent("mouseup", { ...base, buttons: 0 }));
      deleteLeaf.dispatchEvent(new MouseEvent("click", { ...base, buttons: 0 }));
      return true;
    }
    return false;
  }, cardName);
}

// Open the SWITCH COMMANDER roster by tapping the menu's profile button.
// Cannot key on the words "SWITCH COMMANDER": the menu button's own subtitle
// ("Tap to switch commander") contains them, so a text probe passes before
// the modal opens. The roster's close button aria-label is unique to the
// open modal.
async function openRoster(page, buttonLabel) {
  const sel = '[aria-label="Close commander selection"]';
  for (let i = 0; i < 5; i++) {
    if (await page.$(sel)) return;
    await pressFirstText(page, buttonLabel);
    try {
      await page.waitForSelector(sel, { timeout: 4000 });
      return;
    } catch {
      /* retry the tap */
    }
  }
  throw new Error(`openRoster: roster modal never opened after tapping "${buttonLabel}"`);
}

// Roster interactions must be self-healing: right after a commander is
// created, pending async profile work can remount the menu tree, which
// resets modal state and silently closes a just-opened roster. Re-open the
// roster on EVERY attempt rather than assuming it stays open.
async function rosterTap(page, profileLabel, tapLabel, expectText) {
  for (let i = 0; i < 5; i++) {
    await openRoster(page, profileLabel);
    try {
      await clickText(page, tapLabel, { timeout: 5000 });
    } catch {
      continue; // roster closed under us; re-open and retry
    }
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (await hasText(page, expectText)) return;
      await sleep(400);
    }
  }
  throw new Error(`rosterTap: "${expectText}" never appeared after tapping "${tapLabel}"`);
}

// Open the roster (if needed) and press DELETE on the named card, retrying
// until the DELETE COMMANDER confirm dialog is up.
async function deleteFromRoster(page, profileLabel, cardName) {
  for (let i = 0; i < 5; i++) {
    await openRoster(page, profileLabel);
    if (await pressDeleteOnCard(page, cardName)) {
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        if (await hasText(page, "DELETE COMMANDER")) return;
        await sleep(300);
      }
    } else {
      await sleep(600);
    }
  }
  throw new Error(`deleteFromRoster: confirm dialog never opened for "${cardName}"`);
}

// Click a label and confirm it produced the expected transition, retrying if
// not (RN-Web's responder system can swallow the first pointer gesture after
// load, and animated modals occasionally need a second tap).
async function tapUntil(page, clickLabel, expectText, { tries = 4, exact = true } = {}) {
  for (let i = 0; i < tries; i++) {
    await clickText(page, clickLabel, { exact });
    const stepDeadline = Date.now() + 5000;
    while (Date.now() < stepDeadline) {
      if (await hasText(page, expectText)) return;
      await sleep(400);
    }
  }
  throw new Error(`tapUntil: "${expectText}" never appeared after tapping "${clickLabel}"`);
}

// Type into the wizard's name field (RN-Web TextInput -> <input aria-label>).
// Triple-click selects the prefilled "Commander Unknown" so typing replaces it.
async function typeName(page, name) {
  const sel = 'input[aria-label="Commander name"]';
  await page.waitForSelector(sel, { timeout, visible: true }).catch(() => {});
  await page.click(sel, { clickCount: 3 });
  await page.type(sel, name, { delay: 20 });
}
const timeout = 10000;

// Walk the 3-step creation wizard (info -> attributes -> traits) and submit.
async function completeWizard(page, name) {
  await waitForText(page, "COMMANDER NAME", 15000);
  if (name) await typeName(page, name);
  await tapUntil(page, "NEXT: ATTRIBUTES", "NEXT: TRAITS");
  await tapUntil(page, "NEXT: TRAITS", "CREATE COMMANDER");
  await clickText(page, "CREATE COMMANDER");
}

// Retry a GameModal confirm (dispatch can no-op once the element is gone; a
// press that landed makes `donePredicate` true). Only presses while the
// modal's title (`guardText`) is still on screen — pressing "DELETE" after
// the confirm dialog closed would land on a roster card's own DELETE button
// and open a fresh confirm for the wrong commander.
async function confirmModal(page, buttonText, guardText, donePredicate, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await donePredicate()) return;
    if (await hasText(page, guardText)) {
      await pressLastText(page, buttonText);
    }
    await sleep(800);
  }
  throw new Error(`confirmModal: ${label} never completed`);
}

// Seed a minimal-but-loadable commander profile blob directly into
// localStorage (AsyncStorage's web backing store). Only used by the cap flow;
// loadProfile only requires valid JSON (careerStats is sanitized on load).
function seedProfileScript(ids) {
  return `
    (() => {
      const ids = ${JSON.stringify(ids)};
      for (const id of ids) {
        const profile = {
          id,
          name: "Seed " + id.replace("seed_", ""),
          age: 40,
          sex: "male",
          portraitId: "player_male_1",
          commanderLevel: 1,
          xp: 0,
          attributes: { authority: 5, intelligence: 4, charisma: 3, combat: 6, endurance: 5 },
          attributePoints: 0,
          traits: [],
          backstory: "",
          careerStats: {},
        };
        localStorage.setItem("@megacity_profile_" + id, JSON.stringify(profile));
      }
      localStorage.setItem("@megacity_profiles_index", JSON.stringify(ids));
    })();
  `;
}

async function run() {
  console.log(`[e2e] base URL: ${BASE_URL}`);
  const browser = await puppeteer.launch({
    executablePath: resolveChromium(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !/favicon|net::|404/.test(msg.text())) pageErrors.push(msg.text());
  });

  let failed = false;
  try {
    // ── Fresh context: no profiles, menu gates on IDENTIFY YOURSELF ──
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForText(page, "IDENTIFY YOURSELF", 120000).catch(async () => {
      // A previous session's storage may already hold profiles; clear and
      // reload to get the canonical fresh-context entry state.
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForText(page, "IDENTIFY YOURSELF", 60000);
    });
    // Always start from zero storage so counts are deterministic.
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForText(page, "IDENTIFY YOURSELF", 60000);
    await waitForText(page, "EARLY ACCESS", 15000);
    await waitForText(page, "BUILD", 15000);
    console.log("[e2e] FLOW 1: fresh context shows IDENTIFY YOURSELF, COMMANDER");

    // ── FLOW 1: create the first commander and city on one setup page ──
    await tapUntil(page, "NEW COMMANDER", "COMMANDER & CITY SETUP");
    await waitForText(page, "CITY & SECTOR COMMAND");
    await typeName(page, "Alpha Test");
    await clickText(page, "VETERAN");
    await clickText(page, "CREATE COMMANDER & LAUNCH CITY");
      await waitForText(page, "This is the situation room", 30000);
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitForText(page, "WELCOME, ALPHA TEST", 15000);
    console.log("[e2e] FLOW 1 PASS: unified setup created commander + city, menu greets ALPHA TEST");

    // ── FLOW 2: two more commanders via the roster's NEW COMMANDER ──
    for (const [current, next] of [
      ["ALPHA TEST", "Bravo Test"],
      ["BRAVO TEST", "Charlie Test"],
    ]) {
      await rosterTap(page, current, "NEW COMMANDER", "COMMANDER NAME");
      await completeWizard(page, next);
      await waitForText(page, `WELCOME, ${next.toUpperCase()}`, 15000);
    }
    console.log("[e2e] FLOW 2 PASS: roster creation works, active switches to newest");

    // ── FLOW 3: delete a NON-ACTIVE commander (Bravo) ──
    await deleteFromRoster(page, "CHARLIE TEST", "BRAVO TEST");
    await confirmModal(
      page,
      "DELETE",
      "DELETE COMMANDER",
      async () => !(await hasText(page, "BRAVO TEST")),
      "delete non-active commander",
    );
    if (!(await hasText(page, "ALPHA TEST"))) throw new Error("FLOW 3: ALPHA TEST missing from roster");
    if (!(await hasText(page, "CHARLIE TEST"))) throw new Error("FLOW 3: CHARLIE TEST missing from roster");
    console.log("[e2e] FLOW 3 PASS: non-active commander deleted, others intact");

    // ── FLOW 4: delete the ACTIVE commander (Charlie) ──
    await deleteFromRoster(page, "CHARLIE TEST", "CHARLIE TEST");
    await confirmModal(
      page,
      "DELETE",
      "DELETE COMMANDER",
      async () =>
        (await hasText(page, "IDENTIFY YOURSELF")) && !(await hasText(page, "CHARLIE TEST")),
      "delete active commander",
    );
    if (!(await hasText(page, "ALPHA TEST"))) throw new Error("FLOW 4: ALPHA TEST card missing");
    console.log("[e2e] FLOW 4 PASS: deleting active commander returns to profile picker");

    // ── FLOW 5: delete the LAST commander -> wizard auto-reopens ──
    await tapUntil(page, "ALPHA TEST", "WELCOME, ALPHA TEST");
    await deleteFromRoster(page, "ALPHA TEST", "ALPHA TEST");
    await confirmModal(
      page,
      "DELETE",
      "DELETE COMMANDER",
      async () => await hasText(page, "COMMANDER NAME"),
      "delete last commander",
    );
    console.log("[e2e] FLOW 5 PASS: deleting the last commander reopens the creation wizard");

    // ── FLOW 6: commander cap -> CREATION FAILED modal ──
    // Seed 7 loadable profiles, open the wizard while a slot is still free,
    // then fill the 8th slot behind the wizard's back. CREATE COMMANDER must
    // surface CREATION FAILED with the slots-in-use message (the exact player
    // bug this flow guards: creation failing silently while the wizard sat
    // open). Pruning can't rescue it: all 8 index entries are loadable.
    const seeds = Array.from({ length: 7 }, (_, i) => `seed_${i + 1}`);
    await page.evaluate(seedProfileScript(seeds));
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForText(page, "IDENTIFY YOURSELF", 60000);
    await waitForText(page, "SEED 1", 10000);
    await tapUntil(page, "NEW COMMANDER", "COMMANDER NAME");
    await page.evaluate(seedProfileScript([...seeds, "seed_8"]));
    await completeWizard(page, "Overflow Test");
    await waitForText(page, "CREATION FAILED", 15000);
    // The modal body renders as plain text immediately.
    await waitForText(page, "commander slots are in use", 15000);
    await confirmModal(
      page,
      "OK",
      "CREATION FAILED",
      async () => !(await hasText(page, "CREATION FAILED")),
      "dismiss CREATION FAILED",
    );
    // The wizard stays on its LAST step (traits) after a failed submit — the
    // name field from step 1 is not on screen. CREATE COMMANDER is the
    // wizard's submit button and only renders while the wizard is open.
    if (!(await hasText(page, "CREATE COMMANDER"))) {
      throw new Error("FLOW 6: wizard closed after CREATION FAILED — entered data would be lost");
    }
    console.log("[e2e] FLOW 6 PASS: cap surfaces CREATION FAILED, wizard stays open");

    // Leave storage clean so later manual sessions start fresh.
    await page.evaluate(() => localStorage.clear());

    if (pageErrors.length) {
      console.error(`[e2e] page errors:\n${pageErrors.join("\n")}`);
      throw new Error(`${pageErrors.length} page error(s) during commander flows`);
    }
    console.log("[e2e] PASS: all commander create/delete flows verified");
  } catch (err) {
    failed = true;
    console.error(`[e2e] FAIL: ${err.message}`);
    await dumpOnFailure(page, "commanderProfiles");
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    // Chromium occasionally lingers after close(); don't let it hang the run.
    setTimeout(() => process.exit(process.exitCode ?? (failed ? 1 : 0)), 2000).unref();
  }
}

run();
