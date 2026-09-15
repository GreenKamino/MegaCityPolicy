import type { Buildings, Units } from "@/engine/types";

export const COMMUNICATIONS_STRENGTH_CAP = 100;
export const COMMUNICATIONS_LOW_SIGNAL_THRESHOLD = 30;

export type CommunicationsBand = "CRITICAL" | "DEGRADED" | "STABLE";

export type CommunicationsContributor = {
  key: string;
  label: string;
  count: number;
  perAsset: number;
  amount: number;
};

// Keep this list as the single source of truth for the live comms formula and
// its readout. Values stack per asset, then the total is capped at 100%.
export const COMMUNICATIONS_ASSET_WEIGHTS: ReadonlyArray<{
  key: string;
  label: string;
  perAsset: number;
}> = [
  { key: "deepSignalTower", label: "Deep Signal Towers", perAsset: 12 },
  { key: "quantumDataCenters", label: "Quantum Data Centers", perAsset: 15 },
  { key: "predictiveAnalyticsSupercomputers", label: "Predictive Analytics", perAsset: 10 },
  { key: "citywideSurveillanceGrid", label: "Citywide Surveillance Grid", perAsset: 5 },
  { key: "propagandaBroadcastingTowers", label: "Propaganda Broadcasting Towers", perAsset: 8 },
  { key: "commsRelayDroid", label: "Comms Relay Droids", perAsset: 3 },
];

function countAsset(assets: Buildings | Units, key: string): number {
  return assets[key] ?? 0;
}

export function computeCommunicationsStrength(
  buildings: Buildings | Record<string, number>,
  units: Units | Record<string, number>,
): number {
  const rawStrength = COMMUNICATIONS_ASSET_WEIGHTS.reduce((total, asset) => {
    const inventory = asset.key === "commsRelayDroid" ? units : buildings;
    return total + countAsset(inventory, asset.key) * asset.perAsset;
  }, 0);
  return Math.max(0, Math.min(COMMUNICATIONS_STRENGTH_CAP, rawStrength));
}

export function getCommunicationsBand(strength: number): CommunicationsBand {
  if (strength < COMMUNICATIONS_LOW_SIGNAL_THRESHOLD) return "CRITICAL";
  if (strength < 60) return "DEGRADED";
  return "STABLE";
}

export function getCommunicationsConsequence(strength: number): string {
  return strength < COMMUNICATIONS_LOW_SIGNAL_THRESHOLD
    ? "Below 30%: +1 corruption per tick."
    : "No low-signal corruption penalty at 30% or higher.";
}

export function computeCommunicationsBreakdown(
  buildings: Buildings | Record<string, number>,
  units: Units | Record<string, number>,
  liveStrength?: number,
): {
  strength: number;
  calculatedStrength: number;
  band: CommunicationsBand;
  consequence: string;
  contributors: CommunicationsContributor[];
} {
  const calculatedStrength = computeCommunicationsStrength(buildings, units);
  const strength = liveStrength ?? calculatedStrength;
  return {
    strength,
    calculatedStrength,
    band: getCommunicationsBand(strength),
    consequence: getCommunicationsConsequence(strength),
    contributors: COMMUNICATIONS_ASSET_WEIGHTS.map((asset) => {
      const inventory = asset.key === "commsRelayDroid" ? units : buildings;
      const count = countAsset(inventory, asset.key);
      return {
        ...asset,
        count,
        amount: count * asset.perAsset,
      };
    }),
  };
}