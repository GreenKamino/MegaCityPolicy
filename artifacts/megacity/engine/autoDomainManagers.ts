import type { GameState, GameMessage, Resources, TickEntry } from "@/engine/types";
import {
  DOMAIN_LABELS,
  DOMAIN_ROLES,
  enqueueProposal,
  getEffectiveMode,
  type AutoManagerDomain,
  type AutoManagerProposal,
  type AutoManagerProposalKind,
} from "@/engine/autoManagers";
import { TECHNOLOGIES, canResearch } from "@/engine/technologies";
import { RESEARCH_COST_MULTIPLIER } from "@/engine/researchConstants";
import { generateRequestedIntel, generateCounterIntel, appendIntel } from "@/engine/intelEngine";
import { EDICTS, getEdictById } from "@/engine/edicts";
import { getMaxActiveEdicts } from "@/engine/faiths";
import { applyResourceDelta, getResourceStorageCapacity } from "@/engine/resourceStorage";

/**
 * Per-domain auto-managers (Task #131). Task #123 added auto-hire for the
 * Enforcer / Recruit domain only (engine/autoRecruit.ts). This module
 * extends the exact same pattern — gated by the domain's Inner Circle
 * role, honoring SUGGEST/ACT via getEffectiveMode, throttled by a
 * per-domain interval — to every remaining Advisor Briefings domain:
 *
 *   research    → Science Advisor   (research-pick)
 *   intel       → Spymaster         (intel-op)
 *   espionage   → Spymaster         (counter-op)
 *   agriculture → Agriculture Min.  (farm-contract)
 *   trade       → Diplomat          (trade-accept)
 *   military    → War Marshal       (military-topup)
 *   edicts      → Chancellor        (edict-tune)
 *
 * Each domain owns an AutoDomainConfig (budget / target / priority)
 * persisted on GameState.autoDomains alongside autoRecruit. ACT-mode
 * actions are intentionally simple, self-contained resource/state
 * transitions so a delegated officer never reaches deep into a
 * subsystem in a way the player can't audit from the inbox.
 */

export type AutoDomainConfig = {
  /** Credit cap the manager may spend per cycle. */
  budgetPerTick: number;
  /**
   * Domain-specific target. Interpreted per domain:
   *  - intel: minimum number of live intel items to maintain
   *  - agriculture: food stockpile floor
   *  - trade: surplus threshold above which a commodity is sold
   *  - military: per-resource top-up ceiling
   *  - edicts: desired number of simultaneously-active edicts
   *  - research / espionage: unused (kept for a uniform config shape)
   */
  target: number;
  /**
   * Ordered preference list. Interpreted per domain:
   *  - research: tech categories, highest-priority first
   *  - trade: resource keys to sell surplus of
   *  - military: resource keys to top up
   *  - edicts: edict ids to enact, highest-priority first
   *  - intel / espionage / agriculture: unused
   */
  priority: string[];
  /** Tick of the last emitted proposal / executed action (interval gate). */
  lastTick: number;
};

/** Every Advisor Briefings domain except recruit (owned by autoRecruit). */
export type AutoDomain = Exclude<AutoManagerDomain, "recruit">;

export const AUTO_DOMAINS: AutoDomain[] = [
  "research",
  "intel",
  "espionage",
  "agriculture",
  "trade",
  "military",
  "edicts",
];

const DEFAULT_CONFIGS: Record<AutoDomain, Omit<AutoDomainConfig, "lastTick">> = {
  research: {
    budgetPerTick: 0,
    target: 0,
    priority: ["energy", "industry", "military", "agriculture", "health", "research", "infrastructure"],
  },
  intel: { budgetPerTick: 5000, target: 3, priority: [] },
  espionage: { budgetPerTick: 6000, target: 0, priority: [] },
  agriculture: { budgetPerTick: 25000, target: 6000, priority: [] },
  trade: { budgetPerTick: 0, target: 4000, priority: ["goods", "steel"] },
  military: { budgetPerTick: 40000, target: 3000, priority: ["fuel", "ammo", "medSupplies"] },
  edicts: {
    budgetPerTick: 150000,
    target: 2,
    priority: [
      "stimulus_package",
      "infrastructure_blitz",
      "emergency_rations",
      "anti_corruption_purge",
      "emergency_lockdown",
    ],
  },
};

