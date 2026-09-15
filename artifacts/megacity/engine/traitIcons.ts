import type { ComponentProps } from "react";
import type { MaterialCommunityIcons } from "@expo/vector-icons";

export type TraitColorKey =
  | "danger"
  | "warning"
  | "accent"
  | "info"
  | "textSecondary"
  | "textMuted";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export interface TraitVisual {
  icon: IconName;
  color: TraitColorKey;
}

interface TraitRule {
  keywords: string[];
  visual: TraitVisual;
}

const TRAIT_RULES: TraitRule[] = [
  {
    keywords: [
      "authoritarian",
      "tyrannical",
      "uncompromising",
      "disciplined",
      "imperious",
      "absolute",
      "stern",
    ],
    visual: { icon: "shield-crown", color: "danger" },
  },
  {
    keywords: [
      "ruthless",
      "warmongering",
      "fierce",
      "vengeful",
      "brutal",
      "fearless",
      "violent",
      "merciless",
      "militant",
      "brave",
      "unforgiving",
    ],
    visual: { icon: "sword-cross", color: "danger" },
  },
  {
    keywords: [
      "cunning",
      "manipulative",
      "calculating",
      "slippery",
      "scheming",
      "deceptive",
      "treacherous",
      "clever",
      "shrewd",
      "resourceful",
    ],
    visual: { icon: "incognito", color: "warning" },
  },
  {
    keywords: [
      "secretive",
      "paranoid",
      "invisible",
      "hidden",
      "reclusive",
      "shadowy",
    ],
    visual: { icon: "ghost-outline", color: "textMuted" },
  },
  {
    keywords: [
      "charismatic",
      "charming",
      "elegant",
      "persuasive",
      "magnetic",
      "inspiring",
      "bombastic",
      "showboating",
    ],
    visual: { icon: "star-circle", color: "accent" },
  },
  {
    keywords: [
      "devout",
      "zealous",
      "fanatical",
      "spiritual",
      "mystical",
      "prophet",
      "holy",
      "superstitious",
    ],
    visual: { icon: "candle", color: "warning" },
  },
  {
    keywords: [
      "brilliant",
      "knowledgeable",
      "wise",
      "analytical",
      "scientific",
      "scholarly",
      "genius",
      "intellectual",
      "intelligent",
      "philosophical",
    ],
    visual: { icon: "brain", color: "info" },
  },
  {
    keywords: [
      "obsessive",
      "amoral",
      "ambitious",
      "single-minded",
      "determined",
      "surgical",
      "clinical",
    ],
    visual: { icon: "flask-outline", color: "warning" },
  },
  {
    keywords: [
      "compassionate",
      "protective",
      "nurturing",
      "kind",
      "gentle",
      "loyal",
      "honorable",
      "empathetic",
      "territorial",
    ],
    visual: { icon: "heart-outline", color: "accent" },
  },
  {
    keywords: [
      "industrious",
      "entrepreneurial",
      "mercenary",
      "methodical",
      "practical",
      "pragmatic",
      "stubborn",
      "stoic",
      "hard-working",
      "businesslike",
      "mercantile",
      "precise",
    ],
    visual: { icon: "anvil", color: "textSecondary" },
  },
  {
    keywords: [
      "veteran",
      "resilient",
      "patient",
      "ancient",
      "weathered",
      "experienced",
      "survivalist",
      "calm",
      "serene",
    ],
    visual: { icon: "shield-half-full", color: "textSecondary" },
  },
  {
    keywords: [
      "powerful",
      "dominant",
      "imposing",
      "commanding",
      "regal",
    ],
    visual: { icon: "crown", color: "warning" },
  },
  {
    keywords: [
      "idealistic",
      "optimistic",
      "hopeful",
      "visionary",
      "bold",
      "collective-minded",
    ],
    visual: { icon: "lightbulb-on", color: "info" },
  },
  {
    keywords: [
      "bitter",
      "desperate",
      "broken",
      "jaded",
      "haunted",
      "weary",
      "fatalistic",
      "darkly humorous",
    ],
    visual: { icon: "skull-outline", color: "danger" },
  },
  {
    keywords: [
      "unknown",
    ],
    visual: { icon: "account-question-outline", color: "textMuted" },
  },
  {
    keywords: [
      "inhuman",
      "alien",
      "mutant",
      "changed",
      "transcendent",
      "post-human",
    ],
    visual: { icon: "head-cog-outline", color: "info" },
  },
  {
    keywords: [
      "silent",
      "enigmatic",
      "mysterious",
      "cryptic",
      "eccentric",
    ],
    visual: { icon: "head-question-outline", color: "textMuted" },
  },
  {
    keywords: [
      "curious",
      "inquisitive",
      "observant",
      "watchful",
    ],
    visual: { icon: "magnify", color: "info" },
  },
  {
    keywords: [
      "cautious",
      "careful",
      "guarded",
      "wary",
      "gruff",
    ],
    visual: { icon: "shield-search", color: "textSecondary" },
  },
  {
    keywords: [
      "strategic",
      "tactical",
      "calculative",
    ],
    visual: { icon: "chess-king", color: "info" },
  },
  {
    keywords: [
      "proud",
      "haughty",
      "vain",
      "noble",
    ],
    visual: { icon: "crown-outline", color: "warning" },
  },
  {
    keywords: [
      "diplomatic",
      "negotiating",
      "peacemaking",
    ],
    visual: { icon: "handshake", color: "accent" },
  },
  {
    keywords: [
      "greedy",
      "avaricious",
      "miserly",
    ],
    visual: { icon: "cash-multiple", color: "warning" },
  },
];

