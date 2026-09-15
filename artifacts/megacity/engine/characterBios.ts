import type {
  Officer,
  OfficerDepartment,
  OfficerTrait,
  NamedCharacter,
  CharacterRole,
} from "@/engine/types";

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  }
  return h >>> 0;
}

function seededRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 16807) + 12345) >>> 0;
    if (s === 0) s = 1;
    return s / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  if (arr.length === 0) {
    throw new Error("characterBios.pick: empty pool");
  }
  const idx = Math.min(arr.length - 1, Math.max(0, Math.floor(rng() * arr.length)));
  return arr[idx] as T;
}

const DEPT_OPENERS: Record<OfficerDepartment, readonly string[]> = {
  supreme_leadership: [
    "Climbed out of the lower wards on raw nerve and a talent for backroom arithmetic.",
    "Built a name in the council chambers brokering deals nobody else would touch.",
    "Old administrative blood — three generations of family service under different regimes.",
  ],
  executive_council: [
    "Cut their teeth as a deputy aide before any reformers were paying attention.",
    "Came up through the cabinet circuit, fluent in budget hearings and protocol.",
    "Spent a decade running other people's offices before getting their own.",
  ],
  judicial: [
    "Served as a circuit prosecutor in the lower districts before joining the bench.",
    "Trained in pre-Collapse common law and never quite let the old codes go.",
    "Drafted half the city's procedural reforms while still a junior arbiter.",
  ],
  law_enforcement: [
    "Worked patrol in the worst sectors before the rank stripes came.",
    "Earned the badge after a tour with the irregular militias on the perimeter.",
    "Came over from internal affairs after a string of corruption convictions.",
  ],
  civic: [
    "Rose through the ration office during the long famine years.",
    "Started in the housing registry, learned every loophole the hard way.",
    "Volunteered with neighborhood councils long before any of it paid wages.",
  ],
  infrastructure: [
    "Trained as a field engineer rebuilding the grid after the second blackout.",
    "Apprenticed under the old structural inspectors who survived the quake.",
    "Crewed water-line repairs in the Outer Ring for the better part of a decade.",
  ],
  economic: [
    "Cut their teeth as a market auditor chasing shell companies through the commerce floor.",
    "Built a reputation in private credit before stepping into public service.",
    "Came up through the trade syndicate offices, knows every smuggling route by heart.",
  ],
  research: [
    "Trained at one of the surviving university enclaves before the labs fell.",
    "Spent a decade in applied research before the bureaucracy claimed them.",
    "Came over from the medical corps when the science directorate reorganized.",
  ],
  defense: [
    "Veteran of the perimeter campaigns, decorated more than once and quieter about it than you'd expect.",
    "Logged years in tactical command before being recalled to a desk role.",
    "Promoted out of the field after a hard tour against raider columns.",
  ],
  district: [
    "Born and raised in the district they now manage.",
    "Took the post after the previous coordinator vanished during a riot cycle.",
    "Worked their way up from a ward-level clerkship over fifteen patient years.",
  ],
  advisory: [
    "Brought in as an outside consultant and never quite left.",
    "Built a reputation drafting policy briefs for officials who took the credit.",
    "Crossed over from the press corps after one too many leaked memos.",
  ],
};

