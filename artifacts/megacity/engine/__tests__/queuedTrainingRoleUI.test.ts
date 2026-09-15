import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const recruitmentSource = readFileSync(
  path.resolve(here, "../../app/(game)/recruitment.tsx"),
  "utf8",
);
const militarySource = readFileSync(
  path.resolve(here, "../../app/(game)/military.tsx"),
  "utf8",
);

describe("queued training role UI", () => {
  it.each([
    ["Recruitment", recruitmentSource],
    ["Military", militarySource],
  ])("%s keeps roles visible for queued recruits with a legacy fallback", (_name, source) => {
    expect(source).toContain("o.battlefieldRole");
    expect(source).toContain("isUnitRole(o.battlefieldRole)");
    expect(source).toContain('{" · "}ROLE ·');
    expect(source).toContain('?? "UNASSIGNED"');
  });
});