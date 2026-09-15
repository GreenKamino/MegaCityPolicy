import type { DiplomaticHistoryEntry, IntelItem, LocationRelation, PartnerLedger } from "./types";

export type EntitySheetKind = "character" | "faction" | "megacity" | "settlement" | "nation";
export type DisclosureLevel = "identity" | "operational" | "strategic" | "relationship";
export type EvidenceSource = "communication" | "trade" | "intelligence" | "scouting" | "relationship";

export type EntityDisclosureInput = {
  entityId: string;
  kind: EntitySheetKind;
  isPlayerControlled?: boolean;
  isDiscovered?: boolean;
  relation?: LocationRelation;
  ledger?: PartnerLedger;
  history?: DiplomaticHistoryEntry[];
  intel?: IntelItem[];
};

export type EntityDisclosure = {
  level: DisclosureLevel;
  label: string;
  evidence: EvidenceSource[];
  hasOperationalFacts: boolean;
  hasStrategicFacts: boolean;
  hasRelationshipData: boolean;
};

const COMMUNICATION_ACTIONS = new Set([
  "communicate",
  "establish-contact",
  "send-envoy",
  "request-audience",
  "offer-aid",
  "request-aid",
]);

const TRADE_ACTIONS = new Set([
  "trade",
  "trade-mission",
  "establish-trade",
  "open-trade",
  "trade-goods",
]);

function hasHistoryEvidence(history: DiplomaticHistoryEntry[], actions: Set<string>): boolean {
  return history.some((entry) => actions.has(entry.action) || [...actions].some((action) => entry.action.includes(action)));
}

/**
 * Derives disclosure from existing gameplay evidence. This intentionally has
 * no persistence contract: old saves get the same view as current saves.
 */
export function getEntityDisclosure(input: EntityDisclosureInput): EntityDisclosure {
  if (input.isPlayerControlled || input.kind === "character") {
    return {
      level: "relationship",
      label: "DIRECT ACCESS",
      evidence: ["relationship"],
      hasOperationalFacts: true,
      hasStrategicFacts: true,
      hasRelationshipData: true,
    };
  }

  const history = input.history ?? [];
  const intel = input.intel ?? [];
  const evidence: EvidenceSource[] = [];
  const hasCommunication = Boolean(input.ledger) || hasHistoryEvidence(history, COMMUNICATION_ACTIONS);
  const hasTrade = Boolean(input.relation?.tradesMade) || hasHistoryEvidence(history, TRADE_ACTIONS);
  const hasIntel = intel.length > 0;
  const hasScouting = Boolean(input.isDiscovered) || Boolean(input.relation?.scoutsMade);
  const hasRelationship = Boolean(input.ledger) || history.length > 0 || Boolean(input.relation?.lastInteractionTick);

  if (hasCommunication) evidence.push("communication");
  if (hasTrade) evidence.push("trade");
  if (hasIntel) evidence.push("intelligence");
  if (hasScouting) evidence.push("scouting");
  if (hasRelationship) evidence.push("relationship");

  const operational = Boolean(input.isDiscovered || hasCommunication || hasTrade || hasIntel);
  const strategic = Boolean(hasIntel && (hasCommunication || hasScouting));
  const relationship = hasRelationship;
  const level: DisclosureLevel = relationship
    ? "relationship"
    : strategic
    ? "strategic"
    : operational
    ? "operational"
    : "identity";

  return {
    level,
    label: level === "relationship"
      ? "RELATIONSHIP HISTORY"
      : level === "strategic"
      ? "INTELLIGENCE BRIEF"
      : level === "operational"
      ? "OPERATIONAL CONTACT"
      : "IDENTITY ONLY",
    evidence,
    hasOperationalFacts: operational,
    hasStrategicFacts: strategic,
    hasRelationshipData: relationship,
  };
}

export function disclosureEvidenceLabel(evidence: EvidenceSource[]): string {
  if (evidence.length === 0) return "No corroborating evidence";
  return evidence.map((source) => source.toUpperCase()).join(" · ");
}