const TRAIT_FLAVOR: Partial<Record<OfficerTrait, readonly string[]>> = {
  efficient: ["Runs a tight, paperwork-light office.", "Prides themselves on closing files fast."],
  bureaucratic: ["Loves a properly stamped form more than most loves their family.", "Rarely moves without three layers of approval."],
  visionary: ["Talks in five-year plans when others can barely manage the week.", "Carries a notebook full of long-game schemes."],
  incompetent: ["Promoted past their depth and quietly aware of it.", "Subordinates have learned to route around the desk."],
  ambitious: ["Watches the org chart like a hunter watches treelines.", "Already drafting the speech for the next promotion."],
  loyal: ["Has turned down better offers more than once.", "Sticks with whoever signed the first paycheck."],
  corrupt: ["Quietly maintains accounts that nobody in payroll knows about.", "Has favors banked across half the lower districts."],
  idealistic: ["Still believes the city can be fixed if the right people care enough.", "Keeps a copy of the founding charter on the wall."],
  strict: ["Runs the office on military hours and zero excuses.", "Subordinates either thrive or transfer."],
  strategist: ["Thinks three moves ahead even in coffee orders.", "Keeps a war-room mentality about routine work."],
  aggressive: ["Picks fights other officials avoid.", "Has a reputation for breaking stalemates with shouting."],
  cautious: ["Will not commit to a memo without a paper trail of consultations.", "Believes most disasters come from acting too soon."],
  investor_friendly: ["On a first-name basis with most of the corporate board.", "Lunches with industry lobbyists more often than with staff."],
  worker_advocate: ["Spent time on the union floor before the office.", "Remembered for siding with labor in the strike year."],
  corporate_loyalist: ["Treats the corporate charter as scripture.", "Believes private capital is the only thing keeping the lights on."],
  budget_hawk: ["Counts every credit twice and resents anyone who doesn't.", "Has killed more programs by audit than by vote."],
  perfectionist: ["Will rewrite a memo nine times to get a comma right.", "Direct reports learn to leave deadlines well in advance."],
  delegator: ["Hands off everything that isn't strictly signature work.", "Trusts the people they hired — sometimes too much."],
  micromanager: ["Reviews every line item personally, regardless of scale.", "Staff joke that nothing leaves the office un-rewritten."],
  reformist: ["Came in promising to dismantle the worst of the old system.", "Has the scars from years of fighting entrenched interests."],
  populist: ["Speaks in plain language and means it.", "More popular on the street than in the council chamber."],
  paranoid: ["Sweeps their own office for listening devices weekly.", "Trusts no one above two layers of vetting."],
  diplomat: ["Smooths over feuds others would let burn.", "Has back-channels into half the major factions."],
  ruthless: ["Has signed off on consequences most colleagues would not.", "Reputation for outliving every adversary."],
  veteran: ["Has been in the work long enough to remember who started which feud.", "Carries a quiet gravitas that newer staff don't quite earn."],
  intelligence_officer: ["Came over from the spy services and never fully left the habits.", "Knows what's on most people's files without asking."],
  peacekeeper: ["Built their reputation on de-escalation, not arrests.", "Spent their early career mediating gang truces."],
  enforcer: ["Got the job done in the field before it ever got done in the office.", "Has a network of muscle that long predates the badge."],
  seasoned: ["Knows where every body is buried — sometimes literally.", "Long past being shocked by anything the city throws up."],
  tenured: ["Outlasted four administrations and shows no sign of stopping.", "Treated as a fixture by everyone in the building."],
  loyal_lifer: ["Will retire in this chair and not a day sooner.", "Has turned down promotions to stay close to the work."],
  embittered: ["Lost faith in the institution years ago but stayed anyway.", "Speaks of the early career years with audible regret."],
};

function tenureLine(officer: Officer): string {
  const age = officer.age ?? 0;
  if (age >= 60) return `Now in their seventh decade and showing no inclination to step down.`;
  if (age >= 50) return `Now in their fifties, with a long tail of institutional memory behind them.`;
  if (age >= 40) return `Mid-career, with most of the obvious mistakes already made and survived.`;
  if (age >= 30) return `Still in their prime, with a reputation that's hardening fast.`;
  return `Young for the chair, and aware that older eyes are watching.`;
}

function factionLine(officer: Officer): string | null {
  if (!officer.factionAffiliation) return null;
  return `Quietly aligned with ${officer.factionAffiliation}, though it rarely appears on official record.`;
}

