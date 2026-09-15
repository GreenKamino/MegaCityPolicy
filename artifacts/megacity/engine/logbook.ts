// Personal Logbook — entity-discovery codex.
//
// Distinct from the static reference codex (codex.tsx) and the lore archive
// (lore.tsx). The logbook tracks WHICH entities the player has actually
// encountered in their current run: factions, megacities, named characters,
// notable locations, townships. Locked entries are hidden behind redacted
// stubs so the player can see how much of the world is still uncharted.
//
// Pure derivation — no new persisted state.

import type { GameState } from "@/engine/types";

export type LogbookCategoryId =
  | "factions"
  | "megacities"
  | "townships"
  | "locations"
  | "namedCharacters";

export type LogbookEntry = {
  id: string;
  name: string;
  subtitle?: string;
  description?: string;
  discovered: boolean;
};

export type LogbookCategory = {
  id: LogbookCategoryId;
  label: string;
  icon: string;
  entries: LogbookEntry[];
};

const CATEGORY_META: Record<LogbookCategoryId, { label: string; icon: string }> = {
  factions: { label: "FACTIONS", icon: "users" },
  megacities: { label: "MEGACITIES", icon: "globe" },
  townships: { label: "TOWNSHIPS", icon: "home" },
  locations: { label: "NOTABLE LOCATIONS", icon: "map-pin" },
  namedCharacters: { label: "NAMED CHARACTERS", icon: "user" },
};

export function buildLogbook(state: GameState): LogbookCategory[] {
  const factions: LogbookEntry[] = (state.factions ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    subtitle: f.type ? f.type.toUpperCase() : undefined,
    description: f.description,
    discovered: !!f.isActive,
  }));

  const megacities: LogbookEntry[] = (state.externalMegacities ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    subtitle: m.factionType?.toUpperCase(),
    description: m.description,
    discovered: !!m.isActive,
  }));

  const townships: LogbookEntry[] = (state.townships ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    subtitle: t.factionType?.toUpperCase(),
    description: t.description,
    discovered: t.status !== "undiscovered",
  }));

  const locations: LogbookEntry[] = (state.notableLocations ?? []).map((loc) => ({
    id: loc.id,
    name: loc.name,
    subtitle: loc.type?.toUpperCase(),
    description: loc.description,
    discovered: !!loc.discovered,
  }));

  const namedCharacters: LogbookEntry[] = (state.namedCharacters ?? []).map((c: any) => ({
    id: c.id ?? c.name ?? "?",
    name: c.name ?? "Unknown",
    subtitle: c.role?.toUpperCase() ?? c.factionId?.toUpperCase(),
    description: c.bio ?? c.background ?? c.description,
    // Named characters are only ever added to state once met; treat presence
    // as discovery.
    discovered: true,
  }));

  return [
    { id: "factions", ...CATEGORY_META.factions, entries: factions },
    { id: "megacities", ...CATEGORY_META.megacities, entries: megacities },
    { id: "townships", ...CATEGORY_META.townships, entries: townships },
    { id: "locations", ...CATEGORY_META.locations, entries: locations },
    { id: "namedCharacters", ...CATEGORY_META.namedCharacters, entries: namedCharacters },
  ];
}

export function summarizeCategory(cat: LogbookCategory): { discovered: number; total: number } {
  let n = 0;
  for (const e of cat.entries) if (e.discovered) n++;
  return { discovered: n, total: cat.entries.length };
}

export function summarizeLogbook(state: GameState): { discovered: number; total: number } {
  let d = 0;
  let t = 0;
  for (const cat of buildLogbook(state)) {
    const s = summarizeCategory(cat);
    d += s.discovered;
    t += s.total;
  }
  return { discovered: d, total: t };
}
