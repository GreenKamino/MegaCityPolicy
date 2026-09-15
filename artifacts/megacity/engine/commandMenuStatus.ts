import type { GameState } from "@/engine/types";
import { isClaimAvailable, todayKey } from "@/engine/dailyStreak";
import { isComplete as isWeeklyComplete } from "@/engine/weeklyChallenges";

export type CommandMenuStatusTone = "critical" | "unread" | "pending" | "ready";

export type CommandMenuStatus = {
  tone: CommandMenuStatusTone;
  label: string;
  count: number;
};

export type CommandMenuStatusMap = Partial<Record<string, CommandMenuStatus>>;

function status(
  tone: CommandMenuStatusTone,
  label: string,
  count: number,
): CommandMenuStatus {
  return { tone, label, count };
}

/**
 * The status source for command-menu surfaces. Keep counts here rather than
 * re-deriving them in each navigation surface, so More, the quick bar, and
 * the future command palette cannot drift apart.
 */
export function getCommandMenuStatuses(
  state: GameState,
  today: string = todayKey(),
): CommandMenuStatusMap {
  const messages = state.messages ?? [];
  const unread = messages.filter((message) => !message.read).length;
  const criticalUnread = messages.filter(
    (message) => !message.read && message.priority === "critical",
  ).length;

  const activeEvents = (state.activeEvents ?? []).filter((event) => !event.resolved);
  const criticalEvents = activeEvents.filter((event) => event.severity === "critical").length;
  const activeMissions = (state.activeMissions ?? []).filter((mission) => !mission.resolved).length;
  const completedMissions = (state.activeMissions ?? []).filter((mission) => mission.resolved).length;
  const vacancies = (state.officers ?? []).filter((officer) => !officer.appointed).length;
  const criticalFactions = (state.factions ?? []).filter((faction) => faction.threat > 60).length;
  const inboundRaids = (state.combat?.raidEventQueue ?? []).filter(
    (raid) => raid.status === "active" || raid.status === "incoming",
  ).length;
  const dailyReady = isClaimAvailable(
    state.dailyStreak ?? { current: 0, longest: 0, lastClaimedDay: null, lastVisitedDay: null },
    today,
  );
  const weeklyReady = !!state.weeklyChallenge &&
    !state.weeklyChallenge.claimed &&
    isWeeklyComplete(state.weeklyChallenge, state);
  const activeContracts = (state.activeContracts ?? []).length;
  const activeOperations = (state.activeOperations ?? []).length;
  const activeMining = (state.miningOperations ?? []).filter((operation) => operation.active).length;
  const activeScavenging = (state.scavengeExpeditions ?? []).filter((expedition) => expedition.status === "active").length;
  const activeReclamations = (state.districtExpansion?.activeReclamations ?? []).length;
  const queuedResearch = (state.researchQueue ?? []).length + (state.activeResearch ? 1 : 0);
  const statuses: CommandMenuStatusMap = {};

  if (unread > 0) {
    statuses["/(game)/inbox"] = status(
      criticalUnread > 0 ? "critical" : "unread",
      criticalUnread > 0 ? `${criticalUnread} CRITICAL` : `${unread} UNREAD`,
      criticalUnread > 0 ? criticalUnread : unread,
    );
  }
  if (activeEvents.length > 0) {
    statuses["/(game)/events"] = status(
      criticalEvents > 0 ? "critical" : "pending",
      criticalEvents > 0 ? `${criticalEvents} CRITICAL` : `${activeEvents.length} ACTIVE`,
      criticalEvents > 0 ? criticalEvents : activeEvents.length,
    );
  }
  if ((state.autoManagers?.queue ?? []).length > 0) {
    const count = state.autoManagers!.queue.length;
    statuses["/(game)/advisor-briefings"] = status("pending", `${count} PENDING`, count);
  }
  if (inboundRaids > 0) {
    statuses["/(game)/military"] = status("critical", `${inboundRaids} INBOUND`, inboundRaids);
  }
  if (vacancies > 0) {
    statuses["/(game)/officers"] = status("pending", `${vacancies} VACANT`, vacancies);
  }
  if (completedMissions > 0) {
    statuses["/(game)/missions"] = status("ready", `${completedMissions} COMPLETE`, completedMissions);
  } else if (activeMissions > 0) {
    statuses["/(game)/missions"] = status("pending", `${activeMissions} ACTIVE`, activeMissions);
  }
  if (criticalFactions > 0) {
    statuses["/(game)/factions"] = status("critical", `${criticalFactions} CRITICAL`, criticalFactions);
  }
  if (activeContracts > 0) {
    statuses["/(game)/contracts"] = status("pending", `${activeContracts} ACTIVE`, activeContracts);
  }
  if (dailyReady || weeklyReady) {
    const count = Number(dailyReady) + Number(weeklyReady);
    statuses["/(game)/challenges"] = status(
      "ready",
      dailyReady && weeklyReady ? "DAILY + WEEKLY READY" : dailyReady ? "DAILY READY" : "WEEKLY READY",
      count,
    );
  }
  if (activeOperations > 0) {
    statuses["/(game)/operations"] = status("pending", `${activeOperations} ACTIVE`, activeOperations);
  }
  if (activeMining > 0) {
    statuses["/(game)/mining"] = status("pending", `${activeMining} ACTIVE`, activeMining);
  }
  if (activeScavenging > 0) {
    statuses["/(game)/scavenging"] = status("pending", `${activeScavenging} ACTIVE`, activeScavenging);
  }
  if (activeReclamations > 0) {
    statuses["/(game)/expansion"] = status("pending", `${activeReclamations} ACTIVE`, activeReclamations);
  }
  if (queuedResearch > 0) {
    statuses["/(game)/research"] = status("pending", `${queuedResearch} QUEUED`, queuedResearch);
  }

  return statuses;
}

export function getCommandMenuBadgeCount(
  state: GameState,
  route: string,
): number | undefined {
  return getCommandMenuStatuses(state)[route]?.count;
}