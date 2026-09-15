import type { GameState, GameMessage } from "@/engine/types";
import { formatDateShort } from "@/engine/clock";
import {
  WEATHER_ZONES,
  getZoneSeasonState,
  type WeatherZone,
} from "@/engine/worldMapData";
import { getSeason, getSeasonLabel, nextSeason, type Season } from "@/engine/weather";

export function generateEnhancedDailyReport(s: GameState): GameMessage {
  const cs = s.cityStats;
  const r = s.resources;
  const rates = s.rates;
  const pop = cs.population >= 1000000
    ? (cs.population / 1000000).toFixed(2) + "M"
    : (cs.population / 1000).toFixed(1) + "k";
  const income = rates.taxIncome + rates.tradeIncome + (rates.tourismIncome ?? 0);

  const criticalConditions = [
    cs.crime > 70, cs.unrest > 70, cs.happiness < 25,
    cs.corruption > 75, r.food <= 0, r.water <= 0,
  ].filter(Boolean).length;

  const lines: string[] = [
    `OPERATIONS STATUS: ${criticalConditions === 0 ? "NOMINAL" : `${criticalConditions} CRITICAL CONDITION${criticalConditions === 1 ? "" : "S"}`}`,
    "",
    "─── CORE METRICS ───",
    `POPULATION: ${pop} citizens`,
    `TREASURY: ${r.credits.toLocaleString()} cr (+${income.toLocaleString()}/hr)`,
    `CRIME: ${Math.round(cs.crime)} | UNREST: ${Math.round(cs.unrest)} | ORDER: ${Math.round(cs.lawOrder)}`,
    `HAPPINESS: ${Math.round(cs.happiness)} | CORRUPTION: ${Math.round(cs.corruption)}`,
    "",
    "─── UTILITIES ───",
    `FOOD: ${r.food} (net ${rates.foodProduction - rates.foodConsumption}/hr)`,
    `WATER: ${r.water} (net ${rates.waterProduction - rates.waterConsumption}/hr)`,
    `POWER: net ${rates.powerGeneration - Math.floor(rates.powerDrain)} MW`,
  ];

  return {
    id: `daily-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}-${Date.now()}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "report",
    title: `DAILY REPORT — ${formatDateShort(s.gameDate)}`,
    body: lines.join("\n"),
    read: false,
    priority: "normal",
  };
}

export function generateEconomicDispatch(s: GameState): GameMessage | null {
  const r = s.resources;
  const rates = s.rates;
  const cs = s.cityStats;

  const totalIncome = rates.taxIncome + rates.tradeIncome + (rates.tourismIncome ?? 0);
  const totalExpenses = ((rates as any).wages ?? 0) + ((rates as any).maintenance ?? 0) + ((rates as any).researchCost ?? 0);
  const netFlow = totalIncome - totalExpenses;
  const flowWord = netFlow > 0 ? "SURPLUS" : netFlow < -500 ? "CRITICAL DEFICIT" : netFlow < 0 ? "DEFICIT" : "BREAK-EVEN";
  const daysOfReserve = totalExpenses > 0 ? Math.floor(r.credits / Math.max(1, totalExpenses)) : 999;

  const tradeCount = (s.tradeAgreements ?? []).filter(t => t.status === "active").length;
  const employmentPct = Math.round(cs.employment);

  const outlookLines = [
    netFlow > 1000 ? `TREASURY OUTLOOK: SURPLUS; reserve runway ${daysOfReserve} cycles.` : null,
    netFlow < -1000 ? `TREASURY OUTLOOK: CRITICAL DEFICIT; reserve runway ${daysOfReserve} cycles.` : null,
    cs.employment > 80 ? `EMPLOYMENT: ${employmentPct}% (HIGH).` : null,
    cs.employment < 50 ? `EMPLOYMENT: ${employmentPct}% (LOW).` : null,
    r.food < 50 ? `FOOD RESERVES: ${r.food}.` : null,
    r.steel > 500 ? `STEEL RESERVES: ${r.steel}.` : null,
    tradeCount > 3 ? `TRADE NETWORK: ${tradeCount} active agreements; income ${rates.tradeIncome.toLocaleString()} cr/cycle.` : null,
    tradeCount === 0 ? "TRADE NETWORK: 0 ACTIVE AGREEMENTS." : null,
  ].filter(Boolean);

  const lines = [
    `ECONOMIC STATUS: ${flowWord}`,
    "",
    "─── FISCAL SUMMARY ───",
    `TREASURY: ${r.credits.toLocaleString()} cr`,
    `INCOME: +${totalIncome.toLocaleString()} cr/cycle (Tax: ${rates.taxIncome.toLocaleString()} | Trade: ${rates.tradeIncome.toLocaleString()} | Tourism: ${(rates.tourismIncome ?? 0).toLocaleString()})`,
    `EXPENSES: -${totalExpenses.toLocaleString()} cr/cycle (Wages: ${((rates as any).wages ?? 0).toLocaleString()} | Maint: ${((rates as any).maintenance ?? 0).toLocaleString()})`,
    `NET FLOW: ${netFlow > 0 ? "+" : ""}${netFlow.toLocaleString()} cr/cycle — ${flowWord}`,
    `RESERVE RUNWAY: ${daysOfReserve > 100 ? "100+" : daysOfReserve} cycles at current burn rate`,
    "",
    "─── EMPLOYMENT ───",
    `WORKFORCE UTILIZATION: ${employmentPct}%`,
    "",
    "─── TRADE NETWORK ───",
    `ACTIVE AGREEMENTS: ${tradeCount} | TRADE INCOME: ${rates.tradeIncome.toLocaleString()} cr/cycle`,
    ...(outlookLines.length > 0 ? ["", "─── OUTLOOK ───", ...outlookLines] : []),
  ];

  return {
    id: `econ-dispatch-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}-${Date.now()}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "report",
    title: `ECONOMIC DISPATCH — ${flowWord}`,
    body: lines.join("\n"),
    read: false,
    priority: netFlow < -1000 ? "high" : "normal",
  };
}

