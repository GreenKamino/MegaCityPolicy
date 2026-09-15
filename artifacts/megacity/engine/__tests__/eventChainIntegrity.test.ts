import { describe, expect, it } from "vitest";

import { EVENT_CHAINS, type EventChainDef } from "@/engine/eventChains";
import { BUSINESS_EVENT_CHAINS } from "@/engine/businessEventChains";
import { RESEARCH_EVENT_CHAINS } from "@/engine/researchEventChain";
import { createInitialState } from "@/engine/initialState";
import { TECH_MAP } from "@/engine/technologies";
import { FAITH_IDS } from "@/engine/faiths";

/**
 * Effect keys recognised by `applyChainEffects` in eventChains.ts:
 *   - "loyalty_<factionId>" where factionId is in s.factions
 *   - "loyalty_<faithId>" where faithId has no backing faction (Task #209) —
 *     routed to a faith-share nudge in affinity-category districts via
 *     applyFaithLoyaltyNudge. The faction lookup wins on collision.
 *   - "population"
 *   - "tradeIncome" — persisted via the GameState.eventTradeIncome
 *     accumulator (re-added into rates.tradeIncome every tick by formulas.ts),
 *     mirroring how event/response tradeIncome lands in events.ts
 *   - "researchSpeed" — one-time researchProgress grant clamped to
 *     [0, researchTarget]
 *   - any key in s.resources
 *   - any key in s.cityStats
 * Anything else is silently dropped, producing dead gameplay code.
 * We derive the allowed sets from initial state so this guard self-updates
 * when Resources or CityStats grow new fields.
 */
const INITIAL = createInitialState();
const VALID_RESOURCE_KEYS = new Set(Object.keys(INITIAL.resources));
const VALID_CITY_STAT_KEYS = new Set(Object.keys(INITIAL.cityStats));
const VALID_FACTION_IDS = new Set(INITIAL.factions.map((f) => f.id));
const VALID_FAITH_IDS = new Set<string>(FAITH_IDS);
const LOYALTY_PREFIX = "loyalty_";

function classifyEffectKey(key: string): "ok" | "dead" {
  if (key === "population") return "ok";
  if (key === "tradeIncome") return "ok";
  if (key === "researchSpeed") return "ok";
  if (VALID_RESOURCE_KEYS.has(key)) return "ok";
  if (VALID_CITY_STAT_KEYS.has(key)) return "ok";
  if (key.startsWith(LOYALTY_PREFIX)) {
    const id = key.slice(LOYALTY_PREFIX.length);
    if (VALID_FACTION_IDS.has(id)) return "ok";
    if (VALID_FAITH_IDS.has(id)) return "ok";
    return "dead";
  }
  return "dead";
}

/**
 * Effect keys currently shipped in chain content that the runtime silently
 * ignores. Document them here as known debt; remove from the allowlist once
 * the chain is patched (rename the key) or the runtime is extended to handle
 * the stat. Keep this list ALPHABETISED.
 */
const KNOWN_DEAD_EFFECT_KEYS_ALLOWLIST: Set<string> = new Set([
  // Faction ids that don't exist in s.factions. Author intent unclear —
  // possibly renamed factions or aspirational ids never wired up. Loyalty
  // deltas with these keys are silently dropped at runtime.
  "loyalty_aureus-dominion",
  "loyalty_independent",
]);

/**
 * Per-chain stage and response integrity. The runtime navigates between
 * stages with `chainDef.stages.find((st) => st.id === active.currentStageId)`,
 * so stage ids only need to be unique WITHIN a chain — but a duplicate or a
 * dangling `nextStageId` would silently dead-end the player or skip stages.
 *
 * Rules enforced here:
 *   1. Every stage id within a single chain is unique.
 *   2. Every response id within a single stage is unique.
 *   3. Every non-null `nextStageId` resolves to a stage in the SAME chain.
 *   4. Every chain reaches at least one terminal state (response with
 *      `nextStageId === null`) so the chain can actually end.
 *   5. Every non-first stage is reachable from the first stage by walking
 *      `nextStageId` (no orphan stages).
 */

