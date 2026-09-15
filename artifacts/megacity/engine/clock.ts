import type { GameDate } from "@/engine/types";

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_NAMES = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

export function advanceHour(date: GameDate): GameDate {
  let { year, month, day, hour } = date;
  hour += 6;
  if (hour >= 24) {
    hour = 0;
    day += 1;
    const maxDays = DAYS_IN_MONTH[(month - 1) % 12];
    if (day > maxDays) {
      day = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }
  return { year, month, day, hour };
}

export function formatDate(date: GameDate): string {
  const mo = MONTH_NAMES[(date.month - 1) % 12];
  const d = String(date.day).padStart(2, "0");
  const h = String(date.hour).padStart(2, "0");
  return `${date.year} ${mo} ${d} — ${h}:00`;
}

export function formatDateShort(date: GameDate): string {
  const mo = MONTH_NAMES[(date.month - 1) % 12];
  return `${mo} ${date.day}, ${date.year}`;
}

export function isDayStart(date: GameDate): boolean {
  return date.hour === 0;
}
