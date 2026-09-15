import { CLASS_DEFS } from "@/engine/retinueData";
import type { Troop } from "@/engine/retinueData";

export type UnitRole =
  | "FRONTLINE"
  | "RANGED"
  | "RECONNAISSANCE"
  | "ENGINEERING"
  | "MEDICAL SUPPORT"
  | "LOGISTICS"
  | "MOBILITY"
  | "CIVIC SUPPORT"
  | "SPECIAL OPERATIONS";

export const UNIT_ROLE_ORDER: readonly UnitRole[] = [
  "FRONTLINE",
  "RANGED",
  "RECONNAISSANCE",
  "ENGINEERING",
  "MEDICAL SUPPORT",
  "LOGISTICS",
  "MOBILITY",
  "CIVIC SUPPORT",
  "SPECIAL OPERATIONS",
];

export const UNIT_ROLE_SHORT_LABEL: Record<UnitRole, string> = {
  FRONTLINE: "FRONTLINE",
  RANGED: "RANGED",
  RECONNAISSANCE: "RECON",
  ENGINEERING: "ENGINEERING",
  "MEDICAL SUPPORT": "MEDICAL",
  LOGISTICS: "LOGISTICS",
  MOBILITY: "MOBILITY",
  "CIVIC SUPPORT": "CIVIC",
  "SPECIAL OPERATIONS": "SPEC-OPS",
};

export const UNIT_ROLE_ICON: Record<UnitRole, string> = {
  FRONTLINE: "shield-account",
  RANGED: "target",
  RECONNAISSANCE: "binoculars",
  ENGINEERING: "wrench",
  "MEDICAL SUPPORT": "medical-bag",
  LOGISTICS: "truck",
  MOBILITY: "car",
  "CIVIC SUPPORT": "account-group",
  "SPECIAL OPERATIONS": "ninja",
};

const CATEGORY_ROLES: Record<string, UnitRole> = {
  "Law Enforcement": "FRONTLINE",
  "Riot Control": "FRONTLINE",
  "Elite Units": "FRONTLINE",
  Drones: "RANGED",
  Intelligence: "RECONNAISSANCE",
  Military: "FRONTLINE",
  Vehicles: "MOBILITY",
  "Air Units": "RANGED",
  "Workers & Logistics": "ENGINEERING",
  "Medical & Disaster": "MEDICAL SUPPORT",
  "Industrial Workers": "ENGINEERING",
  "Research & Tech": "ENGINEERING",
  "Special Operations": "SPECIAL OPERATIONS",
  "Civic Staff": "CIVIC SUPPORT",
  "Wildlands Operations": "SPECIAL OPERATIONS",
  "Frontier Units": "RECONNAISSANCE",
  "Enforcement Units": "FRONTLINE",
  "Military Expanded": "FRONTLINE",
  "Land Vehicles": "MOBILITY",
  "Aerial Vehicles": "MOBILITY",
  "Space Navy": "RANGED",
  "Biosphere Units": "SPECIAL OPERATIONS",
  "Civic Droids": "CIVIC SUPPORT",
  "Construction Droids": "ENGINEERING",
  "Military Droids": "FRONTLINE",
};

export function isUnitRole(value: unknown): value is UnitRole {
  return typeof value === "string" && UNIT_ROLE_ORDER.includes(value as UnitRole);
}

/**
 * Retinue classes and recruitment entries share this shape. Recruitment
 * metadata is preferred when valid, while the text/category inference below
 * keeps older saves and external catalog data compatible.
 */
export type UnitRoleDefinition = {
  label?: string;
  name?: string;
  category?: string;
  description?: string;
  battlefieldRole?: unknown;
};

export function getUnitRole(def: UnitRoleDefinition): UnitRole | null {
  if (isUnitRole(def.battlefieldRole)) return def.battlefieldRole;
  const text = `${def.label ?? def.name ?? ""} ${def.category ?? ""} ${def.description ?? ""}`.toLowerCase();

  if (/\b(medical|hospital|disease|biohazard|paramedic|triage)\b/.test(text)) {
    return "MEDICAL SUPPORT";
  }
  if (/\b(surveillance|recon|scout|intelligence|forensic|investigator\w*|evidence|exploration|informant|analyst\w*)\b/.test(text)) {
    return "RECONNAISSANCE";
  }
  if (/\b(engineer\w*|repair\w*|construction|utility|power plant|mining|factory|processing|salvage)\b/.test(text)) {
    return "ENGINEERING";
  }
  if (/\b(artillery|gunship|heavy weapon\w*|tactical combat|drone warfare|orbital|indirect fire|assault tank|gun carrier)\b/.test(text)) {
    return "RANGED";
  }
  if (/\b(black ops|covert|mutant|rogue hunter|experimental combat|wildlands)\b/.test(text)) {
    return "SPECIAL OPERATIONS";
  }
  if (/\b(bike|motorcycle|car|apc|carrier|hauler|rover|vehicle|flyer|drop ship|cavalry)\b/.test(text)) {
    return "MOBILITY";
  }
  if (/\b(supply|logistics|transport)\b/.test(text)) {
    return "LOGISTICS";
  }
  if (/\b(census|welfare|propaganda|mediator|district administrator|civic)\b/.test(text)) {
    return "CIVIC SUPPORT";
  }

  return CATEGORY_ROLES[def.category ?? ""] ?? null;
}

export type TroopRoleSummary = Record<UnitRole, number>;

export function summarizeTroopRoles(
  troops: ReadonlyArray<Pick<Troop, "classId">>,
): TroopRoleSummary {
  const out = Object.fromEntries(
    UNIT_ROLE_ORDER.map((role) => [role, 0]),
  ) as TroopRoleSummary;

  for (const troop of troops) {
    const classDef = CLASS_DEFS.find((def) => def.id === troop.classId);
    const role = classDef ? getUnitRole(classDef) : null;
    if (role) out[role] += 1;
  }
  return out;
}