const ALL_CHAIN_SETS: { label: string; chains: EventChainDef[] }[] = [
  { label: "EVENT_CHAINS", chains: EVENT_CHAINS },
  { label: "BUSINESS_EVENT_CHAINS", chains: BUSINESS_EVENT_CHAINS },
  { label: "RESEARCH_EVENT_CHAINS", chains: RESEARCH_EVENT_CHAINS },
];

describe("event chain integrity (per-chain)", () => {
  it("every catalog has chains and every chain has stages", () => {
    for (const { label, chains } of ALL_CHAIN_SETS) {
      expect(chains.length, `${label} chain count`).toBeGreaterThan(0);
      for (const chain of chains) {
        expect(chain.stages.length, `${label}.${chain.id} stage count`).toBeGreaterThan(0);
      }
    }
  });

  it("stage ids are unique within each chain", () => {
    const violations: string[] = [];
    for (const { label, chains } of ALL_CHAIN_SETS) {
      for (const chain of chains) {
        const seen = new Set<string>();
        for (const stage of chain.stages) {
          if (seen.has(stage.id)) {
            violations.push(`${label}.${chain.id} duplicate stage id: ${stage.id}`);
          }
          seen.add(stage.id);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("response ids are unique within each stage", () => {
    const violations: string[] = [];
    for (const { label, chains } of ALL_CHAIN_SETS) {
      for (const chain of chains) {
        for (const stage of chain.stages) {
          const seen = new Set<string>();
          for (const resp of stage.responses) {
            if (seen.has(resp.id)) {
              violations.push(`${label}.${chain.id}.${stage.id} duplicate response id: ${resp.id}`);
            }
            seen.add(resp.id);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("every nextStageId resolves to a stage in the same chain", () => {
    const broken: string[] = [];
    for (const { label, chains } of ALL_CHAIN_SETS) {
      for (const chain of chains) {
        const stageIds = new Set(chain.stages.map((s) => s.id));
        for (const stage of chain.stages) {
          for (const resp of stage.responses) {
            // Task #539: a chanceFork's alternate target must resolve too.
            if (resp.chanceFork && !stageIds.has(resp.chanceFork.altNextStageId)) {
              broken.push(
                `${label}.${chain.id}.${stage.id}.${resp.id} chanceFork -> "${resp.chanceFork.altNextStageId}" (no such stage)`,
              );
            }
            if (resp.nextStageId == null) continue;
            if (!stageIds.has(resp.nextStageId)) {
              broken.push(
                `${label}.${chain.id}.${stage.id}.${resp.id} -> "${resp.nextStageId}" (no such stage)`,
              );
            }
          }
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("every chain has at least one terminal response (nextStageId === null)", () => {
    const noTerminal: string[] = [];
    for (const { label, chains } of ALL_CHAIN_SETS) {
      for (const chain of chains) {
        const hasTerminal = chain.stages.some((s) =>
          s.responses.some((r) => r.nextStageId === null),
        );
        if (!hasTerminal) noTerminal.push(`${label}.${chain.id}`);
      }
    }
    expect(
      noTerminal,
      "Chain has no terminal response — player can never exit",
    ).toEqual([]);
  });

  it("every response effect key is recognised by applyChainEffects", () => {
    const dead: string[] = [];
    for (const { label, chains } of ALL_CHAIN_SETS) {
      for (const chain of chains) {
        for (const stage of chain.stages) {
          for (const resp of stage.responses) {
            for (const key of Object.keys(resp.effects ?? {})) {
              if (classifyEffectKey(key) === "dead" && !KNOWN_DEAD_EFFECT_KEYS_ALLOWLIST.has(key)) {
                dead.push(`${label}.${chain.id}.${stage.id}.${resp.id} effect "${key}"`);
              }
            }
          }
        }
      }
    }
    expect(
      dead,
      "Effect key not in resources/cityStats/population/loyalty_<faction> — silently dropped at runtime",
    ).toEqual([]);
  });

  it("KNOWN_DEAD_EFFECT_KEYS_ALLOWLIST has no stale entries", () => {
    const allKeys = new Set<string>();
    for (const { chains } of ALL_CHAIN_SETS) {
      for (const chain of chains) {
        for (const stage of chain.stages) {
          for (const resp of stage.responses) {
            for (const key of Object.keys(resp.effects ?? {})) allKeys.add(key);
          }
        }
      }
    }
    const stale = [...KNOWN_DEAD_EFFECT_KEYS_ALLOWLIST].filter(
      (k) => !allKeys.has(k) || classifyEffectKey(k) === "ok",
    );
    expect(stale, "Allowlist entry no longer needed — remove it").toEqual([]);
  });

  it("every response unlockTechId resolves in TECH_MAP", () => {
    const broken: string[] = [];
    for (const { label, chains } of ALL_CHAIN_SETS) {
      for (const chain of chains) {
        for (const stage of chain.stages) {
          for (const resp of stage.responses) {
            const techId = (resp as { unlockTechId?: string }).unlockTechId;
            if (techId == null) continue;
            if (!TECH_MAP[techId]) {
              broken.push(`${label}.${chain.id}.${stage.id}.${resp.id} unlockTechId="${techId}"`);
            }
          }
        }
      }
    }
    expect(
      broken,
      "unlockTechId not found in TECH_MAP — chain marks tech unlocked but techDef.effects never apply",
    ).toEqual([]);
  });

  it("delayTicks on every stage is a non-negative integer", () => {
    const bad: string[] = [];
    for (const { label, chains } of ALL_CHAIN_SETS) {
      for (const chain of chains) {
        for (const stage of chain.stages) {
          if (!Number.isInteger(stage.delayTicks) || stage.delayTicks < 0) {
            bad.push(`${label}.${chain.id}.${stage.id} delayTicks=${stage.delayTicks}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("every chanceFork altChancePct is an integer in 1..99", () => {
    const bad: string[] = [];
    for (const { label, chains } of ALL_CHAIN_SETS) {
      for (const chain of chains) {
        for (const stage of chain.stages) {
          for (const resp of stage.responses) {
            if (!resp.chanceFork) continue;
            const pct = resp.chanceFork.altChancePct;
            if (!Number.isInteger(pct) || pct < 1 || pct > 99) {
              bad.push(`${label}.${chain.id}.${stage.id}.${resp.id} altChancePct=${pct}`);
            }
          }
        }
      }
    }
    expect(bad, "altChancePct outside 1..99 makes the fork a no-op or absolute").toEqual([]);
  });

  it("cooldownTicks on every chain is a non-negative integer", () => {
    const bad: string[] = [];
    for (const { label, chains } of ALL_CHAIN_SETS) {
      for (const chain of chains) {
        if (!Number.isInteger(chain.cooldownTicks) || chain.cooldownTicks < 0) {
          bad.push(`${label}.${chain.id} cooldownTicks=${chain.cooldownTicks}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("every stage is reachable from the chain's first stage", () => {
    const unreachable: string[] = [];
    for (const { label, chains } of ALL_CHAIN_SETS) {
      for (const chain of chains) {
        const stageById = new Map(chain.stages.map((s) => [s.id, s]));
        const reachable = new Set<string>();
        const queue: string[] = [chain.stages[0]!.id];
        while (queue.length > 0) {
          const id = queue.shift()!;
          if (reachable.has(id)) continue;
          reachable.add(id);
          const stage = stageById.get(id);
          if (!stage) continue;
          for (const resp of stage.responses) {
            if (resp.nextStageId && !reachable.has(resp.nextStageId)) {
              queue.push(resp.nextStageId);
            }
            // Task #539: chanceFork alternates are real runtime edges.
            if (resp.chanceFork && !reachable.has(resp.chanceFork.altNextStageId)) {
              queue.push(resp.chanceFork.altNextStageId);
            }
          }
        }
        for (const stage of chain.stages) {
          if (!reachable.has(stage.id)) {
            unreachable.push(`${label}.${chain.id}.${stage.id}`);
          }
        }
      }
    }
    expect(
      unreachable,
      "Stage is dead code — no path from first stage reaches it",
    ).toEqual([]);
  });
});