export function generateDistrictSpotlight(s: GameState): GameMessage | null {
  if (!s.districts || s.districts.length === 0) return null;
  const d = s.districts[s.totalTicks % s.districts.length];

  const popStr = d.population >= 10000
    ? (d.population / 1000).toFixed(1) + "k"
    : d.population.toLocaleString();

  const crimeGrade = d.crime > 70 ? "CRITICAL" : d.crime > 50 ? "HIGH" : d.crime > 30 ? "MODERATE" : "LOW";
  const loyaltyGrade = d.loyalty > 70 ? "LOYAL" : d.loyalty > 40 ? "COMPLIANT" : d.loyalty > 20 ? "RESTLESS" : "DEFIANT";
  const infraGrade = d.infraQuality > 70 ? "EXCELLENT" : d.infraQuality > 40 ? "ADEQUATE" : d.infraQuality > 20 ? "DETERIORATING" : "FAILING";

  const concerns: string[] = [];
  if (d.crime > 60) concerns.push(`CRIME ALERT: index ${Math.round(d.crime)}.`);
  if (d.unrest > 60) concerns.push(`UNREST ALERT: index ${Math.round(d.unrest)}.`);
  if (d.gangInfluence > 50) concerns.push(`GANG INFLUENCE ALERT: ${Math.round(d.gangInfluence)}%.`);
  if (d.infraQuality < 30) concerns.push(`INFRASTRUCTURE ALERT: quality ${Math.round(d.infraQuality)}.`);
  if (d.mutationRate > 30) concerns.push(`MUTATION ALERT: rate ${Math.round(d.mutationRate)}%.`);
  if (d.loyalty < 25) concerns.push(`LOYALTY ALERT: ${Math.round(d.loyalty)}%.`);
  if (d.wealth < 20) concerns.push(`WEALTH ALERT: index ${Math.round(d.wealth)}.`);

  const positives: string[] = [];
  if (d.crime < 20) positives.push(`CRIME BASELINE: ${Math.round(d.crime)}.`);
  if (d.loyalty > 80) positives.push(`LOYALTY STATUS: ${Math.round(d.loyalty)}%.`);
  if (d.industrialOutput > 50) positives.push(`INDUSTRIAL OUTPUT: ${Math.round(d.industrialOutput)}.`);
  if (d.infraQuality > 70) positives.push(`INFRASTRUCTURE STATUS: ${Math.round(d.infraQuality)}.`);
  if (d.wealth > 70) positives.push(`WEALTH INDEX: ${Math.round(d.wealth)}.`);

  const lines = [
    `DISTRICT RECORD: ${d.name.toUpperCase()}`,
    "",
    `─── DISTRICT SPOTLIGHT: ${d.name.toUpperCase()} ───`,
    `POPULATION: ${popStr} | WEALTH: ${Math.round(d.wealth)} | DEFENSE: ${Math.round(d.defenseRating)}`,
    `CRIME: ${Math.round(d.crime)} (${crimeGrade}) | UNREST: ${Math.round(d.unrest)}`,
    `LOYALTY: ${Math.round(d.loyalty)} (${loyaltyGrade}) | INFRASTRUCTURE: ${Math.round(d.infraQuality)} (${infraGrade})`,
    `GANG INFLUENCE: ${Math.round(d.gangInfluence)}% | INDUSTRIAL OUTPUT: ${Math.round(d.industrialOutput)}`,
    ...(concerns.length > 0 ? ["", "─── CONCERNS ───", ...concerns.map(c => `⚠ ${c}`)] : []),
    ...(positives.length > 0 ? ["", "─── POSITIVE INDICATORS ───", ...positives.map(p => `✓ ${p}`)] : []),
  ];

  return {
    id: `district-spot-${d.id}-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}-${Date.now()}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "report",
    title: `DISTRICT SPOTLIGHT: ${d.name.toUpperCase()}`,
    body: lines.join("\n"),
    read: false,
    priority: concerns.length >= 3 ? "high" : "normal",
  };
}

export function generateCrimeBlotter(s: GameState): GameMessage | null {
  const cs = s.cityStats;
  const districts = s.districts ?? [];
  if (districts.length === 0) return null;

  const hotspots = [...districts].sort((a, b) => b.crime - a.crime).slice(0, 3);
  const safest = [...districts].sort((a, b) => a.crime - b.crime).slice(0, 2);
  const gangDistricts = districts.filter(d => d.gangInfluence > 40);
  const totalGangInfluence = districts.reduce((sum, d) => sum + d.gangInfluence, 0) / Math.max(1, districts.length);

  const lines = [
    `CRIME OPERATIONS: ${districts.length} DISTRICTS REVIEWED`,
    "",
    `─── CITY CRIME INDEX: ${Math.round(cs.crime)} ───`,
    `LAW & ORDER: ${Math.round(cs.lawOrder)} | CORRUPTION: ${Math.round(cs.corruption)}`,
    `AVG GANG INFLUENCE: ${Math.round(totalGangInfluence)}%`,
    "",
    "─── CRIME HOTSPOTS ───",
    ...hotspots.map(d => `• ${d.name}: Crime ${Math.round(d.crime)} | Gang Influence ${Math.round(d.gangInfluence)}%`),
    "",
    "─── SAFEST DISTRICTS ───",
    ...safest.map(d => `• ${d.name}: Crime ${Math.round(d.crime)} | Loyalty ${Math.round(d.loyalty)}`),
    ...(gangDistricts.length > 0 ? [
      "",
      "─── GANG ACTIVITY ───",
      `${gangDistricts.length} district${gangDistricts.length > 1 ? "s" : ""} reporting significant gang influence (>40%):`,
      ...gangDistricts.slice(0, 4).map(d => `• ${d.name}: ${Math.round(d.gangInfluence)}% gang control`),
    ] : []),
  ];

  return {
    id: `crime-blotter-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}-${Date.now()}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "intel",
    title: `CRIME BLOTTER — INDEX: ${Math.round(cs.crime)}`,
    body: lines.join("\n"),
    read: false,
    priority: cs.crime > 70 ? "high" : "normal",
  };
}

