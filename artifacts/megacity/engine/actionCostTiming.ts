import type { EdictDef } from "@/engine/edicts";
import type { PolicyDef } from "@/engine/policies";
import type { PoliticalDecreeDef } from "@/engine/politicsData";
import type { ActiveEdict } from "@/engine/types";

type TimedActionDefinition = {
  cost: number;
  duration: number;
};

type TimedActionState = {
  activeTicksRemaining?: number;
  currentTick?: number;
  availableCredits?: number;
  phase?: ActionTimingPhase;
};

export type ActionDurationKind =
  | "instant"
  | "timed"
  | "toggleable"
  | "indefinite"
  | "permanent";

export type ActionCooldownStart =
  | "activation"
  | "expiry"
  | "deactivation"
  | "not-applicable";

export type ActionCancellationBehavior =
  | "unavailable"
  | "stops-future-costs"
  | "changes-setting"
  | "renunciation-required"
  | "refunds-remaining-cost";

export type ActionTimingPhase = "available" | "active" | "cooldown";
export type ActionActivationFundsRule =
  | "requires-upfront-cost"
  | "charges-up-to-available"
  | "no-upfront-cost";
export type ActionRunningFundsRule =
  | "continues-while-active"
  | "stops-when-unaffordable"
  | "not-applicable";

export type ActionCostTimingInput = {
  kind?: ActionDurationKind;
  upfrontCostCredits?: number;
  /** Non-credit resources committed at activation, keyed by save-field name. */
  resourceCosts?: Record<string, number>;
  /** Optional live balances used to mark a preview unaffordable. */
  availableResources?: Record<string, number>;
  /** Signed treasury delta: negative is a cost, positive is income. */
  recurringCreditsPerTick?: number;
  durationTicks?: number;
  cooldownTicks?: number;
  cooldownStarts?: ActionCooldownStart;
  cancellation?: ActionCancellationBehavior;
  activeTicksRemaining?: number;
  currentTick?: number;
  cooldownUntilTick?: number;
  availableCredits?: number;
  activationFundsRule?: ActionActivationFundsRule;
  runningFundsRule?: ActionRunningFundsRule;
  phase?: ActionTimingPhase;
};

export type ActionCostTiming = {
  kind: ActionDurationKind;
  upfrontCostCredits: number;
  resourceCosts: Array<{ resource: string; amount: number }>;
  resourceShortfalls: Array<{ resource: string; amount: number }>;
  resourcesAffordable: boolean | null;
  recurringCreditsPerTick: number;
  runningCostPerTickCredits: number;
  runningIncomePerTickCredits: number;
  durationTicks: number | null;
  activeTicksRemaining: number | null;
  maximumTotalCostCredits: number | null;
  remainingMaximumCostCredits: number | null;
  cooldownTicks: number;
  cooldownStarts: ActionCooldownStart;
  cooldownRemainingTicks: number;
  cancellation: ActionCancellationBehavior;
  phase: ActionTimingPhase;
  activationAffordable: boolean | null;
  upfrontShortfallCredits: number;
  activationFundsRule: ActionActivationFundsRule;
  runningFundsRule: ActionRunningFundsRule;
};

export type ActionCostTimingRow = {
  key: string;
  /** Canonical rows use stable keys; resource rows use resource-cost-<name>. */
  label: string;
  value: string;
};

export const ACTION_COST_TERMINOLOGY = {
  upfrontCost: "UPFRONT COST",
  runningCost: "RUNNING COST",
  activeFor: "ACTIVE FOR",
  maximumTotalCost: "MAXIMUM TOTAL COST",
  cooldown: "COOLDOWN",
} as const;

export const ACTION_COST_PLAYER_GUIDE =
  "UPFRONT COST is charged when you confirm. RUNNING COST is charged once per active tick. ACTIVE FOR is the effect or work duration. MAXIMUM TOTAL COST is the most credits a fixed-duration action can consume. COOLDOWN is separate from active time; its row states when the cooldown begins.";

const wholeNonNegative = (value: number | undefined): number =>
  Number.isFinite(value) ? Math.max(0, Math.trunc(value!)) : 0;

const finiteNumber = (value: number | undefined): number =>
  Number.isFinite(value) ? value! : 0;

const normalizeResourceCosts = (
  costs: Record<string, number> | undefined,
): Array<{ resource: string; amount: number }> =>
  Object.entries(costs ?? {})
    .map(([resource, amount]) => ({ resource, amount: wholeNonNegative(amount) }))
    .filter(({ amount }) => amount > 0);

const resourceLabel = (resource: string): string =>
  resource.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toUpperCase();

