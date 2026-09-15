// Phone-sized real-screen contract for actionable City advisories.
// Requires the "artifacts/megacity: expo" workflow.
//   node e2e/overviewWarningActions.e2e.mjs
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const CRIME_OVERVIEW_URL = `${BASE_URL}/?demo=1&crime=1&go=overview`;
const NARROW_VIEWPORTS = [
  { name: "small phone", width: 375, height: 812 },
  { name: "phone", width: 402, height: 874 },
];

async function waitFor(page, predicate, timeout = 120000, ...args) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await page.evaluate(predicate, ...args)) return;
    } catch {
      // Demo seeding replaces the root frame once; retry after it settles.
    }
    await sleep(500);
  }
  throw new Error("Timed out waiting for the expected screen state");
}

async function waitForVisibleText(page, text, timeout = 120000) {
  await waitFor(
    page,
    (needle) => {
      const target = needle.toUpperCase();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!(node.textContent ?? "").toUpperCase().includes(target)) continue;
        const rect = node.parentElement?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) return true;
      }
      return false;
    },
    timeout,
    text,
  );
}

async function openCrimeOverview(page) {
  await page.goto(CRIME_OVERVIEW_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await waitForVisibleText(page, "CITY STATUS MATRIX");
  await waitForVisibleText(page, "Crime 80");
  await waitForVisibleText(page, "Build enforcement infrastructure");
}

async function inspectCrimeCard(page, fragments) {
  return page.evaluate((actionFragments) => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        styles.display !== "none" &&
        styles.visibility !== "hidden"
      );
    };
    const buttons = actionFragments.map((fragment) => {
      const target = fragment.toUpperCase();
      return [...document.querySelectorAll('[role="button"], button')].find((element) => {
        const label = element.getAttribute("aria-label")?.toUpperCase() ?? "";
        return isVisible(element) && label.includes(target);
      });
    });
    const firstButton = buttons[0];
    if (!firstButton || buttons.some((button) => !button)) {
      return { buttons: buttons.map(Boolean), card: null, viewport: null, nextDiagnostic: null };
    }

    let card = firstButton;
    while (card) {
      const cardText = (card.innerText ?? "").toUpperCase();
      if (
        cardText.includes("CRIME") &&
        cardText.includes("AVAILABLE COUNTERMEASURES") &&
        actionFragments.every((fragment) => cardText.includes(fragment.toUpperCase()))
      ) {
        break;
      }
      card = card.parentElement;
    }

    let scrollViewport = card;
    while (scrollViewport) {
      const styles = getComputedStyle(scrollViewport);
      if (
        scrollViewport.scrollHeight > scrollViewport.clientHeight + 4 &&
        (styles.overflowY === "auto" || styles.overflowY === "scroll")
      ) {
        break;
      }
      scrollViewport = scrollViewport.parentElement;
    }

    const rectData = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const cardRect = rectData(card);
    const viewportRect = rectData(scrollViewport);
    const nextDiagnostic = card?.nextElementSibling;
    return {
      buttons: buttons.map((button) => {
        if (!button) return null;
        const rect = button.getBoundingClientRect();
        const centerElement = document.elementFromPoint(
          (rect.left + rect.right) / 2,
          (rect.top + rect.bottom) / 2,
        );
        return {
          label: button.getAttribute("aria-label"),
          role: button.getAttribute("role"),
          tag: button.tagName,
          tabIndex: button.tabIndex,
          rect: rectData(button),
          hitByCenter: centerElement === button || button.contains(centerElement),
        };
      }),
      card: cardRect
        ? { ...cardRect, heightFitsViewport: !!viewportRect && cardRect.height <= viewportRect.height + 1 }
        : null,
      viewport: viewportRect,
      nextDiagnostic: rectData(nextDiagnostic),
    };
  }, fragments);
}

async function assertCrimeActions(page, viewport) {
  const expected = [
    "Build enforcement infrastructure",
    "Deploy more enforcers",
    "Enable a public-order policy",
    "Repeal the black-market ore mining policy",
  ];

  for (const [index, fragment] of expected.entries()) {
    const scrolled = await page.evaluate((needle) => {
      const target = needle.toUpperCase();
      const button = [...document.querySelectorAll('[role="button"], button')].find((element) =>
        (element.getAttribute("aria-label")?.toUpperCase() ?? "").includes(target),
      );
      if (!button) return false;
      button.scrollIntoView({ block: "center", inline: "nearest" });
      return true;
    }, fragment);
    if (!scrolled) throw new Error(`Crime overview action was missing: ${fragment}`);
    await sleep(100);

    const inspection = await inspectCrimeCard(page, expected);
    const action = inspection.buttons[index];
    if (!action || !inspection.card || !inspection.viewport) {
      throw new Error(`Crime overview action disappeared at ${viewport.name}: ${fragment}`);
    }
    const { rect } = action;
    const { card, viewport: scrollViewport, nextDiagnostic } = inspection;
    const inside = (inner, outer) =>
      inner.left >= outer.left - 1 &&
      inner.right <= outer.right + 1 &&
      inner.top >= outer.top - 1 &&
      inner.bottom <= outer.bottom + 1;

    if (!action.label?.toUpperCase().includes("TAP TO GO THERE")) {
      throw new Error(`Crime overview action lacks an accessibility label at ${viewport.name}: ${JSON.stringify(action)}`);
    }
    if (action.role !== "button" && action.tag !== "BUTTON") {
      throw new Error(`Crime overview action is not a button at ${viewport.name}: ${JSON.stringify(action)}`);
    }
    if (action.tabIndex < 0) {
      throw new Error(`Crime overview action is not keyboard reachable at ${viewport.name}: ${JSON.stringify(action)}`);
    }
    if (rect.width < 100 || rect.height < 44) {
      throw new Error(`Crime overview action is too small at ${viewport.name}: ${fragment} ${JSON.stringify(action)}`);
    }
    if (!inside(rect, card)) {
      throw new Error(`Crime overview action is clipped by its card at ${viewport.name}: ${fragment} ${JSON.stringify(inspection)}`);
    }
    if (!inside(rect, scrollViewport)) {
      throw new Error(`Crime overview action is not scroll-reachable at ${viewport.name}: ${fragment} ${JSON.stringify(inspection)}`);
    }
    if (rect.left < -1 || rect.right > page.viewport().width + 1 || !action.hitByCenter) {
      throw new Error(`Crime overview action is obscured or clipped at ${viewport.name}: ${fragment} ${JSON.stringify(inspection)}`);
    }
    if (nextDiagnostic && card.bottom > nextDiagnostic.top + 1) {
      throw new Error(`Crime overview card overlaps the next diagnostic at ${viewport.name}: ${JSON.stringify(inspection)}`);
    }
  }
  return expected;
}

