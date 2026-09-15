import type { GameState } from "@/engine/types";
import type { EventChainDef } from "@/engine/eventChains";
import { getArchetypeById, type ActiveBusiness, type BusinessCategory } from "@/engine/independentEnterprises";
import { getChainById, getEffectiveAntiMonopolyCap, type ActiveChain } from "@/engine/corporateChains";

const TICKS_PER_YEAR = 96;

function rng(seed: number): () => number {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickBusiness(
  s: GameState,
  predicate: (b: ActiveBusiness) => boolean,
): ActiveBusiness | null {
  const econ = s.localEconomy;
  if (!econ) return null;
  const eligible = econ.businesses.filter(predicate);
  if (eligible.length === 0) return null;
  const r = rng(s.totalTicks * 31 + eligible.length);
  return eligible[Math.floor(r() * eligible.length)] ?? null;
}

function bizContext(b: ActiveBusiness): Record<string, string> {
  const arch = getArchetypeById(b.archetypeId);
  return {
    bizUid: b.uid,
    biz_name: b.name,
    owner_name: b.ownerName ?? "the owner",
    years: String(b.yearsActive),
    archetype_label: arch?.displayName ?? "shop",
    employees: String(b.employees * b.locations),
    district: b.districtId,
    tier: String(b.tier),
  };
}

function hasEcon(s: GameState): boolean {
  return !!s.localEconomy && (s.localEconomy.businesses?.length ?? 0) > 0;
}

function inCategory(b: ActiveBusiness, cat: BusinessCategory): boolean {
  return getArchetypeById(b.archetypeId)?.category === cat;
}

function makeChain(
  id: string,
  name: string,
  trigger: (s: GameState) => boolean,
  prepare: (s: GameState) => Record<string, string> | null,
  cooldownTicks: number,
  stages: EventChainDef["stages"],
): EventChainDef {
  return { id, name, triggerCheck: trigger, cooldownTicks, stages, prepareContext: prepare };
}

// Helper: predicate-driven business chain factory
function bizChain(
  id: string,
  name: string,
  predicate: (b: ActiveBusiness) => boolean,
  cooldownTicks: number,
  stages: EventChainDef["stages"],
): EventChainDef {
  return makeChain(
    id,
    name,
    (s) => hasEcon(s) && (s.localEconomy?.businesses ?? []).some(predicate),
    (s) => {
      const b = pickBusiness(s, predicate);
      return b ? bizContext(b) : null;
    },
    cooldownTicks,
    stages,
  );
}

export const BUSINESS_EVENT_CHAINS: EventChainDef[] = [
  // 1. The Beloved Cafe — viral fame for an aged food/drink T1
  bizChain(
    "biz_beloved_cafe",
    "The Beloved Cafe",
    (b) => b.tier === 1 && b.yearsActive >= 8 && inCategory(b, "food_drink"),
    320,
    [
      {
        id: "bc1",
        title: "A CITY FAVORITE EMERGES",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "bc_subsidize", label: "DESIGNATE AS HERITAGE BUSINESS", effects: { credits: -8000, happiness: 4 }, nextStageId: null, bizAction: "mark_landmark" },
          { id: "bc_let_grow", label: "LET THE MARKET REWARD IT", effects: { happiness: 1 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "bc_tax_visit", label: "DISPATCH A TAX INSPECTOR", effects: { credits: 4000, happiness: -3, corruption: 2 }, nextStageId: null, bizAction: "damage_reputation" },
        ],
      },
    ],
  ),

  // 2. Family Dynasty — succession at a long-running shop
  bizChain(
    "biz_family_dynasty",
    "Family Dynasty",
    (b) => b.tier === 1 && b.yearsActive >= 15,
    400,
    [
      {
        id: "fd1",
        title: "A SUCCESSION QUESTION",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "fd_eldest", label: "BACK THE ELDEST CHILD", effects: { happiness: 2 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "fd_split", label: "ORDER AN EQUAL SPLIT", effects: { happiness: 0 }, nextStageId: null, bizAction: "damage_reputation" },
          { id: "fd_buyout", label: "ARRANGE A QUIET BUYOUT", effects: { credits: 6000, happiness: -4 }, nextStageId: null, bizAction: "close_business" },
        ],
      },
    ],
  ),

  // 3. Mob Shakedown — gang protection demand
  bizChain(
    "biz_mob_shakedown",
    "Mob Shakedown",
    (b) => b.tier === 1 && b.yearsActive >= 2,
    260,
    [
      {
        id: "ms1",
        title: "PROTECTION DEMANDED",
        severity: "medium",
        delayTicks: 0,
        responses: [
          { id: "ms_raid", label: "ORDER A POLICE RAID", effects: { credits: -12000, crime: -3, unrest: 4, "loyalty_judges": 3, "loyalty_gangs": -5 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "ms_subsidize", label: "QUIETLY PAY THEIR PROTECTION", effects: { credits: -6000, corruption: 3, "loyalty_gangs": 2 }, nextStageId: null },
          { id: "ms_ignore", label: "TELL THEM TO HANDLE IT", effects: { happiness: -2, crime: 2 }, nextStageId: null, bizAction: "damage_reputation" },
        ],
      },
    ],
  ),

  // 4. Phoenix Reopening — recently closed business, allow reopening
  makeChain(
    "biz_phoenix_reopen",
    "Phoenix Reopening",
    (s) => (s.localEconomy?.closedHistory?.length ?? 0) > 0 && (s.localEconomy?.closedHistory ?? []).some((c) => c.yearsActive >= 5),
    (s) => {
      const closed = (s.localEconomy?.closedHistory ?? []).filter((c) => c.yearsActive >= 5);
      if (closed.length === 0) return null;
      const r = rng(s.totalTicks * 11);
      const c = closed[Math.floor(r() * closed.length)];
      const arch = getArchetypeById(c.archetypeId);
      return {
        biz_name: c.name,
        years: String(c.yearsActive),
        archetype_label: arch?.displayName ?? "shop",
        district: c.districtId,
      };
    },
    220,
    [
      {
        id: "pr1",
        title: "PETITION TO REOPEN",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "pr_grant", label: "GRANT REOPENING SUBSIDY", effects: { credits: -10000, happiness: 4 }, nextStageId: null },
          { id: "pr_loan", label: "OFFER A REPAYABLE LOAN", effects: { credits: -3000, happiness: 2 }, nextStageId: null },
          { id: "pr_decline", label: "DECLINE THE PETITION", effects: { happiness: -2 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 5. Health Inspector Crisis
  bizChain(
    "biz_health_inspector",
    "Health Inspector Crisis",
    (b) => b.tier === 1 && (inCategory(b, "food_drink") || inCategory(b, "fitness_wellness")),
    180,
    [
      {
        id: "hi1",
        title: "CITATION ISSUED",
        severity: "medium",
        delayTicks: 0,
        responses: [
          { id: "hi_uphold", label: "UPHOLD THE CITATION", effects: { credits: 2000 }, nextStageId: null, bizAction: "damage_reputation" },
          { id: "hi_dismiss", label: "DISMISS — REQUEST RE-INSPECTION", effects: { credits: -800, corruption: -1 }, nextStageId: null },
          { id: "hi_close", label: "REVOKE THE OPERATING LICENSE", effects: { happiness: -2 }, nextStageId: null, bizAction: "close_business" },
        ],
      },
    ],
  ),

  // 6. Strike at the Diner
  bizChain(
    "biz_employee_strike",
    "Workplace Strike",
    (b) => b.tier === 1 && b.employees >= 3 && b.yearsActive >= 3,
    220,
    [
      {
        id: "es1",
        title: "WALKOUT AT {biz_name}",
        severity: "medium",
        delayTicks: 0,
        responses: [
          { id: "es_mediate", label: "DISPATCH A LABOR MEDIATOR", effects: { credits: -3000, happiness: 3, unrest: -2 }, nextStageId: null },
          { id: "es_subsidize", label: "SUBSIDIZE THE WAGE GAP", effects: { credits: -7000, happiness: 5, unrest: -4 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "es_break", label: "ORDER POLICE TO CLEAR THE PICKET", effects: { unrest: 6, happiness: -5, crime: 2 }, nextStageId: null, bizAction: "damage_reputation" },
        ],
      },
    ],
  ),

  // 7. Landlord Hike
  bizChain(
    "biz_rent_hike",
    "Landlord Rent Hike",
    (b) => b.tier === 1 && b.yearsActive >= 5,
    260,
    [
      {
        id: "rh1",
        title: "RENT DOUBLED OVERNIGHT",
        severity: "medium",
        delayTicks: 0,
        responses: [
          { id: "rh_subsidy", label: "ISSUE A RENT-STABILIZATION GRANT", effects: { credits: -8000, happiness: 3, "loyalty_aureus-dominion": -2 }, nextStageId: null, bizAction: "mark_landmark" },
          { id: "rh_relocate", label: "RELOCATE TO A PUBLIC PROPERTY", effects: { credits: -2000, happiness: 1 }, nextStageId: null },
          { id: "rh_ignore", label: "PRIVATE MATTER — STAY OUT", effects: { "loyalty_aureus-dominion": 1 }, nextStageId: null, bizAction: "close_business" },
        ],
      },
    ],
  ),

  // 8. Loan Shark Trap
  bizChain(
    "biz_loan_shark",
    "Loan Shark Trap",
    (b) => b.tier === 1 && b.reputation < 50 && b.yearsActive >= 2,
    240,
    [
      {
        id: "ls1",
        title: "OWNER IN DEEP",
        severity: "medium",
        delayTicks: 0,
        responses: [
          { id: "ls_buy", label: "BUY OUT THE DEBT", effects: { credits: -9000, "loyalty_gangs": -3 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "ls_arrest", label: "ARREST THE LENDERS", effects: { credits: -4000, crime: -2, unrest: 2, "loyalty_judges": 2 }, nextStageId: null },
          { id: "ls_decline", label: "DECLINE — IT'S THEIR PROBLEM", effects: { happiness: -2 }, nextStageId: null, bizAction: "close_business" },
        ],
      },
    ],
  ),

  // 9. Pre-Collapse Recipe — heritage opportunity
  bizChain(
    "biz_heritage_recipe",
    "Pre-Collapse Recipe",
    (b) => b.tier === 1 && b.yearsActive >= 20 && inCategory(b, "food_drink"),
    480,
    [
      {
        id: "hr1",
        title: "A RECIPE FROM BEFORE",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "hr_designate", label: "DECLARE LIVING HERITAGE", effects: { credits: -12000, happiness: 6 }, nextStageId: null, bizAction: "mark_landmark" },
          { id: "hr_archive", label: "ARCHIVE THE RECIPE ONLY", effects: { credits: -2000, happiness: 2 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "hr_sell", label: "AUCTION THE RECIPE TO MUMCORP", effects: { credits: 25000, happiness: -6, "loyalty_corps": 3 }, nextStageId: null, bizAction: "damage_reputation" },
        ],
      },
    ],
  ),

  // 10. Counterfeit Crackdown — grey market raid
  bizChain(
    "biz_counterfeit",
    "Counterfeit Crackdown",
    (b) => b.tier === 1 && inCategory(b, "grey_market"),
    260,
    [
      {
        id: "cc1",
        title: "FORGED PAPERS RING",
        severity: "medium",
        delayTicks: 0,
        responses: [
          { id: "cc_raid", label: "RAID AND SHUTTER", effects: { credits: 3000, crime: -3, "loyalty_judges": 2 }, nextStageId: null, bizAction: "close_business" },
          { id: "cc_flip", label: "TURN {owner_name} INTO AN INFORMANT", effects: { corruption: 3, crime: -1 }, nextStageId: null },
          { id: "cc_ignore", label: "DISMISS THE INVESTIGATION", effects: { corruption: 4 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 11. Apprentice's Rise
  bizChain(
    "biz_apprentice_rise",
    "Apprentice's Rise",
    (b) => b.tier === 1 && b.yearsActive >= 12 && b.reputation >= 60,
    300,
    [
      {
        id: "ar1",
        title: "A NEW HEIR",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "ar_bless", label: "BLESS THE TRANSFER", effects: { credits: -1500, happiness: 3 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "ar_expand", label: "FUND AN EXPANSION", effects: { credits: -10000, happiness: 4 }, nextStageId: null, bizAction: "promote_to_t2" },
          { id: "ar_stay_quiet", label: "PRIVATE MATTER", effects: {}, nextStageId: null },
        ],
      },
    ],
  ),

  // 12. Cult Recruitment
  bizChain(
    "biz_cult_recruit",
    "Cult Recruitment Front",
    (b) => b.tier === 1 && (inCategory(b, "cultural_faith") || inCategory(b, "personal_services")),
    260,
    [
      {
        id: "cr1",
        title: "WHISPERS AT THE COUNTER",
        severity: "medium",
        delayTicks: 0,
        responses: [
          { id: "cult_raid", label: "RAID THE BACK ROOM", effects: { unrest: 4, crime: -2, happiness: -3 }, nextStageId: null, bizAction: "close_business" },
          { id: "cult_surveil", label: "OPEN A SURVEILLANCE FILE", effects: { credits: -4000, corruption: 1 }, nextStageId: null },
          { id: "cult_ignore", label: "DISMISS AS GOSSIP", effects: { unrest: 1 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 13. Underground Speakeasy
  bizChain(
    "biz_speakeasy",
    "The Speakeasy Question",
    (b) => b.tier === 1 && inCategory(b, "nightlife"),
    280,
    [
      {
        id: "sp1",
        title: "AN ILLEGAL VENUE",
        severity: "medium",
        delayTicks: 0,
        responses: [
          { id: "sp_legalize", label: "ISSUE A SPECIAL VICE LICENSE", effects: { credits: 6000, happiness: 3, corruption: 2 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "sp_raid", label: "RAID AND SHUTTER", effects: { unrest: 3, crime: -1, "loyalty_judges": 2 }, nextStageId: null, bizAction: "close_business" },
          { id: "sp_ignore", label: "LOOK THE OTHER WAY", effects: { corruption: 3, crime: 1, happiness: 2 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 14. Wholesale Boycott — small biz vs MumFresh
  makeChain(
    "biz_chain_boycott",
    "Wholesale Boycott",
    (s) => {
      const mumfresh = (s.localEconomy?.corporateChains ?? []).find((c) => c.chainId === "mumfresh_grocer");
      const indieRetail = (s.localEconomy?.businesses ?? []).filter((b) => inCategory(b, "retail"));
      return !!mumfresh && mumfresh.locationCount >= 25 && indieRetail.length >= 6;
    },
    (s) => {
      const indieRetail = (s.localEconomy?.businesses ?? []).filter((b) => inCategory(b, "retail"));
      const b = pickBusiness(s, (x) => inCategory(x, "retail") && x.yearsActive >= 5) ?? indieRetail[0];
      if (!b) return null;
      return bizContext(b);
    },
    340,
    [
      {
        id: "wb1",
        title: "INDIE RETAILERS UNITE",
        severity: "medium",
        delayTicks: 0,
        responses: [
          { id: "wb_back_indies", label: "BACK THE BOYCOTT", effects: { credits: -12000, happiness: 5, "loyalty_corps": -4 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "wb_neutral", label: "MEDIATE A SETTLEMENT", effects: { credits: -3000, happiness: 1 }, nextStageId: null },
          { id: "wb_back_chain", label: "RULE FOR MUMFRESH", effects: { credits: 8000, happiness: -5, "loyalty_corps": 4 }, nextStageId: null, bizAction: "damage_reputation" },
        ],
      },
    ],
  ),

  // 15. Veteran's Ire — fired worker plots arson
  bizChain(
    "biz_arson_plot",
    "Arson Plot",
    (b) => b.tier === 1 && b.yearsActive >= 4,
    260,
    [
      {
        id: "ap1",
        title: "INTELLIGENCE: A FIRED WORKER",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "ap_arrest", label: "PRE-EMPTIVE ARREST", effects: { credits: -2000, crime: -1, "loyalty_judges": 2 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "ap_warn", label: "WARN {owner_name}", effects: { credits: -500 }, nextStageId: null },
          { id: "ap_wait", label: "WAIT FOR THE ACT", effects: { crime: 3, happiness: -3 }, nextStageId: null, bizAction: "damage_reputation" },
        ],
      },
    ],
  ),

  // 16. Restaurant Critic
  bizChain(
    "biz_critic_visit",
    "The Critic Visits",
    (b) => b.tier === 1 && b.yearsActive >= 2 && (inCategory(b, "food_drink") || inCategory(b, "nightlife")),
    200,
    [
      {
        id: "cv1",
        title: "AN ANONYMOUS REVIEW",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "cv_leak", label: "LEAK THE OWNER A WARNING", effects: { corruption: 1 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "cv_silent", label: "STAY OUT OF IT", effects: {}, nextStageId: null, bizAction: "damage_reputation" },
          { id: "cv_pressure", label: "PRESSURE THE EDITOR TO PULL IT", effects: { corruption: 4, happiness: -2 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 17. Robot Replacement
  bizChain(
    "biz_droid_replace",
    "Droid Replacement",
    (b) => b.tier === 1 && b.employees >= 4 && b.yearsActive >= 3,
    260,
    [
      {
        id: "dr1",
        title: "AUTOMATION PROPOSAL",
        severity: "medium",
        delayTicks: 0,
        responses: [
          { id: "dr_approve", label: "APPROVE THE PERMIT", effects: { credits: 4000, employment: -2, happiness: -3 }, nextStageId: null, bizAction: "promote_to_t2" },
          { id: "dr_block", label: "DENY — PROTECT THE JOBS", effects: { happiness: 3 }, nextStageId: null },
          { id: "dr_subsidize_retrain", label: "APPROVE WITH RETRAINING SUBSIDY", effects: { credits: -8000, happiness: 1, employment: -1 }, nextStageId: null, bizAction: "boost_reputation" },
        ],
      },
    ],
  ),

  // 18. Inherited Disaster
  bizChain(
    "biz_inherited_disaster",
    "Inherited Disaster",
    (b) => b.tier === 1 && b.yearsActive >= 18 && b.reputation < 60,
    320,
    [
      {
        id: "id1",
        title: "THE HEIR IS FAILING",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "id_intervene", label: "ASSIGN A PUBLIC TRUSTEE", effects: { credits: -6000, happiness: 2 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "id_buyout", label: "ARRANGE A SALE TO A COMPETITOR", effects: { credits: 3000, happiness: -1 }, nextStageId: null },
          { id: "id_let_fall", label: "LET IT FAIL", effects: {}, nextStageId: null, bizAction: "close_business" },
        ],
      },
    ],
  ),

  // 19. Flood Damage
  bizChain(
    "biz_flood_damage",
    "Flood Damage",
    (b) => b.tier === 1,
    220,
    [
      {
        id: "fl1",
        title: "WATER MAIN BURST",
        severity: "medium",
        delayTicks: 0,
        responses: [
          { id: "fl_subsidize", label: "EMERGENCY REPAIR GRANT", effects: { credits: -7000, happiness: 3 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "fl_loan", label: "OFFER A REPAYABLE LOAN", effects: { credits: -2500, happiness: 1 }, nextStageId: null },
          { id: "fl_decline", label: "DECLINE — INSURANCE PROBLEM", effects: { happiness: -2 }, nextStageId: null, bizAction: "close_business" },
        ],
      },
    ],
  ),

  // 20. Tax Audit
  bizChain(
    "biz_tax_audit",
    "Tax Audit",
    (b) => b.tier >= 2 || (b.tier === 1 && b.yearsActive >= 8 && b.reputation >= 70),
    280,
    [
      {
        id: "ta1",
        title: "AUDIT FINDINGS",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "ta_settle", label: "ACCEPT THE QUIET SETTLEMENT", effects: { credits: 12000, corruption: 3 }, nextStageId: null },
          { id: "ta_full_charge", label: "FILE FULL CHARGES", effects: { credits: 25000, happiness: -3, corruption: -1 }, nextStageId: null, bizAction: "damage_reputation" },
          { id: "ta_dismiss", label: "DISMISS THE FINDINGS", effects: { corruption: 2 }, nextStageId: null, bizAction: "boost_reputation" },
        ],
      },
    ],
  ),

  // 21. Squatter's Bistro — illegal occupancy
  bizChain(
    "biz_squatter_bistro",
    "Squatter's Bistro",
    (b) => b.tier === 1 && b.yearsActive <= 2 && b.reputation >= 55,
    240,
    [
      {
        id: "sb1",
        title: "UNLICENSED OCCUPANCY",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "sb_legalize", label: "GRANT A SQUATTER'S CHARTER", effects: { credits: -1500, happiness: 4 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "sb_evict", label: "EVICT AND DEMOLISH", effects: { credits: -3000, happiness: -4, unrest: 3 }, nextStageId: null, bizAction: "close_business" },
          { id: "sb_ignore", label: "OFFICIALLY UNAWARE", effects: { corruption: 1 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 22. Generational Strike
  bizChain(
    "biz_generational_strike",
    "Generational Strike",
    (b) => b.tier === 1 && b.employees >= 4 && b.yearsActive >= 8,
    300,
    [
      {
        id: "gs1",
        title: "THE STRIKE IS HEREDITARY",
        severity: "medium",
        delayTicks: 0,
        responses: [
          { id: "gs_settle", label: "FORCE A GENEROUS SETTLEMENT", effects: { credits: -10000, happiness: 6, unrest: -4 }, nextStageId: null },
          { id: "gs_mediate", label: "OPEN-ENDED ARBITRATION", effects: { credits: -3000, unrest: -1 }, nextStageId: null },
          { id: "gs_break", label: "BREAK THE STRIKE", effects: { unrest: 8, happiness: -7, crime: 2 }, nextStageId: null, bizAction: "damage_reputation" },
        ],
      },
    ],
  ),

  // 23. The Honest Mechanic
  bizChain(
    "biz_honest_mechanic",
    "The Honest Mechanic",
    (b) => b.tier === 1 && inCategory(b, "repair_utility") && b.yearsActive >= 6,
    300,
    [
      {
        id: "hm1",
        title: "A REPUTATION AT STAKE",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "hm_investigate", label: "ORDER AN INDEPENDENT INVESTIGATION", effects: { credits: -3000, happiness: 2 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "hm_quiet", label: "OFFER A QUIET SETTLEMENT TO THE INJURED", effects: { credits: -6000, corruption: 2 }, nextStageId: null },
          { id: "hm_let_run", label: "LET THE STORY RUN", effects: { happiness: -1 }, nextStageId: null, bizAction: "damage_reputation" },
        ],
      },
    ],
  ),

  // 24. The Underbidder — competitor undercuts
  bizChain(
    "biz_underbidder",
    "The Underbidder",
    (b) => b.tier === 1 && b.yearsActive >= 4,
    240,
    [
      {
        id: "ub1",
        title: "PRICE WAR IN {district}",
        severity: "medium",
        delayTicks: 0,
        responses: [
          { id: "ub_anti_dumping", label: "FILE ANTI-DUMPING CHARGES", effects: { credits: -4000, happiness: 2 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "ub_subsidize", label: "MATCH THE PRICE WITH A SUBSIDY", effects: { credits: -8000, happiness: 1 }, nextStageId: null },
          { id: "ub_market", label: "FREE MARKET — STAY OUT", effects: {}, nextStageId: null, bizAction: "close_business" },
        ],
      },
    ],
  ),

  // 25. Closing Time — dignified shutdown
  bizChain(
    "biz_closing_time",
    "Closing Time",
    (b) => b.tier === 1 && b.yearsActive >= 25 && b.reputation >= 65,
    520,
    [
      {
        id: "ct1",
        title: "{biz_name} ANNOUNCES CLOSURE",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "ct_civic_farewell", label: "ORGANIZE A CIVIC FAREWELL", effects: { credits: -4000, happiness: 5 }, nextStageId: null, bizAction: "mark_landmark" },
          { id: "ct_rescue_offer", label: "OFFER LIFETIME RENT-FREE LEASE", effects: { credits: -10000, happiness: 3 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "ct_quiet_close", label: "LET THE DOORS QUIETLY CLOSE", effects: { happiness: 1 }, nextStageId: null, bizAction: "close_business" },
        ],
      },
    ],
  ),

  // 26. Black-Market Surgery
  bizChain(
    "biz_black_clinic",
    "Black-Market Clinic",
    (b) => b.tier === 1 && inCategory(b, "grey_market"),
    280,
    [
      {
        id: "bk1",
        title: "UNLICENSED PROCEDURES",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "bk_shut", label: "RAID AND PROSECUTE", effects: { credits: -3000, "loyalty_helix-commune": 3 }, nextStageId: null, bizAction: "close_business" },
          { id: "bk_license", label: "ISSUE A REGULATED LICENSE", effects: { credits: 5000, "loyalty_helix-commune": -2, happiness: 2 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "bk_ignore", label: "LOOK AWAY", effects: { corruption: 3, "loyalty_helix-commune": -3 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 27. Beloved Owner Dies
  bizChain(
    "biz_owner_dies",
    "A Beloved Owner Passes",
    (b) => b.tier === 1 && b.yearsActive >= 22 && b.reputation >= 60,
    520,
    [
      {
        id: "od1",
        title: "{owner_name} HAS DIED",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "od_state_funeral", label: "ARRANGE A CIVIC FUNERAL", effects: { credits: -5000, happiness: 4 }, nextStageId: null, bizAction: "mark_landmark" },
          { id: "od_continuity_grant", label: "GRANT CONTINUITY FUNDING TO THE FAMILY", effects: { credits: -7000, happiness: 3 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "od_private", label: "RESPECT THE FAMILY'S PRIVACY", effects: { happiness: 1 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 28. Drug Front
  bizChain(
    "biz_drug_front",
    "A Drug Front",
    (b) => b.tier === 1 && b.reputation < 45 && (inCategory(b, "personal_services") || inCategory(b, "nightlife")),
    220,
    [
      {
        id: "df1",
        title: "STIM TRADE BEHIND THE COUNTER",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "df_raid", label: "RAID AND CHARGE", effects: { crime: -3, "loyalty_judges": 2 }, nextStageId: null, bizAction: "close_business" },
          { id: "df_flip", label: "TURN {owner_name} INTO AN ASSET", effects: { corruption: 2, crime: -1 }, nextStageId: null },
          { id: "df_extort", label: "DEMAND A 'COMPLIANCE FEE'", effects: { credits: 9000, corruption: 5, crime: 1 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 29. Mysterious Patron
  bizChain(
    "biz_mystery_patron",
    "The Mysterious Patron",
    (b) => b.tier === 1 && b.yearsActive >= 4 && b.yearsActive <= 10,
    280,
    [
      {
        id: "mp1",
        title: "AN ANONYMOUS BENEFACTOR",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "mp_accept", label: "LET THE GIFT STAND", effects: { happiness: 2 }, nextStageId: null, bizAction: "promote_to_t2" },
          { id: "mp_investigate", label: "INVESTIGATE THE SOURCE", effects: { credits: -3000, "loyalty_aureus-dominion": -2 }, nextStageId: null },
          { id: "mp_seize", label: "SEIZE AS UNKNOWN-ORIGIN FUNDS", effects: { credits: 50000, happiness: -3, corruption: 2 }, nextStageId: null, bizAction: "damage_reputation" },
        ],
      },
    ],
  ),

  // 30. The Festival Booth
  bizChain(
    "biz_festival_booth",
    "The Festival Booth",
    (b) => b.tier === 1 && b.yearsActive >= 6 && b.reputation >= 55,
    300,
    [
      {
        id: "fb1",
        title: "FESTIVAL HONORS REQUESTED",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "fb_sponsor", label: "WAIVE THE BOOTH FEE", effects: { credits: -1500, happiness: 3 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "fb_full_grant", label: "EXPAND TO A FLAGSHIP STAGE", effects: { credits: -6000, happiness: 5 }, nextStageId: null, bizAction: "promote_to_t2" },
          { id: "fb_decline", label: "FESTIVAL HANDLES ITS OWN BOOKING", effects: {}, nextStageId: null },
        ],
      },
    ],
  ),

  // ─── ANTI-MONOPOLY & HOSTILE TAKEOVER CHAINS ─────────────────────────

  // 31. Antitrust Investigation — fires when a non-independent chain crosses
  // (cap - 10) locations. Player breaks it up, grants a waiver, or refers to
  // the Judges. Cooldown is 5 in-game years so regulators can return.
  makeChain(
    "biz_antitrust_review",
    "Antitrust Investigation",
    (s) => pickAntitrustCandidate(s) !== null,
    (s) => pickAntitrustCandidate(s),
    TICKS_PER_YEAR * 5,
    [
      {
        id: "atr1",
        title: "ANTITRUST REVIEW OPENED",
        severity: "high",
        delayTicks: 0,
        responses: [
          {
            id: "atr_break_up",
            label: "ORDER A BREAK-UP",
            effects: { credits: -3000, happiness: 5, unrest: 3, "loyalty_independent": 4, "loyalty_corps": -6 },
            nextStageId: null,
            chainAction: "break_up_chain",
          },
          {
            id: "atr_waiver",
            label: "GRANT AN ANTITRUST WAIVER",
            effects: { credits: 8000, happiness: -4, unrest: 2, corruption: 2, "loyalty_corps": 5, "loyalty_judges": -3 },
            nextStageId: null,
          },
          {
            id: "atr_judges",
            label: "REFER TO THE JUDGES",
            effects: { credits: -1500, "loyalty_judges": 4 },
            nextStageId: null,
            chainAction: "shrink_to_minimum",
          },
        ],
      },
    ],
  ),

  // 32. Hostile Takeover Bid — fires when two same-category chains both exceed
  // 40 locations. Allow → smaller absorbed; Block → both continue; Facilitate
  // → kickback path. Cooldown 2 years; cap pair selection is largest-first.
  makeChain(
    "biz_hostile_takeover",
    "Hostile Takeover Bid",
    (s) => pickTakeoverPair(s) !== null,
    (s) => pickTakeoverPair(s),
    TICKS_PER_YEAR * 2,
    [
      {
        id: "hto1",
        title: "HOSTILE TAKEOVER BID FILED",
        severity: "high",
        delayTicks: 0,
        responses: [
          {
            id: "hto_allow",
            label: "ALLOW THE ACQUISITION",
            effects: { credits: 4000, happiness: -3, unrest: 2, "loyalty_corps": 3, "loyalty_independent": -3 },
            nextStageId: null,
            chainAction: "transfer_locations",
          },
          {
            id: "hto_block",
            label: "BLOCK VIA JUDGES",
            effects: { credits: -2500, happiness: 2, unrest: 1, "loyalty_judges": 3, "loyalty_corps": -2 },
            nextStageId: null,
          },
          {
            id: "hto_facilitate",
            label: "FACILITATE FOR A KICKBACK",
            effects: { credits: 38000, happiness: -5, corruption: 4, unrest: 3, "loyalty_corps": 5, "loyalty_judges": -4, "loyalty_independent": -5 },
            nextStageId: null,
            chainAction: "transfer_locations",
          },
        ],
      },
    ],
  ),

  // 33. Regulator Probe — light flavor event at moderate dominance (>= 30 loc)
  makeChain(
    "biz_regulator_probe",
    "Regulator Probe",
    (s) => pickFlavorChain(s, 30, 49) !== null,
    (s) => pickFlavorChain(s, 30, 49),
    TICKS_PER_YEAR,
    [
      {
        id: "rp1",
        title: "REGULATOR REQUESTS DOCUMENTS",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "rp_cooperate", label: "FULL COOPERATION", effects: { credits: -1500, happiness: 1, "loyalty_judges": 2 }, nextStageId: null },
          { id: "rp_stall", label: "BURY THEM IN PAPER", effects: { corruption: 1, "loyalty_corps": 2 }, nextStageId: null },
          { id: "rp_audit", label: "REQUEST A FULL AUDIT", effects: { credits: 4500, "loyalty_corps": -3, "loyalty_independent": 2 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 34. Public Boycott — citizen reaction at higher dominance (>= 35 loc)
  makeChain(
    "biz_public_boycott",
    "Public Boycott",
    (s) => pickFlavorChain(s, 35, 55) !== null,
    (s) => pickFlavorChain(s, 35, 55),
    TICKS_PER_YEAR,
    [
      {
        id: "pb1",
        title: "GRASSROOTS BOYCOTT BUILDS",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "pb_endorse", label: "ENDORSE THE MOVEMENT", effects: { happiness: 4, "loyalty_independent": 5, "loyalty_corps": -4 }, nextStageId: null },
          { id: "pb_disperse", label: "DISPERSE THE ORGANIZERS", effects: { unrest: 3, happiness: -2, corruption: 1, "loyalty_corps": 3 }, nextStageId: null },
          { id: "pb_observe", label: "MONITOR — DO NOT INTERVENE", effects: {}, nextStageId: null },
        ],
      },
    ],
  ),

  // 35. Whistleblower Leak — internal scandal at high dominance (>= 40 loc)
  makeChain(
    "biz_whistleblower_leak",
    "Whistleblower Leak",
    (s) => pickFlavorChain(s, 40, 70) !== null,
    (s) => pickFlavorChain(s, 40, 70),
    TICKS_PER_YEAR,
    [
      {
        id: "wl1",
        title: "INTERNAL DOCUMENTS LEAKED",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "wl_protect", label: "PROTECT THE WHISTLEBLOWER", effects: { credits: -3000, happiness: 5, "loyalty_judges": 4, "loyalty_corps": -5 }, nextStageId: null },
          { id: "wl_discredit", label: "DISCREDIT THE SOURCE", effects: { unrest: 2, happiness: -3, corruption: 3, "loyalty_corps": 4, "loyalty_independent": -3 }, nextStageId: null },
          { id: "wl_fine", label: "ISSUE A REGULATORY FINE", effects: { credits: 12000, happiness: 2, "loyalty_corps": -2 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 36. Lobbyist Visit — early-dominance flavor event (>= 25 loc)
  makeChain(
    "biz_lobbyist_visit",
    "Lobbyist Visit",
    (s) => pickFlavorChain(s, 25, 39) !== null,
    (s) => pickFlavorChain(s, 25, 39),
    TICKS_PER_YEAR,
    [
      {
        id: "lv1",
        title: "{chainName} LOBBYIST IN THE LOBBY",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "lv_meet", label: "TAKE THE MEETING", effects: { credits: 3500, corruption: 2, "loyalty_corps": 3, "loyalty_independent": -1 }, nextStageId: null },
          { id: "lv_decline", label: "DECLINE — REFER TO STAFF", effects: { happiness: 1, "loyalty_corps": -1 }, nextStageId: null },
          { id: "lv_publicize", label: "PUBLICIZE THE VISIT", effects: { happiness: 4, unrest: 1, "loyalty_corps": -4, "loyalty_independent": 3 }, nextStageId: null },
        ],
      },
    ],
  ),

  // ─── EXTENDED BUSINESS EVENT CHAINS ──────────────────────────────────

  // ===== HOSPITALITY & NIGHTLIFE PACK (8) =====

  // 37. Health Inspector Sweep
  bizChain(
    "biz_health_sweep",
    "Health Inspector Sweep",
    (b) => b.tier <= 2 && (inCategory(b, "food_drink") || inCategory(b, "nightlife")) && b.yearsActive >= 1,
    TICKS_PER_YEAR,
    [
      {
        id: "hs1",
        title: "SURPRISE INSPECTION AT {biz_name}",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "hs_pass", label: "ISSUE A PASS WITH WARNINGS", effects: { happiness: 1 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "hs_fine", label: "FINE AND POST PUBLIC NOTICE", effects: { credits: 2500, happiness: -1 }, nextStageId: null, bizAction: "damage_reputation" },
          { id: "hs_close", label: "REVOKE THE FOOD LICENSE", effects: { happiness: -2, unrest: 1 }, nextStageId: null, bizAction: "close_business" },
        ],
      },
    ],
  ),

  // 38. Celebrity Spotting
  bizChain(
    "biz_celebrity_spot",
    "Celebrity Spotting",
    (b) => b.tier === 1 && (inCategory(b, "food_drink") || inCategory(b, "nightlife")) && b.reputation >= 50,
    TICKS_PER_YEAR,
    [
      {
        id: "cs1",
        title: "MEDIA STAR SPOTTED AT {biz_name}",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "cs_amplify", label: "OFFICIAL CITY ENDORSEMENT", effects: { credits: 1500, happiness: 3, tradeIncome: 200 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "cs_tax", label: "VISITOR TAX SURCHARGE", effects: { credits: 5000, happiness: -1 }, nextStageId: null },
          { id: "cs_ignore", label: "LET THE MOMENT FADE", effects: { happiness: 1 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 39. Bar Brawl Incident
  bizChain(
    "biz_bar_brawl",
    "Bar Brawl Incident",
    (b) => inCategory(b, "nightlife") && b.yearsActive >= 1,
    TICKS_PER_YEAR,
    [
      {
        id: "bb1",
        title: "VIOLENT INCIDENT AT {biz_name}",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "bb_warn", label: "FORMAL WARNING ON FILE", effects: { crime: -1, happiness: 1 }, nextStageId: null },
          { id: "bb_suspend", label: "30-DAY LICENSE SUSPENSION", effects: { credits: -1500, crime: -3, happiness: -2, unrest: 1 }, nextStageId: null, bizAction: "damage_reputation" },
          { id: "bb_revoke", label: "REVOKE THE NIGHTLIFE LICENSE", effects: { crime: -4, happiness: -3, unrest: 2 }, nextStageId: null, bizAction: "close_business" },
        ],
      },
    ],
  ),

  // 40. Late-Night License Dispute
  bizChain(
    "biz_late_license",
    "Late-Night License Dispute",
    (b) => inCategory(b, "nightlife") && b.tier === 1 && b.yearsActive >= 2,
    TICKS_PER_YEAR,
    [
      {
        id: "ll1",
        title: "{biz_name} REQUESTS 4AM PERMIT",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "ll_grant", label: "GRANT THE EXTENSION", effects: { credits: 1200, happiness: -1, crime: 1, tradeIncome: 100 }, nextStageId: null, bizAction: "promote_to_t2" },
          { id: "ll_compromise", label: "GRANT 2AM ONLY", effects: { credits: 600, happiness: 1 }, nextStageId: null },
          { id: "ll_deny", label: "DENY THE APPLICATION", effects: { happiness: 1, "loyalty_independent": -1 }, nextStageId: null, bizAction: "damage_reputation" },
        ],
      },
    ],
  ),

  // 41. Underage Service Scandal
  bizChain(
    "biz_underage_scandal",
    "Underage Service Scandal",
    (b) => inCategory(b, "nightlife") && b.yearsActive >= 1,
    TICKS_PER_YEAR * 2,
    [
      {
        id: "us1",
        title: "UNDERAGE PATRONS SERVED AT {biz_name}",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "us_fine", label: "MAXIMUM FINE", effects: { credits: 8000, happiness: -1 }, nextStageId: null, bizAction: "damage_reputation" },
          { id: "us_close", label: "PERMANENT CLOSURE", effects: { happiness: 2, unrest: 1, crime: -1 }, nextStageId: null, bizAction: "close_business" },
          { id: "us_quiet", label: "SETTLE QUIETLY", effects: { credits: 6000, corruption: 3, happiness: -2 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 42. Surprise Anniversary Crowd
  bizChain(
    "biz_anniversary_crowd",
    "Anniversary Crowd",
    (b) => b.yearsActive >= 5 && (inCategory(b, "food_drink") || inCategory(b, "nightlife")),
    TICKS_PER_YEAR * 2,
    [
      {
        id: "ac1",
        title: "{biz_name} TURNS {years} — REGULARS PACK THE STREET",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "ac_close_street", label: "CLOSE THE STREET — MAKE IT A FESTIVAL", effects: { credits: -2000, happiness: 5 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "ac_overtime", label: "DEPLOY TRAFFIC OFFICERS", effects: { credits: -800, happiness: 2 }, nextStageId: null },
          { id: "ac_disperse", label: "ORDER THE CROWD DISPERSED", effects: { happiness: -3, unrest: 1, "loyalty_independent": -2 }, nextStageId: null, bizAction: "damage_reputation" },
        ],
      },
    ],
  ),

  // 43. Soup Kitchen Crisis
  bizChain(
    "biz_soup_kitchen",
    "Soup Kitchen Crisis",
    (b) => b.archetypeId === "private_soup_kitchen",
    TICKS_PER_YEAR,
    [
      {
        id: "sk1",
        title: "{biz_name} OUT OF FUNDING",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "sk_grant", label: "ANNUAL CITY GRANT", effects: { credits: -6000, happiness: 5, unrest: -3, "loyalty_independent": 4 }, nextStageId: null, bizAction: "mark_landmark" },
          { id: "sk_volunteer", label: "OFFICER VOLUNTEER PROGRAM", effects: { happiness: 3, unrest: -1, employment: 1 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "sk_close", label: "LET IT FAIL — NOT OUR ROLE", effects: { happiness: -5, unrest: 4, "loyalty_independent": -3 }, nextStageId: null, bizAction: "close_business" },
        ],
      },
    ],
  ),

  // 44. Insect-Protein Outrage
  bizChain(
    "biz_insect_protein",
    "Insect-Protein Outrage",
    (b) => b.archetypeId === "gourmet_vendor",
    TICKS_PER_YEAR * 2,
    [
      {
        id: "ip1",
        title: "VIRAL VIDEO TARGETS {biz_name}",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "ip_endorse", label: "MAYORAL ENDORSEMENT", effects: { credits: -1000, happiness: 2, "loyalty_independent": 2 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "ip_distance", label: "PUBLICLY STAY NEUTRAL", effects: {}, nextStageId: null },
          { id: "ip_ban", label: "BAN INSECT PROTEIN SALES", effects: { happiness: -2, unrest: 1, tradeIncome: -150 }, nextStageId: null, bizAction: "close_business" },
        ],
      },
    ],
  ),

  // ===== TRADE & CRAFT PACK (7) =====

  // 45. Apprentice Scandal
  bizChain(
    "biz_apprentice_scandal",
    "Apprentice Scandal",
    (b) => inCategory(b, "education_craft") && b.yearsActive >= 5,
    TICKS_PER_YEAR,
    [
      {
        id: "as1",
        title: "APPRENTICE EXPLOITATION ALLEGED",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "as_audit", label: "FORENSIC PAYROLL AUDIT", effects: { credits: 4500, happiness: 2, "loyalty_judges": 2 }, nextStageId: null, bizAction: "damage_reputation" },
          { id: "as_mediate", label: "ORDER PRIVATE MEDIATION", effects: { credits: -1500, happiness: 1 }, nextStageId: null },
          { id: "as_dismiss", label: "DISMISS THE COMPLAINTS", effects: { happiness: -2, unrest: 2, corruption: 2, "loyalty_corps": 2 }, nextStageId: null, bizAction: "boost_reputation" },
        ],
      },
    ],
  ),

  // 46. Supply Chain Breakdown
  bizChain(
    "biz_supply_chain",
    "Supply Chain Breakdown",
    (b) => inCategory(b, "retail") && b.yearsActive >= 2 && b.status !== "closing",
    TICKS_PER_YEAR,
    [
      {
        id: "sb1",
        title: "{biz_name} SHELVES EMPTYING",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "sb_bridge", label: "BRIDGE THE SHORTFALL", effects: { credits: -3500, happiness: 2 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "sb_subsidize", label: "FAST-TRACK ALTERNATE SUPPLIER", effects: { credits: -800, happiness: 1, tradeIncome: 100 }, nextStageId: null },
          { id: "sb_market", label: "LET THE MARKET CORRECT", effects: { happiness: -2, "loyalty_independent": -2 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 47. Master Craft Award
  bizChain(
    "biz_master_craft",
    "Master Craft Award",
    (b) => inCategory(b, "education_craft") && b.yearsActive >= 15 && b.reputation >= 70,
    TICKS_PER_YEAR * 5,
    [
      {
        id: "mc1",
        title: "{owner_name} NOMINATED FOR MASTER STATUS",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "mc_full", label: "FULL CITY SPONSORSHIP", effects: { credits: -5000, happiness: 6, "loyalty_independent": 4 }, nextStageId: null, bizAction: "mark_landmark" },
          { id: "mc_simple", label: "SIMPLE CIVIC CEREMONY", effects: { credits: -1500, happiness: 3 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "mc_decline", label: "DECLINE TO PARTICIPATE", effects: { happiness: -1, "loyalty_independent": -2 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 48. Construction Union Standoff
  bizChain(
    "biz_construction_standoff",
    "Construction Union Standoff",
    (b) => inCategory(b, "construction") && b.employees >= 4,
    TICKS_PER_YEAR,
    [
      {
        id: "cs_st1",
        title: "{biz_name} CREW WALKS OFF",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "cs_arbitrate", label: "BINDING CITY ARBITRATION", effects: { credits: -2500, happiness: 3, employment: 1, "loyalty_independent": 2 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "cs_replace", label: "AUTHORIZE NON-UNION HIRES", effects: { credits: 1500, happiness: -3, unrest: 4, employment: -1, "loyalty_corps": 2 }, nextStageId: null, bizAction: "damage_reputation" },
          { id: "cs_strikebreak", label: "DISPATCH ENFORCEMENT", effects: { unrest: 6, happiness: -5, crime: 1, "loyalty_judges": -3, "loyalty_independent": -4 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 49. Repair Shop Fraud Ring
  bizChain(
    "biz_repair_fraud",
    "Repair Shop Fraud Ring",
    (b) => inCategory(b, "repair_utility") && b.yearsActive >= 2 && b.reputation < 50,
    TICKS_PER_YEAR,
    [
      {
        id: "rf1",
        title: "{biz_name} ACCUSED OF PHANTOM REPAIRS",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "rf_audit", label: "FORENSIC PARTS AUDIT", effects: { credits: 3000, happiness: 1 }, nextStageId: null, bizAction: "damage_reputation" },
          { id: "rf_warn", label: "FORMAL WARNING", effects: { happiness: 1 }, nextStageId: null },
          { id: "rf_revoke", label: "REVOKE OPERATING PERMIT", effects: { happiness: 2, crime: -1 }, nextStageId: null, bizAction: "close_business" },
        ],
      },
    ],
  ),

  // 50. Heritage Workshop Listing
  bizChain(
    "biz_heritage_workshop",
    "Heritage Workshop Listing",
    (b) => inCategory(b, "education_craft") && b.yearsActive >= 25,
    TICKS_PER_YEAR * 8,
    [
      {
        id: "hw1",
        title: "{biz_name} ELIGIBLE FOR HERITAGE LISTING",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "hw_list", label: "GRANT FULL HERITAGE STATUS", effects: { credits: -3000, happiness: 4 }, nextStageId: null, bizAction: "mark_landmark" },
          { id: "hw_partial", label: "PARTIAL LISTING ONLY", effects: { credits: -500, happiness: 2 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "hw_deny", label: "DENY THE APPLICATION", effects: { happiness: -2, "loyalty_independent": -3 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 51. Tool Theft Wave
  bizChain(
    "biz_tool_theft",
    "Tool Theft Wave",
    (b) => (inCategory(b, "construction") || inCategory(b, "repair_utility")) && b.yearsActive >= 1,
    TICKS_PER_YEAR,
    [
      {
        id: "tt1",
        title: "{biz_name} REPORTS THIRD BREAK-IN",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "tt_patrol", label: "INCREASE PATROLS IN {district}", effects: { credits: -2000, crime: -3, happiness: 2 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "tt_grant", label: "SECURITY UPGRADE GRANT", effects: { credits: -3500, crime: -1, happiness: 3 }, nextStageId: null },
          { id: "tt_blame", label: "TELL THEM TO HIRE PRIVATE", effects: { crime: 1, happiness: -2, "loyalty_independent": -2 }, nextStageId: null },
        ],
      },
    ],
  ),

  // ===== SERVICES & CULTURE PACK (8) =====

  // 52. Faith Healer Investigation
  bizChain(
    "biz_faith_healer",
    "Faith Healer Investigation",
    (b) => inCategory(b, "cultural_faith") && b.reputation >= 40,
    TICKS_PER_YEAR,
    [
      {
        id: "fh1",
        title: "{biz_name} CLAIMS HEALING POWERS",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "fh_license", label: "REQUIRE A MEDICAL DISCLAIMER", effects: { happiness: 1, "loyalty_judges": 1 }, nextStageId: null },
          { id: "fh_tax", label: "RECLASSIFY AS UNREGULATED MEDICINE", effects: { credits: 4500, happiness: -2, unrest: 2, "loyalty_independent": -2 }, nextStageId: null, bizAction: "damage_reputation" },
          { id: "fh_protect", label: "PROTECT AS RELIGIOUS PRACTICE", effects: { happiness: 3, "loyalty_judges": -2 }, nextStageId: null, bizAction: "boost_reputation" },
        ],
      },
    ],
  ),

  // 53. Cult Recruitment in Studio
  bizChain(
    "biz_cult_recruit_studio",
    "Cult Recruitment Pipeline",
    (b) => (inCategory(b, "fitness_wellness") || inCategory(b, "cultural_faith")) && b.yearsActive >= 3,
    TICKS_PER_YEAR * 2,
    [
      {
        id: "cr1",
        title: "{biz_name} LINKED TO RECRUITMENT NETWORK",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "cr_observe", label: "DEEP SURVEILLANCE", effects: { credits: -3000, "loyalty_judges": 2, corruption: 1 }, nextStageId: null },
          { id: "cr_disrupt", label: "DISRUPT THE OPERATION", effects: { unrest: 3, crime: -2, happiness: 1 }, nextStageId: null, bizAction: "close_business" },
          { id: "cr_infiltrate", label: "INFILTRATE QUIETLY", effects: { credits: -1500, "loyalty_judges": 4 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 54. Unlicensed School
  bizChain(
    "biz_unlicensed_school",
    "Unlicensed School",
    (b) => inCategory(b, "education_craft") && b.yearsActive >= 2,
    TICKS_PER_YEAR,
    [
      {
        id: "ul1",
        title: "{biz_name} OPERATING WITHOUT EDUCATION LICENSE",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "ul_license", label: "FAST-TRACK ACCREDITATION", effects: { credits: -1500, happiness: 4, "loyalty_independent": 3 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "ul_fine", label: "FINE AND COMPLY", effects: { credits: 2000, happiness: -1 }, nextStageId: null },
          { id: "ul_close", label: "SHUT IT DOWN", effects: { happiness: -3, unrest: 2, "loyalty_independent": -3 }, nextStageId: null, bizAction: "close_business" },
        ],
      },
    ],
  ),

  // 55. Wellness Studio Doctrine Clash
  bizChain(
    "biz_wellness_doctrine",
    "Wellness Studio Doctrine Clash",
    (b) => inCategory(b, "fitness_wellness") && b.yearsActive >= 2,
    TICKS_PER_YEAR,
    [
      {
        id: "wd1",
        title: "{biz_name} TEACHING BANNED PRACTICE",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "wd_secular", label: "DECLARE WELLNESS NON-RELIGIOUS", effects: { happiness: 2, "loyalty_helix-commune": -1 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "wd_curriculum", label: "ORDER CURRICULUM REVIEW", effects: { credits: -800, happiness: 1, "loyalty_judges": 1 }, nextStageId: null },
          { id: "wd_ban", label: "BAN THE DISPUTED TECHNIQUES", effects: { happiness: -2, unrest: 1 }, nextStageId: null, bizAction: "damage_reputation" },
        ],
      },
    ],
  ),

  // 56. Personal Service Scandal
  bizChain(
    "biz_personal_scandal",
    "Personal Service Scandal",
    (b) => inCategory(b, "personal_services") && b.yearsActive >= 2,
    TICKS_PER_YEAR,
    [
      {
        id: "ps1",
        title: "{biz_name} HIDDEN-CAMERA SCANDAL",
        severity: "critical",
        delayTicks: 0,
        responses: [
          { id: "ps_close", label: "IMMEDIATE PERMANENT CLOSURE", effects: { happiness: 3, crime: -1, "loyalty_judges": 3 }, nextStageId: null, bizAction: "close_business" },
          { id: "ps_investigate", label: "FULL CRIMINAL INVESTIGATION", effects: { credits: -3000, happiness: 1, crime: -2 }, nextStageId: null, bizAction: "damage_reputation" },
          { id: "ps_quiet", label: "SETTLE WITH VICTIMS QUIETLY", effects: { credits: -8000, happiness: -2, corruption: 4 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 57. Streamer Studio Boom
  bizChain(
    "biz_streamer_boom",
    "Streamer Studio Boom",
    (b) => inCategory(b, "media_tech") && b.tier === 1 && b.yearsActive >= 1,
    TICKS_PER_YEAR,
    [
      {
        id: "sb_st1",
        title: "{biz_name} HAS LANDED A MAJOR CREATOR",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "sb_zone", label: "REZONE FOR EXPANSION", effects: { credits: -800, happiness: 2, employment: 1 }, nextStageId: null, bizAction: "promote_to_t2" },
          { id: "sb_tax", label: "MEDIA SUCCESS TAX", effects: { credits: 5500, happiness: -1 }, nextStageId: null },
          { id: "sb_observe", label: "MONITOR — NO ACTION", effects: {}, nextStageId: null },
        ],
      },
    ],
  ),

  // 58. Heritage Faith Site Restoration
  bizChain(
    "biz_faith_restoration",
    "Heritage Faith Site Restoration",
    (b) => inCategory(b, "cultural_faith") && b.yearsActive >= 30,
    TICKS_PER_YEAR * 8,
    [
      {
        id: "fr1",
        title: "{biz_name} STRUCTURE FAILING",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "fr_full", label: "FULL HERITAGE RESTORATION", effects: { credits: -25000, happiness: 6, "loyalty_helix-commune": 3 }, nextStageId: null, bizAction: "mark_landmark" },
          { id: "fr_patch", label: "EMERGENCY PATCH-UP ONLY", effects: { credits: -6000, happiness: 2 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "fr_demolish", label: "ORDER DEMOLITION", effects: { credits: -2500, happiness: -6, unrest: 3, "loyalty_helix-commune": -5 }, nextStageId: null, bizAction: "close_business" },
        ],
      },
    ],
  ),

  // 59. Personal Trainer Scandal
  bizChain(
    "biz_trainer_doping",
    "Trainer Doping Scandal",
    (b) => inCategory(b, "fitness_wellness") && b.yearsActive >= 2,
    TICKS_PER_YEAR,
    [
      {
        id: "td1",
        title: "{biz_name} TRAINERS DISTRIBUTING ENHANCERS",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "td_prosecute", label: "FULL PROSECUTION", effects: { credits: 3500, crime: -2, "loyalty_judges": 3 }, nextStageId: null, bizAction: "damage_reputation" },
          { id: "td_warn", label: "FORMAL WARNING + INSPECTION", effects: { happiness: 1 }, nextStageId: null },
          { id: "td_close", label: "REVOKE FACILITY LICENSE", effects: { happiness: 1, crime: -1, "loyalty_independent": -1 }, nextStageId: null, bizAction: "close_business" },
        ],
      },
    ],
  ),

  // ===== GREY & PROFESSIONAL PACK (7) =====

  // 60. Smuggling Ring Bust
  bizChain(
    "biz_smuggling_ring",
    "Smuggling Ring Bust",
    (b) => inCategory(b, "grey_market") && b.yearsActive >= 1,
    TICKS_PER_YEAR,
    [
      {
        id: "sr1",
        title: "{biz_name} TIED TO SMUGGLING NETWORK",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "sr_raid", label: "JOINT RAID WITH JUDGES", effects: { credits: 12000, crime: -3, unrest: 2, "loyalty_judges": 4, "loyalty_gangs": -3 }, nextStageId: null, bizAction: "close_business" },
          { id: "sr_flip", label: "TURN THEM AS INFORMANT", effects: { credits: -2000, crime: -2, corruption: 2, "loyalty_judges": 2 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "sr_ignore", label: "INSUFFICIENT EVIDENCE", effects: { crime: 1, corruption: 3, "loyalty_gangs": 2 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 61. Professional Malpractice Suit
  bizChain(
    "biz_malpractice",
    "Professional Malpractice Suit",
    (b) => inCategory(b, "professional") && b.yearsActive >= 3 && b.reputation >= 40,
    TICKS_PER_YEAR,
    [
      {
        id: "mp_st1",
        title: "{biz_name} NAMED IN MALPRACTICE FILING",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "mp_legal", label: "CITY LEGAL ASSISTANCE", effects: { credits: -4500, happiness: 1, "loyalty_independent": 3 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "mp_neutral", label: "LET THE COURTS DECIDE", effects: { "loyalty_judges": 2 }, nextStageId: null },
          { id: "mp_pressure", label: "PRESSURE FOR SETTLEMENT", effects: { credits: -2000, happiness: -1, corruption: 2 }, nextStageId: null, bizAction: "damage_reputation" },
        ],
      },
    ],
  ),

  // 62. Taxi Strike
  bizChain(
    "biz_taxi_strike",
    "Taxi Operator Strike",
    (b) => inCategory(b, "transport") && b.yearsActive >= 2 && b.employees >= 3,
    TICKS_PER_YEAR,
    [
      {
        id: "ts1",
        title: "{biz_name} JOINS CITYWIDE TAXI STRIKE",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "ts_repeal", label: "REPEAL THE REGULATIONS", effects: { credits: -3500, happiness: 4, unrest: -3, "loyalty_independent": 4, tradeIncome: 100 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "ts_break", label: "BREAK THE STRIKE", effects: { credits: 2000, happiness: -4, unrest: 5, "loyalty_independent": -5, "loyalty_corps": 2 }, nextStageId: null, bizAction: "damage_reputation" },
          { id: "ts_mediate", label: "MEDIATE A COMPROMISE", effects: { credits: -1500, happiness: 1, unrest: -1 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 63. Drone Delivery Crash
  bizChain(
    "biz_drone_crash",
    "Drone Delivery Crash",
    (b) => inCategory(b, "transport") && b.tier === 1 && b.yearsActive >= 1,
    TICKS_PER_YEAR,
    [
      {
        id: "dc1",
        title: "{biz_name} DELIVERY DRONE FATALITY",
        severity: "critical",
        delayTicks: 0,
        responses: [
          { id: "dc_ground", label: "GROUND THE FLEET CITYWIDE", effects: { credits: -5000, happiness: 2, tradeIncome: -300, "loyalty_corps": -3 }, nextStageId: null, bizAction: "damage_reputation" },
          { id: "dc_specific", label: "GROUND {biz_name} ONLY", effects: { credits: -1500, happiness: 1 }, nextStageId: null, bizAction: "damage_reputation" },
          { id: "dc_investigate", label: "INVESTIGATE WITHOUT GROUNDING", effects: { credits: -8000, happiness: -3, unrest: 2, corruption: 1 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 64. Black-Market Pharmacy
  bizChain(
    "biz_blackmarket_pharma",
    "Black-Market Pharmacy",
    (b) => inCategory(b, "grey_market") && b.yearsActive >= 1 && b.reputation >= 30,
    TICKS_PER_YEAR,
    [
      {
        id: "bp1",
        title: "{biz_name} SELLING UNAPPROVED DRUGS",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "bp_license", label: "FAST-TRACK GREY-MARKET LICENSE", effects: { credits: 4500, happiness: 4, corruption: 1, "loyalty_independent": 3, "loyalty_corps": -3 }, nextStageId: null, bizAction: "promote_to_t2" },
          { id: "bp_warn", label: "FORMAL CEASE-AND-DESIST", effects: { happiness: -1, "loyalty_judges": 1 }, nextStageId: null, bizAction: "damage_reputation" },
          { id: "bp_raid", label: "ARMED PHARMACEUTICAL RAID", effects: { credits: 8000, happiness: -3, unrest: 3, crime: -2, "loyalty_corps": 2 }, nextStageId: null, bizAction: "close_business" },
        ],
      },
    ],
  ),

  // 65. Forensic Accountant Hire
  bizChain(
    "biz_forensic_hire",
    "Forensic Accountant Hire",
    (b) => inCategory(b, "professional") && b.yearsActive >= 5 && b.reputation >= 60,
    TICKS_PER_YEAR * 2,
    [
      {
        id: "fa1",
        title: "{biz_name} OFFERS TO AUDIT THE CITY",
        severity: "low",
        delayTicks: 0,
        responses: [
          { id: "fa_hire", label: "RETAIN THEM", effects: { credits: -6000, happiness: 5, corruption: -5, "loyalty_judges": 4 }, nextStageId: null, bizAction: "mark_landmark" },
          { id: "fa_limited", label: "LIMITED-SCOPE ENGAGEMENT", effects: { credits: -2000, happiness: 2, corruption: -2 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "fa_decline", label: "DECLINE THE OFFER", effects: { corruption: 1, happiness: -1 }, nextStageId: null },
        ],
      },
    ],
  ),

  // 66. Long-Haul Convoy Heist
  bizChain(
    "biz_convoy_heist",
    "Long-Haul Convoy Heist",
    (b) => inCategory(b, "transport") && b.tier >= 2,
    TICKS_PER_YEAR,
    [
      {
        id: "ch1",
        title: "{biz_name} CONVOY HIJACKED",
        severity: "high",
        delayTicks: 0,
        responses: [
          { id: "ch_escort", label: "PROVIDE OFFICER ESCORTS", effects: { credits: -4000, crime: -3, happiness: 1, tradeIncome: 200 }, nextStageId: null, bizAction: "boost_reputation" },
          { id: "ch_bounty", label: "ISSUE A BOUNTY ON THE GANG", effects: { credits: -6000, crime: -4, unrest: 1, "loyalty_judges": -2 }, nextStageId: null },
          { id: "ch_decline", label: "PRIVATE SECURITY IS YOUR JOB", effects: { crime: 1, "loyalty_independent": -2 }, nextStageId: null, bizAction: "damage_reputation" },
        ],
      },
    ],
  ),
];

// ─── Helper functions for chain-based events ──────────────────────────

// Pick the largest non-independent chain that has crossed (cap - 10) but not
// yet reached cap. Returns context for the antitrust event.
function pickAntitrustCandidate(s: GameState): Record<string, string> | null {
  const chains = s.localEconomy?.corporateChains ?? [];
  const cap = getEffectiveAntiMonopolyCap(s);
  let best: ActiveChain | null = null;
  let bestDef: ReturnType<typeof getChainById> = undefined;
  for (const c of chains) {
    if (c.locationCount < cap - 10) continue;
    const def = getChainById(c.chainId);
    if (!def || def.faction === "independent") continue;
    if (!best || c.locationCount > best.locationCount) {
      best = c;
      bestDef = def;
    }
  }
  if (!best || !bestDef) return null;
  return {
    chainId: best.chainId,
    chainName: bestDef.name,
    locations: String(best.locationCount),
    cap: String(cap),
  };
}

// Pick the largest pair of same-category, non-independent chains both above
// 40 locations. Returns context with the larger as chainId2 (acquirer) and
// smaller as chainId (target).
function pickTakeoverPair(s: GameState): Record<string, string> | null {
  const chains = s.localEconomy?.corporateChains ?? [];
  const eligible: { chain: ActiveChain; def: NonNullable<ReturnType<typeof getChainById>> }[] = [];
  for (const c of chains) {
    if (c.locationCount < 40) continue;
    const def = getChainById(c.chainId);
    if (!def || def.faction === "independent") continue;
    eligible.push({ chain: c, def });
  }
  // Group by category
  const byCat = new Map<BusinessCategory, typeof eligible>();
  for (const e of eligible) {
    const list = byCat.get(e.def.category) ?? [];
    list.push(e);
    byCat.set(e.def.category, list);
  }
  let best: { acquirer: typeof eligible[number]; target: typeof eligible[number]; total: number } | null = null;
  for (const list of byCat.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => b.chain.locationCount - a.chain.locationCount);
    const acquirer = sorted[0];
    const target = sorted[1];
    const total = acquirer.chain.locationCount + target.chain.locationCount;
    if (!best || total > best.total) {
      best = { acquirer, target, total };
    }
  }
  if (!best) return null;
  return {
    chainId: best.target.chain.chainId,
    chainId2: best.acquirer.chain.chainId,
    chainName: best.target.def.name,
    chainName2: best.acquirer.def.name,
    locations: String(best.target.chain.locationCount),
    locations2: String(best.acquirer.chain.locationCount),
    category: best.acquirer.def.category.replace(/_/g, " "),
  };
}

// Pick a non-independent chain whose locationCount is in [minLoc, maxLoc].
// Used for flavor mini-events at moderate dominance levels.
function pickFlavorChain(s: GameState, minLoc: number, maxLoc: number): Record<string, string> | null {
  const chains = s.localEconomy?.corporateChains ?? [];
  const eligible: { chain: ActiveChain; def: NonNullable<ReturnType<typeof getChainById>> }[] = [];
  for (const c of chains) {
    if (c.locationCount < minLoc || c.locationCount > maxLoc) continue;
    const def = getChainById(c.chainId);
    if (!def || def.faction === "independent") continue;
    eligible.push({ chain: c, def });
  }
  if (eligible.length === 0) return null;
  const r = rng((s.totalTicks ?? 0) * 13 + minLoc);
  const pick = eligible[Math.floor(r() * eligible.length)];
  return {
    chainId: pick.chain.chainId,
    chainName: pick.def.name,
    locations: String(pick.chain.locationCount),
  };
}
