// Plain-text serializer for the end-of-run summary card.
//
// Produces a clipboard-friendly snapshot of every section the visual
// summary screen renders, formatted for posting to Discord, Steam
// reviews, X/Bluesky, etc. Sticks to ASCII to maximise paste fidelity
// (no em-dashes, no smart quotes), and uses bullet headings the way
// players are used to seeing in patch notes.
//
// Sections mirror the visual card 1:1 (identity, time, demographics,
// workforce, income classes, resources, production balance, income
// rates, QoL, order, infrastructure, research, diplomacy, top
// factions, tourism, governance, career counters, milestones,
// defining moment) so what you copy is what you saw.

import type { RunSummary } from "./runSummary";
import { getCommanderOrigin } from "./commanderOrigins";

const fmt = (n: number, opts: { decimals?: number; sign?: boolean } = {}): string => {
  const d = opts.decimals ?? 0;
  const s = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
  if (opts.sign) return `${n >= 0 ? "+" : "-"}${s}`;
  return n < 0 ? `-${s}` : s;
};

const credits = (n: number): string => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M cr`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K cr`;
  return `${n} cr`;
};

const pct = (n: number): string => `${fmt(n)}%`;
const bar = (n: number): string => `${fmt(n)}/100`;

export function buildRunSummaryText(s: RunSummary): string {
  const lines: string[] = [];

  // ---- Identity & time ----
  lines.push(`MEGACITY :: ${s.cityName.toUpperCase()}`);
  lines.push(`Commander ${s.playerName} (${s.playerTitle})`);
  lines.push(`Origin: ${getCommanderOrigin(s.commanderOrigin).name}`);
  lines.push("");
  lines.push(`>> ${fmt(s.daysSurvived)} days survived  |  ${s.gameDateLabel}`);
  lines.push(`   ${fmt(s.totalTicks)} ticks total`);
  lines.push("");

  // ---- State of the city ----
  lines.push("// STATE OF THE CITY");
  lines.push(`  [${s.stateOfCity.headline}]`);
  lines.push("");

  // ---- Run archetype ----
  lines.push("// RUN ARCHETYPE");
  lines.push(`  ${s.archetype.name}`);
  lines.push("");

  // ---- Population & demographics ----
  lines.push("// POPULATION");
  lines.push(`  Total:        ${fmt(s.population)}`);
  lines.push(`  Growth:       ${fmt(s.populationGrowthRate, { decimals: 2, sign: true })} /tick`);
  lines.push(`  Birth rate:   ${fmt(s.birthRate, { decimals: 2 })}`);
  lines.push(`  Death rate:   ${fmt(s.deathRate, { decimals: 2 })}`);
  lines.push("");

  // ---- Income classes ----
  lines.push("// INCOME CLASSES");
  lines.push(`  Low:    ${fmt(s.incomeClasses.low)}`);
  lines.push(`  Middle: ${fmt(s.incomeClasses.middle)}`);
  lines.push(`  High:   ${fmt(s.incomeClasses.high)}`);
  lines.push("");

  // ---- Workforce ----
  lines.push("// WORKFORCE");
  const w = s.workforce;
  lines.push(`  Total workforce: ${fmt(w.total)}`);
  lines.push(`  Employment:      ${pct(w.employmentRate)}`);
  lines.push(`  Unemployment:    ${pct(w.unemploymentRate)}`);
  lines.push(`  Industrial:      ${fmt(w.industrial)}`);
  lines.push(`  Service:         ${fmt(w.service)}`);
  lines.push(`  Government:      ${fmt(w.government)}`);
  lines.push(`  Research:        ${fmt(w.research)}`);
  lines.push(`  Infrastructure:  ${fmt(w.infrastructure)}`);
  lines.push(`  Security:        ${fmt(w.security)}`);
  lines.push(`  Black market:    ${fmt(w.blackMarket)}`);
  lines.push("");

  // ---- Resources (all 9) ----
  const r = s.resources;
  lines.push("// RESOURCES");
  lines.push(`  Treasury:    ${credits(r.credits)}`);
  lines.push(`  Food:        ${fmt(r.food)}`);
  lines.push(`  Water:       ${fmt(r.water)}`);
  lines.push(`  Power:       ${fmt(r.power)}`);
  lines.push(`  Steel:       ${fmt(r.steel)}`);
  lines.push(`  Goods:       ${fmt(r.goods)}`);
  lines.push(`  Fuel:        ${fmt(r.fuel)}`);
  lines.push(`  Med supply:  ${fmt(r.medSupplies)}`);
  lines.push(`  Ammo:        ${fmt(r.ammo)}`);
  lines.push("");

  // ---- Production balance ----
  const p = s.production;
  lines.push("// PRODUCTION BALANCE  (production / consumption / net)");
  lines.push(`  Food:   ${fmt(p.food.production)} / ${fmt(p.food.consumption)} / ${fmt(p.food.net, { sign: true })}`);
  lines.push(`  Water:  ${fmt(p.water.production)} / ${fmt(p.water.consumption)} / ${fmt(p.water.net, { sign: true })}`);
  lines.push(`  Power:  ${fmt(p.power.generation)} / ${fmt(p.power.drain)} / ${fmt(p.power.net, { sign: true })}`);
  lines.push(`  Goods:  ${fmt(p.goods.production)} / ${fmt(p.goods.consumption)} / ${fmt(p.goods.net, { sign: true })}`);
  lines.push("");

  // ---- Income rates ----
  const ir = s.incomeRates;
  lines.push("// INCOME RATES /tick");
  lines.push(`  Tax:      ${credits(ir.tax)}`);
  lines.push(`  Trade:    ${credits(ir.trade)}`);
  lines.push(`  Tourism:  ${credits(ir.tourism)}`);
  lines.push(`  Avg citizen income: ${credits(s.averageCitizenIncome)}`);
  lines.push(`  Registered businesses: ${fmt(s.registeredBusinesses)}`);
  lines.push("");

  // ---- Quality of life ----
  const q = s.qol;
  lines.push("// QUALITY OF LIFE");
  lines.push(`  Happiness:        ${bar(q.happiness)}`);
  lines.push(`  Public health:    ${bar(q.publicHealth)}`);
  lines.push(`  Education:        ${bar(q.education)}`);
  lines.push(`  Biosphere:        ${bar(q.biosphere)}`);
  lines.push(`  Literacy:         ${bar(q.literacy)}`);
  lines.push(`  Life expectancy:  ${fmt(q.lifeExpectancy)} yrs`);
  lines.push(`  Homeless:         ${fmt(q.homeless)}`);
  lines.push(`  Hospital usage:   ${pct(q.hospitalCapacity)}`);
  lines.push(`  Refugees:         ${fmt(s.populationCohorts.refugees)}`);
  lines.push(`  Prisoners:        ${fmt(s.populationCohorts.prisoners)}`);
  lines.push(`  Sick residents:   ${fmt(s.populationCohorts.sick)}`);
  lines.push(`  Retirees:         ${fmt(s.populationCohorts.retirees)}`);
  lines.push(`  Orphans:          ${fmt(s.populationCohorts.orphans)}`);
  lines.push("");

  // ---- Order ----
  const o = s.order;
  lines.push("// ORDER");
  lines.push(`  Law/Order:    ${bar(o.lawOrder)}`);
  lines.push(`  Crime:        ${bar(o.crime)}`);
  lines.push(`  Unrest:       ${bar(o.unrest)}`);
  lines.push(`  Corruption:   ${bar(o.corruption)}`);
  lines.push(`  Fear index:   ${bar(o.fearIndex)}`);
  lines.push(`  Loyalty:      ${bar(o.loyaltyIndex)}`);
  lines.push("");

  // ---- Infrastructure ----
  const inf = s.infrastructure;
  lines.push("// INFRASTRUCTURE & DEFENSE");
  lines.push(`  Buildings:        ${fmt(inf.buildingsCount)} (${fmt(inf.uniqueBuildingTypes)} unique types)`);
  lines.push(`  Units:            ${fmt(inf.unitsCount)}`);
  lines.push(`  Districts:        ${fmt(inf.districtsCount)}`);
  lines.push(`  Infra health:     ${bar(inf.infrastructureHealth)}`);
  lines.push(`  Defense rating:   ${fmt(inf.defenseRating)}`);
  lines.push("");

  // ---- Research ----
  const rs = s.research;
  lines.push("// RESEARCH");
  lines.push(`  Technologies unlocked: ${fmt(rs.technologiesUnlocked)}`);
  lines.push(`  Active research:       ${rs.activeResearchId ?? "none"}${rs.activeResearchId ? ` (${pct(rs.progressPct)})` : ""}`);
  lines.push(`  Queue length:          ${fmt(rs.queueLength)}`);
  lines.push("");

  // ---- Tourism ----
  const t = s.tourism;
  lines.push("// TOURISM");
  lines.push(`  Visitors:      ${fmt(t.visitors)}`);
  lines.push(`  Capacity:      ${fmt(t.capacity)}`);
  lines.push(`  Satisfaction:  ${bar(t.satisfaction)}`);
  lines.push("");

  // ---- Governance ----
  const g = s.governance;
  lines.push("// GOVERNANCE & FINANCE");
  lines.push(`  Active edicts:      ${fmt(g.activeEdicts)}`);
  lines.push(`  Active policies:    ${fmt(g.activePolicies)}`);
  lines.push(`  Credit rating:      ${fmt(g.creditRating)}`);
  lines.push(`  Outstanding loans:  ${credits(g.outstandingLoans)}`);
  lines.push("");

  // ---- Diplomacy ----
  const d = s.diplomacy;
  lines.push("// DIPLOMACY");
  lines.push(`  Trade agreements:    ${fmt(d.tradeAgreements)}`);
  lines.push(`  Diplomatic pacts:    ${fmt(d.diplomaticPacts)}`);
  lines.push(`  Joint projects:      ${fmt(d.jointProjects)}`);
  lines.push(`  Active operations:   ${fmt(d.activeOperations)}`);
  lines.push(`  Known megacities:    ${fmt(d.knownMegacities)}`);
  lines.push(`  Known townships:     ${fmt(d.knownTownships)}`);
  lines.push(`  Notable locations:   ${fmt(d.notableLocations)}`);
  lines.push("");

  // ---- Top factions ----
  if (s.topFactions && s.topFactions.length > 0) {
    lines.push("// FACTION STANDINGS");
    for (const f of s.topFactions.slice(0, 5)) {
      // Mirror the visual summary's "standing" proxy: (loyalty - threat).
      const standing = Math.round((f.loyalty ?? 0) - (f.threat ?? 0));
      lines.push(`  ${f.name}: L${Math.round(f.loyalty)} T${Math.round(f.threat)} (${fmt(standing, { sign: true })})`);
    }
    lines.push("");
  }

  // ---- Career counters ----
  const c = s.career;
  lines.push("// CAREER");
  lines.push(`  Events handled:        ${fmt(c.eventsHandled)}`);
  lines.push(`  Strikes executed:      ${fmt(c.strikesExecuted)} (succeeded: ${fmt(c.strikesSucceeded)})`);
  lines.push(`  Contracts completed:   ${fmt(c.contractsCompleted)} (active: ${fmt(c.contractsActive)})`);
  lines.push(`  Mining ops:            ${fmt(c.miningOps)}`);
  lines.push(`  Scavenge expeditions:  ${fmt(c.scavengeExpeditions)}`);
  lines.push(`  Law missions:          ${fmt(c.lawMissions)}`);
  lines.push(`  Total deaths:          ${fmt(c.totalDeaths)}`);
  lines.push("");

  // ---- Milestones ----
  lines.push("// MILESTONES");
  lines.push(`  Firsts:        ${fmt(s.firstsUnlocked)}/${fmt(s.firstsTotal)}`);
  lines.push(`  Achievements:  ${fmt(s.achievementsUnlocked)}`);
  if (s.biggestEvent) {
    lines.push("");
    lines.push(`  Defining moment: ${s.biggestEvent.title}`);
    if (s.biggestEvent.description) {
      lines.push(`    ${s.biggestEvent.description}`);
    }
  }

  // ---- Milestone timeline ----
  if (s.milestoneTimeline && s.milestoneTimeline.length > 0) {
    lines.push("");
    lines.push("// MILESTONE TIMELINE");
    for (const m of s.milestoneTimeline) {
      const sev = m.severity ? ` [${m.severity.toUpperCase()}]` : "";
      lines.push(`  ${m.slot}.${sev} ${m.label}`);
    }
  }

  lines.push("");
  lines.push("// MEGACITY :: SECTOR MARSHAL");
  return lines.join("\n");
}
