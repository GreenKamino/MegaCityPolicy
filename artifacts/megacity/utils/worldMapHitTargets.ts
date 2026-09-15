import type { WorldLocationType } from "@/engine/worldMap";

// Map nodes share densely packed coordinates. Higher-priority nodes render
// above lower-priority ones so a city marker can never be stolen by a broad
// area-like target simply because that target happened to render later.
const HIT_TARGET_PRIORITY: Record<WorldLocationType, number> = {
  resource_node: 10,
  notable: 20,
  township: 30,
  nation: 40,
  megacity: 50,
  player_city: 60,
};

// Terrain remains discoverable, but its broad interaction areas always sit
// below location nodes — even while its tooltip is visible.
export const WORLD_MAP_TERRAIN_HIT_TARGET_Z_INDEX = 5;

export function getWorldMapHitTargetPriority(type: WorldLocationType): number {
  return HIT_TARGET_PRIORITY[type];
}

type HitTargetLocation = Pick<{
  id: string;
  type: WorldLocationType;
}, "id" | "type">;

// Sorting yields a stable paint order even if the source array is rebuilt in a
// different order. The later sibling receives presses when same-tier marker
// labels overlap, so the id tie-breaker makes that outcome predictable.
export function sortWorldMapLocationsForHitTesting<T extends HitTargetLocation>(locations: readonly T[]): T[] {
  return [...locations].sort((a, b) => {
    const priorityDelta = getWorldMapHitTargetPriority(a.type) - getWorldMapHitTargetPriority(b.type);
    return priorityDelta || a.id.localeCompare(b.id);
  });
}