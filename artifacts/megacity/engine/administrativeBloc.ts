import type { Faction, FactionDomain } from "@/engine/types";

/**
 * The Administrative Bloc is a city-wide institutional faction, not a
 * collection of named characters. Keep its identity in one small catalog so
 * the working name, color, and domain language can change without touching
 * simulation code.
 */
export const ADMINISTRATIVE_BLOC_ID = "administrative-bloc";
export const ADMINISTRATIVE_BLOC_NAME = "Administrative Bloc";
export const ADMINISTRATIVE_BLOC_COLOR = "#4FD1C5";
export const ADMINISTRATIVE_BLOC_ROLE = "institutional_governance";

export const ADMINISTRATIVE_BLOC_DOMAINS: readonly FactionDomain[] = [
  "administration",
  "inspection",
  "legal",
  "auditing",
  "finance",
  "procurement",
];

export function createAdministrativeBloc(): Faction {
  return {
    id: ADMINISTRATIVE_BLOC_ID,
    name: ADMINISTRATIVE_BLOC_NAME,
    description:
      "The city's institutional core: civil servants, inspectors, lawyers, auditors, treasury officials, and procurement administrators who keep its machinery legible and funded.",
    influence: 58,
    loyalty: 62,
    threat: 18,
    type: "institutional",
    isActive: true,
    scope: "internal",
    color: ADMINISTRATIVE_BLOC_COLOR,
    domains: [...ADMINISTRATIVE_BLOC_DOMAINS],
    mechanicalRole: ADMINISTRATIVE_BLOC_ROLE,
    institutionalPresence: 72,
  };
}
