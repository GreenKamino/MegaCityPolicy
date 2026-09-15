import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONDITION_TRIGGERS, OFFICER_RESPONSES } from "@/engine/eventTriggers";
import {
  BIOSPHERE_EVENT_POOL,
  EVENT_POOL,
  EXPANSION_EVENT_POOL,
} from "@/engine/events";
import { BB_EVENT_POOL } from "@/engine/addons/bigBrother";
import { SD_EVENT_POOL } from "@/engine/addons/sixthDay";
import { createInitialState } from "@/engine/initialState";
import type { EventResponse, GameEvent } from "@/engine/types";
import { EVENT_CHAINS, startEventChain } from "@/engine/eventChains";

/**
 * Schema guard for player-choice events. Every new content pool (weather,
 * religion, education, and the upcoming prison/sports/tourism/transit/
 * sewer/celebrity pools) adds dozens of EventResponse `effects` objects.
 * The dispatcher in events.ts (`applyResponseEffects`) only reads a fixed
 * subset of keys; anything outside that subset is silently dropped and the
 * player ends up tapping a button that does nothing. This test walks every
 * known response and trigger so a typo'd key fails CI loudly instead of
 * shipping a dead-button event.
 */

const ALLOWED_RESPONSE_EFFECT_KEYS = new Set<keyof EventResponse["effects"]>([
  "credits",
  "unrest",
  "crime",
  "food",
  "water",
  "power",
  "happiness",
  "lawOrder",
  "corruption",
  "defenseRating",
  "medSupplies",
  "tradeIncome",
  "employment",
]);

const VALID_SEVERITIES: ReadonlySet<GameEvent["severity"]> = new Set([
  "low",
  "medium",
  "high",
  "critical",
]);

function assertResponseShape(response: EventResponse, where: string) {
  expect(typeof response.id, `${where}: id missing`).toBe("string");
  expect(response.id.length, `${where}: id empty`).toBeGreaterThan(0);
  expect(typeof response.label, `${where}: label missing`).toBe("string");
  expect(response.effects, `${where}: effects missing`).toBeDefined();
  for (const key of Object.keys(response.effects)) {
    expect(
      ALLOWED_RESPONSE_EFFECT_KEYS.has(key as keyof EventResponse["effects"]),
      `${where}: response "${response.id}" uses disallowed effects key "${key}". Allowed keys: ${[...ALLOWED_RESPONSE_EFFECT_KEYS].join(", ")}`,
    ).toBe(true);
  }
}

describe("OFFICER_RESPONSES schema", () => {
  it("every response uses only the allowed EventResponse.effects keys", () => {
    for (const [poolKey, responses] of Object.entries(OFFICER_RESPONSES)) {
      expect(
        Array.isArray(responses) && responses.length > 0,
        `OFFICER_RESPONSES["${poolKey}"] must be a non-empty array`,
      ).toBe(true);
      for (const response of responses) {
        assertResponseShape(response, `OFFICER_RESPONSES["${poolKey}"]`);
      }
    }
  });

  it("response ids are unique within each response pool", () => {
    for (const [poolKey, responses] of Object.entries(OFFICER_RESPONSES)) {
      const seen = new Set<string>();
      for (const response of responses) {
        expect(
          seen.has(response.id),
          `OFFICER_RESPONSES["${poolKey}"] has duplicate response id "${response.id}"`,
        ).toBe(false);
        seen.add(response.id);
      }
    }
  });
});

/**
 * Some triggers' generate() functions assume a precondition (e.g. an
 * officer matching a filter) and crash on a fresh initial state. We still
 * want a hard structural guarantee for those, so we fall back to scanning
 * the source file for the `responseOptions: OFFICER_RESPONSES.<key>`
 * reference and validating that key.
 */
const TRIGGER_SOURCE = readFileSync(
  join(__dirname, "..", "eventTriggers.ts"),
  "utf8",
);

