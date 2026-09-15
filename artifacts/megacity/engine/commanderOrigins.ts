import type { GameState, PlayerAttributes, PlayerSkills } from "@/engine/types";

export const DEFAULT_COMMANDER_ORIGIN_ID = "none" as const;

export type CommanderOriginId =
  | "none"
  | "academy_officer"
  | "street_organizer"
  | "corporate_defector"
  | "field_veteran"
  | "intelligence_operative"
  | "wasteland_scout";

export type CommanderOriginDefinition = {
  id: CommanderOriginId;
  name: string;
  icon: string;
  description: string;
  advantage: string;
  tradeoff: string;
  dispatchLine: string;
  trait?: string;
  attributeBonuses: Partial<Record<keyof PlayerAttributes, number>>;
  skillBonuses: Partial<Record<keyof PlayerSkills, number>>;
};

/**
 * Starting origins are deliberately small packages. They use existing player
 * stats and traits so an origin changes the opening posture without creating a
 * second progression system or a hidden permanent bonus.
 */
export const COMMANDER_ORIGINS: readonly CommanderOriginDefinition[] = [
  {
    id: "none",
    name: "NO ORIGIN",
    icon: "minus-circle-outline",
    description: "Arrive without an inherited doctrine. Build your commander's reputation from the decisions ahead.",
    advantage: "No starting modifiers",
    tradeoff: "No starting specialization",
    dispatchLine: "No prior record was attached to your commission. The city will judge you by what you do next.",
    attributeBonuses: {},
    skillBonuses: {},
  },
  {
    id: "academy_officer",
    name: "ACADEMY OFFICER",
    icon: "school-outline",
    description: "A disciplined graduate trained to turn a chain of command into a functioning city.",
    advantage: "+1 Authority, +1 Leadership",
    tradeoff: "−1 Charisma",
    dispatchLine: "Your academy record arrived before you did: precise, decorated, and already being used to measure your failures.",
    trait: "Born Leader",
    attributeBonuses: { authority: 1, charisma: -1 },
    skillBonuses: { leadership: 1 },
  },
  {
    id: "street_organizer",
    name: "STREET ORGANIZER",
    icon: "account-group-outline",
    description: "You kept neighborhoods alive when official systems stopped answering their radios.",
    advantage: "+1 Charisma, +1 Intimidation",
    tradeoff: "−1 Intelligence",
    dispatchLine: "The districts remember the work you did before the appointment. They also remember every promise you made.",
    trait: "People's Champion",
    attributeBonuses: { charisma: 1, intelligence: -1 },
    skillBonuses: { intimidation: 1 },
  },
  {
    id: "corporate_defector",
    name: "CORPORATE DEFECTOR",
    icon: "briefcase-account-outline",
    description: "You walked away from MegaCorp with its procedures, its contacts, and a file that should have been destroyed.",
    advantage: "+1 Charisma, +1 Administration",
    tradeoff: "−1 Endurance",
    dispatchLine: "Your former employers sent congratulations, then a quiet reminder that defection is only a temporary condition.",
    trait: "Corporate Exile",
    attributeBonuses: { charisma: 1, endurance: -1 },
    skillBonuses: { administration: 1 },
  },
  {
    id: "field_veteran",
    name: "FIELD VETERAN",
    icon: "shield-star-outline",
    description: "Years at the border taught you how to keep people moving when the map becomes a target.",
    advantage: "+1 Combat, +1 Tactics",
    tradeoff: "−1 Charisma",
    dispatchLine: "The border command calls you reliable. It does not call you gentle, and the city has received both reports.",
    trait: "Military Veteran",
    attributeBonuses: { combat: 1, charisma: -1 },
    skillBonuses: { tactics: 1 },
  },
  {
    id: "intelligence_operative",
    name: "INTELLIGENCE OPERATIVE",
    icon: "eye-outline",
    description: "You spent a career finding the threat beneath the official story and the official story beneath the threat.",
    advantage: "+1 Intelligence, +1 Surveillance",
    tradeoff: "−1 Authority",
    dispatchLine: "Your personnel file is mostly redaction. The surviving pages recommend that nobody leave you unsupervised.",
    trait: "Ex-Intelligence",
    attributeBonuses: { intelligence: 1, authority: -1 },
    skillBonuses: { surveillance: 1 },
  },
  {
    id: "wasteland_scout",
    name: "WASTELAND SCOUT",
    icon: "compass-outline",
    description: "You crossed the irradiated zones by reading weather, spoor, and the silence before an ambush.",
    advantage: "+1 Endurance, +1 Logistics",
    tradeoff: "−1 Authority",
    dispatchLine: "The walls feel close after the open waste. Your old routes are still useful, if the things on them have not learned your name.",
    trait: "Wasteland Scout",
    attributeBonuses: { endurance: 1, authority: -1 },
    skillBonuses: { logistics: 1 },
  },
];

const ORIGIN_MAP = new Map(COMMANDER_ORIGINS.map((origin) => [origin.id, origin]));

export const COMMANDER_ORIGIN_TRAITS = new Set(
  COMMANDER_ORIGINS.flatMap((origin) => origin.trait ? [origin.trait] : []),
);

export function isCommanderOriginId(value: unknown): value is CommanderOriginId {
  return typeof value === "string" && ORIGIN_MAP.has(value as CommanderOriginId);
}

export function getCommanderOrigin(value: unknown): CommanderOriginDefinition {
  return (isCommanderOriginId(value) ? ORIGIN_MAP.get(value) : undefined) ?? ORIGIN_MAP.get(DEFAULT_COMMANDER_ORIGIN_ID)!;
}

/**
 * Applies an origin to a fresh city. Reapplying the same origin is a no-op so
 * accidental duplicate launch handling cannot stack its modifiers.
 */
export function applyCommanderOrigin(state: GameState, value: unknown): GameState {
  const origin = getCommanderOrigin(value);
  if (state.commanderOrigin === origin.id) return state;

  const attributes = { ...state.player.attributes };
  for (const [key, delta] of Object.entries(origin.attributeBonuses) as [keyof PlayerAttributes, number][]) {
    attributes[key] = Math.max(1, Math.min(20, (attributes[key] ?? 0) + delta)) as never;
  }

  const skills = { ...state.player.skills };
  for (const [key, delta] of Object.entries(origin.skillBonuses) as [keyof PlayerSkills, number][]) {
    skills[key] = Math.max(0, Math.min(15, (skills[key] ?? 0) + delta)) as never;
  }

  const traits = [...(state.player.traits ?? [])];
  if (origin.trait && !traits.includes(origin.trait)) traits.push(origin.trait);

  return {
    ...state,
    commanderOrigin: origin.id,
    player: {
      ...state.player,
      attributes,
      skills,
      traits,
    },
  };
}