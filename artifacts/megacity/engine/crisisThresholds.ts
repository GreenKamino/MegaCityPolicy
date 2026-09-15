// Shared boundaries for the core city crisis triggers and their player-facing
// warning surfaces. Keep these in a leaf module so eventTriggers and breakdown
// cards can depend on the same values without creating an import cycle.

export const CRISIS_THRESHOLDS = {
  crime: {
    trigger: 60,
    critical: 80,
  },
  food: {
    trigger: 30,
    critical: 10,
  },
  power: {
    trigger: 20,
    critical: 5,
  },
  unrest: {
    trigger: 70,
    critical: 85,
  },
  diseaseRisk: {
    trigger: 60,
    critical: 80,
  },
  corruption: {
    trigger: 65,
    critical: 85,
  },
  infrastructureHealth: {
    trigger: 30,
    critical: 15,
  },
} as const;