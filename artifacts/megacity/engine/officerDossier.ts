// Officer dossiers — a computed, display-only layer over the existing Officer
// roster. Derives an intelligence-style dossier (public reputation, private
// assessment, preferred doctrine, quote) plus THREAT / STABILITY scores from
// the stats and traits officers already carry. Deliberately adds NO new state
// fields: everything here is a pure function of the Officer object, so legacy
// saves get full dossiers with zero migration risk, and the text stays in sync
// with the officer's evolving stats (an officer who grows corrupt reads
// differently next time the file is opened).

import type { Officer, OfficerTrait } from "@/engine/types";

const clamp01to100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// THREAT — how dangerous this officer is to the Commander personally.
// Ambition and corruption drive it; fear-based authority and a public
// following make a move more viable; loyalty suppresses it.
export function getOfficerThreatScore(o: Officer): number {
  return clamp01to100(
    o.ambition * 0.35 +
      o.corruption * 0.25 +
      o.fearFactor * 0.1 +
      o.popularity * 0.1 +
      Math.max(0, 60 - o.loyalty) * 0.5,
  );
}

// STABILITY — how much steady value the officer adds to the administration.
// Loyalty and competence dominate; runaway ambition and corruption erode it.
export function getOfficerStabilityValue(o: Officer): number {
  return clamp01to100(
    o.loyalty * 0.35 +
      o.competence * 0.35 +
      Math.max(0, 100 - o.ambition) * 0.15 +
      Math.max(0, 100 - o.corruption) * 0.15,
  );
}

export type ThreatBand = "low" | "guarded" | "elevated" | "severe";

export function getThreatBand(score: number): ThreatBand {
  if (score >= 70) return "severe";
  if (score >= 50) return "elevated";
  if (score >= 30) return "guarded";
  return "low";
}

export type OfficerDossier = {
  publicReputation: string;
  privateAssessment: string;
  preferredDoctrine: string;
  quote: string;
};

// Deterministic per-officer variety: a tiny string hash so two officers with
// the same dominant trait do not read identically, while any given officer
// always renders the same dossier for the same stats.
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const pick = <T,>(arr: T[], seed: number): T => arr[seed % arr.length];

// Trait-keyed dossier fragments, in the city's dry institutional voice.
// Every OfficerTrait in types.ts has an entry — officerDossier.test.ts
// enforces full coverage so a new trait cannot silently fall back.
type TraitVoice = {
  doctrine: string[];
  quote: string[];
};

