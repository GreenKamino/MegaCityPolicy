import type { GameDate, GameState } from "@/engine/types";

export const LABOUR_DAY_BOOSTER_IDS = [
  "labour_day_paid_leave",
  "labour_day_public_works",
  "labour_day_production_push",
] as const;

export type LabourDayBoosterId = (typeof LABOUR_DAY_BOOSTER_IDS)[number];
export type LabourDayObservance = "international" | "us";

export type LabourDayDateMatch = {
  observance: LabourDayObservance;
  label: string;
  eventId: string;
};

export function isLabourDayBoosterId(id: string): id is LabourDayBoosterId {
  return (LABOUR_DAY_BOOSTER_IDS as readonly string[]).includes(id);
}

export function getLabourDayBoosterDuration(id: LabourDayBoosterId): number {
  switch (id) {
    case "labour_day_paid_leave":
      return 8;
    case "labour_day_public_works":
      return 8;
    case "labour_day_production_push":
      return 8;
  }
}

function firstMondayOfSeptember(year: number): number {
  const weekday = new Date(Date.UTC(year, 8, 1)).getUTCDay();
  return 1 + ((8 - weekday) % 7);
}

export function getLabourDayDateMatch(date: GameDate): LabourDayDateMatch | null {
  if (date.month === 5 && date.day === 1) {
    return {
      observance: "international",
      label: "MAY 1 INTERNATIONAL LABOUR DAY",
      eventId: `labour_day_international_${date.year}`,
    };
  }
  if (date.month === 9 && date.day === firstMondayOfSeptember(date.year)) {
    return {
      observance: "us",
      label: "SEPTEMBER LABOUR DAY",
      eventId: `labour_day_us_${date.year}`,
    };
  }
  return null;
}

export function activateLabourDayBooster(
  state: GameState,
  boosterId: LabourDayBoosterId,
): GameState {
  const activeEdicts = (state.activeEdicts ?? []).filter(
    (edict) => edict.edictId !== boosterId,
  );
  return {
    ...state,
    activeEdicts: [
      ...activeEdicts,
      {
        edictId: boosterId,
        ticksRemaining: getLabourDayBoosterDuration(boosterId),
        issuedAtTick: state.totalTicks,
        cooldownUntilTick: state.totalTicks + getLabourDayBoosterDuration(boosterId),
      },
    ],
  };
}

export function getActiveLabourDayBooster(state: GameState) {
  return (state.activeEdicts ?? []).find((edict) =>
    isLabourDayBoosterId(edict.edictId),
  );
}