export function generateInfrastructureReport(s: GameState): GameMessage | null {
  const u = s.utilities;
  if (!u) return null;
  const rates = s.rates;

  const powerNet = rates.powerGeneration - Math.floor(rates.powerDrain);
  const powerStatus = powerNet > 100 ? "SURPLUS" : powerNet > 0 ? "ADEQUATE" : "DEFICIT";
  const wasteEfficiency = u.wasteGenerated > 0
    ? Math.round((u.wasteProcessed / u.wasteGenerated) * 100)
    : 100;
  const transitUtil = u.transitCapacity > 0
    ? Math.round((u.transitLoad / u.transitCapacity) * 100)
    : 0;

  const concerns: string[] = [];
  if (powerNet < 0) concerns.push(`POWER DEFICIT: ${Math.abs(powerNet)} MW.`);
  if (wasteEfficiency < 60) concerns.push(`WASTE PROCESSING: ${wasteEfficiency}% efficiency.`);
  if (transitUtil > 100) concerns.push(`TRANSIT LOAD: ${transitUtil}% capacity.`);
  if (u.sanitationLevel < 40) concerns.push(`SANITATION: ${u.sanitationLevel}%.`);
  if (u.commsStrength < 40) concerns.push(`COMMUNICATIONS: ${u.commsStrength}%.`);

  const lines = [
    `INFRASTRUCTURE STATUS: ${concerns.length === 0 ? "NOMINAL" : `${concerns.length} ISSUE${concerns.length > 1 ? "S" : ""}`}`,
    "",
    "─── POWER GRID ───",
    `Generation: ${rates.powerGeneration.toLocaleString()} MW | Drain: ${Math.floor(rates.powerDrain).toLocaleString()} MW`,
    `Net: ${powerNet > 0 ? "+" : ""}${powerNet.toLocaleString()} MW — ${powerStatus}`,
    `Stored: ${u.powerStored.toLocaleString()} MW`,
    "",
    "─── WASTE MANAGEMENT ───",
    `Generated: ${u.wasteGenerated} | Processed: ${u.wasteProcessed} | Efficiency: ${wasteEfficiency}%`,
    "",
    "─── TRANSIT NETWORK ───",
    `Capacity: ${u.transitCapacity} | Load: ${u.transitLoad} | Utilization: ${transitUtil}%`,
    "",
    "─── OTHER SYSTEMS ───",
    `Communications: ${u.commsStrength}% | Sanitation: ${u.sanitationLevel}% | Fuel Distribution: ${u.fuelDistribution}`,
    ...(concerns.length > 0 ? ["", "─── ACTION ITEMS ───", ...concerns] : [""]),
  ];

  return {
    id: `infra-report-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}-${Date.now()}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "report",
    title: `INFRASTRUCTURE STATUS — ${concerns.length > 0 ? concerns.length + " ISSUE" + (concerns.length > 1 ? "S" : "") : "NOMINAL"}`,
    body: lines.join("\n"),
    read: false,
    priority: concerns.length >= 2 ? "high" : "normal",
  };
}

export function generatePopulationCensus(s: GameState): GameMessage | null {
  const cs = s.cityStats;
  const districts = s.districts ?? [];
  if (districts.length === 0) return null;

  const totalPop = cs.population;
  const popStr = totalPop >= 1000000
    ? (totalPop / 1000000).toFixed(2) + "M"
    : (totalPop / 1000).toFixed(1) + "k";
  const growthRate = cs.populationGrowthRate;
  const growthWord = growthRate > 5 ? "RAPID GROWTH" : growthRate > 0 ? "GROWING" : growthRate > -5 ? "DECLINING" : "CRISIS";

  const topDistricts = [...districts].sort((a, b) => b.population - a.population).slice(0, 3);
  const bottomDistricts = [...districts].sort((a, b) => a.population - b.population).slice(0, 2);
  const avgWealth = Math.round(districts.reduce((sum, d) => sum + d.wealth, 0) / Math.max(1, districts.length));
  const avgLoyalty = Math.round(districts.reduce((sum, d) => sum + d.loyalty, 0) / Math.max(1, districts.length));

  const demographicInsights = [
    cs.happiness > 70 ? `HAPPINESS ABOVE TARGET: ${Math.round(cs.happiness)}.` : null,
    cs.happiness < 30 ? `HAPPINESS BELOW TARGET: ${Math.round(cs.happiness)}.` : null,
    cs.publicHealth > 70 ? `PUBLIC HEALTH: ${Math.round(cs.publicHealth)}.` : null,
    cs.publicHealth < 30 ? `PUBLIC HEALTH ALERT: ${Math.round(cs.publicHealth)}.` : null,
    cs.education > 60 ? `EDUCATION INDEX: ${Math.round(cs.education)}.` : null,
    cs.housingPressure > 70 ? `HOUSING PRESSURE: ${Math.round(cs.housingPressure)}%.` : null,
    cs.housingPressure < 30 ? `HOUSING PRESSURE: ${Math.round(cs.housingPressure)}%.` : null,
    cs.diseaseRisk > 50 ? `DISEASE RISK: ${Math.round(cs.diseaseRisk)}%.` : null,
    cs.upliftPopulation > 0 ? `UPLIFTED POPULATION: ${cs.upliftPopulation.toLocaleString()}.` : null,
  ].filter(Boolean);

  const lines = [
    `CENSUS STATUS: ${growthWord}`,
    "",
    `─── POPULATION OVERVIEW ───`,
    `TOTAL: ${popStr} citizens across ${districts.length} districts`,
    `GROWTH: ${growthRate > 0 ? "+" : ""}${growthRate.toFixed(1)}% — ${growthWord}`,
    `AVG WEALTH: ${avgWealth} | AVG LOYALTY: ${avgLoyalty}`,
    `HAPPINESS: ${Math.round(cs.happiness)} | EMPLOYMENT: ${Math.round(cs.employment)}%`,
    "",
    "─── MOST POPULATED ───",
    ...topDistricts.map(d => `• ${d.name}: ${d.population.toLocaleString()} (Wealth: ${Math.round(d.wealth)}, Loyalty: ${Math.round(d.loyalty)})`),
    "",
    "─── LEAST POPULATED ───",
    ...bottomDistricts.map(d => `• ${d.name}: ${d.population.toLocaleString()} (Wealth: ${Math.round(d.wealth)})`),
    ...(demographicInsights.length > 0 ? ["", "─── DEMOGRAPHIC NOTES ───", ...demographicInsights.map(i => `• ${i}`)] : []),
  ];

  return {
    id: `census-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}-${Date.now()}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "report",
    title: `POPULATION CENSUS — ${popStr} CITIZENS`,
    body: lines.join("\n"),
    read: false,
    priority: growthRate < -5 ? "high" : "normal",
  };
}