export function normalizeActionCostTiming(input: ActionCostTimingInput): ActionCostTiming {
  const durationTicks = input.durationTicks === undefined
    ? null
    : wholeNonNegative(input.durationTicks);
  const kind = input.kind ?? (durationTicks === null ? "instant" : "timed");
  const upfrontCostCredits = wholeNonNegative(input.upfrontCostCredits);
  const resourceCosts = normalizeResourceCosts(input.resourceCosts);
  const resourceShortfalls = input.availableResources === undefined
    ? []
    : resourceCosts
      .map(({ resource, amount }) => ({
        resource,
        amount: Math.max(0, amount - finiteNumber(input.availableResources?.[resource])),
      }))
      .filter(({ amount }) => amount > 0);
  const resourcesAffordable = input.availableResources === undefined
    ? (resourceCosts.length > 0 ? null : true)
    : resourceShortfalls.length === 0;
  const recurringCreditsPerTick = finiteNumber(input.recurringCreditsPerTick);
  const runningCostPerTickCredits = Math.max(0, -recurringCreditsPerTick);
  const runningIncomePerTickCredits = Math.max(0, recurringCreditsPerTick);
  const finiteDuration = kind === "timed" ? durationTicks ?? 0 : null;
  const activeTicksRemaining = input.activeTicksRemaining === undefined
    ? null
    : wholeNonNegative(input.activeTicksRemaining);
  const maximumTotalCostCredits = finiteDuration === null && runningCostPerTickCredits > 0
    ? null
    : upfrontCostCredits + runningCostPerTickCredits * (finiteDuration ?? 0);
  const remainingMaximumCostCredits = activeTicksRemaining === null && runningCostPerTickCredits > 0
    ? null
    : runningCostPerTickCredits * (activeTicksRemaining ?? 0);
  const cooldownTicks = wholeNonNegative(input.cooldownTicks);
  const cooldownStarts = cooldownTicks === 0
    ? "not-applicable"
    : input.cooldownStarts ?? (kind === "timed" ? "expiry" : "activation");
  const currentTick = wholeNonNegative(input.currentTick);
  const cooldownUntilTick = wholeNonNegative(input.cooldownUntilTick);
  const cooldownRemainingTicks = activeTicksRemaining === null
    ? Math.max(0, cooldownUntilTick - currentTick)
    : 0;
  const phase: ActionTimingPhase = input.phase ?? (
    activeTicksRemaining !== null
      ? "active"
      : cooldownRemainingTicks > 0
        ? "cooldown"
        : "available"
  );
  const availableCredits = Number.isFinite(input.availableCredits)
    ? input.availableCredits!
    : null;
  const activationFundsRule = input.activationFundsRule ??
    (upfrontCostCredits > 0 ? "requires-upfront-cost" : "no-upfront-cost");
  const activationAffordable = availableCredits === null
    ? (input.availableResources === undefined ? null : resourcesAffordable)
    : (activationFundsRule === "charges-up-to-available" || availableCredits >= upfrontCostCredits)
      && resourcesAffordable !== false;

  return {
    kind,
    upfrontCostCredits,
    resourceCosts,
    resourceShortfalls,
    resourcesAffordable,
    recurringCreditsPerTick,
    runningCostPerTickCredits,
    runningIncomePerTickCredits,
    durationTicks: finiteDuration,
    activeTicksRemaining,
    maximumTotalCostCredits,
    remainingMaximumCostCredits,
    cooldownTicks,
    cooldownStarts,
    cooldownRemainingTicks,
    cancellation: input.cancellation ?? "unavailable",
    phase,
    activationAffordable,
    upfrontShortfallCredits: availableCredits === null || activationFundsRule === "charges-up-to-available"
      ? 0
      : Math.max(0, upfrontCostCredits - availableCredits),
    activationFundsRule,
    runningFundsRule: input.runningFundsRule ??
      (recurringCreditsPerTick < 0 ? "continues-while-active" : "not-applicable"),
  };
}

export type EdictCostTimingState = {
  active?: Pick<ActiveEdict, "ticksRemaining">;
  cooldownUntilTick?: number;
  currentTick?: number;
  availableCredits?: number;
};