function getTriggerSourceWindow(triggerId: string): string {
  const idMatch = TRIGGER_SOURCE.indexOf(`id: "${triggerId}"`);
  if (idMatch < 0) return "";
  // Scan forward until just before the next trigger entry begins. The
  // outer triggers list uses `  {` at column 2 as its entry boundary, so
  // we slice to the next `\n  },\n  {\n    id: "` which marks the start
  // of the next trigger. Falling back to a bounded window keeps the test
  // robust if formatting drifts.
  const after = TRIGGER_SOURCE.slice(idMatch);
  const nextEntry = after.search(/\n  \},\n  \{\n    id: "/);
  return nextEntry > 0 ? after.slice(0, nextEntry) : after.slice(0, 6000);
}

function findResponsePoolKeysForTrigger(triggerId: string): string[] {
  const window = getTriggerSourceWindow(triggerId);
  if (!window) return [];
  const keys: string[] = [];
  const re = /OFFICER_RESPONSES\.([a-zA-Z0-9_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(window)) !== null) {
    keys.push(m[1]);
  }
  return keys;
}

function findSeveritiesForTrigger(triggerId: string): string[] {
  const window = getTriggerSourceWindow(triggerId);
  if (!window) return [];
  const severities: string[] = [];
  const re = /severity:\s*(?:[^,\n]*\?\s*)?"([a-z]+)"(?:\s*:\s*"([a-z]+)")?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(window)) !== null) {
    if (m[1]) severities.push(m[1]);
    if (m[2]) severities.push(m[2]);
  }
  return severities;
}

type GenerateProbe =
  | { ok: true; event: ReturnType<(typeof CONDITION_TRIGGERS)[number]["generate"]> }
  | { ok: false; error: unknown };

function probeGenerate(
  trigger: (typeof CONDITION_TRIGGERS)[number],
): GenerateProbe {
  try {
    const state = createInitialState();
    return { ok: true, event: trigger.generate(state) };
  } catch (error) {
    return { ok: false, error };
  }
}

describe("CONDITION_TRIGGERS schema", () => {
  const probes = CONDITION_TRIGGERS.map((trigger) => ({
    trigger,
    probe: probeGenerate(trigger),
  }));

  it("every trigger id is unique", () => {
    const seen = new Set<string>();
    for (const { trigger } of probes) {
      expect(
        seen.has(trigger.id),
        `Duplicate CONDITION_TRIGGERS id "${trigger.id}"`,
      ).toBe(false);
      seen.add(trigger.id);
    }
  });

  it("every trigger has a non-empty responseOptions array", () => {
    for (const { trigger, probe } of probes) {
      if (probe.ok) {
        expect(
          Array.isArray(probe.event.responseOptions) &&
            (probe.event.responseOptions?.length ?? 0) > 0,
          `Trigger "${trigger.id}" generated an event with no responseOptions. Players would see a card with no buttons.`,
        ).toBe(true);
      } else {
        // Fallback: confirm the trigger references a real, non-empty
        // OFFICER_RESPONSES pool in source.
        const referencedKeys = findResponsePoolKeysForTrigger(trigger.id);
        expect(
          referencedKeys.length,
          `Trigger "${trigger.id}" generate() threw on initial state and the source contains no OFFICER_RESPONSES.<key> reference. Add a responseOptions or fix generate().`,
        ).toBeGreaterThan(0);
        for (const key of referencedKeys) {
          const pool = OFFICER_RESPONSES[key];
          expect(
            Array.isArray(pool) && pool.length > 0,
            `Trigger "${trigger.id}" references OFFICER_RESPONSES.${key}, which is missing or empty.`,
          ).toBe(true);
        }
      }
    }
  });

  it("every trigger severity is one of the four valid values", () => {
    for (const { trigger, probe } of probes) {
      if (probe.ok) {
        expect(
          VALID_SEVERITIES.has(probe.event.severity),
          `Trigger "${trigger.id}" produced invalid severity "${probe.event.severity}". Allowed: low, medium, high, critical.`,
        ).toBe(true);
      } else {
        // Fallback: scan the source for severity literals on this trigger
        // and assert each one is valid. This catches typos like "extreme"
        // even when generate() throws on a fresh state.
        const severities = findSeveritiesForTrigger(trigger.id);
        expect(
          severities.length,
          `Trigger "${trigger.id}" generate() threw on initial state and the source contains no parseable severity literal. Add a severity or fix generate().`,
        ).toBeGreaterThan(0);
        for (const sev of severities) {
          expect(
            VALID_SEVERITIES.has(sev as GameEvent["severity"]),
            `Trigger "${trigger.id}" uses invalid severity literal "${sev}". Allowed: low, medium, high, critical.`,
          ).toBe(true);
        }
      }
    }
  });

  it("every responseOptions entry uses only allowed effects keys", () => {
    for (const { trigger, probe } of probes) {
      const options = probe.ok
        ? probe.event.responseOptions ?? []
        : findResponsePoolKeysForTrigger(trigger.id).flatMap(
            (key) => OFFICER_RESPONSES[key] ?? [],
          );
      for (const response of options) {
        assertResponseShape(
          response,
          `CONDITION_TRIGGERS["${trigger.id}"].responseOptions`,
        );
      }
    }
  });
});