export function generateOfficerBio(officer: Officer): string {
  const traits = [...(officer.traits ?? [])].sort();
  const seedKey = [
    officer.id ?? "",
    officer.name ?? "",
    officer.position ?? "",
    officer.department ?? "",
    String(officer.age ?? 0),
    officer.factionAffiliation ?? "",
    traits.join(","),
  ].join("|");
  const rng = seededRng(hashString(seedKey));

  const opener = pick(rng, DEPT_OPENERS[officer.department] ?? DEPT_OPENERS.civic);
  const flavored = traits
    .map((t) => TRAIT_FLAVOR[t as OfficerTrait])
    .filter((arr): arr is readonly string[] => Array.isArray(arr) && arr.length > 0);
  const fac = factionLine(officer);

  // Priority ordering keeps the most informative beats inside the 2-4 sentence cap.
  const sentences: string[] = [opener, tenureLine(officer)];
  if (fac) sentences.push(fac);
  if (flavored.length > 0) sentences.push(pick(rng, flavored[0]));
  if (flavored.length > 1) sentences.push(pick(rng, flavored[1]));

  return sentences.slice(0, 4).join(" ");
}

const ROLE_OPENERS: Record<CharacterRole, readonly string[]> = {
  gang_lieutenant: [
    "Came up running errands for a crew boss before the previous one disappeared.",
    "Earned their stripes in the territorial wars that nobody officially admits happened.",
    "Took over the corner after their predecessor caught a knife in a transit tunnel.",
  ],
  journalist: [
    "Cut their teeth as a stringer for the rationing-era pamphlets.",
    "Built a name on a single explosive story that nobody could quite kill.",
    "Came out of the underground press circuit when it was still illegal to print without a permit.",
  ],
  tycoon: [
    "Started with one warehouse and a knack for spotting which markets were about to crack.",
    "Inherited a small concern and turned it into a city-spanning operation in under a decade.",
    "Made their first fortune in scrap reclamation and never quite looked back.",
  ],
  agitator: [
    "Spent their early years on the picket lines that nobody wrote about.",
    "First arrested at sixteen for handing out unauthorized leaflets, and undeterred since.",
    "Came up through the tenement organizing circuit during the lean years.",
  ],
  celebrity: [
    "Broke through on a single broadcast that everyone in the city remembers seeing.",
    "Worked the entertainment circuit for years before the cameras finally turned their way.",
    "Built their following on a mix of talent and a near-supernatural sense for timing.",
  ],
  informant: [
    "Spent years in petty crime before discovering snitching paid better.",
    "Came to it after a sentencing deal that was never made entirely public.",
    "Built up a network of contacts that even the intelligence directorate envies.",
  ],
  fugitive: [
    "On the run since a job that went wrong in ways nobody fully agrees on.",
    "Wanted on charges that have grown more elaborate with every retelling.",
    "Vanished from the official roll after a courtroom no-show that became legend.",
  ],
  preacher: [
    "Preaches a doctrine assembled from pre-Collapse fragments and personal vision.",
    "Built their congregation in the back of a salvage yard before moving to better quarters.",
    "Came to the work after a personal crisis they will not discuss in public.",
  ],
  union_boss: [
    "Worked the line themselves for fifteen years before standing for office.",
    "Took the leadership after their predecessor took an unexplained early retirement.",
    "Built their reputation in the strike actions of the lean years.",
  ],
};

const ROLE_TENURE: Record<CharacterRole, (years: number) => string> = {
  gang_lieutenant: (y) => y > 10 ? "A decade in the trade and still upright, which is its own kind of credential." : "Newer to the rank, but moving carefully and watching everyone.",
  journalist: (y) => y > 15 ? "Has covered every administration since the Collapse, with the contacts to prove it." : "Still building the byline, still chasing the first big break.",
  tycoon: (y) => y > 20 ? "An old hand by industry standards, with the political reach that comes with it." : "Risen fast enough that the older houses are starting to notice.",
  agitator: (y) => y > 10 ? "Veteran of the long campaigns, marked and unbroken." : "Newer to the work, but already on more than one watch list.",
  celebrity: (y) => y > 10 ? "A fixture of the public scene by now, with the entourage to match." : "Still riding the rise, still vulnerable to the next bad cycle.",
  informant: (y) => y > 10 ? "Has outlived most of the people they've sold out — which is rarer than it sounds." : "Newer to the trade, and still learning who can be trusted to keep their name off the file.",
  fugitive: (y) => y > 10 ? "Has stayed ahead of the warrants longer than most ever manage." : "On the run only recently, and visibly still adjusting.",
  preacher: (y) => y > 15 ? "A weathered presence in the underground religious scene." : "Still building the flock, still finding the voice.",
  union_boss: (y) => y > 15 ? "A long-standing fixture of the labor circuit, with all the favors that implies." : "Newer to the chair, with a base that still needs proving.",
};

