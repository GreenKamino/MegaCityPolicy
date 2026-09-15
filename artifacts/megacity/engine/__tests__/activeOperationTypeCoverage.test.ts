import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Drift guard: ActiveOperationType coverage in OPERATION_DEFS.
 *
 * ActiveOperationType is a 10-member union exported from
 * engine/types.ts. The dispatcher OPERATION_DEFS in
 * engine/diplomacyEngine.ts maps DiplomaticActionId → operation
 * config, where each config carries a `type: ActiveOperationType`.
 *
 * If a union member never appears as a `type:` literal in
 * OPERATION_DEFS, that operation kind is unreachable through normal
 * diplomatic action flow — silent dead union member. Conversely a
 * `type:` literal not in the union is caught by tsc, but only if
 * `Record<...>` types are not loosened later.
 *
 * Both halves are parsed live from source so the test cannot be
 * fooled by mocking either side.
 */

const TYPES_SRC = readFileSync(
  join(__dirname, "..", "types.ts"),
  "utf8",
);
const DIPLO_SRC = readFileSync(
  join(__dirname, "..", "diplomacyEngine.ts"),
  "utf8",
);

function parseActiveOperationTypeUnion(): string[] {
  const m = TYPES_SRC.match(
    /export type ActiveOperationType\s*=\s*([\s\S]*?);/,
  );
  expect(m).not.toBeNull();
  return (m![1].match(/"([a-zA-Z-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

function extractOperationDefsBlock(): string {
  // Match from `const OPERATION_DEFS` to its closing `};` at column 0.
  const m = DIPLO_SRC.match(
    /const OPERATION_DEFS[\s\S]*?^\};$/m,
  );
  expect(m, "OPERATION_DEFS block not found").not.toBeNull();
  return m![0];
}

function parseTypeLiterals(block: string): string[] {
  return (block.match(/type:\s*"([a-zA-Z-]+)"/g) ?? []).map((s) =>
    s.replace(/^type:\s*"/, "").replace(/"$/, ""),
  );
}

describe("ActiveOperationType coverage drift guard", () => {
  const union = parseActiveOperationTypeUnion();
  const block = extractOperationDefsBlock();
  const literals = parseTypeLiterals(block);

  it("parses the ActiveOperationType union from types.ts", () => {
    expect(union.length).toBe(10);
    for (const anchor of [
      "blockade",
      "embargo",
      "sanctions",
      "gun-pipeline",
    ]) {
      expect(union).toContain(anchor);
    }
  });

  it("OPERATION_DEFS declares the documented number of entries", () => {
    // Top-level keys (action ids). Lines beginning with two-space
    // indent + double-quoted identifier + colon. Pinning the count
    // forces explicit review when the dispatcher grows or shrinks.
    const topLevelKeys =
      block.match(/^  "[a-zA-Z-]+":\s*\{/gm) ?? [];
    expect(topLevelKeys.length).toBe(12);
  });

  it("every ActiveOperationType union member appears in OPERATION_DEFS", () => {
    const used = new Set(literals);
    const missing = union.filter((u) => !used.has(u));
    expect(missing).toEqual([]);
  });

  it("every `type:` literal in OPERATION_DEFS is a valid union member", () => {
    const unionSet = new Set(union);
    const orphans = literals.filter((l) => !unionSet.has(l));
    expect(orphans).toEqual([]);
  });

  it("type literal count matches the entry count (one type per entry)", () => {
    // If an entry ever gets two `type:` keys via copy-paste or one
    // entry omits it entirely, this catches it before tsc would
    // (since OPERATION_DEFS values are typed).
    const topLevelKeys =
      block.match(/^  "[a-zA-Z-]+":\s*\{/gm) ?? [];
    expect(literals.length).toBe(topLevelKeys.length);
  });
});