const INTERVALS: Record<AutoDomain, number> = {
  research: 4,
  intel: 12,
  espionage: 12,
  agriculture: 6,
  trade: 8,
  military: 6,
  edicts: 16,
};

// Credit price per unit when the manager buys a resource on the player's
// behalf (agriculture / military procurement). Kept deliberately above
// passive production value so delegation is a convenience, not a free
// money pump.
const PROCURE_PRICE: Record<string, number> = {
  food: 8,
  fuel: 18,
  ammo: 22,
  medSupplies: 14,
  water: 6,
  goods: 12,
  steel: 15,
};

// Credit value per unit when the manager sells surplus (trade).
const SELL_PRICE: Record<string, number> = {
  goods: 9,
  steel: 11,
  food: 6,
  fuel: 12,
  ammo: 15,
  medSupplies: 10,
};

export function createDefaultAutoDomainConfigs(): Partial<Record<AutoDomain, AutoDomainConfig>> {
  const out: Partial<Record<AutoDomain, AutoDomainConfig>> = {};
  for (const d of AUTO_DOMAINS) {
    out[d] = { ...DEFAULT_CONFIGS[d], priority: [...DEFAULT_CONFIGS[d].priority], lastTick: 0 };
  }
  return out;
}

function getDomainConfig(s: GameState, domain: AutoDomain): AutoDomainConfig {
  const existing = s.autoDomains?.[domain];
  if (existing) return existing;
  return { ...DEFAULT_CONFIGS[domain], priority: [...DEFAULT_CONFIGS[domain].priority], lastTick: 0 };
}

function setDomainLastTick(s: GameState, domain: AutoDomain, config: AutoDomainConfig): void {
  s.autoDomains = { ...(s.autoDomains ?? {}), [domain]: { ...config, lastTick: s.totalTicks } };
}

function hasDomainRole(s: GameState, domain: AutoDomain): boolean {
  const role = DOMAIN_ROLES[domain];
  return (s.innerCircle?.members ?? []).some((m) => m.role === role);
}

function getRoleOfficerId(s: GameState, domain: AutoDomain): string | undefined {
  const role = DOMAIN_ROLES[domain];
  return (s.innerCircle?.members ?? []).find((m) => m.role === role)?.officerId;
}

type Threatish = { id: string; threat: number; isActive?: boolean; status?: string; controlStatus?: string };

function collectActivePartners(s: GameState): Threatish[] {
  const out: Threatish[] = [];
  for (const f of s.factions ?? []) if (f.isActive) out.push({ id: f.id, threat: f.threat });
  for (const m of s.externalMegacities ?? []) if (m.isActive) out.push({ id: m.id, threat: m.threat, controlStatus: m.controlStatus });
  for (const t of s.townships ?? []) if (t.status !== "undiscovered") out.push({ id: t.id, threat: t.threat, controlStatus: t.controlStatus });
  return out;
}

function hasIntelTargets(s: GameState): boolean {
  return collectActivePartners(s).length > 0;
}

function hasHostilePartners(s: GameState): boolean {
  const ledgers = s.partnerLedgers ?? {};
  // Annexed/occupied partners are under player control — they never count
  // as hostile for espionage sweeps regardless of threat/grudge numbers.
  return collectActivePartners(s).some(
    (p) => p.controlStatus !== "annexed" && p.controlStatus !== "occupied"
      && (p.threat > 50 || (ledgers[p.id]?.grudges ?? 0) > 25),
  );
}

function activeIntelCount(s: GameState): number {
  const tick = s.totalTicks;
  return (s.intelItems ?? []).filter((i) => i.kind === "intel" && i.expiresTick > tick).length;
}

// ── Plan + spec contracts ─────────────────────────────────────────────
// A plan carries its own pure executor so ACT mode and the accept handler
// share one code path. assess() always recomputes against current state,
// so an accepted (possibly stale) proposal can never apply an outdated or
// now-unaffordable action — the worst case is a no-op.

type DomainPlan = {
  title: string;
  summary: string;
  rationale: string;
  costPreview?: string;
  exec: (s: GameState) => GameState;
  entry: { delta: number; unit: string; reason: string };
  message: { title: string; body: string };
};

type DomainSpec = {
  domain: AutoDomain;
  kind: AutoManagerProposalKind;
  interval: number;
  plan: (s: GameState, config: AutoDomainConfig) => DomainPlan | null;
};

function withCredits(s: GameState, delta: number): Resources {
  return { ...s.resources, credits: Math.max(0, s.resources.credits + delta) };
}

