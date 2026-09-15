import { COMPANIES } from "@/engine/companies";
import { ARRAY_CAPS } from "@/engine/sanitizer";
import type { GameState } from "@/engine/types";

export type CompanyLicenseResult =
  | { ok: true; state: GameState }
  | {
      ok: false;
      state: GameState;
      reason: "already_licensed" | "unknown_company" | "unknown_district" | "insufficient_funds";
    };

/**
 * Apply a company license as one transaction. Invalid targets return the
 * original state so callers cannot accidentally spend credits or append a
 * company/receipt for data that is no longer valid.
 */
export function applyCompanyLicense(
  prev: GameState,
  companyId: string,
  districtId: string,
): CompanyLicenseResult {
  if (prev.companies.some((c) => c.companyId === companyId)) {
    return { ok: false, state: prev, reason: "already_licensed" };
  }

  const def = COMPANIES.find((c) => c.id === companyId);
  if (!def) return { ok: false, state: prev, reason: "unknown_company" };

  const district = prev.districts.find((d) => d.id === districtId);
  if (!district) return { ok: false, state: prev, reason: "unknown_district" };

  if (prev.resources.credits < def.licenseCost) {
    return { ok: false, state: prev, reason: "insufficient_funds" };
  }

  const licenseMsg: import("@/engine/types").GameMessage = {
    id: `license-${companyId}-${Date.now()}`,
    timestamp: prev.gameDate,
    tick: prev.totalTicks,
    category: "report",
    title: `LICENSE ISSUED: ${def.name.toUpperCase()}`,
    body: `Commercial license fee of ${def.licenseCost.toLocaleString()} credits paid. ${def.name} begins operations in ${district.name}: +${def.taxOutput} credits/tick tax output against ${def.maintenanceCost}/tick maintenance. Recurring payout appears as COMMERCIAL LICENSING on the Economy ledger.`,
    read: false,
    priority: "normal",
  };

  return {
    ok: true,
    state: {
      ...prev,
      resources: { ...prev.resources, credits: prev.resources.credits - def.licenseCost },
      companies: [
        ...prev.companies,
        { companyId, districtId, licenseDate: prev.totalTicks },
      ],
      messages: [licenseMsg, ...(prev.messages ?? [])].slice(0, ARRAY_CAPS.messages),
    },
  };
}