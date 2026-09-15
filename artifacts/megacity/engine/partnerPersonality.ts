import type {
  Faction,
  ExternalMegacity,
  Township,
  PartnerKind,
  PartnerPersonality,
  PartnerPersonalityTrait,
} from "./types";

const TRAIT_VALUES: Record<PartnerPersonalityTrait, PartnerPersonality["values"]> = {
  proud:        { gifts: 0.6, threats: -1.5, formality: 1.4, secrecy: 0.9, loyaltyMemory: 1.2, grudgeMemory: 1.4 },
  vengeful:     { gifts: 0.7, threats: -0.4, formality: 0.8, secrecy: 1.0, loyaltyMemory: 0.8, grudgeMemory: 2.2 },
  mercantile:   { gifts: 1.6, threats: -0.6, formality: 0.7, secrecy: 0.8, loyaltyMemory: 1.0, grudgeMemory: 0.8 },
  paranoid:     { gifts: 0.4, threats: -1.0, formality: 1.0, secrecy: 1.8, loyaltyMemory: 0.6, grudgeMemory: 1.6 },
  opportunist:  { gifts: 1.2, threats: 0.3, formality: 0.6, secrecy: 1.0, loyaltyMemory: 0.5, grudgeMemory: 0.6 },
  honorable:    { gifts: 0.9, threats: -1.2, formality: 1.3, secrecy: 0.6, loyaltyMemory: 1.6, grudgeMemory: 1.0 },
  pragmatic:    { gifts: 1.0, threats: -0.5, formality: 0.9, secrecy: 0.8, loyaltyMemory: 1.0, grudgeMemory: 0.9 },
  fanatical:    { gifts: 0.5, threats: -0.7, formality: 1.0, secrecy: 1.2, loyaltyMemory: 1.1, grudgeMemory: 1.5 },
  cautious:     { gifts: 0.8, threats: -0.9, formality: 1.1, secrecy: 1.3, loyaltyMemory: 1.0, grudgeMemory: 1.1 },
  treacherous:  { gifts: 1.3, threats: 0.5, formality: 0.5, secrecy: 1.4, loyaltyMemory: 0.4, grudgeMemory: 0.7 },
};

export const TRAIT_LABEL: Record<PartnerPersonalityTrait, string> = {
  proud: "PROUD",
  vengeful: "VENGEFUL",
  mercantile: "MERCANTILE",
  paranoid: "PARANOID",
  opportunist: "OPPORTUNIST",
  honorable: "HONORABLE",
  pragmatic: "PRAGMATIC",
  fanatical: "FANATICAL",
  cautious: "CAUTIOUS",
  treacherous: "TREACHEROUS",
};

export const TRAIT_DESCRIPTION: Record<PartnerPersonalityTrait, string> = {
  proud: "Bristles at threats. Demands respect, formality, and recognition.",
  vengeful: "Never forgets a slight. Grudges fester for cycles.",
  mercantile: "Trade and tribute open every door. Money talks loudest.",
  paranoid: "Trusts no one. Reads conspiracy into routine signals.",
  opportunist: "Loyal only to leverage. Easily swayed by the strongest hand.",
  honorable: "Keeps its word. Expects the same. Hates betrayal.",
  pragmatic: "Weighs cost and benefit. Predictable but reasonable.",
  fanatical: "Driven by ideology. Dialogue must speak its language.",
  cautious: "Slow to commit. Hedges every agreement.",
  treacherous: "Will smile and stab. Pacts mean nothing under pressure.",
};

const KIND_TRAIT_POOLS: Record<PartnerKind, PartnerPersonalityTrait[]> = {
  law:         ["honorable", "pragmatic", "proud", "cautious"],
  criminal:    ["opportunist", "treacherous", "vengeful", "mercantile"],
  corporate:   ["mercantile", "pragmatic", "opportunist", "cautious"],
  underclass:  ["proud", "vengeful", "honorable", "fanatical"],
  cult:        ["fanatical", "paranoid", "vengeful", "proud"],
  institutional: ["pragmatic", "cautious", "honorable", "mercantile"],
  megacity:    ["proud", "pragmatic", "mercantile", "honorable"],
  nation:      ["proud", "honorable", "cautious", "fanatical"],
  township:    ["honorable", "cautious", "pragmatic", "proud"],
  settlement:  ["cautious", "honorable", "vengeful", "pragmatic"],
  group:       ["proud", "fanatical", "vengeful", "opportunist"],
};

