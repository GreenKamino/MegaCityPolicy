// Plain-text serializer for the tick-error modal's "Copy report" action.
//
// Produces a clipboard-friendly summary of an isolated tick failure so
// players can paste it straight into a bug report without screenshots.
// Sticks to ASCII for maximum paste fidelity and leads with a short save
// context header (city name / total ticks / save slot) followed by every
// subsystem that failed and its error message.

import type { TickSubsystemError } from "./formulas";

export type TickErrorReportInput = {
  tick: number;
  errors: TickSubsystemError[];
  cityName: string;
  totalTicks: number;
  saveSlot: number;
  // Optional: a capped, deduped sample of subsystem errors that were suppressed
  // from the bounded on-screen catch-up list. These aren't rendered in the
  // modal, but for a bug report the suppressed variants (e.g. a subsystem that
  // fails with an ever-changing message) are often the most useful signal, so
  // the export includes them. Omitted for the live-tick badge, which never
  // suppresses anything.
  suppressedErrors?: TickSubsystemError[];
  // Optional: total count of suppressed error occurrences. May exceed
  // suppressedErrors.length, which is a deduped, capped sample.
  suppressedCount?: number;
};

export function buildTickErrorReport(input: TickErrorReportInput): string {
  const { tick, errors, cityName, totalTicks, saveSlot, suppressedErrors, suppressedCount } = input;
  const lines: string[] = [];

  lines.push("MEGACITY TICK ERROR REPORT");
  lines.push(`Time: ${new Date().toISOString()}`);
  lines.push(`City: ${cityName || "MEGACITY"}`);
  lines.push(`Total Ticks: ${totalTicks}`);
  lines.push(`Save Slot: ${saveSlot}`);
  lines.push(`Failed Tick: ${tick}`);
  lines.push(`Subsystem Failures: ${errors.length}`);
  lines.push("");

  if (errors.length === 0) {
    lines.push("(no subsystem errors recorded)");
  } else {
    errors.forEach((e, i) => {
      lines.push(`${i + 1}. ${e.subsystem}`);
      lines.push(`   ${e.error || "unknown error"}`);
    });
  }

  // Suppressed-errors appendix. The on-screen list is intentionally bounded,
  // so this section carries the additional diagnostic detail that didn't fit.
  const sample = suppressedErrors ?? [];
  const totalSuppressed = suppressedCount ?? sample.length;
  if (totalSuppressed > 0) {
    lines.push("");
    lines.push(`Suppressed Errors (not shown on screen): ${totalSuppressed}`);
    if (sample.length > 0) {
      lines.push(
        sample.length < totalSuppressed
          ? `Sample of ${sample.length} suppressed:`
          : "Suppressed:",
      );
      sample.forEach((e, i) => {
        lines.push(`${i + 1}. ${e.subsystem}`);
        lines.push(`   ${e.error || "unknown error"}`);
      });
    }
  }

  return lines.join("\n");
}
