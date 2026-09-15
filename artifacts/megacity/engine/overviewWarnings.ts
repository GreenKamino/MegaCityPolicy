import type { GameState } from "@/engine/types";
import {
  computePopulationPressure,
  formatPopulationCapacityValue,
} from "@/engine/populationPressure";
import { computePopulationDensityPressure } from "@/engine/populationDensity";

export type OverviewWarning = {
  id: string;
  icon: string;
  label: string;
  detail: string;
  severity: "critical" | "warning" | "caution";
  action?: OverviewWarningAction;
};

export type OverviewWarningTarget =
  | { screen: "construction"; category: string }
  | { screen: "law" }
  | { screen: "economy" }
  | { screen: "districts" }
  | { screen: "military" }
  | { screen: "wildlands" };

export type OverviewWarningAction = {
  label: string;
  target: OverviewWarningTarget;
};

const WARNING_ACTIONS: Record<string, OverviewWarningAction> = {
  "food-crit": { label: "OPEN FOOD BUILD", target: { screen: "construction", category: "food" } },
  "food-warn": { label: "OPEN FOOD BUILD", target: { screen: "construction", category: "food" } },
  "water-crit": { label: "OPEN WATER BUILD", target: { screen: "construction", category: "water" } },
  "water-warn": { label: "OPEN WATER BUILD", target: { screen: "construction", category: "water" } },
  "power-crit": { label: "OPEN ENERGY BUILD", target: { screen: "construction", category: "energy" } },
  "power-warn": { label: "OPEN ENERGY BUILD", target: { screen: "construction", category: "energy" } },
  "crime-crit": { label: "OPEN LAW", target: { screen: "law" } },
  "crime-warn": { label: "OPEN LAW", target: { screen: "law" } },
  "unrest-crit": { label: "OPEN LAW", target: { screen: "law" } },
  "unrest-warn": { label: "OPEN LAW", target: { screen: "law" } },
  "happy-crit": { label: "OPEN ECONOMY", target: { screen: "economy" } },
  "happy-warn": { label: "OPEN ECONOMY", target: { screen: "economy" } },
  "corrupt-crit": { label: "OPEN LAW", target: { screen: "law" } },
  "corrupt-warn": { label: "OPEN LAW", target: { screen: "law" } },
  "credits-crit": { label: "OPEN ECONOMY", target: { screen: "economy" } },
  "credits-warn": { label: "OPEN ECONOMY", target: { screen: "economy" } },
  "housing-crit": { label: "OPEN HOUSING BUILD", target: { screen: "construction", category: "housing" } },
  "housing-warn": { label: "OPEN HOUSING BUILD", target: { screen: "construction", category: "housing" } },
  "defense-warn": { label: "OPEN MILITARY", target: { screen: "military" } },
  "employ-warn": { label: "OPEN ECONOMY", target: { screen: "economy" } },
  "infra-warn": { label: "OPEN INFRA BUILD", target: { screen: "construction", category: "infrastructure" } },
  "biosphere-crit": { label: "OPEN WILDLANDS", target: { screen: "wildlands" } },
  "biosphere-warn": { label: "OPEN WILDLANDS", target: { screen: "wildlands" } },
  "disease-crit": { label: "OPEN HEALTH BUILD", target: { screen: "construction", category: "civic" } },
  "disease-warn": { label: "OPEN HEALTH BUILD", target: { screen: "construction", category: "civic" } },
  "toxic-warn": { label: "OPEN WILDLANDS", target: { screen: "wildlands" } },
  "population-density-tradeoff": { label: "OPEN DISTRICTS", target: { screen: "districts" } },
};

export function getOverviewWarningAction(id: string): OverviewWarningAction | undefined {
  if (id.startsWith("population-capacity-")) {
    return { label: "OPEN HOUSING BUILD", target: { screen: "construction", category: "housing" } };
  }
  return WARNING_ACTIONS[id];
}

const FOOD_CRITICAL_LINES = [
  "Ration distribution centers report empty shelves. Citizens are fighting over scraps.",
  "Food riots have begun in the lower districts. Supply chains have collapsed.",
  "Calorie reserves at zero. Expect civil unrest within hours.",
  "The last supply convoy was three days ago. Nobody remembers why.",
  "Synthetic protein printers are offline. The city eats nothing tonight.",
];