const KIND_MANIFESTOS: Record<PartnerKind, string[]> = {
  law: [
    "Order is the only mercy worth the name.",
    "The law does not negotiate. It permits.",
    "Compliance buys protection. Defiance buys consequences.",
  ],
  criminal: [
    "The street has rules older than your charter.",
    "We were here before you. We'll be here after.",
    "Pay your respects, or pay in other ways.",
  ],
  corporate: [
    "Every relationship has a balance sheet.",
    "Loyalty is a quarterly figure.",
    "Disruption is just another revenue line.",
  ],
  underclass: [
    "We have nothing left for you to take.",
    "We remember every door slammed in our faces.",
    "Mercy from the towers is rarer than rain.",
  ],
  cult: [
    "The veil thins. We watch from beyond it.",
    "Faith is the architecture of survival.",
    "What you call madness, we call doctrine.",
  ],
  institutional: [
    "Every seal has a cost, and every cost must be recorded.",
    "Procedure is memory made durable.",
    "A city survives when its obligations remain legible.",
  ],
  megacity: [
    "Two great cities, two great destinies.",
    "Diplomacy is war by slower means.",
    "Our walls remember every visitor.",
  ],
  nation: [
    "A flag flies for the dead, not the living.",
    "Borders are written in blood and ratified in ink.",
    "Sovereignty is non-negotiable.",
  ],
  township: [
    "We endure. That is our contribution.",
    "Small does not mean weak. It means careful.",
    "We measure friends by what they leave behind.",
  ],
  settlement: [
    "Out here, every promise costs water.",
    "We trade with anyone who keeps their hands visible.",
    "The wasteland teaches you who to trust.",
  ],
  group: [
    "We are voiceless until we are loud.",
    "Our patience has run out years ago.",
    "Listen now or read about us later.",
  ],
};

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function generatePersonalityForKind(partnerKind: PartnerKind, partnerId: string): PartnerPersonality {
  const pool = KIND_TRAIT_POOLS[partnerKind] ?? KIND_TRAIT_POOLS.megacity;
  const seed = hashString(partnerId);
  const primary = pool[seed % pool.length];
  const secondaryPool = pool.filter((t) => t !== primary);
  const secondary = secondaryPool.length > 0 && (seed % 3 !== 0)
    ? secondaryPool[(seed >> 3) % secondaryPool.length]
    : undefined;
  const manifestos = KIND_MANIFESTOS[partnerKind] ?? KIND_MANIFESTOS.megacity;
  const manifesto = manifestos[(seed >> 6) % manifestos.length];

  const baseValues = { ...TRAIT_VALUES[primary] };
  if (secondary) {
    const sec = TRAIT_VALUES[secondary];
    baseValues.gifts = (baseValues.gifts + sec.gifts) / 2;
    baseValues.threats = (baseValues.threats + sec.threats) / 2;
    baseValues.formality = (baseValues.formality + sec.formality) / 2;
    baseValues.secrecy = (baseValues.secrecy + sec.secrecy) / 2;
    baseValues.loyaltyMemory = (baseValues.loyaltyMemory + sec.loyaltyMemory) / 2;
    baseValues.grudgeMemory = (baseValues.grudgeMemory + sec.grudgeMemory) / 2;
  }

  return {
    primary,
    secondary,
    values: baseValues,
    manifesto,
  };
}

export function ensurePersonality<T extends { id: string; personality?: PartnerPersonality }>(
  partner: T,
  partnerKind: PartnerKind,
): PartnerPersonality {
  if (partner.personality) return partner.personality;
  const generated = generatePersonalityForKind(partnerKind, partner.id);
  partner.personality = generated;
  return generated;
}

export function getPartnerKind(
  faction?: Faction,
  megacity?: ExternalMegacity,
  township?: Township,
): PartnerKind {
  if (faction) return faction.type;
  if (megacity) return megacity.factionType;
  if (township) return township.factionType === "township" ? "township" : township.factionType;
  return "megacity";
}

const ACTION_TONE: Record<string, "gift" | "threat" | "trade" | "intel" | "neutral"> = {
  "send-aid": "gift",
  "rebuild-assistance": "gift",
  "refugee-program": "gift",
  "medical-mission": "gift",
  "diplomatic-marriage": "gift",
  "declare-war": "threat",
  "issue-ultimatum": "threat",
  "impose-blockade": "threat",
  "trade-embargo": "threat",
  "demand-tribute": "threat",
  "impose-sanctions": "threat",
  "infrastructure-raid": "threat",
  "cyber-attack": "threat",
  "false-flag": "threat",
  "covert-destabilize": "threat",
  "proxy-war": "threat",
  "trade-agreement": "trade",
  "resource-exchange": "trade",
  "arms-deal": "trade",
  "smuggling-deal": "trade",
  "gun-running": "trade",
  "buy-rumors": "intel",
  "spy-network": "intel",
  "counter-intel": "intel",
  "request-intel": "intel",
  // Faction-screen sandbox actions (event-only). Tones drive the personality
  // modifier in personalityModifier(); keep aligned with EVENT_ONLY_ACTION_RULES.
  "negotiate": "neutral",
  "suppress": "threat",
  "fund": "gift",
  "host-banquet": "gift",
  "grant-honor": "gift",
  "tax-concession": "gift",
  "seize-assets": "threat",
  "plant-informant": "intel",
  "spread-rumors": "intel",
  "arrange-accident": "threat",
  "arrest-leaders": "threat",
  "purge": "threat",
};

export function personalityModifier(personality: PartnerPersonality, action: string): number {
  const tone = ACTION_TONE[action] ?? "neutral";
  const v = personality.values;
  switch (tone) {
    case "gift": return Math.round((v.gifts - 1) * 12);
    case "threat": return Math.round(v.threats * 8);
    case "trade": return Math.round((v.gifts - 1) * 6 + (v.formality - 1) * 4);
    case "intel": return Math.round((v.secrecy - 1) * -6);
    default: return Math.round((v.formality - 1) * 3);
  }
}