const TRAIT_VOICES: Record<OfficerTrait, TraitVoice> = {
  efficient: {
    doctrine: ["Short meetings, shorter reports, results by end of shift.", "Process is a tool. Outcomes are the job."],
    quote: ["Give me the summary. If it needs a second page, it needs a second author.", "Efficiency is loyalty to everyone's time."],
  },
  bureaucratic: {
    doctrine: ["Everything in writing. Everything filed. Everything defensible.", "The correct form, correctly completed, protects everyone."],
    quote: ["The city is held together by paperwork. You are welcome.", "Power changes hands. Paperwork changes desks."],
  },
  visionary: {
    doctrine: ["Build for the city that does not exist yet.", "Plan two crises ahead; the current one is already lost or won."],
    quote: ["The skyline is a promise. I intend to keep it.", "Everyone manages today. Someone has to manage the decade."],
  },
  incompetent: {
    doctrine: ["Delegate early, delegate often, be elsewhere when it lands.", "Confidence, properly projected, resembles ability."],
    quote: ["These numbers were correct when I was handed them.", "In my defence, nobody explained the second column."],
  },
  ambitious: {
    doctrine: ["Take the hard postings. Hard postings are visible postings.", "Every assignment is an audition."],
    quote: ["I serve the city. The city should notice.", "Vacancies above me have a way of appearing. I stay ready."],
  },
  loyal: {
    doctrine: ["The Commander's order is the plan. Execution is my department.", "Stand where you are posted, especially when it is raining."],
    quote: ["I was here before the good years. I will be here after.", "Loyalty is not a feeling. It is attendance."],
  },
  corrupt: {
    doctrine: ["Friction is inevitable. Lubrication is negotiable.", "Every regulation has a service entrance."],
    quote: ["Call it a facilitation fee. The auditors do, eventually.", "Everything moves faster warm. Money is warmth."],
  },
  idealistic: {
    doctrine: ["The rules exist to protect people, or they are not rules worth enforcing.", "Measure the administration by its worst district."],
    quote: ["I still believe the city can be what the posters say it is.", "Cynicism is just surrender with better posture."],
  },
  strict: {
    doctrine: ["Standards are not suggestions. Inspections are not visits.", "Discipline first; morale follows discipline, never the reverse."],
    quote: ["The regulation is clear. So is my schedule. Comply with both.", "I am not harsh. The consequences I prevent are harsh."],
  },
  strategist: {
    doctrine: ["Win the map before the meeting. Win the meeting before the fight.", "Position beats force. Timing beats position."],
    quote: ["I do not gamble. I schedule outcomes.", "Surprise is what planning looks like to the unprepared."],
  },
  aggressive: {
    doctrine: ["Hit problems while they are still small enough to hit.", "Momentum is the only resource that cannot be requisitioned."],
    quote: ["Waiting is a decision. Usually the wrong one.", "I have never regretted moving first. Ask anyone who moved second."],
  },
  cautious: {
    doctrine: ["Slow is smooth. Smooth survives the inquiry.", "Never commit to what you cannot walk back before nightfall."],
    quote: ["The bold get statues. The careful get pensions.", "I double-check because single-checking built the memorial wall."],
  },
  investor_friendly: {
    doctrine: ["Capital goes where it is welcomed and stays where it is safe.", "A signed contract is public order in its most durable form."],
    quote: ["The market is a citizen too. A large, nervous citizen.", "Confidence is infrastructure."],
  },
  worker_advocate: {
    doctrine: ["The shift floor knows before the dashboard does. Ask the floor.", "Safe workers, paid on time, do not riot. Economics is simple."],
    quote: ["The city runs on shoulders. I answer to them.", "Every quota was set by someone who never lifted it."],
  },
  corporate_loyalist: {
    doctrine: ["Align with the chartered companies; their logistics outlast ministries.", "What is good for the sector charters is good for the sector."],
    quote: ["The corporations built half this city. I keep the receipts framed.", "Public-private partnership, heavy on the partnership."],
  },
  budget_hawk: {
    doctrine: ["Every credit is a conscript. None desert on my watch.", "Cut twice, measure the complaints, cut again."],
    quote: ["No. That is the budget review in full.", "A deficit is just theft from a citizen who has not been born yet."],
  },
  perfectionist: {
    doctrine: ["Done right or done again. There is no third state.", "Tolerances exist for machines. Not for standards."],
    quote: ["Adequate is a resignation letter with extra steps.", "I found one error in the report. Therefore the report is wrong."],
  },
  delegator: {
    doctrine: ["Hire past your own ceiling and get out of the corridor.", "My job is the roster, not the wrench."],
    quote: ["I am responsible for everything and hands-on with nothing. That is the design.", "Good staff make me look lazy. Excellent staff make me look brilliant."],
  },
  micromanager: {
    doctrine: ["Trust, but verify. Then verify the verification.", "Nothing ships until I have initialled every page."],
    quote: ["Yes, I read the footnotes. Someone has to.", "Detail is not small. Detail is where the failures hide."],
  },
  reformist: {
    doctrine: ["Audit the process, not the people. The process is usually guilty.", "Institutions rot from habit. Prune annually."],
    quote: ["'We have always done it this way' is a confession, not a defence.", "I do not break systems. I interrupt their decay."],
  },
  populist: {
    doctrine: ["Govern in the open. The queue is the real cabinet.", "If the districts cheer, the ministries will follow."],
    quote: ["The people are not a risk to be managed. They are the point.", "I read the graffiti. It is more honest than the briefings."],
  },
  paranoid: {
    doctrine: ["Assume the room is listening. Usually the room is listening.", "Redundancy in everything: plans, exits, food tasters."],
    quote: ["I am not paranoid. I am correctly calibrated.", "Twice is coincidence. Once is enemy action done well."],
  },
  diplomat: {
    doctrine: ["Every enemy is a negotiation that has not started yet.", "Leave the table last. The last one seated writes the minutes."],
    quote: ["Wars are budget overruns with flags.", "I have ended more conflicts with lunch than the army has with artillery."],
  },
  ruthless: {
    doctrine: ["Remove obstacles completely; half-measures grow back with grudges.", "Mercy is a policy instrument. Use it precisely and rarely."],
    quote: ["I sleep well. The city sleeps better.", "Sentiment is expensive. I run a lean department."],
  },
  veteran: {
    doctrine: ["Plans fail at first contact. Train for the second contact.", "Hold the line you are given. Improve the line you hold."],
    quote: ["I have outlived three doctrines and two memorials. Experience compounds.", "The young ones call it a crisis. We called it Tuesday."],
  },
  intelligence_officer: {
    doctrine: ["Collect quietly, act rarely, deny everything by default.", "The best operation is the one recorded nowhere, twice."],
    quote: ["I know. That is the job description in full.", "Secrets are load-bearing. Handle accordingly."],
  },
  peacekeeper: {
    doctrine: ["De-escalate first. The truncheon depreciates goodwill fast.", "A calm crowd is a policing success nobody photographs."],
    quote: ["Every riot prevented is invisible. I specialize in invisible.", "Force is the loudest way to admit you ran out of ideas."],
  },
  enforcer: {
    doctrine: ["Presence prevents. Absence invites. Stay present.", "The law is only as real as its nearest officer."],
    quote: ["I am not the last resort. I am the reminder.", "Compliance is a habit. I am the habit-forming kind."],
  },
  seasoned: {
    doctrine: ["Read the room, then the regulations, in that order.", "Most emergencies are old emergencies wearing new badges."],
    quote: ["Give me a week and I will tell you which crisis this one is a rerun of.", "Calm is a skill. I have had decades of lessons."],
  },
  tenured: {
    doctrine: ["Outlast. Institutions reward the standing.", "Never volunteer, never refuse, never retire mid-scandal."],
    quote: ["I have survived four reorganizations by reading none of the memos.", "My chair and I have seniority. Respect at least one of us."],
  },
  loyal_lifer: {
    doctrine: ["One badge, one career, one city. Complications are for consultants.", "Serve the office, whoever holds it. The office remembers."],
    quote: ["Forty years in and the anthem still works on me.", "I signed for life. The fine print agreed."],
  },
  embittered: {
    doctrine: ["Expect nothing, document everything, keep copies off-site.", "Do the job exactly to specification. Exactly."],
    quote: ["I used to have ideals. Now I have receipts.", "Passed over twice, promoted once, forgotten always. Yet here I am, on time."],
  },
};

