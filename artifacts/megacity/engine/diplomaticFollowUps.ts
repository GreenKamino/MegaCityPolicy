import type {
  GameState,
  PendingPartnerResponse,
  PartnerKind,
  PartnerPersonality,
  GameMessage,
  PartnerLedger,
} from "./types";

const KIND_GREETING: Record<PartnerKind, string> = {
  law: "SECTOR HOUSE",
  criminal: "BACK CHANNEL",
  corporate: "EXECUTIVE WIRE",
  underclass: "TUNNEL VOICE",
  cult: "WHISPER NETWORK",
  institutional: "CIVIC REGISTRY",
  megacity: "FOREIGN MINISTRY",
  nation: "STATE COMMUNIQUÉ",
  township: "TOWN COUNCIL",
  settlement: "RUNNER MESSAGE",
  group: "ASSEMBLY VOICE",
};

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function pickFromArray<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

const FAVOR_REQUESTS_BY_KIND: Record<PartnerKind, string[]> = {
  law: [
    "We're requesting a joint patrol authorization in your eastern grid for two cycles. Mutual benefit.",
    "Our records office is short-staffed. Loan us two clerks and we'll forward priority intel for a quarter.",
    "Approve overflight rights for our enforcement drones. Routine, but it would mean something.",
  ],
  criminal: [
    "We've got a shipment that needs to move through your customs without questions. We owe you next time.",
    "Don't notice the warehouse on 4th this week. That's all we're asking.",
    "A few of our boys need clean papers. Your stamp opens doors.",
  ],
  corporate: [
    "Our quarterly forecast would benefit from a small tax holiday on luxury goods. Help us help you.",
    "We're ready to acquire a struggling rival. Your regulatory body can stay quiet for the right price.",
    "Approve the rezoning of district 7 commercial. Our shareholders will reciprocate.",
  ],
  underclass: [
    "The medical mission helped. Now the children need schooling. Even a temporary teacher would change everything.",
    "Our elder asks for one truck of clean water this cycle. Nothing more.",
    "Allow our salvage crews three days of access to the outer scrap belt. We'll share what we find.",
  ],
  cult: [
    "Permit a procession through the upper streets at the next eclipse. The omens demand witnesses.",
    "Our temple needs sanctified ground. Cede us the abandoned chapel on the hill.",
    "A relic must change hands at midnight. We need your patrols to look elsewhere.",
  ],
  institutional: [
    "Authorize a transparent review of the procurement ledger.",
    "Give the inspectors protected access to the city's records.",
    "Renew the legal offices' mandate before the next budget cycle.",
  ],
  megacity: [
    "Our delegation requests reciprocal diplomatic immunity for envoys posted in your towers.",
    "We propose joint participation in the next regional trade summit. Your absence would be felt.",
    "A cultural exchange — a hundred of our scholars for a hundred of yours. Build the future together.",
  ],
  nation: [
    "Recognize our claim to the southern territories formally. A signature, nothing more.",
    "Sponsor our membership in the regional accord. Your weight tips the scale.",
    "Vote with us at the next council session. We'll remember.",
  ],
  township: [
    "We need a road repair crew for two weeks. Our young people are willing labor in exchange.",
    "Your seal on a defense pact would deter the raiders. Just the seal — no troops needed.",
    "Buy this cycle's harvest at fair price. We'll throw in a season's allegiance.",
  ],
  settlement: [
    "We need salt and ammunition before the dry season. Pay us in caravans, not coin.",
    "Three of our scouts went missing in your territory. Help us find them and we won't forget.",
    "A trade contact would change our fortunes. Connect us to one of your mid-tier merchants.",
  ],
  group: [
    "We demand a public hearing in the council chamber. Not a back-room meeting — a recorded session.",
    "Withdraw the patrol from our gathering grounds. Show good faith.",
    "Issue a public apology for the harm done. Words matter to us, even if they don't to you.",
  ],
};