const FOOD_WARNING_LINES = [
  "Food reserves dwindling. Rationing protocols recommended.",
  "Supply forecasts show deficit within 48 hours at current consumption.",
  "Agricultural output failing to keep pace with population growth.",
  "Warehouse inspectors report stockpile shrinkage. Theft suspected.",
  "The hydroponics bays are running at half capacity. Something about budget cuts.",
];

const WATER_CRITICAL_LINES = [
  "Water purification offline. Citizens drinking from condensation traps.",
  "Reservoir levels at zero. Emergency desalination units overwhelmed.",
  "Public fountains have run dry. The queue at the last working tap stretches six blocks.",
  "Recyc-water systems are processing sewage into... still sewage. We have a problem.",
  "The aquifer is tapped out. Atmospheric moisture collectors can't keep up.",
];

const WATER_WARNING_LINES = [
  "Water reserves dropping below safe margins. Conservation advisories in effect.",
  "Pipe infrastructure showing stress fractures. Losses increasing.",
  "Treatment plants operating at diminished capacity. Quality declining.",
  "The reservoir engineers look worried. That's never a good sign.",
];

const POWER_CRITICAL_LINES = [
  "Citywide blackout imminent. Grid load exceeds generation by dangerous margins.",
  "Fusion reactor output critically low. Rolling brownouts in all sectors.",
  "Power deficit unsustainable. Life support in residential blocks at risk.",
  "The grid operators have started praying. That's the diagnostic we're going with.",
  "Emergency generators are running on fumes. Literal fumes.",
];

const POWER_WARNING_LINES = [
  "Power generation not meeting demand. Non-essential systems should be curtailed.",
  "Grid stability wavering. Recommend additional generation capacity.",
  "Transmission losses increasing. Infrastructure maintenance overdue.",
  "The lights flickered in Sector 7 again. Engineers blame 'atmospheric conditions.'",
];

const CRIME_CRITICAL_LINES = [
  "Street-level law enforcement has effectively collapsed. Armed gangs control multiple sectors.",
  "Crime syndicates are openly operating in broad daylight. Enforcers overwhelmed.",
  "Murder rate has tripled this quarter. Citizens are afraid to leave their hab-blocks.",
  "The criminal element has become the establishment. We just haven't admitted it yet.",
];

const CRIME_WARNING_LINES = [
  "Crime indices trending upward across multiple districts. Patrols stretched thin.",
  "Property crime and petty theft rising. Citizens demanding stronger enforcement.",
  "Gang activity increasing in the lower sectors. Intelligence suggests recruitment drives.",
  "Block security reports are getting longer. That's never a positive trend.",
];

const UNREST_CRITICAL_LINES = [
  "Mass demonstrations turning violent. Riot suppression units deployed across the city.",
  "Citizens erecting barricades in the outer sectors. Full insurrection possible.",
  "Public confidence in the administration has collapsed. Revolutionary rhetoric spreading.",
  "The protests have evolved past chanting. They've started organizing.",
];

const UNREST_WARNING_LINES = [
  "Civil discontent rising. Social media channels buzzing with anti-government sentiment.",
  "Protest movements gaining traction in working-class sectors.",
  "Public approval ratings declining sharply. Advisors recommend policy adjustments.",
  "Someone is printing pamphlets again. The old-fashioned kind. That means commitment.",
];

const HAPPINESS_CRITICAL_LINES = [
  "Citizen satisfaction at rock bottom. Mass emigration risk is real and immediate.",
  "Quality of life indicators have flatlined. The city feels like a prison to its residents.",
  "Happiness surveys returning results too depressing to publish.",
  "Morale is somewhere between 'catastrophic' and 'why do we bother.'",
];

const HAPPINESS_WARNING_LINES = [
  "Citizen well-being declining. Entertainment and social services underfunded.",
  "Satisfaction metrics dropping. Recommend investment in public amenities.",
  "The populace is restless. Small comforts are becoming luxuries.",
  "People aren't angry yet. They're just... tired. That might be worse.",
];

const CORRUPTION_CRITICAL_LINES = [
  "Institutional corruption is systemic. Every permit, contract, and inspection has a price.",
  "Administration officials openly taking bribes. Internal affairs has given up.",
  "The treasury is hemorrhaging credits to corrupt officials. No one is clean.",
  "Corruption has become the operating system. Honesty is the bug.",
];

const CORRUPTION_WARNING_LINES = [
  "Corruption indices rising. Recommend anti-corruption task force deployment.",
  "Financial audits revealing irregularities across multiple departments.",
  "Kickback schemes detected in construction contracts. Investigation pending.",
  "The budget numbers don't add up. Someone is skimming, and they're not subtle about it.",
];