const REPUTATION_BY_POPULARITY: [number, string[]][] = [
  [75, [
    "Citizens speak of {name} warmly and unprompted, which the surveillance summaries describe as 'statistically unusual.'",
    "Genuinely popular in the districts. Crowds part politely; some of them even mean it.",
  ]],
  [50, [
    "Regarded as one of the administration's more tolerable faces. Complaints about {name} tend to be procedural rather than personal.",
    "Respected in public, assessed cautiously in private. The districts have learned to reserve judgement on officials who last.",
  ]],
  [25, [
    "Largely anonymous outside official channels. Citizens recognize the title before the face, and prefer it that way.",
    "Neither loved nor hated in the districts — a distinction most officials would envy if they thought about it.",
  ]],
  [0, [
    "Publicly unpopular. Effigies have not yet appeared, which Public Affairs counts as a win.",
    "The districts use the name {name} the way they use weather warnings.",
  ]],
];

function reputationFor(o: Officer, seed: number): string {
  for (const [threshold, lines] of REPUTATION_BY_POPULARITY) {
    if (o.popularity >= threshold) {
      return pick(lines, seed).replace("{name}", o.name);
    }
  }
  return pick(REPUTATION_BY_POPULARITY[REPUTATION_BY_POPULARITY.length - 1][1], seed).replace("{name}", o.name);
}

function assessmentFor(o: Officer, threat: number, stability: number, seed: number): string {
  const parts: string[] = [];

  if (o.competence >= 75) parts.push("Highly capable; results arrive ahead of the excuses.");
  else if (o.competence >= 45) parts.push("Competent within the usual tolerances of the service.");
  else parts.push("Performance is best described as decorative.");

  if (o.loyalty >= 70) parts.push("Loyalty assessed as durable under ordinary and most extraordinary pressures.");
  else if (o.loyalty >= 40) parts.push("Loyalty holds while conditions do. Recommend conditions be maintained.");
  else parts.push("Loyalty is transactional. Know the current price and who else is bidding.");

  if (o.corruption >= 50) parts.push("Financial irregularities are no longer irregular.");
  else if (o.corruption >= 25) parts.push("Minor graft detected; within departmental norms, regrettably.");

  if (o.ambition >= 70) parts.push("Ambition exceeds current posting. Watch the calendar of vacancies above them.");

  const band = getThreatBand(threat);
  if (band === "severe") parts.push("CONCLUSION: treat as a rival who has not yet chosen a date.");
  else if (band === "elevated") parts.push("CONCLUSION: containment recommended — promotion, posting, or scrutiny.");
  else if (stability >= 70) parts.push("CONCLUSION: a stabilizing asset. Retain and resource.");
  else parts.push("CONCLUSION: serviceable. Review annually or after the next scandal, whichever comes first.");

  // Rotate the joining rhythm slightly per officer so long rosters do not
  // read as a single template.
  return seed % 2 === 0 ? parts.join(" ") : parts.join("  ");
}

export function buildOfficerDossier(o: Officer): OfficerDossier {
  const seed = hashId(o.id);
  const threat = getOfficerThreatScore(o);
  const stability = getOfficerStabilityValue(o);
  const dominantTrait: OfficerTrait | undefined = o.traits?.[0];
  const voice = dominantTrait ? TRAIT_VOICES[dominantTrait] : undefined;

  return {
    publicReputation: reputationFor(o, seed),
    privateAssessment: assessmentFor(o, threat, stability, seed),
    preferredDoctrine: voice
      ? pick(voice.doctrine, seed)
      : "No stated doctrine on file. The absence has been noted.",
    quote: voice
      ? pick(voice.quote, seed >> 3)
      : "No quotable statements on record. Analysts consider this deliberate.",
  };
}
