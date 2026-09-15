import type { GameDate } from "./types";

export type Season = "spring" | "summer" | "autumn" | "winter";

export function getSeason(month: number): Season {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

export function nextSeason(season: Season): Season {
  switch (season) {
    case "spring": return "summer";
    case "summer": return "autumn";
    case "autumn": return "winter";
    case "winter": return "spring";
  }
}

export function getSeasonLabel(season: Season): string {
  const labels: Record<Season, string> = {
    spring: "SPRING",
    summer: "SUMMER",
    autumn: "AUTUMN",
    winter: "WINTER",
  };
  return labels[season];
}

export function getSeasonIcon(season: Season): string {
  const icons: Record<Season, string> = {
    spring: "\u{1F331}",
    summer: "\u{2600}\u{FE0F}",
    autumn: "\u{1F342}",
    winter: "\u{2744}\u{FE0F}",
  };
  return icons[season];
}

export type SeasonalModifiers = {
  foodProduction: number;
  waterProduction: number;
  powerDrain: number;
  happiness: number;
  diseaseRisk: number;
};

export function getSeasonalModifiers(season: Season): SeasonalModifiers {
  switch (season) {
    case "spring":
      return { foodProduction: 1.15, waterProduction: 1.1, powerDrain: 1.0, happiness: 2, diseaseRisk: 0 };
    case "summer":
      return { foodProduction: 1.0, waterProduction: 0.85, powerDrain: 1.15, happiness: -1, diseaseRisk: 1 };
    case "autumn":
      return { foodProduction: 1.2, waterProduction: 1.05, powerDrain: 1.05, happiness: 1, diseaseRisk: 0 };
    case "winter":
      return { foodProduction: 0.75, waterProduction: 0.9, powerDrain: 1.25, happiness: -2, diseaseRisk: 2 };
  }
}

export function getSeasonColor(season: Season): string {
  switch (season) {
    case "spring": return "#88CC44";
    case "summer": return "#FFAA00";
    case "autumn": return "#CC6600";
    case "winter": return "#6688CC";
  }
}

export type WeatherEffect = {
  happiness?: number;
  unrest?: number;
  crime?: number;
  diseaseRisk?: number;
  foodProduction?: number;
  powerDrain?: number;
  constructionSpeed?: number;
};

export const WEATHER_EFFECTS: Record<string, WeatherEffect> = {
  "Acid Rain": { happiness: -3, diseaseRisk: 2, foodProduction: -5 },
  "Smog Alert": { happiness: -2, diseaseRisk: 3, unrest: 1 },
  "Dust Storm": { happiness: -2, constructionSpeed: -20, unrest: 1 },
  "Electromagnetic Storm": { powerDrain: 15, crime: 2 },
  "Toxic Fog": { happiness: -4, diseaseRisk: 5, unrest: 2 },
  "Radiation Spike": { happiness: -3, diseaseRisk: 4, unrest: 2 },
  "Ash Fall": { happiness: -3, diseaseRisk: 2, foodProduction: -3 },
  "Chemical Haze": { happiness: -2, diseaseRisk: 3 },
  "Ion Storm": { powerDrain: 20, crime: 3, constructionSpeed: -10 },
  "Sewer Gas Surge": { happiness: -5, diseaseRisk: 4, unrest: 3 },
  "Black Rain": { happiness: -4, diseaseRisk: 3, foodProduction: -8 },
  "Solar Flare": { powerDrain: 25 },
  "Heatwave": { happiness: -2, unrest: 1, powerDrain: 10 },
  "Scorching": { happiness: -1, powerDrain: 5 },
  "Freezing": { happiness: -2, powerDrain: 10 },
  "Heavy Rain": { happiness: -1, crime: -1, constructionSpeed: -10 },
  "Sleet": { happiness: -1, constructionSpeed: -15 },
  "Cold Winds": { happiness: -1, powerDrain: 5 },
  "Humid": { happiness: -1, diseaseRisk: 1 },
  "Light Rain": { crime: -1 },
  "Drizzle": { crime: -1 },
  "Windy": { constructionSpeed: -5 },
  "Clear Skies": { happiness: 2, crime: -1 },
  "Sunny": { happiness: 2, foodProduction: 3, crime: -1 },
  "Calm": { happiness: 1, crime: -1 },
  "Clear & Cold": { happiness: 1, powerDrain: 3 },
  "Mild": { happiness: 2 },
  "Warm & Breezy": { happiness: 2, foodProduction: 1 },
  "Partly Cloudy": {},
  "Breezy": { constructionSpeed: 5 },
  "Overcast": {},
  "Grey Skies": { happiness: -1 },
  "Cloudy": {},
  "Nanite Swarm": { happiness: -4, diseaseRisk: 3, constructionSpeed: -25, crime: 2 },
  "Gravitational Anomaly": { happiness: -3, constructionSpeed: -30, unrest: 2 },
  "Plasma Rain": { happiness: -4, diseaseRisk: 2, foodProduction: -6, powerDrain: 15 },
  "Spore Bloom": { happiness: -3, diseaseRisk: 6, foodProduction: 3 },
  "Static Storm": { powerDrain: 30, crime: 3, constructionSpeed: -15 },
  "Thermal Inversion": { happiness: -2, diseaseRisk: 4, unrest: 1 },
  "Blood Mist": { happiness: -5, diseaseRisk: 4, unrest: 3, crime: 2 },
  "Aurora Toxica": { happiness: -1, diseaseRisk: 2, powerDrain: 10 },
  "Seismic Tremor": { happiness: -3, constructionSpeed: -20, unrest: 2 },
};

export type WeatherVisual = { icon: string; colorKey: "danger" | "warning" | "accent" | "info" | "muted" | "custom"; customColor?: string };

const WEATHER_VISUALS: Record<string, WeatherVisual> = {
  "Acid Rain": { icon: "☢", colorKey: "danger" },
  "Smog Alert": { icon: "🌫", colorKey: "custom", customColor: "#999" },
  "Dust Storm": { icon: "🌪", colorKey: "warning" },
  "Electromagnetic Storm": { icon: "⛈", colorKey: "warning" },
  "Toxic Fog": { icon: "🌫", colorKey: "danger" },
  "Radiation Spike": { icon: "☢", colorKey: "danger" },
  "Ash Fall": { icon: "🌫", colorKey: "muted" },
  "Chemical Haze": { icon: "🌫", colorKey: "danger" },
  "Ion Storm": { icon: "⛈", colorKey: "warning" },
  "Sewer Gas Surge": { icon: "🌫", colorKey: "danger" },
  "Black Rain": { icon: "🌧", colorKey: "danger" },
  "Solar Flare": { icon: "☀", colorKey: "warning" },
  "Heatwave": { icon: "🔥", colorKey: "custom", customColor: "#FF6B35" },
  "Scorching": { icon: "☀", colorKey: "custom", customColor: "#FF6B35" },
  "Freezing": { icon: "❄", colorKey: "custom", customColor: "#87CEEB" },
  "Heavy Rain": { icon: "🌧", colorKey: "muted" },
  "Sleet": { icon: "🌧", colorKey: "custom", customColor: "#87CEEB" },
  "Cold Winds": { icon: "❄", colorKey: "custom", customColor: "#87CEEB" },
  "Humid": { icon: "🔥", colorKey: "muted" },
  "Light Rain": { icon: "🌧", colorKey: "muted" },
  "Drizzle": { icon: "🌧", colorKey: "muted" },
  "Windy": { icon: "💨", colorKey: "muted" },
  "Clear Skies": { icon: "☀", colorKey: "accent" },
  "Sunny": { icon: "☀", colorKey: "accent" },
  "Calm": { icon: "🌤", colorKey: "accent" },
  "Clear & Cold": { icon: "❄", colorKey: "custom", customColor: "#87CEEB" },
  "Mild": { icon: "🌤", colorKey: "accent" },
  "Warm & Breezy": { icon: "🌤", colorKey: "accent" },
  "Partly Cloudy": { icon: "☁", colorKey: "muted" },
  "Breezy": { icon: "💨", colorKey: "muted" },
  "Overcast": { icon: "☁", colorKey: "muted" },
  "Grey Skies": { icon: "☁", colorKey: "muted" },
  "Cloudy": { icon: "☁", colorKey: "muted" },
  "Nanite Swarm": { icon: "⚠", colorKey: "danger" },
  "Gravitational Anomaly": { icon: "⚠", colorKey: "danger" },
  "Plasma Rain": { icon: "🌧", colorKey: "danger" },
  "Spore Bloom": { icon: "🍄", colorKey: "warning" },
  "Static Storm": { icon: "⛈", colorKey: "warning" },
  "Thermal Inversion": { icon: "🔥", colorKey: "warning" },
  "Blood Mist": { icon: "🌫", colorKey: "danger" },
  "Aurora Toxica": { icon: "✨", colorKey: "warning" },
  "Seismic Tremor": { icon: "🌪", colorKey: "warning" },
};

export function getWeatherVisual(weather: string): WeatherVisual {
  return WEATHER_VISUALS[weather] ?? { icon: "🌤", colorKey: "muted" };
}

export function generateWeather(date: GameDate): string {
  const seed = date.year * 10000 + date.month * 100 + date.day;
  const hash = ((seed * 2654435761) >>> 0) % 1000;
  const month = date.month;

  const isSummer = month >= 5 && month <= 8;
  const isWinter = month <= 2 || month === 12;
  const isSpring = month >= 3 && month <= 4;

  if (hash < 25) return "Acid Rain";
  if (hash < 45) return "Smog Alert";
  if (hash < 65) return "Dust Storm";
  if (hash < 80) return "Electromagnetic Storm";
  if (hash < 95) return "Toxic Fog";
  if (hash < 105) return "Radiation Spike";
  if (hash < 120) return "Ash Fall";
  if (hash < 132) return "Chemical Haze";
  if (hash < 142) return "Ion Storm";
  if (hash < 150) return "Sewer Gas Surge";
  if (hash < 155) return "Black Rain";
  if (hash < 160) return "Solar Flare";
  if (hash < 165) return "Nanite Swarm";
  if (hash < 169) return "Gravitational Anomaly";
  if (hash < 178) return "Plasma Rain";
  if (hash < 183) return "Spore Bloom";
  if (hash < 187) return "Static Storm";
  if (hash < 191) return "Thermal Inversion";
  if (hash < 194) return "Blood Mist";
  if (hash < 198) return "Aurora Toxica";
  if (hash < 201) return "Seismic Tremor";

  if (isWinter) {
    if (hash < 260) return "Freezing";
    if (hash < 360) return "Heavy Rain";
    if (hash < 430) return "Sleet";
    if (hash < 530) return "Cold Winds";
    if (hash < 630) return "Grey Skies";
    if (hash < 730) return "Overcast";
    if (hash < 800) return "Cloudy";
    return "Clear & Cold";
  }

  if (isSummer) {
    if (hash < 260) return "Heatwave";
    if (hash < 360) return "Scorching";
    if (hash < 460) return "Humid";
    if (hash < 560) return "Sunny";
    if (hash < 660) return "Clear Skies";
    if (hash < 760) return "Warm & Breezy";
    if (hash < 860) return "Partly Cloudy";
    return "Calm";
  }

  if (isSpring) {
    if (hash < 260) return "Light Rain";
    if (hash < 410) return "Breezy";
    if (hash < 560) return "Mild";
    if (hash < 710) return "Partly Cloudy";
    if (hash < 860) return "Calm";
    return "Clear Skies";
  }

  if (hash < 260) return "Drizzle";
  if (hash < 410) return "Windy";
  if (hash < 560) return "Overcast";
  if (hash < 710) return "Calm";
  if (hash < 860) return "Clear Skies";
  return "Mild";
}
