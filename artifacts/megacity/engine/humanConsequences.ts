import type {
  GameState,
  HumanConsequenceCause,
  HumanConsequences,
  TickEntry,
} from "@/engine/types";

export function createDefaultHumanConsequences(): HumanConsequences {
  return {
    civilianWounded: 0,
    civilianSick: 0,
    civilianMissing: 0,
    totalCivilianDeaths: 0,
    totalMilitaryDeaths: 0,
    totalRecovered: 0,
    totalMissingFound: 0,
    deathsByCause: {},
    woundedByCause: {},
    missingByCause: {},
    lastCombatPopulationLosses: 0,
  };
}

export function ensureHumanConsequences(s: GameState): HumanConsequences {
  if (!s.humanConsequences) s.humanConsequences = createDefaultHumanConsequences();
  return s.humanConsequences;
}

function addCause(
  target: Partial<Record<HumanConsequenceCause, number>>,
  cause: HumanConsequenceCause,
  amount: number,
): void {
  if (amount > 0) target[cause] = Math.max(0, Math.round((target[cause] ?? 0) + amount));
}

export function recordHumanConsequences(
  s: GameState,
  cause: HumanConsequenceCause,
  harm: {
    wounded?: number;
    sick?: number;
    missing?: number;
    deaths?: number;
    militaryDeaths?: number;
    removeDeathsFromPopulation?: boolean;
  },
): void {
  const h = ensureHumanConsequences(s);
  const wounded = Math.max(0, Math.round(harm.wounded ?? 0));
  const sick = Math.max(0, Math.round(harm.sick ?? 0));
  const missing = Math.max(0, Math.round(harm.missing ?? 0));
  const deaths = Math.max(0, Math.round(harm.deaths ?? 0));
  const militaryDeaths = Math.max(0, Math.round(harm.militaryDeaths ?? 0));

  h.civilianWounded += wounded;
  h.civilianSick += sick;
  h.civilianMissing += missing;
  h.totalCivilianDeaths += deaths;
  h.totalMilitaryDeaths += militaryDeaths;
  addCause(h.woundedByCause, cause, wounded);
  addCause(h.missingByCause, cause, missing);
  addCause(h.deathsByCause, cause, deaths + militaryDeaths);

  if (harm.removeDeathsFromPopulation && deaths > 0) {
    s.cityStats.population = Math.max(0, s.cityStats.population - deaths);
  }
}

function activeDisasterPressure(s: GameState): number {
  const hazard = /(fire|collapse|explosion|outbreak|plague|radiation|reactor|chemical|storm|flood|attack|riot|war)/i;
  return Math.min(5, (s.activeEvents ?? []).filter(event => hazard.test(`${event.id} ${event.title}`)).length);
}

/**
 * Convert city risk into real people. Rates are deliberately restrained:
 * conditions create persistent caseloads every tick, while treatment capacity
 * resolves part of those caseloads and severe untreated cases can die.
 */