export function getEdictCostTiming(
  edict: Pick<EdictDef, "cost" | "durationTicks" | "cooldownTicks" | "effects">,
  state: EdictCostTimingState = {},
): ActionCostTiming {
  const recurringCreditsPerTick =
    finiteNumber(edict.effects?.credits) +
    finiteNumber(edict.effects?.creditsPerTick) +
    finiteNumber(edict.effects?.tradeIncome);
  return normalizeActionCostTiming({
    kind: "timed",
    upfrontCostCredits: edict.cost,
    recurringCreditsPerTick,
    durationTicks: edict.durationTicks,
    activeTicksRemaining: state.active?.ticksRemaining,
    cooldownTicks: edict.cooldownTicks,
    cooldownStarts: "expiry",
    cooldownUntilTick: state.cooldownUntilTick,
    currentTick: state.currentTick,
    availableCredits: state.availableCredits,
    cancellation: "unavailable",
    runningFundsRule: recurringCreditsPerTick < 0
      ? "continues-while-active"
      : "not-applicable",
  });
}

export type PolicyCostTimingState = {
  active?: boolean;
  cancellation?: ActionCancellationBehavior;
};

export function getPolicyCostTiming(
  policy: Pick<PolicyDef, "costPerTick">,
  state: PolicyCostTimingState = {},
): ActionCostTiming {
  return normalizeActionCostTiming({
    kind: "toggleable",
    recurringCreditsPerTick: -policy.costPerTick,
    cooldownStarts: "not-applicable",
    cancellation: state.cancellation ?? "stops-future-costs",
    phase: state.active ? "active" : "available",
    runningFundsRule: policy.costPerTick > 0
      ? "continues-while-active"
      : "not-applicable",
  });
}

export type DecreeCostTimingState = {
  cooldownUntilTick?: number;
  currentTick?: number;
  availableCredits?: number;
};

export function getDecreeCostTiming(
  decree: Pick<PoliticalDecreeDef, "cost" | "cooldownTicks">,
  state: DecreeCostTimingState = {},
): ActionCostTiming {
  return normalizeActionCostTiming({
    kind: "instant",
    upfrontCostCredits: decree.cost,
    cooldownTicks: decree.cooldownTicks,
    cooldownStarts: "activation",
    cooldownUntilTick: state.cooldownUntilTick,
    currentTick: state.currentTick,
    availableCredits: state.availableCredits,
    cancellation: "unavailable",
    runningFundsRule: "not-applicable",
  });
}

/**
 * Shared adapter for operational actions that charge once and resolve after a
 * fixed number of ticks. Domain screens should use this instead of rebuilding
 * cost/duration/remaining-time text locally.
 */
export function getTimedActionCostTiming(
  definition: TimedActionDefinition,
  state: TimedActionState = {},
): ActionCostTiming {
  return normalizeActionCostTiming({
    kind: "timed",
    upfrontCostCredits: definition.cost,
    durationTicks: definition.duration,
    activeTicksRemaining: state.activeTicksRemaining,
    currentTick: state.currentTick,
    availableCredits: state.availableCredits,
    phase: state.phase,
    cooldownStarts: "expiry",
    cancellation: "unavailable",
    runningFundsRule: "not-applicable",
  });
}

const credits = (value: number): string => `${value.toLocaleString()} cr`;

const cooldownStartLabel: Record<ActionCooldownStart, string> = {
  activation: "from activation",
  expiry: "after expiry",
  deactivation: "after deactivation",
  "not-applicable": "",
};

