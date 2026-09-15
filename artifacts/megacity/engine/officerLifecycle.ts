import type {
  GameState,
  Officer,
  OfficerExitReason,
  OfficerTrait,
  GameMessage,
  CareerLogEntry,
} from "./types";
import { generateOfficer, OFFICER_POSITIONS } from "./officers";

const CAREER_LOG_CAP = 24;

function pushCareerLog(officer: Officer, entry: CareerLogEntry): void {
  const log = officer.careerLog ? [...officer.careerLog, entry] : [entry];
  if (log.length > CAREER_LOG_CAP) log.splice(0, log.length - CAREER_LOG_CAP);
  officer.careerLog = log;
}

function ensureTrait(officer: Officer, trait: OfficerTrait): boolean {
  const traits = officer.traits ?? [];
  if (traits.includes(trait)) return false;
  officer.traits = [...traits, trait];
  return true;
}

function dropTrait(officer: Officer, trait: OfficerTrait): boolean {
  const traits = officer.traits ?? [];
  if (!traits.includes(trait)) return false;
  officer.traits = traits.filter((t) => t !== trait);
  return true;
}

function retirementChance(age: number): number {
  if (age < 65) return 0;
  if (age >= 85) return 1;
  // 65 -> 0%, 70 -> ~12%, 75 -> ~30%, 80 -> ~55%, 85 -> 100%
  return Math.min(1, ((age - 65) / 20) ** 1.6);
}

function deathChance(age: number): number {
  if (age < 50) return 0.001;
  if (age < 60) return 0.004;
  if (age < 70) return 0.012;
  if (age < 80) return 0.035;
  if (age < 90) return 0.08;
  return 0.18;
}

function pickReplacementName(rng: () => number): { first: string; last: string } {
  const FIRST = ["Vex", "Korr", "Nia", "Sable", "Mira", "Joran", "Dax", "Eshe", "Talen", "Rin", "Cass", "Idris", "Lior", "Quill", "Renko", "Sasha", "Tov", "Yara", "Zev", "Halia"];
  const LAST = ["Drennan", "Voss", "Marek", "Calder", "Okafor", "Strazza", "Halberd", "Pell", "Roan", "Vance", "Solano", "Tarkov", "Wynn", "Brand", "Greer", "Hadj", "Ishmael", "Moreau", "Quan", "Velez"];
  return {
    first: FIRST[Math.floor(rng() * FIRST.length)],
    last: LAST[Math.floor(rng() * LAST.length)],
  };
}

function vacateAndReplace(
  state: GameState,
  officer: Officer,
  reason: OfficerExitReason,
  year: number,
): { exiting: Officer; replacement: Officer } {
  const exiting: Officer = {
    ...officer,
    appointed: false,
    appointmentMethod: null,
    exitYear: year,
    exitReason: reason,
  };
  const reasonText =
    reason === "died"
      ? `Died in office at age ${officer.age ?? "?"}.`
      : reason === "retired"
        ? `Retired after ${officer.yearsServed ?? 0} years of service.`
        : reason === "scandal"
          ? "Forced out by scandal."
          : "Dismissed.";
  pushCareerLog(exiting, { year, text: reasonText });

  const posDef = OFFICER_POSITIONS.find((p) => p.id === officer.id);
  if (!posDef) {
    return { exiting, replacement: exiting };
  }
  const seed = (year * 1000 + (officer.age ?? 50) * 13 + posDef.id.length * 31) % 2147483647;
  const fresh = generateOfficer(posDef, seed || 7919);
  return { exiting, replacement: fresh };
}

const OBIT_MESSAGES: Record<OfficerExitReason, (o: Officer) => string> = {
  retired: (o) =>
    `${o.position} ${o.name} retires after ${o.yearsServed ?? 0} years of service. The position is now vacant.`,
  died: (o) =>
    `${o.position} ${o.name} has died at age ${o.age ?? "?"}. The bureau marks an open seat.`,
  scandal: (o) =>
    `${o.position} ${o.name} forced out under a corruption cloud. Position vacant.`,
  dismissed: (o) =>
    `${o.position} ${o.name} dismissed. Position vacant pending appointment.`,
};

function pushObit(state: GameState, officer: Officer, reason: OfficerExitReason): void {
  if (!state.gameDate) return;
  const text = OBIT_MESSAGES[reason](officer);
  const msg: GameMessage = {
    id: `obit-${officer.id}-${state.gameDate.year}-${state.gameDate.month}-${state.gameDate.day}`,
    timestamp: { ...state.gameDate },
    tick: state.totalTicks ?? 0,
    category: "report",
    title: `Vacancy: ${officer.position}`,
    body: text,
    read: false,
    priority: "normal",
  };
  state.messages = [msg, ...(state.messages ?? [])].slice(0, 200);
}