const GOSSIP_LINES_BY_KIND: Record<PartnerKind, string[]> = {
  law: ["Other authority cells have logged the action. Standardized response will follow."],
  criminal: ["The other crews already know. Word travels faster than your couriers."],
  corporate: ["Your move is in three different boardrooms by morning. Markets twitched."],
  underclass: ["The undercity hummed with the news for a full cycle. Stories spread."],
  cult: ["The whisper network carried it across three sects before sundown."],
  institutional: ["The filing systems have noticed. A review docket is already open."],
  megacity: ["Foreign ministers in two other capitals are now drafting position papers."],
  nation: ["Your action was logged in the regional record. Diplomatic chess pieces have moved."],
  township: ["Neighboring townships heard within days. Some smiled. Some did not."],
  settlement: ["Caravans carried the story across the wastes in a week."],
  group: ["The streets sang about it before the council finished their statement."],
};

const RETALIATION_LINES_BY_KIND: Record<PartnerKind, string[]> = {
  law: [
    "Expect tighter audits in the next cycle. Compliance becomes its own punishment.",
    "Our enforcers are stationed at your trade checkpoints. Routine, of course.",
  ],
  criminal: [
    "A shipment of yours will arrive damaged. Read the message in the broken crates.",
    "Your tax collector will find empty warehouses where his ledger says full ones.",
  ],
  corporate: [
    "Three of your municipal contracts just received hostile counter-bids. Coincidence.",
    "Your bond rating gets a quiet downgrade in our private circulars.",
  ],
  underclass: [
    "A general strike begins at your factories tomorrow. The Collective coordinates without warning.",
    "Sabotage in the lower tunnels. Your power grid will stutter.",
  ],
  cult: [
    "An effigy of you burns in the lower temple tonight. Symbols matter.",
    "A curse-tablet is buried beneath your treasury. Believe what you want.",
  ],
  institutional: [
    "The Bloc has suspended discretionary cooperation pending a formal review.",
    "Your next procurement cycle will be met with forms, audits, and no shortcuts.",
  ],
  megacity: [
    "Our diplomatic withdrawal from your trade zone begins this cycle. Quiet, formal, devastating.",
    "We're cosigning a regional condemnation of your administration. Read the wires.",
  ],
  nation: [
    "Our ambassador departs with no replacement scheduled. Channels go dark.",
    "Sanctions packet is being drafted. You will see it before the week ends.",
  ],
  township: [
    "Our markets close to your traders. Out here, that bites harder than you think.",
    "We renounce the protection arrangement. You get nothing for nothing now.",
  ],
  settlement: [
    "Caravans warned. Scouts redirected. You no longer pass our territory unchallenged.",
    "The wells we shared are sealed. A small thing, until you need water.",
  ],
  group: [
    "Public demonstrations are being organized. The crowd will not be polite.",
    "Our spokespeople are giving interviews to every outlet that will listen.",
  ],
};

const MEMORY_CALLBACKS: string[] = [
  "Our elders remember when you sent the medical convoys. We have not forgotten the gesture.",
  "Your previous betrayal still circulates in our council chambers. The wound has scarred, not healed.",
  "Last cycle's gift of supplies opens this conversation in your favor. Speak.",
  "You signed a pact with us once and broke it. Every offer now passes through that filter.",
  "We owe you one favor from the joint operation. Now would be a fair time to call it in.",
];

