const DEFAULT_BASE_URL = "http://localhost:80/desktop";
const DEFAULT_PREFLIGHT_TIMEOUT_MS = 15000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function fetchWithTimeout(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function ensureDesktopWrapperReady({
  baseUrl = process.env.E2E_BASE_URL || DEFAULT_BASE_URL,
  preflightTimeoutMs =
    Number(process.env.E2E_DESKTOP_PREFLIGHT_TIMEOUT_MS) ||
    DEFAULT_PREFLIGHT_TIMEOUT_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  fetchImpl = fetch,
  sleepImpl = sleep,
  now = Date.now,
  log = console.log,
} = {}) {
  const basePath = baseUrl.replace(/\/$/, "");
  const statusUrl = `${basePath}/__game-status`;
  const deadline = now() + preflightTimeoutMs;
  let lastFailure = "no response";

  while (now() <= deadline) {
    try {
      const rootResponse = await fetchWithTimeout(
        fetchImpl,
        `${basePath}/`,
        requestTimeoutMs,
      );
      if (!rootResponse.ok) {
        throw new Error(`desktop wrapper returned HTTP ${rootResponse.status}`);
      }
      await rootResponse.text();

      const statusResponse = await fetchWithTimeout(
        fetchImpl,
        statusUrl,
        requestTimeoutMs,
      );
      const statusText = await statusResponse.text();
      if (!statusResponse.ok) {
        throw new Error(
          `desktop readiness returned HTTP ${statusResponse.status}`,
        );
      }
      if (!statusText.includes("packager-status:running")) {
        const responseSummary = statusText.trim().replace(/\s+/g, " ");
        throw new Error(
          `desktop readiness reported "${responseSummary.slice(0, 160) || "empty response"}${
            responseSummary.length > 160 ? "…" : ""
          }"`,
        );
      }

      log(`PASS: desktop wrapper is ready (${statusUrl})`);
      return;
    } catch (error) {
      lastFailure = errorMessage(error);
    }

    if (now() >= deadline) break;
    await sleepImpl(Math.min(1000, deadline - now()));
  }

  throw new Error(
    `Desktop wrapper workflow "artifacts/megacity-desktop: web" is unavailable or not ready at ` +
      `E2E_BASE_URL=${baseUrl} after ${preflightTimeoutMs}ms: ${lastFailure}. ` +
      `Blocked before browser assertions at ${statusUrl}. ` +
      'Start the "artifacts/megacity-desktop: web" and "artifacts/megacity: expo" workflows, then retry.',
  );
}