function planResearch(s: GameState, config: AutoDomainConfig): DomainPlan | null {
  if (s.activeResearch) return null;
  const unlocked = s.unlockedTechnologies ?? [];
  const candidates = TECHNOLOGIES.filter((t) => canResearch(t.id, unlocked).available);
  if (candidates.length === 0) return null;
  const rank = (cat: string) => {
    const idx = config.priority.indexOf(cat);
    return idx === -1 ? config.priority.length : idx;
  };
  candidates.sort((a, b) => {
    const r = rank(a.category) - rank(b.category);
    if (r !== 0) return r;
    if (a.researchCost !== b.researchCost) return a.researchCost - b.researchCost;
    return a.id.localeCompare(b.id);
  });
  const tech = candidates[0];
  const cost = tech.researchCost * RESEARCH_COST_MULTIPLIER;
  return {
    title: `Begin research: ${tech.name}`,
    summary: `Start researching ${tech.name} (${tech.category}).`,
    rationale: `No project active. ${tech.name} is the highest-priority prereq-met option.`,
    costPreview: `${cost.toLocaleString()} research`,
    exec: (st) =>
      st.activeResearch ? st : { ...st, activeResearch: { techId: tech.id, progress: 0, cost } },
    entry: { delta: 0, unit: "research", reason: `Auto-research: ${tech.name}` },
    message: {
      title: "AUTO-RESEARCH: PROJECT STARTED",
      body: `Your Science Advisor began researching ${tech.name}.`,
    },
  };
}

function planIntel(s: GameState, config: AutoDomainConfig): DomainPlan | null {
  if (activeIntelCount(s) >= config.target) return null;
  if (!hasIntelTargets(s)) return null;
  const cost = Math.max(0, Math.floor(config.budgetPerTick));
  if (s.resources.credits < cost) return null;
  return {
    title: "Run intelligence operation",
    summary: "Task the Spymaster with a fresh intel sweep on a watch-list partner.",
    rationale: `Live intel below target (${activeIntelCount(s)}/${config.target}).`,
    costPreview: cost > 0 ? `${cost.toLocaleString()} credits` : undefined,
    exec: (st) => {
      const items = generateRequestedIntel(st, "spymaster-ops", "Spymaster");
      if (items.length === 0) return st;
      return appendIntel({ ...st, resources: withCredits(st, -cost) }, items);
    },
    entry: { delta: -cost, unit: "credits", reason: "Auto-intel: intelligence sweep" },
    message: {
      title: "AUTO-INTEL: OPERATION COMPLETE",
      body: "Your Spymaster ran an intelligence sweep. New intel filed.",
    },
  };
}

function planEspionage(s: GameState, config: AutoDomainConfig): DomainPlan | null {
  if (!hasHostilePartners(s)) return null;
  const cost = Math.max(0, Math.floor(config.budgetPerTick));
  if (s.resources.credits < cost) return null;
  return {
    title: "Run counter-intelligence sweep",
    summary: "Disrupt hostile operations and surface incoming espionage.",
    rationale: "Hostile partners detected (threat / grudge above threshold).",
    costPreview: cost > 0 ? `${cost.toLocaleString()} credits` : undefined,
    exec: (st) => {
      const items = generateCounterIntel(st, "spymaster-ci", "Spymaster");
      return appendIntel({ ...st, resources: withCredits(st, -cost) }, items);
    },
    entry: { delta: -cost, unit: "credits", reason: "Auto-espionage: counter-intel sweep" },
    message: {
      title: "AUTO-ESPIONAGE: SWEEP COMPLETE",
      body: "Your Spymaster ran a counter-intelligence sweep.",
    },
  };
}

