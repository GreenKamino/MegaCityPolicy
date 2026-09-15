import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StartupHydrationTimeoutError,
  createStartupAttemptGuard,
  withStartupDeadline,
} from "../startupHydration";

const contextSource = fs.readFileSync(
  path.resolve(process.cwd(), "context/GameContext.tsx"),
  "utf8",
);
const menuSource = fs.readFileSync(
  path.resolve(process.cwd(), "app/index.tsx"),
  "utf8",
);
const layoutSource = fs.readFileSync(
  path.resolve(process.cwd(), "app/_layout.tsx"),
  "utf8",
);
const timeoutNoticeSource = fs.readFileSync(
  path.resolve(process.cwd(), "components/BootTimeoutNotice.tsx"),
  "utf8",
);

describe("main-menu startup hydration", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not run synchronous offline catch-up before boot hydration completes", () => {
    const initStart = contextSource.indexOf("// ─── STARTUP HYDRATION");
    const initEnd = contextSource.indexOf("// The dev-only demo seeder", initStart);
    const initSource = contextSource.slice(initStart, initEnd);

    expect(initStart).toBeGreaterThan(-1);
    expect(initEnd).toBeGreaterThan(initStart);
    expect(initSource).not.toContain("runOfflineCatchup(");
    expect(initSource).toContain("setState(previewState);");
  });

  it("performs the deferred slot load when CONTINUE is pressed", () => {
    const continueStart = menuSource.indexOf("const handleContinue = async");
    const continueEnd = menuSource.indexOf("// Quick \"NEW GAME\"", continueStart);
    const continueSource = menuSource.slice(continueStart, continueEnd);

    expect(continueStart).toBeGreaterThan(-1);
    expect(continueEnd).toBeGreaterThan(continueStart);
    expect(continueSource).toContain("await loadSlot(activeSlot)");
    expect(continueSource).toContain('router.push("/(game)/overview")');
  });

  it("keeps preview hydration out of tick, autosave, and background-save paths", () => {
    expect(contextSource).toContain("if (!isLoaded || !isCitySessionActive || autoSaveMinutes === 0) return;");
    expect(contextSource).toContain(
      "if (!isLoaded || (!isCitySessionActive && !isReadOnlyLiveFixture)) return;",
    );
    expect(contextSource).toContain("if (!citySessionActiveRef.current) return false;");
    expect(contextSource).toContain("if (!citySessionActiveRef.current) {");
    expect(contextSource).toContain("citySessionActiveRef.current = true;");
    expect(contextSource).toContain("setIsCitySessionActive(true);");
    expect(contextSource).toContain("await refreshSlotMetas(saveSession.profileId);");
    expect(contextSource).toContain("if (!requestStillCurrent()) return false;");
    expect(contextSource).toContain("syncProfileFromGameState(saveProfileSnapshot, toSave)");
  });

  it("shares one short startup budget across profile and slot cloud work", () => {
    expect(contextSource).toContain("const startupCloudDeadline = Date.now() + 5000;");
    expect(contextSource).toContain("bootstrapProfilesFromCloudIfEmpty(");
    expect(contextSource).toContain("reconcileCloudSaves(");
    expect(contextSource).toContain("attempt.isActive() && withinStartupCloudBudget()");
  });

  it("restores normal hydration before reporting the provider ready", () => {
    const initStart = contextSource.indexOf("// ─── STARTUP HYDRATION");
    const initEnd = contextSource.indexOf("// The dev-only demo seeder", initStart);
    const initSource = contextSource.slice(initStart, initEnd);

    expect(initSource).toContain("let profiles = await awaitStartup(loadAllProfilesStrict())");
    expect(initSource.indexOf("loadAllProfilesStrict()")).toBeLessThan(
      initSource.indexOf("bootstrapProfilesFromCloudIfEmpty("),
    );
    expect(initSource).toContain("const lastProfileId = await awaitStartup(loadActiveProfileId())");
    expect(initSource).toContain("setState(previewState)");
    expect(initSource).toContain('finishStartup("ready")');
    expect(initSource.indexOf('finishStartup("ready")')).toBeLessThan(
      initSource.indexOf("sweepStaleTmpKeys("),
    );
  });

  it("treats malformed profile and slot data as incomplete instead of empty", () => {
    expect(contextSource).toContain("loadAllProfilesStrict()");
    expect(contextSource).toContain("if (strict) throw error;");
    expect(contextSource).toContain("readSlotMetas(selectedProfile?.id ?? null, true)");
    expect(contextSource).toContain("() => attempt.isActive() && withinStartupCloudBudget()");
  });

  it("bounds a deliberately non-resolving storage operation", async () => {
    vi.useFakeTimers();
    const never = new Promise<string>(() => {});
    const pending = withStartupDeadline(never, Date.now() + 25);
    const rejection = expect(pending).rejects.toBeInstanceOf(StartupHydrationTimeoutError);

    await vi.advanceTimersByTimeAsync(25);

    await rejection;
  });

  it("prevents a late result from an abandoned startup attempt being applied", async () => {
    vi.useFakeTimers();
    const attempt = createStartupAttemptGuard();
    let resolveLate!: (value: string) => void;
    const late = new Promise<string>((resolve) => {
      resolveLate = resolve;
    });
    const pending = withStartupDeadline(late, Date.now() + 25);
    let applied = "";
    void pending.then((value) => {
      if (attempt.isActive()) applied = value;
    }).catch(() => {});

    await vi.advanceTimersByTimeAsync(25);
    attempt.abandon();
    resolveLate("stale");
    await Promise.resolve();

    expect(applied).toBe("");
  });

  it("hands the visible boot overlay to a recoverable menu state", () => {
    expect(layoutSource).toContain("if (gameHydratedRef.current) return;");
    expect(layoutSource).toContain("setGameHydrated(true);");
    expect(layoutSource).toContain("<BootRecoveryNotice reason={bootFailureReason} />");
    expect(layoutSource).toContain("retryStartupHydration");
    expect(timeoutNoticeSource).toContain("SAVE DATA NOT FULLY LOADED");
    expect(timeoutNoticeSource).toContain("RETRY LOAD");
    expect(timeoutNoticeSource).toContain("RESTART APP");
    expect(timeoutNoticeSource).toContain("Nothing was deleted or overwritten.");
  });

  it("reuses one guarded hydration pipeline for in-place retries", () => {
    expect(contextSource).toContain("const hydrateStartup = useCallback(async (): Promise<boolean>");
    expect(contextSource).toContain("const retryStartupHydration = useCallback((): Promise<boolean>");
    expect(contextSource).toContain("startupHydrationInFlightRef.current");
    expect(contextSource).toContain("startupAttemptRef.current?.abandon();");
    expect(contextSource).toContain("setBootHydrationStatus(\"pending\");");
  });

  it("stages slot metadata until the same final commit as the preview", () => {
    const initStart = contextSource.indexOf("// ─── STARTUP HYDRATION");
    const initEnd = contextSource.indexOf("// The dev-only demo seeder", initStart);
    const initSource = contextSource.slice(initStart, initEnd);

    expect(initSource).toContain("const stagedSlotMetas = await awaitStartup(");
    expect(initSource).toContain("readSlotMetas(selectedProfile?.id ?? null, true)");
    expect(initSource).toContain("setSlotMetas(stagedSlotMetas);");
    expect(initSource).toContain("setState(previewState);");
    expect(initSource.indexOf("setSlotMetas(stagedSlotMetas);")).toBeLessThan(
      initSource.indexOf('finishStartup("ready")'),
    );
    expect(initSource.indexOf("const stagedSlotMetas")).toBeLessThan(
      initSource.indexOf("setSlotMetas(stagedSlotMetas);"),
    );
  });
});