function generateWeatherAdvisory(s: GameState): GameMessage | null {
  if (!s.weather || !s.season || !s.gameDate) return null;

  const weatherName = String(s.weather).replace(/_/g, " ").toUpperCase();
  const season = String(s.season).toUpperCase();

  const lines = [
    `WEATHER STATUS: ${weatherName}`,
    "",
    `─── CURRENT CONDITIONS ───`,
    `WEATHER: ${weatherName}`,
    `SEASON: ${season}`,
  ];

  return {
    id: `weather-adv-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}-${Date.now()}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "update",
    title: `WEATHER ADVISORY — ${weatherName}`,
    body: lines.join("\n"),
    read: false,
    priority: "low",
  };
}

function generateOfficerCorpsUpdate(s: GameState): GameMessage | null {
  if (!s.officers || s.officers.length === 0) return null;

  const appointed = s.officers.filter(o => o.appointed);
  if (appointed.length === 0) return null;

  const focus = appointed[s.totalTicks % appointed.length];
  const competenceWord = focus.competence > 70 ? "EXCEPTIONAL" : focus.competence > 40 ? "ADEQUATE" : "UNDERPERFORMING";
  const loyaltyWord = focus.loyalty > 70 ? "DEVOTED" : focus.loyalty > 40 ? "RELIABLE" : focus.loyalty > 20 ? "QUESTIONABLE" : "SUSPECT";
  const corruptionWord = focus.corruption > 60 ? "DEEPLY COMPROMISED" : focus.corruption > 30 ? "UNDER INVESTIGATION" : "CLEAN";

  const rivalInfo = focus.rivals.length > 0
    ? `KNOWN RIVALRIES: ${focus.rivals.length}.`
    : "KNOWN RIVALRIES: 0.";

  const traitLines = focus.traits.length > 0
    ? focus.traits.slice(0, 3).map(t => `• ${String(t)}`).join("\n")
    : "No notable traits on file.";

  const factionNote = focus.factionAffiliation
    ? `FACTION AFFILIATION: ${focus.factionAffiliation}.`
    : "FACTION AFFILIATION: NONE RECORDED.";

  const lines = [
    `OFFICER STATUS: ${focus.name.toUpperCase()}`,
    "",
    `─── OFFICER METRICS: ${focus.name.toUpperCase()} ───`,
    `POSITION: ${focus.position} | DEPARTMENT: ${focus.department}`,
    `RANK: ${focus.rank}`,
    "",
    `COMPETENCE: ${Math.round(focus.competence)} (${competenceWord})`,
    `LOYALTY: ${Math.round(focus.loyalty)} (${loyaltyWord})`,
    `AMBITION: ${Math.round(focus.ambition)} | CORRUPTION: ${Math.round(focus.corruption)} (${corruptionWord})`,
    `POPULARITY: ${Math.round(focus.popularity)} | FEAR FACTOR: ${Math.round(focus.fearFactor)}`,
    "",
    "─── TRAITS ───",
    traitLines,
    "",
    "─── AFFILIATIONS ───",
    factionNote,
    rivalInfo,
  ];

  return {
    id: `officer-update-${focus.id}-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}-${Date.now()}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "intel",
    title: `OFFICER CORPS: ${focus.name.toUpperCase()}`,
    body: lines.join("\n"),
    read: false,
    priority: focus.corruption > 60 || focus.loyalty < 20 ? "high" : "normal",
  };
}