function planAgriculture(s: GameState, config: AutoDomainConfig): DomainPlan | null {
  const food = s.resources.food;
  if (food >= config.target) return null;
  const price = PROCURE_PRICE.food;
  const deficit = config.target - food;
  const byBudget = Math.floor(config.budgetPerTick / price);
  const byCredits = Math.floor(s.resources.credits / price);
  const storageRoom = Math.max(0, getResourceStorageCapacity(s, "food") - food);
  const units = Math.max(0, Math.min(deficit, byBudget, byCredits, storageRoom));
  if (units <= 0) return null;
  const cost = units * price;
  return {
    title: `Secure ${units.toLocaleString()} food`,
    summary: `Procure ${units.toLocaleString()} food to restore the stockpile band.`,
    rationale: `Food ${food.toLocaleString()} below target ${config.target.toLocaleString()}.`,
    costPreview: `${cost.toLocaleString()} credits`,
    exec: (st) => {
      const next = { ...st, resources: { ...st.resources, credits: st.resources.credits - cost } };
      applyResourceDelta(next, "food", units);
      return next;
    },
    entry: { delta: -cost, unit: "credits", reason: `Auto-agriculture: +${units.toLocaleString()} food` },
    message: {
      title: "AUTO-AGRICULTURE: RATIONS SECURED",
      body: `Your Agriculture Minister procured ${units.toLocaleString()} food.`,
    },
  };
}

function planTrade(s: GameState, config: AutoDomainConfig): DomainPlan | null {
  const res = s.resources as unknown as Record<string, number>;
  for (const commodity of config.priority) {
    const have = res[commodity];
    if (typeof have !== "number") continue;
    if (have <= config.target) continue;
    const amount = Math.min(have - config.target, 1000);
    if (amount <= 0) continue;
    const price = SELL_PRICE[commodity] ?? 8;
    const credits = amount * price;
    return {
      title: `Sell ${amount.toLocaleString()} ${commodity}`,
      summary: `Broker an export of ${amount.toLocaleString()} ${commodity} for ${credits.toLocaleString()} credits.`,
      rationale: `${commodity} surplus ${have.toLocaleString()} above target ${config.target.toLocaleString()}.`,
      costPreview: `+${credits.toLocaleString()} credits`,
      exec: (st) => {
        const r = { ...st.resources } as unknown as Record<string, number>;
        r.credits += credits;
        r[commodity] = Math.max(0, r[commodity] - amount);
        return {
          ...st,
          resources: r as unknown as Resources,
          totalCreditsEarned: (st.totalCreditsEarned ?? 0) + credits,
        };
      },
      entry: { delta: credits, unit: "credits", reason: `Auto-trade: sold ${amount.toLocaleString()} ${commodity}` },
      message: {
        title: "AUTO-TRADE: EXPORT BROKERED",
        body: `Your Diplomat sold ${amount.toLocaleString()} ${commodity} for ${credits.toLocaleString()} credits.`,
      },
    };
  }
  return null;
}

function planMilitary(s: GameState, config: AutoDomainConfig): DomainPlan | null {
  const res = s.resources as unknown as Record<string, number>;
  let best: { key: string; have: number } | null = null;
  for (const key of config.priority) {
    const have = res[key];
    if (typeof have !== "number") continue;
    if (have >= config.target) continue;
    if (!best || have < best.have) best = { key, have };
  }
  if (!best) return null;
  const price = PROCURE_PRICE[best.key] ?? 15;
  const deficit = config.target - best.have;
  const byBudget = Math.floor(config.budgetPerTick / price);
  const byCredits = Math.floor(s.resources.credits / price);
  const units = Math.max(0, Math.min(deficit, byBudget, byCredits));
  if (units <= 0) return null;
  const cost = units * price;
  const key = best.key;
  return {
    title: `Top up ${units.toLocaleString()} ${key}`,
    summary: `Restock ${units.toLocaleString()} ${key} toward the readiness ceiling.`,
    rationale: `${key} ${best.have.toLocaleString()} below target ${config.target.toLocaleString()}.`,
    costPreview: `${cost.toLocaleString()} credits`,
    exec: (st) => {
      const r = { ...st.resources } as unknown as Record<string, number>;
      r.credits -= cost;
      r[key] += units;
      return { ...st, resources: r as unknown as Resources };
    },
    entry: { delta: -cost, unit: "credits", reason: `Auto-military: +${units.toLocaleString()} ${key}` },
    message: {
      title: "AUTO-MILITARY: SUPPLIES RESTOCKED",
      body: `Your War Marshal restocked ${units.toLocaleString()} ${key}.`,
    },
  };
}

