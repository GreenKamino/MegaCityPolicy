const DEFAULT_SETTLE_DELAY_MS = 250;
const TARGET_ATTRIBUTE = "data-e2e-target";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForVisibleTestId(page, testId, timeout) {
  await page.waitForFunction(
    (id) => [...document.querySelectorAll(`[data-testid="${id}"]`)].some((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }),
    { timeout },
    testId,
  );
}

async function markVisibleTestId(page, testId, nearestInteractive) {
  const marked = await page.evaluate(({ id, interactive, marker }) => {
    const targets = [...document.querySelectorAll(`[data-testid="${id}"]`)];
    const target = interactive
      ? targets
          .map((candidate) => candidate.closest("[role='button'], button") ?? candidate)
          .find((candidate) => {
            const rect = candidate.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })
      : targets.find((candidate) => {
          const rect = candidate.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
    const element = target;
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    document.querySelectorAll(`[${marker}]`).forEach((node) => node.removeAttribute(marker));
    element.setAttribute(marker, "1");
    element.scrollIntoView({ block: "center", inline: "center" });
    return true;
  }, { id: testId, interactive: nearestInteractive, marker: TARGET_ATTRIBUTE });
  if (!marked) throw new Error(`Could not mark visible test control: ${testId}`);
  const element = await page.$(`[${TARGET_ATTRIBUTE}]`);
  if (!element) throw new Error(`Could not reacquire visible test control: ${testId}`);
  return element;
}

async function clearTarget(page) {
  await page.evaluate((marker) => {
    document.querySelectorAll(`[${marker}]`).forEach((node) => node.removeAttribute(marker));
  }, TARGET_ATTRIBUTE);
}

export async function clickVisibleTestId(page, testId, { settleDelayMs = DEFAULT_SETTLE_DELAY_MS, timeout = 30000 } = {}) {
  const element = await markVisibleTestId(page, testId, true);
  await sleep(settleDelayMs);
  await element.click();
  await clearTarget(page);
}

export async function clickVisibleTestIdCenter(page, testId, { settleDelayMs = DEFAULT_SETTLE_DELAY_MS, timeout = 30000 } = {}) {
  const element = await markVisibleTestId(page, testId, false);
  await sleep(settleDelayMs);
  const box = await element.boundingBox();
  if (!box) throw new Error(`Could not measure visible test control: ${testId}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await clearTarget(page);
}