describe("event id uniqueness across all sources", () => {
  it("trigger ids do not collide with any other event source id", () => {
    const sources: Array<{
      name: string;
      ids: string[];
    }> = [
      {
        name: "CONDITION_TRIGGERS",
        ids: CONDITION_TRIGGERS.map((t) => t.id),
      },
      {
        name: "BIOSPHERE_EVENT_POOL",
        ids: BIOSPHERE_EVENT_POOL.map((e) => e.id),
      },
      {
        name: "EXPANSION_EVENT_POOL",
        ids: EXPANSION_EVENT_POOL.map((e) => e.id),
      },
      { name: "BB_EVENT_POOL", ids: BB_EVENT_POOL.map((e) => e.id) },
      { name: "SD_EVENT_POOL", ids: SD_EVENT_POOL.map((e) => e.id) },
    ];

    const seen = new Map<string, string>();
    for (const source of sources) {
      for (const id of source.ids) {
        const prior = seen.get(id);
        expect(
          prior === undefined,
          `Event id "${id}" appears in both ${prior} and ${source.name}. Ids must be unique across pools so cooldowns/history dedupe correctly.`,
        ).toBe(true);
        seen.set(id, source.name);
      }
    }
  });
});

describe("retained incident payloads", () => {
  it("omits narrative descriptions from newly generated catalog incidents", () => {
    const pools = [EVENT_POOL, EXPANSION_EVENT_POOL, BIOSPHERE_EVENT_POOL, BB_EVENT_POOL, SD_EVENT_POOL];
    for (const pool of pools) {
      for (const event of pool) {
        expect(event).not.toHaveProperty("description");
        for (const response of event.responseOptions ?? []) {
          expect(response).not.toHaveProperty("description");
        }
      }
    }

    for (const trigger of CONDITION_TRIGGERS) {
      const generated = probeGenerate(trigger);
      if (!generated.ok) continue;
      expect(generated.event).not.toHaveProperty("description");
      for (const response of generated.event.responseOptions ?? []) {
        expect(response).not.toHaveProperty("description");
      }
    }
  });

  it("omits descriptions when a chain stage is materialized", () => {
    const state = createInitialState();
    state.cityStats.infrastructureHealth = 0;
    state.resources.power = 0;
    const chain = EVENT_CHAINS.find((candidate) => candidate.id === "reactor_meltdown")!;
    const event = startEventChain(state, chain)!;
    expect(event).not.toHaveProperty("description");
    for (const response of event.responseOptions ?? []) {
      expect(response).not.toHaveProperty("description");
    }
  });
});