function planEdicts(s: GameState, config: AutoDomainConfig): DomainPlan | null {
  const active = s.activeEdicts ?? [];
  if (active.length >= config.target) return null;
  if (active.length >= getMaxActiveEdicts(s)) return null;
  const cooldowns = s.edictCooldowns ?? {};
  const authority = s.player?.attributes?.authority ?? 0;

  // Emergency health response: when disease risk is high or a bio-outbreak is
  // already active, the Chancellor reaches for vaccination / public-health
  // edicts FIRST. This lets players delegate disease management — ACT mode
  // enacts it, SUGGEST mode proposes it — instead of hand-managing every
  // ecology crisis. The normal affordability / cooldown / slot checks below
  // still apply, so this only fires when the edict is actually viable.
  const cs = s.cityStats;
  const outbreakActive = (s.activeEvents ?? []).some(
    (e) =>
      e.id === "biosphere_disease_outbreak" ||
      e.id === "biosphere_toxic_bloom" ||
      e.id === "biosphere_contamination_leak",
  );
  const emergencyIds: string[] = [];
  if (cs.diseaseRisk >= 70 || outbreakActive) emergencyIds.push("public_health_emergency");
  if (cs.diseaseRisk >= 65 || outbreakActive) emergencyIds.push("mass_vaccination_drive");

  const baseIds = config.priority.length > 0 ? config.priority : EDICTS.map((e) => e.id);
  const ids = [...emergencyIds, ...baseIds.filter((id) => !emergencyIds.includes(id))];
  for (const edictId of ids) {
    const def = getEdictById(edictId);
    if (!def) continue;
    if (active.some((e) => e.edictId === edictId)) continue;
    if (cooldowns[edictId] && cooldowns[edictId] > s.totalTicks) continue;
    if (def.requiresAuthority && authority < def.requiresAuthority) continue;
    if (s.resources.credits < def.cost) continue;
    // When the Chancellor reaches for an emergency health edict, speak to the
    // player like an ecology advisor: name the threat and the follow-up fix, so
    // both the SUGGEST briefing and the ACT log read as guidance, not noise.
    const isHealthEmergency = emergencyIds.includes(edictId);
    const healthRationale = outbreakActive
      ? `A bio-outbreak is active and disease risk is at ${Math.round(cs.diseaseRisk)}/100. ${def.name} contains it before it spreads further.`
      : `Disease risk is high (${Math.round(cs.diseaseRisk)}/100). ${def.name} pulls it back before an outbreak triggers.`;
    return {
      title: isHealthEmergency ? `Ecology alert: ${def.name}` : `Issue edict: ${def.name}`,
      summary: isHealthEmergency
        ? `Public health is at risk. ${def.name} is the fastest way to stabilize it. Pair it with Reclamation Domes or Biofilter Stations to lift the biosphere itself.`
        : `Enact ${def.name} to keep stats inside their target band.`,
      rationale: isHealthEmergency
        ? healthRationale
        : `Active edicts ${active.length}/${config.target}; ${def.name} is affordable and off cooldown.`,
      costPreview: `${def.cost.toLocaleString()} credits`,
      exec: (st) => {
        const a = st.activeEdicts ?? [];
        if (a.some((e) => e.edictId === edictId)) return st;
        if (a.length >= getMaxActiveEdicts(st)) return st;
        if (st.resources.credits < def.cost) return st;
        const newCooldowns = { ...(st.edictCooldowns ?? {}) };
        delete newCooldowns[edictId];
        return {
          ...st,
          resources: { ...st.resources, credits: st.resources.credits - def.cost },
          activeEdicts: [
            ...a,
            {
              edictId,
              ticksRemaining: def.durationTicks,
              issuedAtTick: st.totalTicks,
              cooldownUntilTick: st.totalTicks + def.durationTicks + def.cooldownTicks,
            },
          ],
          edictCooldowns: newCooldowns,
        };
      },
      entry: {
        delta: -def.cost,
        unit: "credits",
        reason: isHealthEmergency ? `Ecology response: ${def.name}` : `Auto-edict: ${def.name}`,
      },
      message: isHealthEmergency
        ? {
            title: "CHANCELLOR: ECOLOGY RESPONSE",
            body: `Your Chancellor enacted ${def.name} to get the disease threat under control. Build Reclamation Domes and Biofilter Stations to recover the biosphere.`,
          }
        : { title: "AUTO-EDICTS: EDICT ENACTED", body: `Your Chancellor enacted ${def.name}.` },
    };
  }
  return null;
}