export function buildPendingResponse(
  state: GameState,
  partnerId: string,
  partnerName: string,
  partnerKind: PartnerKind,
  triggerAction: string,
  outcome: "accepted" | "rejected",
  personality?: PartnerPersonality,
  ledger?: PartnerLedger,
): PendingPartnerResponse | null {
  const tick = state.totalTicks;
  const isHostileAction = ["declare-war", "issue-ultimatum", "infrastructure-raid", "cyber-attack", "covert-destabilize", "false-flag", "demand-tribute", "impose-blockade", "betray-deal", "trade-embargo", "impose-sanctions", "proxy-war"].includes(triggerAction);
  const isHelpful = ["send-aid", "rebuild-assistance", "medical-mission", "refugee-program", "fund", "joint-research", "diplomatic-marriage", "land-grant", "amnesty", "shrine-construction"].includes(triggerAction);
  const isMajor = isHostileAction || isHelpful || ["propose-alliance", "joint-treaty", "diplomatic-recognition"].includes(triggerAction);

  let kind: PendingPartnerResponse["responseKind"];
  let payload: string;

  if (outcome === "rejected" && isHostileAction) {
    kind = "retaliation";
    payload = pickFromArray(RETALIATION_LINES_BY_KIND[partnerKind]) ?? "Consequences will follow.";
  } else if (outcome === "accepted" && isHostileAction) {
    if (Math.random() < 0.6) {
      kind = "retaliation";
      payload = pickFromArray(RETALIATION_LINES_BY_KIND[partnerKind]) ?? "Consequences will follow.";
    } else {
      kind = "third-party-gossip";
      payload = pickFromArray(GOSSIP_LINES_BY_KIND[partnerKind]) ?? "Word spread quickly.";
    }
  } else if (outcome === "accepted" && isHelpful && Math.random() < 0.55) {
    kind = "favor-asked";
    payload = pickFromArray(FAVOR_REQUESTS_BY_KIND[partnerKind]) ?? "We have a small request in return.";
  } else if (outcome === "accepted" && isMajor) {
    kind = "third-party-gossip";
    payload = pickFromArray(GOSSIP_LINES_BY_KIND[partnerKind]) ?? "Other partners noticed.";
  } else if (ledger && ledger.recent.length >= 3 && Math.random() < 0.35) {
    kind = "memory-callback";
    payload = pickFromArray(MEMORY_CALLBACKS) ?? "We remember.";
  } else if (outcome === "accepted" && Math.random() < 0.3) {
    kind = "intel-leak";
    payload = `An aide of ${partnerName} let slip a detail you might find useful. A small piece of intel has been added to your file.`;
  } else {
    return null;
  }

  const personalityDelay = personality?.values.formality ?? 1;
  const baseDelay = kind === "retaliation" ? 4 : kind === "favor-asked" ? 6 : 3;
  const dueTick = tick + Math.max(2, Math.round(baseDelay * personalityDelay));

  return {
    id: id("pending"),
    partnerId,
    partnerName,
    partnerKind,
    triggerAction,
    responseKind: kind,
    payload,
    dueTick,
  };
}

export function enqueuePendingResponse(state: GameState, pending: PendingPartnerResponse): GameState {
  const queue = [...(state.pendingPartnerResponses ?? []), pending].slice(-50);
  return { ...state, pendingPartnerResponses: queue };
}

const KIND_TONE_TITLE: Record<PendingPartnerResponse["responseKind"], string> = {
  "favor-asked": "FAVOR REQUESTED",
  "counter-offer": "COUNTER-OFFER",
  "third-party-gossip": "WORD HAS SPREAD",
  "retaliation": "RETALIATION",
  "memory-callback": "OLD ACCOUNTS REOPENED",
  "intel-leak": "INTEL FRAGMENT",
};

export function processPendingResponses(state: GameState): GameState {
  const queue = state.pendingPartnerResponses ?? [];
  if (queue.length === 0) return state;

  const due = queue.filter((p) => p.dueTick <= state.totalTicks);
  const remaining = queue.filter((p) => p.dueTick > state.totalTicks);
  if (due.length === 0) return state;

  const newMessages: GameMessage[] = [];
  for (const p of due) {
    const titleTone = KIND_TONE_TITLE[p.responseKind];
    const greet = KIND_GREETING[p.partnerKind] ?? "INCOMING TRANSMISSION";
    newMessages.push({
      id: id("pending-msg"),
      timestamp: state.gameDate,
      tick: state.totalTicks,
      category: p.responseKind === "retaliation" ? "alert" : p.responseKind === "intel-leak" ? "intel" : "call",
      title: `${p.partnerName}: ${titleTone}`,
      body: `[${greet}]\n\n"${p.payload}"\n\n— ${p.partnerName} (in response to your earlier ${p.triggerAction.replace(/-/g, " ").toUpperCase()})`,
      read: false,
      priority: p.responseKind === "retaliation" ? "high" : "normal",
    });
  }

  return {
    ...state,
    pendingPartnerResponses: remaining,
    messages: [...newMessages, ...(state.messages ?? [])].slice(0, 200),
  };
}
