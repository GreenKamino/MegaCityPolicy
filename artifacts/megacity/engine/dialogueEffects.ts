import type { GameState } from "./types";

/**
 * Effects shared by command, officer, and retinue choices. Target-specific
 * values (officer/bodyguard loyalty, competence, combat, and XP) stay in the
 * caller because each target lives in a different state collection.
 */
export type DialogueEffectValues = Partial<{
  loyalty: number;
  competence: number;
  combat: number;
  xp: number;
  credits: number;
  unrest: number;
  corruption: number;
  happiness: number;
  lawOrder: number;
  defenseRating: number;
  research: number;
}>;

/**
 * Apply every city-wide/resource effect from a dialogue choice. Keeping this
 * in one pure helper prevents previews from advertising keys that a reducer
 * silently drops. Research is a progress grant, so it cannot exceed the
 * current research target.
 */
export function applyDialogueCityEffects(
  state: GameState,
  effects: DialogueEffectValues,
): GameState {
  return {
    ...state,
    resources: {
      ...state.resources,
      credits: state.resources.credits + (effects.credits ?? 0),
    },
    cityStats: {
      ...state.cityStats,
      unrest: state.cityStats.unrest + (effects.unrest ?? 0),
      corruption: state.cityStats.corruption + (effects.corruption ?? 0),
      happiness: state.cityStats.happiness + (effects.happiness ?? 0),
      lawOrder: state.cityStats.lawOrder + (effects.lawOrder ?? 0),
      defenseRating: state.cityStats.defenseRating + (effects.defenseRating ?? 0),
      researchProgress: Math.max(
        0,
        Math.min(
          state.cityStats.researchTarget,
          state.cityStats.researchProgress + (effects.research ?? 0),
        ),
      ),
    },
  };
}