import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Tripwire for Task #465: the char-create modal (app/index.tsx) must never
// silently overwrite the saved Settings default start style. Persisting the
// pick as the new default is gated on an explicit "remember this choice"
// opt-in checkbox. app/index.tsx cannot be imported under the node vitest
// environment (it pulls in react-native / expo assets), so we assert against
// its source text — the same readFileSync approach used by
// manualEngineSync.test.ts.

const PKG_ROOT = join(__dirname, "..", "..");
const src = readFileSync(join(PKG_ROOT, "app", "index.tsx"), "utf8");

describe("start-style default opt-in (char-create modal)", () => {
  it("only writes defaultStartStyle when the player opted in via the checkbox", () => {
    // Every write of the saved default inside the char-create flow must be
    // guarded by the rememberStartStyle opt-in. Find each setSetting call for
    // defaultStartStyle in index.tsx and require the opt-in guard nearby.
    const writes = [...src.matchAll(/setSetting\(\s*["']defaultStartStyle["']/g)];
    expect(writes.length, "expected exactly one defaultStartStyle write in index.tsx").toBe(1);
    for (const m of writes) {
      const windowBefore = src.slice(Math.max(0, m.index! - 300), m.index!);
      expect(
        windowBefore,
        "setSetting('defaultStartStyle', ...) must be gated on the rememberStartStyle opt-in",
      ).toMatch(/if\s*\(\s*rememberStartStyle\s*&&/);
    }
  });

  it("resets the opt-in each time the char-create modal opens", () => {
    // startCharCreate must clear the checkbox so a previous run's opt-in never
    // leaks into the next new-game flow.
    const start = src.indexOf("const startCharCreate");
    expect(start, "startCharCreate not found in index.tsx").toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf("};", start));
    expect(body).toContain("setRememberStartStyle(false)");
  });

  it("renders the opt-in checkbox only when the pick differs from the saved default", () => {
    expect(src).toMatch(/startStyle\s*!==\s*defaultStartStyle\s*&&\s*\(/);
    expect(src).toContain('accessibilityRole="checkbox"');
  });
});
