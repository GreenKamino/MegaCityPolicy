import { LOCATION_POSITIONS } from "./worldMapPositions";

export const MEGACITY_ROSTER_CAP = 10;

/**
 * These entities have fixed map coordinates or route-dependent authored
 * relationships. They are never replaced by a seeded roll.
 */
export const RESERVED_MEGACITY_IDS = [
  "nova-pacifica",
  "iron-khanate",
  "iron-armada",
  "mega-habana",
  "terminus-prime",
  "new-olympus",
  "panopticon",
  "ashfall-dominion",
  "the-recursion",
] as const;

const GENERATED_CANDIDATE_IDS = [
  "helix-commune",
  "aureus-dominion",
  "ghost-meridian",
  "crimson-reach",
] as const;

export type MegacityRosterSource = "reserved" | "generated";

export type MegacityRosterEntry = {
  id: string;
  displayName: string;
  source: MegacityRosterSource;
  locationId: string;
  placement: {
    x: number;
    y: number;
    region: string;
    landOnly: boolean;
  };
};

export type MegacityRosterMetadata = {
  seed: number;
  entries: MegacityRosterEntry[];
};

const DISPLAY_NAMES: Record<string, string> = {
  "nova-pacifica": "Megacity Pacifica",
  "iron-khanate": "LA CITY",
  "iron-armada": "The Iron Armada",
  "mega-habana": "Mega-Habana",
  "terminus-prime": "Terminus Prime",
  "new-olympus": "Olympus",
  panopticon: "Panopticon City",
  "ashfall-dominion": "Ashfall State",
  "the-recursion": "The Recursion",
  "helix-commune": "Helix Commune",
  "aureus-dominion": "Aureus Dominion",
  "ghost-meridian": "Ghost Meridian",
  "crimson-reach": "Red Mesa",
};

export function defaultMegacityDisplayName(id: string): string {
  return DISPLAY_NAMES[id] ?? id;
}

const FALLBACK_POSITION = { x: 740, y: 420 };

export function rosterSeedFromString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextRandom(seed: number): { seed: number; value: number } {
  const next = (Math.imul(seed ^ (seed >>> 16), 2246822519) + 3266489917) >>> 0;
  return { seed: next, value: next / 0x100000000 };
}

function entryFor(id: string, source: MegacityRosterSource, displayName = defaultMegacityDisplayName(id)): MegacityRosterEntry {
  const position = LOCATION_POSITIONS[id] ?? FALLBACK_POSITION;
  const region =
    id === "iron-armada" || id === "the-recursion"
      ? "eastern-coast"
      : id === "nova-pacifica" || id === "iron-khanate" || id === "helix-commune" || id === "ashfall-dominion"
        ? "western-coast"
        : "interior";
  return {
    id,
    displayName,
    source,
    locationId: id,
    placement: { x: position.x, y: position.y, region, landOnly: id !== "iron-armada" },
  };
}

export function validateMegacityRoster(
  roster: MegacityRosterMetadata,
  excludedPositions: Array<{ x: number; y: number }> = [],
): string[] {
  const errors: string[] = [];
  if (roster.entries.length > MEGACITY_ROSTER_CAP) errors.push("megacity cap exceeded");
  if (new Set(roster.entries.map((entry) => entry.id)).size !== roster.entries.length) errors.push("duplicate megacity ID");
  for (const id of RESERVED_MEGACITY_IDS) {
    if (!roster.entries.some((entry) => entry.id === id && entry.source === "reserved")) {
      errors.push(`reserved megacity missing: ${id}`);
    }
  }
  for (const entry of roster.entries) {
    if (!entry.placement.landOnly && entry.source === "generated") errors.push(`generated placement is not land-only: ${entry.id}`);
    if (!Number.isFinite(entry.placement.x) || !Number.isFinite(entry.placement.y)) errors.push(`invalid placement: ${entry.id}`);
    if (excludedPositions.some((point) => Math.hypot(point.x - entry.placement.x, point.y - entry.placement.y) < 18)) {
      errors.push(`placement overlaps exclusion zone: ${entry.id}`);
    }
  }
  for (let index = 0; index < roster.entries.length; index += 1) {
    for (let other = index + 1; other < roster.entries.length; other += 1) {
      const a = roster.entries[index].placement;
      const b = roster.entries[other].placement;
      if (Math.hypot(a.x - b.x, a.y - b.y) < 18) errors.push(`placement overlap: ${roster.entries[index].id}/${roster.entries[other].id}`);
    }
  }
  return errors;
}

export function createMegacityRoster(seed: number, displayNameOverrides: Record<string, string> = {}): MegacityRosterMetadata {
  let randomSeed = seed >>> 0;
  const reserved = RESERVED_MEGACITY_IDS.map((id) => entryFor(id, "reserved", displayNameOverrides[id] ?? DISPLAY_NAMES[id]));
  const candidates = [...GENERATED_CANDIDATE_IDS];
  const generated: MegacityRosterEntry[] = [];
  while (reserved.length + generated.length < MEGACITY_ROSTER_CAP && candidates.length > 0) {
    const roll = nextRandom(randomSeed);
    randomSeed = roll.seed;
    const index = Math.floor(roll.value * candidates.length);
    const [id] = candidates.splice(index, 1);
    generated.push(entryFor(id, "generated", displayNameOverrides[id] ?? DISPLAY_NAMES[id]));
  }
  return { seed: seed >>> 0, entries: [...reserved, ...generated] };
}

export function normalizeMegacityRoster(
  value: Partial<MegacityRosterMetadata> | null | undefined,
  fallbackSeed = 1,
): MegacityRosterMetadata {
  const seed = typeof value?.seed === "number" && Number.isFinite(value.seed) ? value.seed >>> 0 : fallbackSeed >>> 0;
  const overrides = Object.fromEntries(
    (Array.isArray(value?.entries) ? value.entries : [])
      .filter((entry): entry is MegacityRosterEntry => Boolean(entry) && typeof entry.id === "string")
      .map((entry) => [entry.id, typeof entry.displayName === "string" ? entry.displayName.trim().slice(0, 40) : ""])
      .filter(([, displayName]) => Boolean(displayName)),
  );
  return createMegacityRoster(seed, overrides);
}

export function applyMegacityRosterNames<T extends { id: string; name: string }>(
  entities: T[],
  roster: MegacityRosterMetadata,
): T[] {
  const names = new Map(roster.entries.map((entry) => [entry.id, entry.displayName]));
  return entities.map((entity) => {
    const name = names.get(entity.id);
    return name ? { ...entity, name } : entity;
  });
}