import assert from "node:assert/strict";
import { test } from "node:test";

import { ensureDesktopWrapperReady } from "./desktopReadiness.mjs";

function response(body, status = 200) {
  return new Response(body, { status });
}

function readinessOptions(fetchImpl) {
  return {
    baseUrl: "http://desktop.test/desktop",
    preflightTimeoutMs: 0,
    requestTimeoutMs: 100,
    fetchImpl,
    sleepImpl: async () => {},
    log: () => {},
  };
}

test("fails fast with recovery guidance when the desktop wrapper is unavailable", async () => {
  await assert.rejects(
    ensureDesktopWrapperReady(
      readinessOptions(async () => {
        throw new Error("connect ECONNREFUSED");
      }),
    ),
    (error) => {
      assert.match(
        error.message,
        /Desktop wrapper workflow "artifacts\/megacity-desktop: web" is unavailable or not ready/,
      );
      assert.match(error.message, /E2E_BASE_URL=http:\/\/desktop\.test\/desktop/);
      assert.match(error.message, /Blocked before browser assertions at http:\/\/desktop\.test\/desktop\/__game-status/);
      assert.match(error.message, /Start the "artifacts\/megacity-desktop: web" and "artifacts\/megacity: expo" workflows/);
      assert.match(error.message, /connect ECONNREFUSED/);
      return true;
    },
  );
});

test("fails before browser assertions when the packager is not ready", async () => {
  const requestedUrls = [];
  await assert.rejects(
    ensureDesktopWrapperReady(
      readinessOptions(async (url) => {
        requestedUrls.push(url);
        return url.endsWith("/__game-status")
          ? response("packager-status:starting")
          : response("<html>desktop wrapper</html>");
      }),
    ),
    /desktop readiness reported "packager-status:starting"/,
  );
  assert.deepEqual(requestedUrls, [
    "http://desktop.test/desktop/",
    "http://desktop.test/desktop/__game-status",
  ]);
});

test("accepts the wrapper only when its packager status is running", async () => {
  const requestedUrls = [];
  await ensureDesktopWrapperReady({
    ...readinessOptions(async (url) => {
      requestedUrls.push(url);
      return url.endsWith("/__game-status")
        ? response("packager-status:running")
        : response("<html>desktop wrapper</html>");
    }),
    log: () => {},
  });
  assert.deepEqual(requestedUrls, [
    "http://desktop.test/desktop/",
    "http://desktop.test/desktop/__game-status",
  ]);
});