const DOMAIN_SPECS: DomainSpec[] = [
  { domain: "research", kind: "research-pick", interval: INTERVALS.research, plan: planResearch },
  { domain: "intel", kind: "intel-op", interval: INTERVALS.intel, plan: planIntel },
  { domain: "espionage", kind: "counter-op", interval: INTERVALS.espionage, plan: planEspionage },
  { domain: "agriculture", kind: "farm-contract", interval: INTERVALS.agriculture, plan: planAgriculture },
  { domain: "trade", kind: "trade-accept", interval: INTERVALS.trade, plan: planTrade },
  { domain: "military", kind: "military-topup", interval: INTERVALS.military, plan: planMilitary },
  { domain: "edicts", kind: "edict-tune", interval: INTERVALS.edicts, plan: planEdicts },
];

function emitMessage(s: GameState, title: string, body: string, idKey: string): GameMessage[] {
  const gameDate = s.gameDate ?? { year: 2030, month: 1, day: 1, hour: 0 };
  const msg: GameMessage = {
    id: idKey,
    title,
    body,
    timestamp: gameDate,
    tick: s.totalTicks,
    read: false,
    category: "update",
    priority: "normal",
  };
  return [msg, ...(s.messages ?? [])].slice(0, 200);
}

function applyPlan(s: GameState, spec: DomainSpec, plan: DomainPlan): GameState {
  const next = plan.exec(s);
  const idKey = `auto-${spec.domain}-${s.totalTicks}`;
  return { ...next, messages: emitMessage(next, plan.message.title, plan.message.body, idKey) };
}

/**
 * Per-tick driver for every non-recruit Advisor Briefings domain. Mirrors
 * processAutoRecruit's gating order: effective mode → required officer →
 * interval throttle → domain "need" (plan != null). SUGGEST enqueues one
 * proposal per domain (deduped while a prior one is still pending); ACT
 * applies the plan in place, emits a per-action inbox message, and pushes
 * a tick-log entry.
 */
export function processAutoDomainManagers(s: GameState, entries: TickEntry[]): void {
  if (!s.autoManagers) return;

  for (const spec of DOMAIN_SPECS) {
    const mode = getEffectiveMode(s, spec.domain);
    if (mode === "off") continue;
    if (!hasDomainRole(s, spec.domain)) continue;

    const config = getDomainConfig(s, spec.domain);
    if (s.totalTicks - config.lastTick < spec.interval) continue;

    const plan = spec.plan(s, config);
    if (!plan) continue;

    if (mode === "suggest") {
      const am = s.autoManagers;
      // One pending briefing per domain — don't pile up duplicates while
      // the player hasn't acted on the previous suggestion.
      if (am.queue.some((p) => p.domain === spec.domain)) continue;
      const proposalId = `${spec.kind}-${s.totalTicks}`;
      if (am.queue.some((p) => p.id === proposalId)) continue;
      const proposal: AutoManagerProposal = {
        id: proposalId,
        domain: spec.domain,
        kind: spec.kind,
        officerId: getRoleOfficerId(s, spec.domain),
        title: plan.title,
        summary: plan.summary,
        rationale: plan.rationale,
        costPreview: plan.costPreview,
        createdTick: s.totalTicks,
        expiresAtTick: s.totalTicks + 48,
        declineable: true,
      };
      s.autoManagers = enqueueProposal(am, proposal);
      setDomainLastTick(s, spec.domain, config);
      continue;
    }

    // ACT — apply the plan in place (Object.assign back onto the live tick
    // state) so downstream domains in this same loop see the mutation.
    const next = applyPlan(s, spec, plan);
    Object.assign(s, next);
    setDomainLastTick(s, spec.domain, config);
    entries.push({
      label: DOMAIN_LABELS[spec.domain],
      delta: plan.entry.delta,
      unit: plan.entry.unit,
      reason: plan.entry.reason,
      severity: "neutral",
    });
  }
}

/**
 * Accept handler for a per-domain proposal. Pure (returns a new state).
 * Re-derives the plan from current config + state so accepting a stale
 * briefing never applies an outdated or now-unaffordable action — if the
 * need has lapsed the proposal applies as a no-op. GameContext wraps this
 * in its setState reducer and handles dequeue + lastDecisionTick.
 */
export function applyDomainProposal(s: GameState, proposal: AutoManagerProposal): GameState {
  const spec = DOMAIN_SPECS.find((sp) => sp.domain === proposal.domain && sp.kind === proposal.kind);
  if (!spec) return s;
  const config = getDomainConfig(s, spec.domain as AutoDomain);
  const plan = spec.plan(s, config);
  if (!plan) return s;
  return applyPlan(s, spec, plan);
}