function generateWastelandIntel(s: GameState): GameMessage | null {
  const discoveredLocations = s.discoveredLocationIds?.length ?? 0;
  const knownSettlements = s.townships?.length ?? 0;
  const activeExpeditions = (s.scavengeExpeditions ?? []).filter((e) => e.status === "active").length;
  const activeMining = (s.miningOperations ?? []).filter((o) => o.active).length;
  const highThreatFactions = s.factions.filter((f) => f.threat > 60).length;

  const lines = [
    `WASTELAND STATUS: ${discoveredLocations} LOCATIONS DISCOVERED`,
    "",
    "─── OPERATIONS ───",
    `KNOWN SETTLEMENTS: ${knownSettlements}`,
    `ACTIVE EXPEDITIONS: ${activeExpeditions}`,
    `ACTIVE MINING OPERATIONS: ${activeMining}`,
    "",
    "─── FACTION THREATS ───",
    `HIGH-THREAT FACTIONS: ${highThreatFactions}`,
  ];

  return {
    id: `wasteland-intel-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}-${Date.now()}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "intel",
    title: "WASTELAND INTELLIGENCE BRIEFING",
    body: lines.join("\n"),
    read: false,
    priority: "normal",
  };
}

// Months whose first day marks the start of a new meteorological season under
// getSeason: spring=3-5, summer=6-8, autumn=9-11, winter=12,1,2.
const SEASON_START_MONTHS: ReadonlySet<number> = new Set([3, 6, 9, 12]);
// One month before each season start; used to gate the next-season forecast
// dispatch (fires near the end of the current season's last month).
const SEASON_FORECAST_MONTHS: ReadonlySet<number> = new Set([2, 5, 8, 11]);

function zonesAtPeak(season: Season): WeatherZone[] {
  return WEATHER_ZONES.filter((z) => getZoneSeasonState(z, season) === "high");
}

function zonesGoingDormant(from: Season, to: Season): WeatherZone[] {
  return WEATHER_ZONES.filter(
    (z) => getZoneSeasonState(z, from) !== "dormant" && getZoneSeasonState(z, to) === "dormant",
  );
}

function zonesWaking(from: Season, to: Season): WeatherZone[] {
  return WEATHER_ZONES.filter(
    (z) => getZoneSeasonState(z, from) === "dormant" && getZoneSeasonState(z, to) !== "dormant",
  );
}

// Announcement when a new season begins: lists the zones currently at peak
// intensity ("high") so the marshal knows which corridors to avoid this
// quarter. Fires once per season-start (month 3/6/9/12, day 1, hour 6).
export function generateSeasonPeakAnnouncement(s: GameState): GameMessage | null {
  if (!s.gameDate) return null;
  const season = getSeason(s.gameDate.month);
  const peaks = zonesAtPeak(season);
  if (peaks.length === 0) return null;
  const peakLines = peaks.map((z) => `• ${z.label.toUpperCase()} — ${z.type.replace(/_/g, " ").toUpperCase()}`);
  const body = [
    `SEASON STATUS: ${getSeasonLabel(season).toUpperCase()}. PEAK HAZARD ZONES: ${peaks.length}.`,
    "",
    ...peakLines,
    "",
  ].join("\n");
  return {
    id: `season-peak-${season}-${s.gameDate.year}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "alert",
    title: `${getSeasonLabel(season)} PEAK — ${peaks.length} ZONE${peaks.length > 1 ? "S" : ""} AT HIGH INTENSITY`,
    body,
    read: false,
    priority: "high",
  };
}

