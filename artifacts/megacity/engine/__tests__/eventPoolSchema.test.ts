import { describe, expect, it } from "vitest";

import {
  BIOSPHERE_EVENT_POOL,
  EVENT_POOL,
  EXPANSION_EVENT_POOL,
  WAR_EVENT_POOL,
} from "@/engine/events";
import { BB_EVENT_POOL } from "@/engine/addons/bigBrother";
import { SD_EVENT_POOL } from "@/engine/addons/sixthDay";
import type { EventResponse, GameEvent } from "@/engine/types";

/**
 * Sibling guard to eventTriggerSchema.test.ts. Task #206 caught dead-button
 * effects in OFFICER_RESPONSES / CONDITION_TRIGGERS; this walks the rest of
 * the static event pools (biosphere, expansion, Big Brother addon, Sixth
 * Day addon) so a content author who types `foodProduction`,
 * `researchSpeed`, `fuel`, etc. on a responseOptions[].effects key (which
 * the dispatcher in events.ts silently ignores) fails CI loudly instead of
 * shipping a button that does nothing.
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

const POOLS: Array<{
  name: string;
  events: ReadonlyArray<Omit<GameEvent, "timestamp" | "resolved">>;
}> = [
  { name: "BIOSPHERE_EVENT_POOL", events: BIOSPHERE_EVENT_POOL },
  { name: "EXPANSION_EVENT_POOL", events: EXPANSION_EVENT_POOL },
  { name: "BB_EVENT_POOL", events: BB_EVENT_POOL },
  { name: "SD_EVENT_POOL", events: SD_EVENT_POOL },
  { name: "EVENT_POOL", events: EVENT_POOL },
  { name: "WAR_EVENT_POOL", events: WAR_EVENT_POOL },
];

describe("static event pools schema", () => {
  it("every event severity is one of low|medium|high|critical", () => {
    for (const { name, events } of POOLS) {
      for (const event of events) {
        expect(
          VALID_SEVERITIES.has(event.severity),
          `${name} event "${event.id}" has invalid severity "${event.severity}". Allowed: low, medium, high, critical.`,
        ).toBe(true);
      }
    }
  });

  it("every responseOptions[].effects key is in the allowed EventResponse.effects key set", () => {
    for (const { name, events } of POOLS) {
      for (const event of events) {
        const options = event.responseOptions;
        if (!options) continue;
        expect(
          Array.isArray(options) && options.length > 0,
          `${name} event "${event.id}" has a responseOptions field but it is empty. Players would see a card with no buttons.`,
        ).toBe(true);
        for (const response of options) {
          expect(
            typeof response.id === "string" && response.id.length > 0,
            `${name} event "${event.id}" has a response with a missing/empty id.`,
          ).toBe(true);
          expect(
            typeof response.label === "string" && response.label.length > 0,
            `${name} event "${event.id}" response "${response.id}" has a missing/empty label.`,
          ).toBe(true);
          expect(
            response.effects,
            `${name} event "${event.id}" response "${response.id}" is missing effects.`,
          ).toBeDefined();
          for (const key of Object.keys(response.effects)) {
            expect(
              ALLOWED_RESPONSE_EFFECT_KEYS.has(
                key as keyof EventResponse["effects"],
              ),
              `${name} event "${event.id}" response "${response.id}" uses disallowed effects key "${key}". The dispatcher in events.ts silently drops this, so the button does nothing. Allowed keys: ${[...ALLOWED_RESPONSE_EFFECT_KEYS].join(", ")}.`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("response ids are unique within each event's responseOptions", () => {
    for (const { name, events } of POOLS) {
      for (const event of events) {
        const options = event.responseOptions;
        if (!options) continue;
        const seen = new Set<string>();
        for (const response of options) {
          expect(
            seen.has(response.id),
            `${name} event "${event.id}" has duplicate response id "${response.id}".`,
          ).toBe(false);
          seen.add(response.id);
        }
      }
    }
  });
});
