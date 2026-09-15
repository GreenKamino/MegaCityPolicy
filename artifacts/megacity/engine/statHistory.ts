import type { GameState } from "@/engine/types";

export type StatSnapshot = {
  tick: number;
  population: number;
  credits: number;
  happiness: number;
  crime: number;
  unrest: number;
  employment: number;
  health: number;
  lawOrder: number;
  corruption: number;
  defenseRating: number;
  infrastructureHealth: number;
  food: number;
  water: number;
  power: number;
};

const MAX_HISTORY = 120;
const SNAPSHOT_INTERVAL = 4;

export function shouldSnapshot(tick: number): boolean {
  return tick > 0 && tick % SNAPSHOT_INTERVAL === 0;
}

export function takeSnapshot(s: GameState): StatSnapshot {
  return {
    tick: s.totalTicks,
    population: s.cityStats.population,
    credits: s.resources.credits,
    happiness: s.cityStats.happiness,
    crime: s.cityStats.crime,
    unrest: s.cityStats.unrest,
    employment: s.cityStats.employment,
    health: s.cityStats.publicHealth ?? 50,
    lawOrder: s.cityStats.lawOrder,
    corruption: s.cityStats.corruption,
    defenseRating: s.cityStats.defenseRating,
    infrastructureHealth: s.cityStats.infrastructureHealth,
    food: s.resources.food,
    water: s.resources.water,
    power: s.resources.power,
  };
}

export function processStatHistory(s: GameState): void {
  if (!shouldSnapshot(s.totalTicks)) return;
  const snap = takeSnapshot(s);
  const history = s.statHistory ? [...s.statHistory] : [];
  history.push(snap);
  while (history.length > MAX_HISTORY) history.shift();
  s.statHistory = history;
}