const CREDITS_CRITICAL_LINES = [
  "Treasury nearly empty. Payroll and essential services at risk of suspension.",
  "Credit reserves critically low. The city cannot fund basic operations.",
  "Financial collapse imminent. Bond markets have downgraded the city to junk status.",
  "We can't afford to keep the lights on. That's not a metaphor — check the power bill.",
];

const CREDITS_WARNING_LINES = [
  "Treasury reserves declining. Revenue generation should be prioritized.",
  "Budget deficit growing. Non-essential expenditures should be reviewed.",
  "Financial advisors recommend immediate austerity measures.",
  "The accountants are using red ink exclusively now. That's their way of screaming.",
];

const HOUSING_CRITICAL_LINES = [
  "Homeless encampments spreading across all sectors. Housing capacity completely exhausted.",
  "Citizens sleeping in corridors and stairwells. Hab-block density at dangerous levels.",
  "Housing crisis has become a humanitarian emergency. People are living in maintenance tunnels.",
];

const HOUSING_WARNING_LINES = [
  "Housing pressure mounting. New residential construction urgently needed.",
  "Occupancy rates exceeding safe limits in multiple hab-blocks.",
  "Waiting list for housing assignments now exceeds 10,000 citizens.",
];

const DEFENSE_WARNING_LINES = [
  "Defense readiness inadequate. The city is vulnerable to external threats.",
  "Perimeter security gaps detected. Military advisors recommend fortification.",
  "Wasteland scouts report increased hostile activity near city borders.",
  "Our walls are more suggestion than fortification at this point.",
];

const EMPLOYMENT_WARNING_LINES = [
  "Unemployment rising. Idle citizens are becoming a destabilizing factor.",
  "Job creation not keeping pace with population growth. Economic programs needed.",
  "Labor markets contracting. Automation displacing workers faster than retraining can absorb.",
];

const INFRA_WARNING_LINES = [
  "Infrastructure deteriorating. Maintenance budgets inadequate for current decay rate.",
  "Structural inspectors flagging critical failures in older sectors.",
  "Road surfaces, pipe networks, and power conduits all showing age. Rebuild or regret.",
];

// Ecology advisories are deliberately actionable: they name the buildings and
// edicts that fix the problem, because a low biosphere / high disease spiral is
// otherwise hard for new players to diagnose or reverse.
const BIOSPHERE_WARNING_LINES = [
  "Ecological reserves are slipping. Build Biosphere Reclamation Domes or Decontamination Forests, and consider a Wildlands restoration project.",
  "Air and soil quality are declining. Atmospheric Biofilter Stations and Bioremediation Plants will pull the biosphere back up.",
  "Green cover is thinning across the sectors. Conservation buildings and the Biosphere Protection Act edict slow the rot.",
  "The biosphere is fraying. Add ecological infrastructure now, before a weak biosphere starts driving disease risk upward.",
];

const BIOSPHERE_CRITICAL_LINES = [
  "Biosphere near collapse. Build Reclamation Domes and Decontamination Forests immediately and run an emergency Wildlands restoration.",
  "Ecological failure imminent. Without bioremediation infrastructure right now, an ecosystem collapse will gut your food supply.",
  "The living systems of the city are dying. Pour credits into biosphere buildings before the collapse cascades into disease.",
];

const DISEASE_WARNING_LINES = [
  "Disease risk climbing. Raise public health with MegaClinics and lift the biosphere; a Mass Vaccination Drive edict buys breathing room.",
  "Infection vectors are spreading. Build Xeno-Veterinary Hospitals and enact health edicts before an outbreak triggers.",
  "Pathogen surveillance is flashing amber. Improve sanitation and biosphere health to keep risk below the outbreak line.",
];

const DISEASE_CRITICAL_LINES = [
  "Outbreak imminent. Enact Mass Vaccination Drive or Public Health Emergency now, and build medical capacity fast.",
  "Disease risk critical. One more push and hospitals are overwhelmed — vaccinate and quarantine before it tips over.",
  "Infection is about to break loose. Spend on health edicts and clinics immediately to pull risk back down.",
];

