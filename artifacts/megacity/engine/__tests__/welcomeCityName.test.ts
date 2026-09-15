import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { buildWelcomeBody, createInitialState } from "@/engine/initialState";

describe("welcome transmission city-name interpolation", () => {
  it("buildWelcomeBody interpolates the chosen city name", () => {
    const body = buildWelcomeBody("NEW HAVEN");
    expect(body).toContain("appointed to command NEW HAVEN.");
    expect(body).not.toContain("MEGACITY JUAN");
  });

  it("createInitialState bakes the placeholder default via the same template", () => {
    const state = createInitialState();
    const welcome = state.messages.find((m) => m.id === "msg-welcome");
    expect(welcome).toBeDefined();
    expect(welcome?.body).toBe(buildWelcomeBody("MEGACITY JUAN"));
    expect(welcome?.body).toContain("appointed to command MEGACITY JUAN.");
  });

  it("rewriting msg-welcome swaps only the welcome body (confirmCharCreate contract)", () => {
    const state = createInitialState();
    const chosen = "STEEL HARBOR";
    const rewritten = state.messages.map((m) =>
      m.id === "msg-welcome" ? { ...m, body: buildWelcomeBody(chosen) } : m,
    );
    const welcome = rewritten.find((m) => m.id === "msg-welcome");
    expect(welcome?.body).toContain("appointed to command STEEL HARBOR.");
    expect(welcome?.body).not.toContain("MEGACITY JUAN");
    expect(rewritten.length).toBe(state.messages.length);
    for (const m of rewritten) {
      if (m.id !== "msg-welcome") {
        expect(m).toEqual(state.messages.find((o) => o.id === m.id));
      }
    }
  });

  it("onboarding arrival beat interpolates state.cityName instead of a hardcoded name", () => {
    // The onboarding screen can't be imported in node (native module graph),
    // so assert against its source text — same approach as other
    // screen-embedded-config tests in this repo.
    const src = readFileSync(
      join(__dirname, "..", "..", "app", "(game)", "onboarding.tsx"),
      "utf8",
    );
    expect(src).toContain('${state.cityName || "MEGACITY JUAN"}');
    expect(src).not.toContain('"MEGACITY JUAN. Nine hundred eighty thousand');
  });
});