// Trait → flavor sentences for NamedCharacter bios.
//
// Audit (current state of spawn/event code):
// - `spawnNamedCharacter` accepts `traits: string[]` in its options, but no
//   call site in `engine/` currently passes a non-empty list — `getOrPickActiveNPC`
//   and `maybeEmitWeeklyNotable` both spawn with no traits.
// - As event content evolves and starts tagging NPCs (gang lieutenants,
//   journalists, tycoons, etc.) with personality traits, the natural pool to
//   draw from is `CITIZEN_TRAITS` (engine/traits.ts) — the canonical list of
//   personality strings the engine already defines and surfaces in the citizen
//   traits panel.
// - Below covers (a) the original NPC archetype traits, plus (b) every id in
//   `CITIZEN_TRAITS`, so any future event that attaches a citizen trait to a
//   named character will automatically produce flavor.
//
// Lookup is case-insensitive (see `generateCharacterBio`).
const CHARACTER_TRAIT_FLAVOR: Record<string, readonly string[]> = {
  // --- Original NPC archetype traits ---
  ruthless: ["Settles disputes with a finality that has not gone unnoticed.", "Has a body count that older operators speak about only in private."],
  greedy: ["Built every move on the calculation of personal gain.", "Has a reputation for squeezing every concession out of every contact."],
  charismatic: ["Walks into rooms and reorients the conversation without trying.", "Has the kind of presence that wins recruits before any pitch is made."],
  paranoid: ["Sleeps in a different place every week, and not without cause.", "Trusts maybe three people in the city, possibly fewer."],
  ambitious: ["Already plotting two moves past the current operation.", "Treats the present role as a stepping stone to something larger."],
  loyal: ["Sticks with allies past the point most would have walked away.", "Has refused to flip on prior associates, even under pressure."],
  cunning: ["Reads angles that others miss until it is too late.", "Has outmaneuvered better-resourced rivals on more than one occasion."],
  brutal: ["Has built a reputation on the willingness to do what others will not.", "Subordinates and rivals alike know not to test the limits."],
  reckless: ["Has burned through allies and resources at a startling pace.", "Operates with a tolerance for risk that older hands find unsettling."],
  calculating: ["Plans every public move in advance and rarely improvises.", "Approaches each interaction as a transaction to be priced and weighed."],
  vengeful: ["Carries grudges across years and acts on them when the moment comes.", "Has a memory for slights that more strategic minds would let go."],
  idealistic: ["Still believes the work matters beyond the personal stakes.", "Has turned down easier paths in service of a larger conviction."],
  corrupt: ["Has hands in revenue streams that the official record never quite catches.", "Treats integrity as a cost of doing business rather than a baseline."],
  pious: ["Speaks of the work as a calling rather than a job.", "Maintains observances that others find inconvenient or excessive."],
  manipulative: ["Has a talent for getting people to do things they will later regret.", "Treats personal relationships as instruments to be deployed."],
  reformist: ["Has staked their reputation on changing the way things are done.", "Has more enemies in the established order than allies, and counts that as progress."],

  // --- Citizen-trait coverage (mirrors ids in CITIZEN_TRAITS) ---
  hardworking: ["Logs hours that wear down everyone trying to keep pace.", "Has a reputation for arriving before the cleaners and leaving after them."],
  lazy: ["Has perfected the art of looking busy while accomplishing very little.", "Leaves the heavy lifting for whichever subordinate is least likely to complain."],
  suspicious: ["Reads every neutral comment as the opening move of an attack.", "Keeps a private file on anyone who has been kind too consistently."],
  curious: ["Asks the kind of follow-up questions that more cautious operators avoid.", "Has a habit of pulling on threads other people would rather leave alone."],
  aggressive: ["Defaults to confrontation in any disagreement that lasts more than a minute.", "Has left more meetings on bad terms than most attend in a year."],
  friendly: ["Greets every contact like an old comrade, regardless of history.", "Maintains a personal rapport across factional lines that nobody fully understands."],
  shy: ["Avoids public appearances and lets surrogates handle the speaking.", "Has built influence almost entirely through written notes and quiet meetings."],
  rebellious: ["Has bucked authority since before they had a position to lose.", "Treats every directive from above as a starting point for negotiation."],
  obedient: ["Has never been observed questioning a directive from a superior.", "Treats the chain of command as a moral structure, not a procedural one."],
  generous: ["Picks up tabs and bills others can't bring themselves to mention.", "Has quietly funded more rivals' projects than rivals will admit to."],
  cautious: ["Will not commit publicly without three independent confirmations.", "Prefers to wait out a crisis rather than risk being on record about it."],
  intelligent: ["Reads briefing packets in half the time staff expect, and remembers them.", "Has a reputation for spotting flaws in proposals nobody else catches."],
  gullible: ["Has been conned out of position-relevant information more than once.", "Trusts secondhand reports that more careful operators would verify twice."],
  patriotic: ["Speaks of the city in terms older operators reserve for family.", "Keeps a frayed banner on the office wall that they replace personally."],
  cynical: ["Has stopped pretending to believe in the official narrative.", "Treats every reform announcement as a redistribution of who profits."],
  optimistic: ["Speaks about the next budget cycle with audible hope.", "Has a knack for keeping morale up even during the worst news."],
  pessimistic: ["Opens most meetings with a worst-case projection.", "Has a contingency plan for failures nobody else has considered yet."],
  risk_taking: ["Bets on operations that older hands have already talked them out of.", "Has come back from disasters that should have been career-ending."],
  law_abiding: ["Files every form even when nobody is watching.", "Has a reputation for refusing favors that would compromise the paperwork."],
  rule_breaking: ["Treats regulations as suggestions when speed matters.", "Has accumulated more procedural censures than most colleagues' entire careers."],
  community_minded: ["Spends as much time at neighborhood meetings as at headquarters.", "Pushes resources toward the ground level even when it costs them politically."],
  independent: ["Refuses faction tags even when the alignment would be obvious.", "Has built a small network that operates outside any formal channel."],
  calm: ["Has not been seen raising their voice, even during raids.", "Keeps a steady tone in rooms where everyone else is already shouting."],
  nervous: ["Speaks fast in meetings and burns through stim coffee at a startling rate.", "Has been known to revise their position three times in a single hour."],
  stoic: ["Absorbs setbacks without visible reaction, which unsettles colleagues.", "Has buried more associates than most ever discuss aloud."],
  emotional: ["Has stormed out of more than one council session.", "Wears every disappointment openly, which both helps and hurts the cause."],
  competitive: ["Treats every adjacent role as a benchmark to beat.", "Keeps a private scoreboard against rivals nobody else takes seriously."],
  cooperative: ["Has built coalitions where others assumed enmity was permanent.", "Splits credit easily, which has earned a long bench of allies."],
  resourceful: ["Has gotten more out of underfunded operations than any peer.", "Knows where to find supplies that the official channels keep losing."],
  creative: ["Has solved problems with approaches the procedure manual never imagined.", "Treats institutional constraints as design challenges, not stop signs."],
  opportunistic: ["Has never let a crisis pass without extracting some advantage.", "Reads chaos as opportunity in ways that unsettle more principled colleagues."],
  faction_loyal: ["Puts faction interest first when the decisions get hard.", "Has refused promotions that would have cut their faction ties."],
  authority_respecting: ["Defers to the chain of command even when convinced it is wrong.", "Has never publicly criticized a superior, regardless of provocation."],
  authority_hating: ["Has fought every superior they've ever served under.", "Treats every order as the opening offer in a negotiation."],
  quiet: ["Says less than half what their position permits, and means most of it.", "Has built influence through observation more than declaration."],
  talkative: ["Fills any silence in any meeting, often with information they shouldn't share.", "Has leaked more than one operation simply by enjoying the sound of their own voice."],
  industrious: ["Works through holidays and looks confused when asked why.", "Keeps an output pace that has burned out two previous staff teams."],
  distrustful: ["Believes every official report contains at least one lie.", "Verifies even routine intelligence through their own private channels."],
  thrill_seeking: ["Has volunteered for operations that more careful peers refused.", "Looks visibly bored during long stretches of routine work."],
  ethical: ["Has refused arrangements that would have advanced them faster.", "Maintains a personal code that costs them allies but earns respect."],
  compassionate: ["Goes out of their way for subordinates the system has chewed up.", "Has personally covered medical costs for staff more than once."],
  selfish: ["Frames every collective effort around how it serves them.", "Has burned through goodwill from more than one prior posting."],
};

