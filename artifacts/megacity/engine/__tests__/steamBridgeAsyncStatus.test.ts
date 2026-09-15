import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Platform: { OS: "web" },
}));

describe("Steam bridge async status checks", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not treat a Promise resolving false as initialized/available", async () => {
    vi.stubGlobal("window", {
      steamworks: {
        isInitialized: vi.fn().mockResolvedValue(false),
        cloud: {
          isCloudEnabled: vi.fn().mockResolvedValue(true),
        },
      },
    });

    const bridge = await import("@/engine/steamBridge");
    expect(await bridge.initSteamBridge()).toBe(false);
    expect(bridge.isSteamAvailable()).toBe(false);
    expect(bridge.isSteamCloudAvailable()).toBe(false);
  });

  it("caches resolved Steam and cloud availability as booleans", async () => {
    vi.stubGlobal("window", {
      steamworks: {
        isInitialized: vi.fn().mockResolvedValue(true),
        cloud: {
          isCloudEnabled: vi.fn().mockResolvedValue(true),
        },
      },
    });

    const bridge = await import("@/engine/steamBridge");
    expect(await bridge.initSteamBridge()).toBe(true);
    expect(bridge.isSteamAvailable()).toBe(true);
    expect(bridge.isSteamCloudAvailable()).toBe(true);
  });

  it("times out a Steam IPC status check instead of hanging boot", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      steamworks: {
        isInitialized: vi.fn(() => new Promise<boolean>(() => {})),
      },
    });

    const bridge = await import("@/engine/steamBridge");
    const init = bridge.initSteamBridge();
    await vi.advanceTimersByTimeAsync(1500);

    await expect(init).resolves.toBe(false);
    expect(bridge.isSteamAvailable()).toBe(false);
  });
});