async function clickCrimeAction(page, textFragment) {
  const clicked = await page.evaluate((fragment) => {
    const needle = fragment.toUpperCase();
    const button = [...document.querySelectorAll('[role="button"], button')].find((element) => {
      const rect = element.getBoundingClientRect();
      const label = element.getAttribute("aria-label")?.toUpperCase() ?? "";
      return rect.width > 0 && rect.height > 0 && label.includes(needle);
    });
    if (!button) return false;
    button.scrollIntoView({ block: "center", inline: "nearest" });
    button.click();
    return true;
  }, textFragment);
  if (!clicked) throw new Error(`Could not click crime overview action containing: ${textFragment}`);
}

async function assertCrimeDestination(page, action) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (action.path.some((suffix) => new URL(page.url()).pathname.endsWith(suffix))) break;
    await sleep(250);
  }
  if (!action.path.some((suffix) => new URL(page.url()).pathname.endsWith(suffix))) {
    throw new Error(`Timed out waiting for ${action.name}; current URL: ${page.url()}`);
  }
  await waitForVisibleText(page, action.screen);
  if (action.params) {
    const url = new URL(page.url());
    for (const [key, value] of Object.entries(action.params)) {
      if (url.searchParams.get(key) !== value) {
        throw new Error(`Crime overview ${action.name} params were wrong: ${url.href}`);
      }
    }
  }
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: resolveChromium(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|net::|404/.test(message.text())) errors.push(message.text());
  });

  try {
    await page.setViewport({ width: 402, height: 874 });
    await page.goto(`${BASE_URL}/?demo=1&go=overview`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await waitFor(page, () => document.body?.innerText.includes("CITY STATUS MATRIX"));
    await waitFor(page, () => document.body?.innerText.includes("OPEN WILDLANDS"));

    const actionRect = await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('[role="button"]')).find(
        (node) => node.textContent?.includes("OPEN WILDLANDS"),
      );
      if (!button) return null;
      button.scrollIntoView({ block: "center", inline: "nearest" });
      const rect = button.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
    });
    if (!actionRect) throw new Error("OPEN WILDLANDS advisory action was not rendered");
    if (actionRect.left < 0 || actionRect.right > 402 || actionRect.width < 100 || actionRect.height < 28) {
      throw new Error(`Advisory action is clipped or too small: ${JSON.stringify(actionRect)}`);
    }

    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('[role="button"]')).find(
        (node) => node.textContent?.includes("OPEN WILDLANDS"),
      );
      button?.click();
    });
    await waitFor(page, () =>
      location.pathname.includes("wildlands") &&
      document.body?.innerText.includes("BIOSPHERE BREAKDOWN"),
      30000,
    );

    const crimeActions = [
      {
        name: "construction",
        text: "Build enforcement infrastructure",
        path: ["/construction"],
        screen: "CONSTRUCTION",
        params: { category: "security", highlight: "sectorHouseHQ" },
      },
      {
        name: "military",
        text: "Deploy more enforcers",
        path: ["/military"],
        screen: "MILITARY",
      },
      {
        name: "law",
        text: "Enable a public-order policy",
        path: ["/law"],
        screen: "LAW / JUSTICE / SECURITY",
      },
      {
        name: "mining",
        text: "Repeal the black-market ore mining policy",
        path: ["/mining"],
        screen: "MINING",
      },
    ];

    for (const viewport of NARROW_VIEWPORTS) {
      await page.setViewport(viewport);
      await openCrimeOverview(page);
      await assertCrimeActions(page, viewport);
      console.log(`[e2e] PASS: expanded crime recovery card is readable and keyboard reachable at ${viewport.name}`);

      for (const action of crimeActions) {
        await openCrimeOverview(page);
        await clickCrimeAction(page, action.text);
        await assertCrimeDestination(page, action);
        console.log(`[e2e] PASS: overview crime action reaches ${action.name} at ${viewport.name}`);
      }
    }

    if (errors.length) throw new Error(`Browser errors:\n${errors.join("\n")}`);
    console.log("[e2e] PASS: phone City overview advisories and crime recovery links are readable and tappable");
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});