/**
 * Returns true if the given trait id has at least one flavor sentence
 * registered in CHARACTER_TRAIT_FLAVOR. Lookup is case-insensitive, matching
 * `generateCharacterBio`'s behavior.
 *
 * Exported for the regression test that guards coverage as new traits get
 * attached to NamedCharacters by event/spawn code.
 */
export function hasCharacterTraitFlavor(trait: string): boolean {
  const arr = CHARACTER_TRAIT_FLAVOR[trait.toLowerCase()];
  return Array.isArray(arr) && arr.length > 0;
}

const NOTORIETY_LINE: Array<[number, string]> = [
  [80, "Notoriety levels that put them on the watch lists of three separate directorates."],
  [60, "Well known enough that strangers recognize the name in conversation."],
  [40, "Recognized in the right circles, anonymous in most others."],
  [20, "Quietly building a name where it counts."],
  [0, "Still mostly unknown to the wider city."],
];

function notorietyLine(notoriety: number): string {
  for (const [threshold, text] of NOTORIETY_LINE) {
    if (notoriety >= threshold) return text;
  }
  return NOTORIETY_LINE[NOTORIETY_LINE.length - 1]![1];
}

export function generateCharacterBio(character: NamedCharacter): string {
  const traits = [...(character.traits ?? [])].sort();
  const seedKey = [
    character.id ?? "",
    character.name ?? "",
    character.role ?? "",
    String(character.bornYear ?? 0),
    String(character.introducedYear ?? 0),
    character.factionId ?? "",
    traits.join(","),
  ].join("|");
  const rng = seededRng(hashString(seedKey));

  const opener = pick(rng, ROLE_OPENERS[character.role] ?? ROLE_OPENERS.celebrity);
  const flavored = traits
    .map((t) => CHARACTER_TRAIT_FLAVOR[t.toLowerCase()])
    .filter((arr): arr is readonly string[] => Array.isArray(arr) && arr.length > 0);

  const yearsActive = Math.max(0, (character.lastSeenYear ?? character.introducedYear ?? 0) - (character.introducedYear ?? 0));
  const careerLength = yearsActive + Math.max(5, Math.min(40, (character.introducedYear ?? 0) - (character.bornYear ?? 0) - 18));
  const tenure = (ROLE_TENURE[character.role] ?? ROLE_TENURE.celebrity)(careerLength);
  const notoriety = notorietyLine(character.notoriety ?? 0);

  // Priority ordering keeps the most informative beats inside the 2-4 sentence cap.
  const sentences: string[] = [opener, notoriety];
  if (character.factionId) {
    sentences.push(`Reported ties to ${character.factionId} continue to surface in intelligence reports.`);
  }
  if (flavored.length > 0) sentences.push(pick(rng, flavored[0]));
  if (flavored.length > 1) sentences.push(pick(rng, flavored[1]));
  sentences.push(tenure);

  return sentences.slice(0, 4).join(" ");
}