const TOXIC_BLOOM_LINES = [
  "A degraded biosphere plus high disease risk invites toxic blooms in the water supply. Fix biosphere and sanitation together.",
  "Conditions are ripe for a toxic bloom. Raise biosphere health and lower disease risk before it contaminates the water.",
];

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateOverviewWarnings(state: GameState): OverviewWarning[] {
  const warnings: OverviewWarning[] = [];
  const cs = state.cityStats;
  const r = state.resources;
  const rates = state.rates;

  const foodNet = rates.foodProduction - rates.foodConsumption;
  const waterNet = rates.waterProduction - rates.waterConsumption;
  const powerNet = rates.powerGeneration - Math.floor(rates.powerDrain);
  const populationPressure = computePopulationPressure(state);
  const densityPressure = computePopulationDensityPressure(state);

  if (r.food <= 0) {
    warnings.push({ id: "food-crit", icon: "alert-circle", label: "FOOD CRISIS", detail: pick(FOOD_CRITICAL_LINES), severity: "critical" });
  } else if (r.food < 100 || foodNet < -5) {
    warnings.push({ id: "food-warn", icon: "package", label: "FOOD SHORTAGE", detail: pick(FOOD_WARNING_LINES), severity: "warning" });
  }

  if (r.water <= 0) {
    warnings.push({ id: "water-crit", icon: "alert-circle", label: "WATER CRISIS", detail: pick(WATER_CRITICAL_LINES), severity: "critical" });
  } else if (r.water < 100 || waterNet < -5) {
    warnings.push({ id: "water-warn", icon: "droplet", label: "WATER SHORTAGE", detail: pick(WATER_WARNING_LINES), severity: "warning" });
  }

  if (powerNet < -200) {
    warnings.push({ id: "power-crit", icon: "zap-off", label: "POWER FAILURE", detail: pick(POWER_CRITICAL_LINES), severity: "critical" });
  } else if (powerNet < 0) {
    warnings.push({ id: "power-warn", icon: "zap", label: "POWER DEFICIT", detail: pick(POWER_WARNING_LINES), severity: "warning" });
  }

  if (cs.crime > 80) {
    warnings.push({ id: "crime-crit", icon: "shield-off", label: "CRIME EMERGENCY", detail: pick(CRIME_CRITICAL_LINES), severity: "critical" });
  } else if (cs.crime > 60) {
    warnings.push({ id: "crime-warn", icon: "shield", label: "CRIME RISING", detail: pick(CRIME_WARNING_LINES), severity: "warning" });
  }

  if (cs.unrest > 80) {
    warnings.push({ id: "unrest-crit", icon: "alert-triangle", label: "CIVIL UNREST", detail: pick(UNREST_CRITICAL_LINES), severity: "critical" });
  } else if (cs.unrest > 60) {
    warnings.push({ id: "unrest-warn", icon: "alert-triangle", label: "UNREST RISING", detail: pick(UNREST_WARNING_LINES), severity: "warning" });
  }

  if (cs.happiness < 15) {
    warnings.push({ id: "happy-crit", icon: "frown", label: "MORALE COLLAPSE", detail: pick(HAPPINESS_CRITICAL_LINES), severity: "critical" });
  } else if (cs.happiness < 30) {
    warnings.push({ id: "happy-warn", icon: "meh", label: "LOW MORALE", detail: pick(HAPPINESS_WARNING_LINES), severity: "caution" });
  }

  if (cs.corruption > 80) {
    warnings.push({ id: "corrupt-crit", icon: "dollar-sign", label: "SYSTEMIC CORRUPTION", detail: pick(CORRUPTION_CRITICAL_LINES), severity: "critical" });
  } else if (cs.corruption > 60) {
    warnings.push({ id: "corrupt-warn", icon: "dollar-sign", label: "CORRUPTION GROWING", detail: pick(CORRUPTION_WARNING_LINES), severity: "warning" });
  }

  if (r.credits < 1000) {
    warnings.push({ id: "credits-crit", icon: "trending-down", label: "TREASURY EMPTY", detail: pick(CREDITS_CRITICAL_LINES), severity: "critical" });
  } else if (r.credits < 5000) {
    warnings.push({ id: "credits-warn", icon: "trending-down", label: "LOW FUNDS", detail: pick(CREDITS_WARNING_LINES), severity: "warning" });
  }

  if (cs.housingPressure > 85) {
    warnings.push({ id: "housing-crit", icon: "home", label: "HOUSING CRISIS", detail: pick(HOUSING_CRITICAL_LINES), severity: "critical" });
  } else if (cs.housingPressure > 65) {
    warnings.push({ id: "housing-warn", icon: "home", label: "HOUSING PRESSURE", detail: pick(HOUSING_WARNING_LINES), severity: "caution" });
  }

  if (cs.defenseRating < 25) {
    warnings.push({ id: "defense-warn", icon: "shield", label: "WEAK DEFENSES", detail: pick(DEFENSE_WARNING_LINES), severity: "warning" });
  }

  if (cs.employment < 40) {
    warnings.push({ id: "employ-warn", icon: "briefcase", label: "UNEMPLOYMENT", detail: pick(EMPLOYMENT_WARNING_LINES), severity: "caution" });
  }

  if (cs.infrastructureHealth < 35) {
    warnings.push({ id: "infra-warn", icon: "tool", label: "INFRA DECAY", detail: pick(INFRA_WARNING_LINES), severity: "warning" });
  }

  // Ecology — warn BEFORE the disaster thresholds (ecosystem collapse at
  // biosphere <= 15, disease outbreak at diseaseRisk >= 75) so players get lead
  // time and a clear fix instead of a surprise crisis.
  if (cs.biosphere <= 20) {
    warnings.push({ id: "biosphere-crit", icon: "alert-octagon", label: "BIOSPHERE COLLAPSING", detail: pick(BIOSPHERE_CRITICAL_LINES), severity: "critical" });
  } else if (cs.biosphere <= 35) {
    warnings.push({ id: "biosphere-warn", icon: "wind", label: "BIOSPHERE FAILING", detail: pick(BIOSPHERE_WARNING_LINES), severity: "warning" });
  }

  if (cs.diseaseRisk >= 70) {
    warnings.push({ id: "disease-crit", icon: "activity", label: "OUTBREAK IMMINENT", detail: pick(DISEASE_CRITICAL_LINES), severity: "critical" });
  } else if (cs.diseaseRisk >= 55) {
    warnings.push({ id: "disease-warn", icon: "activity", label: "DISEASE RISK RISING", detail: pick(DISEASE_WARNING_LINES), severity: "warning" });
  }

  if (cs.diseaseRisk >= 50 && cs.biosphere <= 30) {
    warnings.push({ id: "toxic-warn", icon: "droplet", label: "TOXIC BLOOM RISK", detail: pick(TOXIC_BLOOM_LINES), severity: "caution" });
  }

  const populationShortfalls = populationPressure.pressuredMetrics
    .filter((item) => item.status === "shortfall")
    .slice(0, 3);
  if (
    populationShortfalls.length > 0 ||
    populationPressure.approachingNextTier ||
    populationPressure.recentlyEnteredTier
  ) {
    const shortfallText = populationShortfalls.length > 0
      ? populationShortfalls
          .map(
            (item) =>
              `${item.label.toLowerCase()} ${formatPopulationCapacityValue(item.actual, item.unit)}/${formatPopulationCapacityValue(item.reserveTarget, item.unit)}`,
          )
          .join(", ")
      : "current services have their recommended reserve";
    const milestoneText = populationPressure.recentlyEnteredTier
      ? `The city has entered the ${populationPressure.tier.label.toLowerCase()} band`
      : `Prepare for ${populationPressure.nextTier?.label.toLowerCase() ?? "the next population band"} at ${populationPressure.nextTier?.minPopulation.toLocaleString() ?? "maximum"} citizens`;
    warnings.push({
      id: `population-capacity-${populationPressure.tier.id}`,
      icon: "users",
      label: "GROWTH CAPACITY PLAN",
      detail: `${milestoneText}: ${shortfallText}. Growth expands the tax base and workforce, while density gradually raises health, security, and ecology pressure.`,
      severity: populationShortfalls.length > 0 ? "warning" : "caution",
    });
  }

  if (densityPressure.level >= 0.5) {
    warnings.push({
      id: "population-density-tradeoff",
      icon: "users",
      label: "DENSITY TRADEOFF",
      detail:
        "A larger city brings more workers and revenue, but crowding now adds gradual crime, unrest, disease, and pollution pressure. Stay ahead with security, clinics, sanitation, and green infrastructure.",
      severity: "caution",
    });
  }

  return warnings.sort((a, b) => {
    const order = { critical: 0, warning: 1, caution: 2 };
    return order[a.severity] - order[b.severity];
  }).map((warning) => ({ ...warning, action: getOverviewWarningAction(warning.id) }));
}