const TRAIT_GRANT_LABELS: Record<string, { title: string; body: (o: Officer) => string }> = {
  seasoned: {
    title: "Officer Recognition: Seasoned",
    body: (o) =>
      `${o.position} ${o.name} has reached 5 years of service. Now classed as Seasoned — adds field experience to long-running operations.`,
  },
  tenured: {
    title: "Officer Recognition: Tenured",
    body: (o) =>
      `${o.position} ${o.name} crosses 15 years of service. Tenured status grants institutional weight and resistance to political churn.`,
  },
  loyal_lifer: {
    title: "Loyalty Recognized",
    body: (o) =>
      `${o.position} ${o.name} earns the Loyal Lifer designation. Years of high-loyalty service have made them a fixture of the regime.`,
  },
  embittered: {
    title: "Morale Warning",
    body: (o) =>
      `${o.position} ${o.name} has grown Embittered. Sustained low loyalty is now a permanent risk factor — watch for sabotage and leaks.`,
  },
};

function pushTraitGrantMessage(state: GameState, officer: Officer, trait: string): void {
  if (!state.gameDate) return;
  const def = TRAIT_GRANT_LABELS[trait];
  if (!def) return;
  const msg: GameMessage = {
    id: `trait-grant-${officer.id}-${trait}-${state.gameDate.year}`,
    timestamp: { ...state.gameDate },
    tick: state.totalTicks ?? 0,
    category: "report",
    title: def.title,
    body: def.body(officer),
    read: false,
    priority: trait === "embittered" ? "high" : "normal",
  };
  state.messages = [msg, ...(state.messages ?? [])].slice(0, 200);
}

/**
 * Year-rollover lifecycle pass. Mutates state in place. Safe to call once
 * per year boundary (newYear !== prevYear).
 */
export function processOfficerLifecycles(state: GameState, newYear: number): void {
  if (!Array.isArray(state.officers) || state.officers.length === 0) return;

  const updated: Officer[] = [];
  for (let i = 0; i < state.officers.length; i++) {
    const o = state.officers[i];
    const officer: Officer = { ...o };

    // Age everyone (whether appointed or not — vacant candidates exist).
    officer.age = (officer.age ?? 45) + 1;
    if (officer.appointed) {
      officer.yearsServed = (officer.yearsServed ?? 0) + 1;
    }

    // Lifecycle traits — only meaningful for appointed officers.
    if (officer.appointed) {
      const ys = officer.yearsServed ?? 0;
      if (ys >= 5 && ensureTrait(officer, "seasoned")) {
        pushCareerLog(officer, { year: newYear, text: "Earned trait: Seasoned (5 years)." });
        pushTraitGrantMessage(state, officer, "seasoned");
      }
      if (ys >= 15 && ensureTrait(officer, "tenured")) {
        pushCareerLog(officer, { year: newYear, text: "Earned trait: Tenured (15 years)." });
        pushTraitGrantMessage(state, officer, "tenured");
      }
      if (ys >= 3 && officer.loyalty >= 70 && ensureTrait(officer, "loyal_lifer")) {
        pushCareerLog(officer, { year: newYear, text: "Earned trait: Loyal Lifer." });
        pushTraitGrantMessage(state, officer, "loyal_lifer");
      }
      if (ys >= 2 && officer.loyalty < 30) {
        if (ensureTrait(officer, "embittered")) {
          pushCareerLog(officer, { year: newYear, text: "Earned trait: Embittered (loyalty collapsed)." });
          pushTraitGrantMessage(state, officer, "embittered");
        }
      } else if (officer.loyalty >= 50) {
        // Recover from embittered if loyalty recovers substantially.
        if (dropTrait(officer, "embittered")) {
          pushCareerLog(officer, { year: newYear, text: "Recovered from Embittered as loyalty rebuilt." });
        }
      }
    }

    // Exit checks only for appointed officers — bench candidates just age.
    // (Killing/replacing unappointed seats would emit confusing vacancy news
    //  for positions that were already vacant.)
    const age = officer.age;
    let exited = false;

    if (officer.appointed) {
      if (Math.random() < deathChance(age)) {
        const { exiting, replacement } = vacateAndReplace(state, officer, "died", newYear);
        pushObit(state, exiting, "died");
        updated.push(replacement);
        exited = true;
      } else if (Math.random() < retirementChance(age)) {
        const { exiting, replacement } = vacateAndReplace(state, officer, "retired", newYear);
        pushObit(state, exiting, "retired");
        updated.push(replacement);
        exited = true;
      }
    }

    if (!exited) updated.push(officer);
  }

  state.officers = updated;
}

/**
 * Called from appoint/dismiss handlers to keep careerLog and yearsServed
 * in sync. Pure helpers — no state mutation outside the returned officer.
 */
export function recordAppointment(officer: Officer, year: number, methodLabel: string): Officer {
  const next: Officer = {
    ...officer,
    appointedYear: year,
    yearsServed: 0,
  };
  pushCareerLog(next, { year, text: `Appointed (${methodLabel}).` });
  return next;
}

export function recordDismissal(officer: Officer, year: number): Officer {
  const next: Officer = {
    ...officer,
    exitYear: year,
    exitReason: "dismissed",
  };
  pushCareerLog(next, {
    year,
    text: `Dismissed after ${officer.yearsServed ?? 0} years of service.`,
  });
  return next;
}