export function formatActionCostTiming(model: ActionCostTiming): ActionCostTimingRow[] {
  const rows: ActionCostTimingRow[] = [];
  rows.push({ key: "phase", label: "STATUS", value: model.phase.toUpperCase() });
  rows.push({
    key: "upfront-cost",
    label: ACTION_COST_TERMINOLOGY.upfrontCost,
    value: model.upfrontCostCredits > 0 ? credits(model.upfrontCostCredits) : "None",
  });
  for (const cost of model.resourceCosts) {
    rows.push({
      key: `resource-cost-${cost.resource}`,
      label: `${resourceLabel(cost.resource)} COST`,
      value: `${cost.amount.toLocaleString()} ${resourceLabel(cost.resource).toLowerCase()}`,
    });
  }
  if (model.runningCostPerTickCredits > 0) {
    rows.push({ key: "running-cost", label: ACTION_COST_TERMINOLOGY.runningCost, value: `${credits(model.runningCostPerTickCredits)} per tick` });
  }
  if (model.runningIncomePerTickCredits > 0) {
    rows.push({ key: "running-income", label: "RUNNING INCOME", value: `${credits(model.runningIncomePerTickCredits)} per tick` });
  }
  if (model.kind === "timed" && model.durationTicks !== null) {
    rows.push({ key: "duration", label: ACTION_COST_TERMINOLOGY.activeFor, value: `${model.durationTicks} ticks` });
  } else if (model.kind === "instant") {
    rows.push({ key: "duration", label: "EFFECT TIMING", value: "Immediate" });
  } else if (model.kind === "toggleable") {
    rows.push({ key: "duration", label: ACTION_COST_TERMINOLOGY.activeFor, value: "Until deactivated" });
  } else if (model.kind === "indefinite") {
    rows.push({ key: "duration", label: ACTION_COST_TERMINOLOGY.activeFor, value: "Indefinitely" });
  } else if (model.kind === "permanent") {
    rows.push({ key: "duration", label: "EFFECT", value: "Permanent" });
  }
  if (model.phase === "active" && model.activeTicksRemaining !== null) {
    rows.push({ key: "active-remaining", label: "ACTIVE TIME REMAINING", value: `${model.activeTicksRemaining} ticks` });
  }
  if (model.phase === "active") {
    rows.push({
      key: "next-tick-charge",
      label: "NEXT-TICK CHARGE",
      value: model.runningCostPerTickCredits > 0 ? credits(model.runningCostPerTickCredits) : "None",
    });
  }
  if (model.maximumTotalCostCredits !== null) {
    rows.push({
      key: "maximum-cost",
      label: ACTION_COST_TERMINOLOGY.maximumTotalCost,
      value: model.maximumTotalCostCredits > 0 ? credits(model.maximumTotalCostCredits) : "None",
    });
  } else if (model.runningCostPerTickCredits > 0) {
    rows.push({ key: "maximum-cost", label: ACTION_COST_TERMINOLOGY.maximumTotalCost, value: "No fixed maximum" });
  }
  if (
    model.activeTicksRemaining !== null &&
    model.runningCostPerTickCredits > 0 &&
    model.remainingMaximumCostCredits !== null
  ) {
    rows.push({ key: "remaining-cost", label: "REMAINING MAXIMUM COST", value: credits(model.remainingMaximumCostCredits) });
  }
  if (model.cooldownTicks > 0) {
    rows.push({
      key: "cooldown",
      label: ACTION_COST_TERMINOLOGY.cooldown,
      value: `${model.cooldownTicks} ticks ${cooldownStartLabel[model.cooldownStarts]}`.trim(),
    });
  }
  if (model.phase === "cooldown") {
    rows.push({
      key: "cooldown-remaining",
      label: "COOLDOWN REMAINING",
      value: `${model.cooldownRemainingTicks} ticks`,
    });
  }
  if (model.activationAffordable === false) {
    const resourceShortfall = model.resourceShortfalls
      .map(({ resource, amount }) => `${amount.toLocaleString()} ${resourceLabel(resource).toLowerCase()}`)
      .join(", ");
    rows.push({
      key: "affordability",
      label: "CANNOT ACTIVATE",
      value: [
        model.upfrontShortfallCredits > 0 ? `${credits(model.upfrontShortfallCredits)} short` : "",
        resourceShortfall ? `${resourceShortfall} short` : "",
      ].filter(Boolean).join("; "),
    });
  }
  if (model.activationFundsRule === "charges-up-to-available") {
    rows.push({
      key: "insufficient-funds",
      label: "IF FUNDS RUN SHORT",
      value: "Spends the available treasury and still completes",
    });
  }
  if (model.runningFundsRule === "continues-while-active") {
    rows.push({
      key: "insufficient-funds",
      label: "IF FUNDS RUN SHORT",
      value: "Running cost continues while active",
    });
  } else if (model.runningFundsRule === "stops-when-unaffordable") {
    rows.push({
      key: "insufficient-funds",
      label: "IF FUNDS RUN SHORT",
      value: "Action stops when the running cost cannot be paid",
    });
  }
  if (model.cancellation === "stops-future-costs") {
    rows.push({ key: "cancellation", label: "CANCELLATION", value: "Deactivate any time; future costs and effects stop" });
  } else if (model.cancellation === "changes-setting") {
    rows.push({ key: "cancellation", label: "CANCELLATION", value: "Choose another setting at any time" });
  } else if (model.cancellation === "renunciation-required") {
    rows.push({ key: "cancellation", label: "CANCELLATION", value: "Requires paid renunciation" });
  } else if (model.cancellation === "refunds-remaining-cost") {
    rows.push({ key: "cancellation", label: "CANCELLATION", value: "Refunds remaining running cost" });
  } else if (model.kind === "timed" || model.kind === "permanent") {
    rows.push({ key: "cancellation", label: "CANCELLATION", value: "Cannot be cancelled" });
  }
  return rows;
}

export function formatActionCostTimingSummary(model: ActionCostTiming): string {
  return formatActionCostTiming(model)
    .map((row) => `${row.label}: ${row.value}`)
    .join("\n");
}