// Forecast for the upcoming season, fired in the last month of the current
// season (month 2/5/8/11, day 25, hour 18) so the marshal has time to plan.
// Lists zones expected to peak, go dormant, or wake up next season.
export function generateSeasonForecast(s: GameState): GameMessage | null {
  if (!s.gameDate) return null;
  const cur = getSeason(s.gameDate.month);
  const nxt = nextSeason(cur);
  const peaks = zonesAtPeak(nxt);
  const dormant = zonesGoingDormant(cur, nxt);
  const waking = zonesWaking(cur, nxt);
  if (peaks.length === 0 && dormant.length === 0 && waking.length === 0) return null;
  const lines: string[] = [
    `NEXT SEASON: ${getSeasonLabel(nxt).toUpperCase()}.`,
    "",
  ];
  if (peaks.length > 0) {
    lines.push("─── EXPECTED PEAKS ───");
    for (const z of peaks) lines.push(`• ${z.label.toUpperCase()}`);
    lines.push("");
  }
  if (waking.length > 0) {
    lines.push("─── WAKING ───");
    for (const z of waking) lines.push(`• ${z.label.toUpperCase()} — DORMANT TO ACTIVE`);
    lines.push("");
  }
  if (dormant.length > 0) {
    lines.push("─── GOING QUIET ───");
    for (const z of dormant) lines.push(`• ${z.label.toUpperCase()} — ACTIVE TO DORMANT`);
    lines.push("");
  }
  return {
    id: `season-forecast-${nxt}-${s.gameDate.year}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "intel",
    title: `NEXT-SEASON FORECAST — ${getSeasonLabel(nxt)} APPROACHING`,
    body: lines.join("\n"),
    read: false,
    priority: "normal",
  };
}

export function generatePeriodicMessage(s: GameState): GameMessage | null {
  if (!s.gameDate) return null;

  const hour = s.gameDate.hour;
  const day = s.gameDate.day;
  const month = s.gameDate.month;

  // Seasonal dispatches — narrow windows so they fire at most once per
  // season per year. Checked first so they never lose a slot to an
  // unrelated periodic report.
  if (hour === 6 && day === 1 && SEASON_START_MONTHS.has(month)) {
    const m = generateSeasonPeakAnnouncement(s);
    if (m) return m;
  }
  if (hour === 18 && day === 25 && SEASON_FORECAST_MONTHS.has(month)) {
    const m = generateSeasonForecast(s);
    if (m) return m;
  }

  if (hour === 10 && day % 2 === 1) return generateEconomicDispatch(s);
  if (hour === 14 && day % 3 === 0) return generateDistrictSpotlight(s);
  if (hour === 16 && day % 2 === 0) return generateCrimeBlotter(s);
  if (hour === 12 && day % 3 === 1) return generateInfrastructureReport(s);
  if (hour === 18 && day % 4 === 0) return generatePopulationCensus(s);
  if (hour === 7 && day % 2 === 1) return generateWeatherAdvisory(s);
  if (hour === 20 && day % 3 === 2) return generateOfficerCorpsUpdate(s);
  if (hour === 22 && day % 3 === 0) return generateWastelandIntel(s);

  return null;
}

export function generateEnhancedAlert(s: GameState): GameMessage | null {
  const cs = s.cityStats;
  const r = s.resources;
  const alerts: string[] = [];

  if (cs.crime > 70) alerts.push(`CRIME INDEX: ${Math.round(cs.crime)}.`);
  if (cs.unrest > 70) alerts.push(`UNREST INDEX: ${Math.round(cs.unrest)}.`);
  if (cs.happiness < 25) alerts.push(`HAPPINESS INDEX: ${Math.round(cs.happiness)}.`);
  if (r.food <= 0) alerts.push(`FOOD RESERVES: ${r.food}.`);
  if (r.water <= 0) alerts.push(`WATER RESERVES: ${r.water}.`);
  if (r.credits < 2000) alerts.push(`TREASURY: ${r.credits} CR.`);
  if (cs.corruption > 75) alerts.push(`CORRUPTION INDEX: ${Math.round(cs.corruption)}.`);

  if (s.utilities) {
    if (s.utilities.wasteGenerated > s.utilities.wasteProcessed + 30)
      alerts.push(`WASTE PROCESSING: ${Math.round((s.utilities.wasteProcessed / Math.max(1, s.utilities.wasteGenerated)) * 100)}% capacity.`);
    if (s.utilities.transitLoad > s.utilities.transitCapacity)
      alerts.push(`TRANSIT LOAD: ${s.utilities.transitLoad}/${s.utilities.transitCapacity}.`);
    if (s.utilities.sanitationLevel < 35)
      alerts.push(`SANITATION LEVEL: ${s.utilities.sanitationLevel}%.`);
  }

  if (alerts.length === 0) return null;

  const severityWord = alerts.length >= 4 ? "CRITICAL" : alerts.length >= 2 ? "MULTIPLE" : "SECTOR";

  return {
    id: `alert-${s.gameDate.year}-${s.gameDate.month}-${s.gameDate.day}-${Date.now()}`,
    timestamp: { ...s.gameDate },
    tick: s.totalTicks,
    category: "alert",
    title: `${severityWord} ALERT — ${alerts.length} ISSUE${alerts.length > 1 ? "S" : ""} FLAGGED`,
    body: alerts.map((a) => `⚠ ${a}`).join("\n\n"),
    read: false,
    priority: alerts.length >= 3 ? "critical" : "high",
  };
}