export function processHumanConsequences(s: GameState, entries: TickEntry[]): void {
  const h = ensureHumanConsequences(s);
  const pop = Math.max(0, Math.round(s.cityStats.population));
  const crime = Math.max(0, s.cityStats.crime);
  const disease = Math.max(0, s.cityStats.diseaseRisk);
  const health = Math.max(0, s.cityStats.publicHealth);
  const infrastructure = Math.max(0, s.cityStats.infrastructureHealth);
  const response = Math.max(0, s.demographics.emergencyResponseCoverage ?? 0);
  const disasterPressure = activeDisasterPressure(s);
  const radioactiveWeather = /radioactive|rad storm|fallout/i.test(s.weather ?? "");

  const combatTotal = Math.max(0, Math.round(s.combat?.totalPopulationLosses ?? 0));
  const newCombatDeaths = Math.max(0, combatTotal - Math.max(0, h.lastCombatPopulationLosses ?? 0));
  if (newCombatDeaths > 0) {
    recordHumanConsequences(s, "attack", { deaths: newCombatDeaths });
  }
  h.lastCombatPopulationLosses = combatTotal;

  const crimeWounded = Math.floor(pop * Math.max(0, crime - 15) / 2_500_000);
  const crimeMissing = Math.floor(pop * Math.max(0, crime - 35) / 12_000_000);
  const accidentWounded = Math.floor(pop * Math.max(0, 65 - infrastructure) / 4_000_000);
  const newSick = Math.floor(pop * disease / 1_000_000);
  const weatherWounded = radioactiveWeather ? Math.max(1, Math.floor(pop / 250_000)) : 0;
  const disasterWounded = disasterPressure * Math.max(1, Math.floor(pop / 500_000));
  const disasterMissing = disasterPressure > 0 ? Math.max(1, Math.floor(disasterPressure / 2)) : 0;

  recordHumanConsequences(s, "crime", { wounded: crimeWounded, missing: crimeMissing });
  recordHumanConsequences(s, "accident", { wounded: accidentWounded });
  recordHumanConsequences(s, "disease", { sick: newSick });
  recordHumanConsequences(s, radioactiveWeather ? "radiation" : "weather", { wounded: weatherWounded });
  recordHumanConsequences(s, "disaster", { wounded: disasterWounded, missing: disasterMissing });

  const treatmentRate = Math.min(0.35, 0.03 + health / 500 + response / 1000);
  const foundRate = Math.min(0.25, 0.02 + s.cityStats.lawOrder / 600 + response / 1200);
  const woundedRecovered = Math.min(h.civilianWounded, Math.floor(h.civilianWounded * treatmentRate));
  const sickRecovered = Math.min(h.civilianSick, Math.floor(h.civilianSick * treatmentRate * 0.8));
  const missingFound = Math.min(h.civilianMissing, Math.floor(h.civilianMissing * foundRate));
  h.civilianWounded -= woundedRecovered;
  h.civilianSick -= sickRecovered;
  h.civilianMissing -= missingFound;
  h.totalRecovered += woundedRecovered + sickRecovered;
  h.totalMissingFound += missingFound;

  const untreatedSeverity = Math.max(0, 55 - health) / 55;
  const woundedDeaths = Math.min(h.civilianWounded, Math.floor(h.civilianWounded * untreatedSeverity * 0.015));
  const diseaseDeaths = Math.min(h.civilianSick, Math.floor(h.civilianSick * Math.max(0.002, untreatedSeverity * 0.02)));
  // Background mortality must remain below a healthy city's normal birth and
  // migration growth. Harsh conditions add their own explicit deaths above.
  const naturalDeaths = pop > 0 ? Math.max(1, Math.floor(pop / 200_000)) : 0;
  if (woundedDeaths > 0) h.civilianWounded -= woundedDeaths;
  if (diseaseDeaths > 0) h.civilianSick -= diseaseDeaths;
  recordHumanConsequences(s, "accident", { deaths: woundedDeaths, removeDeathsFromPopulation: true });
  recordHumanConsequences(s, "disease", { deaths: diseaseDeaths, removeDeathsFromPopulation: true });
  recordHumanConsequences(s, "natural", { deaths: naturalDeaths, removeDeathsFromPopulation: true });

  const newDeaths = naturalDeaths + woundedDeaths + diseaseDeaths + newCombatDeaths;
  const newCases = crimeWounded + accidentWounded + newSick + weatherWounded + disasterWounded;
  if (newDeaths > 0 || newCases > 0 || crimeMissing + disasterMissing > 0) {
    entries.push({
      label: "HUMAN CONSEQUENCES",
      delta: -newDeaths,
      unit: "lives",
      reason: `${newDeaths.toLocaleString()} dead · ${newCases.toLocaleString()} newly wounded or sick · ${(crimeMissing + disasterMissing).toLocaleString()} missing`,
      severity: newDeaths > Math.max(10, pop * 0.0001) ? "negative" : "warning",
    });
  }
}