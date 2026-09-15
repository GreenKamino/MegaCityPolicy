import { vi } from "vitest";

/**
 * Keep exact rate and budget assertions isolated from unrelated random
 * events, incidents, ecology rolls, and officer spawns.
 *
 * 0.99 is above every random-spawner threshold used by the live tick pipeline.
 * Tests that intentionally exercise a random branch must use their own
 * explicit fixture instead of this helper.
 */
export const NO_SPAWN_RANDOM = 0.99;

export function mockNoSpawnRandom() {
  return vi.spyOn(Math, "random").mockReturnValue(NO_SPAWN_RANDOM);
}