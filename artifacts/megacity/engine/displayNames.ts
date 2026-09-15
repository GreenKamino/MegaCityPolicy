import { getItemDef } from "@/engine/inventoryData";
import { TECH_MAP } from "@/engine/technologies";
import { WORLD_LOCATIONS } from "@/engine/worldMap";

export function humanizeId(id: string): string {
  if (!id) return "Unknown";
  return id
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function itemDisplayName(itemDefId: string): string {
  const def = getItemDef(itemDefId);
  return def?.name ?? humanizeId(itemDefId);
}

export function techDisplayName(techId: string): string {
  const def = TECH_MAP[techId];
  return def?.name ?? humanizeId(techId);
}

const BANK_NAMES: Record<string, string> = {
  "corpbank": "CorpBank",
  "megacity-central": "MegaCity Central",
};

export function getBankName(bankId: string | null | undefined): string {
  if (!bankId) return "Unknown Bank";
  return BANK_NAMES[bankId] ?? humanizeId(bankId);
}

export interface NamedZoneLike {
  id: string;
  name?: string;
}

export function getZoneName(zones: ReadonlyArray<NamedZoneLike> | null | undefined, zoneId: string | null | undefined): string {
  if (!zoneId) return "Unknown Zone";
  const z = zones?.find((zone) => zone.id === zoneId);
  return z?.name ?? humanizeId(zoneId);
}

export function getNodeName(nodeId: string | null | undefined): string {
  if (!nodeId) return "Unknown Node";
  return WORLD_LOCATIONS.find((l) => l.id === nodeId)?.name ?? humanizeId(nodeId);
}

export interface NamedFactionLike {
  id: string;
  name?: string;
}

export function getFactionName(
  factions: ReadonlyArray<NamedFactionLike> | null | undefined,
  factionId: string | null | undefined,
): string {
  if (!factionId) return "Unaffiliated";
  const f = factions?.find((fac) => fac.id === factionId);
  return f?.name ?? humanizeId(factionId);
}
