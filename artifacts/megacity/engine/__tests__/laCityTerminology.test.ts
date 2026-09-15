import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const MEGACITY_ROOT = path.resolve(__dirname, "../..");
const EXCLUDED_DIRECTORIES = new Set(["__tests__", "content"]);

function canonicalSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return EXCLUDED_DIRECTORIES.has(entry.name) ? [] : canonicalSourceFiles(file);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) ? [file] : [];
  });
}

describe("LA CITY player-facing terminology", () => {
  it("does not retain the retired Khanate player-facing prose in canonical source", () => {
    // Test fixtures are deliberately excluded so synthetic legacy-save inputs
    // remain possible. The durable `iron-khanate` ID is also unaffected: this
    // checks only player-facing prose, never machine identifiers.
    const retiredProse = /\b(?:iron\s+khanate|khan\s+torgrim|war-herald|tribute-state)\b/i;
    const stale = [
      ...canonicalSourceFiles(path.join(MEGACITY_ROOT, "engine")),
      ...canonicalSourceFiles(path.join(MEGACITY_ROOT, "components")),
      ...canonicalSourceFiles(path.join(MEGACITY_ROOT, "app")),
    ].flatMap((file) => {
      const text = fs.readFileSync(file, "utf8");
      return retiredProse.test(text) ? [path.relative(MEGACITY_ROOT, file)] : [];
    });

    expect(stale, `retired LA CITY prose in: ${stale.join(", ")}`).toEqual([]);
  });
});