export const DEFAULT_TRAIT_VISUAL: TraitVisual = {
  icon: "help-circle-outline",
  color: "textMuted",
};

const VISUAL_CACHE = new Map<string, TraitVisual>();

export function getTraitVisual(trait: string): TraitVisual {
  if (!trait) return DEFAULT_TRAIT_VISUAL;
  const norm = trait.toLowerCase().trim();
  const cached = VISUAL_CACHE.get(norm);
  if (cached) return cached;

  // Exact-match first to avoid false positives from substring matching
  // (e.g. "impatient" must not match "patient").
  for (const rule of TRAIT_RULES) {
    if (rule.keywords.includes(norm)) {
      VISUAL_CACHE.set(norm, rule.visual);
      return rule.visual;
    }
  }
  VISUAL_CACHE.set(norm, DEFAULT_TRAIT_VISUAL);
  return DEFAULT_TRAIT_VISUAL;
}

// ─── Trait descriptions ──────────────────────────────────────────────
//
// One-sentence plain-English summaries used in tooltips. Covers every
// trait keyword from TRAIT_RULES above plus a small set of extras that
// appear in leader/NPC content but don't carry a unique icon. Lookup is
// case-insensitive; unknown traits fall back to a generic line.

export const TRAIT_DESCRIPTIONS: Record<string, string> = {
  // shield-crown / authority
  authoritarian: "Believes in strict order and central command.",
  tyrannical: "Rules through fear and punishment.",
  uncompromising: "Refuses to negotiate on core demands.",
  disciplined: "Holds themselves and others to a strict code.",
  imperious: "Acts as if their authority is unquestionable.",
  absolute: "Tolerates no dissent — their word is final.",
  stern: "Cold, formal, and slow to show approval.",

  // sword-cross / warlike
  ruthless: "Does whatever it takes to win, regardless of cost.",
  warmongering: "Actively seeks open conflict and conquest.",
  fierce: "Aggressive in confrontation, hard to intimidate.",
  vengeful: "Holds grudges and repays slights with interest.",
  brutal: "Uses overwhelming force and accepts collateral damage.",
  fearless: "Unfazed by danger — sometimes recklessly so.",
  violent: "Reaches for force as a first option.",
  merciless: "Shows no leniency to enemies or rivals.",
  militant: "Frames every problem in terms of force.",
  brave: "Stands their ground when others would break.",
  unforgiving: "Never lets an offense go unanswered.",

  // incognito / cunning
  cunning: "Sets traps and reads three moves ahead.",
  manipulative: "Bends others to their will through pressure and lies.",
  calculating: "Treats people and events as variables to optimize.",
  slippery: "Dodges blame and slips out of commitments.",
  scheming: "Always running a side plan beneath the surface.",
  deceptive: "Lies easily and convincingly.",
  treacherous: "Will betray allies if the price is right.",
  clever: "Quick to spot openings and exploit them.",
  shrewd: "Sees through pretense and judges accurately.",
  resourceful: "Improvises around obstacles with what's at hand.",

  // ghost-outline / shadow
  secretive: "Hoards information and shares only when forced.",
  paranoid: "Sees enemies everywhere — sometimes correctly.",
  invisible: "Operates from the margins, leaving no trail.",
  hidden: "Keeps their true motives concealed.",
  reclusive: "Avoids the spotlight and limits direct contact.",
  shadowy: "Surrounded by rumor, rarely seen in person.",

  // star-circle / charismatic
  charismatic: "Naturally draws people to their cause.",
  charming: "Disarms opponents with warmth and wit.",
  elegant: "Carries themselves with refined polish.",
  persuasive: "Wins arguments others thought were closed.",
  magnetic: "Pulls a room toward whatever they want.",
  inspiring: "Motivates followers to push past their limits.",

  // candle / faith
  devout: "Anchors decisions in deep religious conviction.",
  zealous: "Burns with single-minded faith in their cause.",
  fanatical: "Will sacrifice anything for the creed.",
  spiritual: "Sees a sacred thread running through events.",
  mystical: "Believes in forces beyond rational explanation.",
  prophet: "Claims insight into futures others can't see.",
  holy: "Treated by followers as touched by the divine.",
  superstitious: "Lets omens and signs guide their hand.",

  // brain / intellect
  brilliant: "Solves problems faster than peers think possible.",
  knowledgeable: "Carries deep expertise across many fields.",
  wise: "Counsels with hard-won perspective and patience.",
  analytical: "Breaks problems into parts before acting.",
  scientific: "Demands evidence and tests every claim.",
  scholarly: "Lives in books, archives, and theory.",
  genius: "Operates at a level few others can follow.",
  intellectual: "Prefers ideas and debate to brute action.",
  intelligent: "Sharp, quick, and good at reading systems.",
  philosophical: "Reflects on meaning before choosing a path.",

  // flask-outline / obsessive
  obsessive: "Locked onto one goal at the expense of all else.",
  amoral: "Operates outside conventional ideas of right and wrong.",
  ambitious: "Always reaching for the next rung of power.",
  "single-minded": "Pursues one objective without distraction.",
  determined: "Refuses to abandon a chosen course.",
  surgical: "Treats every problem as a procedure with a scalpel and a checklist.",
  clinical: "Detached, precise, and unbothered by the mess.",

  // heart-outline / kind
  compassionate: "Genuinely cares about those under their care.",
  protective: "Will shield allies even at personal cost.",
  nurturing: "Builds people up rather than tearing them down.",
  kind: "Generous and considerate by default.",
  gentle: "Soft-spoken and slow to anger.",
  loyal: "Stands by allies through hardship.",
  honorable: "Keeps their word even when it costs them.",
  empathetic: "Reads others' feelings and responds with care.",
  territorial: "Fiercely defends their patch from outsiders.",

  // anvil / industrious
  industrious: "Outworks rivals through sheer effort.",
  entrepreneurial: "Spins opportunities into ventures.",
  mercenary: "Sells loyalty to whoever pays best.",
  methodical: "Works through every step in careful order.",
  practical: "Picks the option that actually works.",
  pragmatic: "Trades ideals for results when needed.",
  stubborn: "Refuses to change course once committed.",
  stoic: "Endures hardship without complaint.",
  "hard-working": "Puts in the hours others won't.",
  businesslike: "Treats everything as a transaction.",
  mercantile: "Thinks in terms of trade, margin, and leverage.",
  precise: "Works with exacting accuracy.",

  // shield-half-full / veteran
  veteran: "Carries scars and lessons from past campaigns.",
  resilient: "Bounces back from setbacks others can't.",
  patient: "Willing to wait years for the right moment.",
  ancient: "Has outlasted regimes and remembers them all.",
  weathered: "Hardened by long exposure to hardship.",
  experienced: "Has been through this kind of fight before.",
  survivalist: "Prepares for the worst, every time.",
  calm: "Unshaken under pressure.",
  serene: "Carries an unsettling, settled stillness.",

  // crown / dominant
  powerful: "Commands respect through sheer presence.",
  dominant: "Naturally takes charge of any room.",
  imposing: "Their physical or political weight is hard to ignore.",
  commanding: "Issues orders that get obeyed.",
  regal: "Bears themselves like royalty.",

  // lightbulb-on / idealist
  idealistic: "Believes in a better future and works toward it.",
  optimistic: "Expects things to work out, and acts that way.",
  hopeful: "Sees light even in the worst situations.",
  visionary: "Sketches futures most can't yet imagine.",
  bold: "Willing to make the big bet.",
  "collective-minded": "Puts the group's needs ahead of their own.",

  // skull-outline / broken
  bitter: "Soured by past betrayals and losses.",
  desperate: "Backed into a corner — and acts like it.",
  broken: "Carries trauma that warps every decision.",
  jaded: "Has seen too much to believe in much anymore.",
  haunted: "Pursued by something they can't name aloud.",
  weary: "Exhausted by years of conflict.",
  fatalistic: "Believes the outcome is already written.",
  "darkly humorous": "Cracks jokes at the gallows. The grimmer it gets, the sharper the wit.",

  // head-cog-outline / changed
  inhuman: "No longer fully recognizable as one of us.",
  alien: "Thinks in patterns no one else can follow.",
  mutant: "Carries visible biological alterations.",
  changed: "Marked by an event that altered them at the core.",
  transcendent: "Operates on a plane the rest of us don't access.",
  "post-human": "Has moved beyond baseline human limits.",

  // head-question-outline / enigmatic
  silent: "Speaks rarely — and is listened to when they do.",
  enigmatic: "Hard to read, harder to predict.",
  mysterious: "Conceals their past and their intentions.",
  cryptic: "Speaks in riddles when plain words would do.",
  eccentric: "Operates by rules only they understand.",

  // magnify / curious
  curious: "Pokes into everything that catches their eye.",
  inquisitive: "Asks the questions others avoid.",
  observant: "Notices small details others miss.",
  watchful: "Keeps eyes on every entrance and exit.",

  // shield-search / cautious
  cautious: "Triple-checks before committing.",
  careful: "Avoids risks unless the upside is clear.",
  guarded: "Slow to trust, quick to suspect.",
  wary: "Treats every new face as a potential threat.",
  gruff: "Blunt and unwelcoming on the surface.",

  // chess-king / strategic
  strategic: "Plays the long game across multiple fronts.",
  tactical: "Wins fights through positioning and timing.",
  calculative: "Weighs every option against expected payoff.",

  // crown-outline / proud
  proud: "Takes their honor and reputation seriously.",
  haughty: "Looks down on those they consider beneath them.",
  vain: "Cares deeply about how others see them.",
  noble: "Acts according to a personal code of honor.",

  // handshake / diplomatic
  diplomatic: "Defuses conflict through talk and compromise.",
  negotiating: "Brokers deals others can't close.",
  peacemaking: "Works to end fights rather than win them.",

  // cash-multiple / greedy
  greedy: "Always wants more — money, power, both.",
  avaricious: "Hoards wealth even when they have plenty.",
  miserly: "Refuses to spend even on necessities.",

  // ── extras that appear in NPC content but don't have a unique icon ──
  ethical: "Refuses corrupt shortcuts even when costly.",
  corrupt: "Routinely takes bribes and bends rules.",
  aggressive: "Pushes hard, often the first to escalate.",
  reformist: "Pushes from within to change the system.",
  reckless: "Acts before thinking through consequences.",
  emotional: "Reacts strongly and visibly to events.",
  talkative: "Always sharing opinions and gossip.",
  quiet: "Says little, listens a lot.",
  creative: "Finds unconventional solutions.",
  thrill_seeking: "Drawn to risk for its own sake.",
  rule_breaking: "Treats laws and norms as suggestions.",
  opportunistic: "Pounces on any opening, regardless of plan.",
  competitive: "Treats every interaction as a contest.",
  patriotic: "Loyal to the city or faction above all.",
  cynical: "Assumes the worst about every motive.",
  distrustful: "Believes nobody, takes nothing on faith.",
  independent: "Resists orders and goes their own way.",
  friendly: "Warm, easy to like, builds rapport quickly.",
  suspicious: "Sees ulterior motives everywhere.",
  agitator: "Stirs up unrest and rallies dissenters.",
};

export function getTraitDescription(trait: string): string {
  if (!trait) return "";
  const norm = trait.toLowerCase().trim();
  return (
    TRAIT_DESCRIPTIONS[norm] ??
    "A defining personality trait that shapes how this character behaves."
  );
}
