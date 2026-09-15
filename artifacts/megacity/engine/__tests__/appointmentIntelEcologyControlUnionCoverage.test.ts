import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { APPOINTMENT_METHODS } from "@/engine/officers";
import { controlStatusLabel } from "@/engine/partnerCityStats";
import type {
  AppointmentMethod,
  IntelItemKind,
  EcologyStance,
  PartnerControlStatus,
} from "@/engine/types";

/**
 * Drift guard: residual small unions vs their consumers.
 *
 *   AppointmentMethod(4)     ↔ APPOINTMENT_METHODS catalog (1:1
 *                              ids, non-empty name/desc/effects).
 *
 *   IntelItemKind(5)         ↔ kind:"…" emissions parsed from
 *                              intelEngine.ts. Subset must be in
 *                              the union; runtime emits at least
 *                              "rumor", "intel", "warning" today.
 *                              The remaining members ("tip","secret")
 *                              are pinned reserved-but-typed slots.
 *
 *   EcologyStance(4)         ↔ ecologyStance:"…" assignments in
 *                              initialState.ts. Every union member
 *                              must be assigned to ≥1 starting
 *                              faction (orphan = dead branch in
 *                              ecology UI/effects).
 *
 *   PartnerControlStatus(3)  ↔ controlStatusLabel switch: every
 *                              union member yields a distinct
 *                              non-empty label.
 */

const TYPES_SRC = readFileSync(join(__dirname, "..", "types.ts"), "utf8");
const INTEL_SRC = readFileSync(join(__dirname, "..", "intelEngine.ts"), "utf8");
const INITIAL_SRC = readFileSync(
  join(__dirname, "..", "initialState.ts"),
  "utf8",
);

function parseUnion(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  expect(m, `union ${name} not found`).not.toBeNull();
  return (m![1].match(/"([a-zA-Z0-9_-]+)"/g) ?? []).map((s) =>
    s.replace(/"/g, ""),
  );
}

const APPOINTMENT_METHOD = parseUnion(TYPES_SRC, "AppointmentMethod");
const INTEL_ITEM_KIND = parseUnion(TYPES_SRC, "IntelItemKind");
const ECOLOGY_STANCE = parseUnion(TYPES_SRC, "EcologyStance");
const PARTNER_CONTROL_STATUS = parseUnion(TYPES_SRC, "PartnerControlStatus");

describe("appointment / intel / ecology / control-status union coverage drift guard", () => {
  it("union member counts are budget-pinned", () => {
    expect(APPOINTMENT_METHOD.length).toBe(4);
    expect(INTEL_ITEM_KIND.length).toBe(5);
    expect(ECOLOGY_STANCE.length).toBe(4);
    expect(PARTNER_CONTROL_STATUS.length).toBe(3);
  });

  it("APPOINTMENT_METHODS catalog is 1:1 with AppointmentMethod with non-empty fields", () => {
    expect(APPOINTMENT_METHODS.length).toBe(APPOINTMENT_METHOD.length);
    const ids = APPOINTMENT_METHODS.map((m) => m.id).sort();
    expect(ids).toEqual([...APPOINTMENT_METHOD].sort());
    const seen = new Set<string>();
    for (const m of APPOINTMENT_METHODS) {
      expect(seen.has(m.id), `duplicate appointment id ${m.id}`).toBe(false);
      seen.add(m.id);
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(0);
      expect(m.effects.length).toBeGreaterThan(0);
    }
  });

  it("intelEngine.ts kind emissions are subset of IntelItemKind; runtime hits the core set", () => {
    const kinds = new Set(
      (INTEL_SRC.match(/kind:\s*"([a-z]+)"/g) ?? []).map(
        (s) => s.match(/"([^"]+)"/)![1],
      ),
    );
    const known = new Set(INTEL_ITEM_KIND);
    for (const k of kinds) {
      expect(known.has(k), `intelEngine emits unknown kind ${k}`).toBe(true);
    }
    // Core runtime set today.
    for (const required of ["rumor", "intel", "warning"]) {
      expect(
        kinds.has(required),
        `intelEngine should emit ${required}`,
      ).toBe(true);
    }
  });

  it("every EcologyStance is assigned to ≥1 starting faction in initialState", () => {
    const assigned = new Set(
      (INITIAL_SRC.match(/ecologyStance:\s*"([a-z]+)"/g) ?? []).map(
        (s) => s.match(/"([^"]+)"/)![1],
      ),
    );
    const known = new Set(ECOLOGY_STANCE);
    for (const a of assigned) {
      expect(known.has(a), `initialState assigns unknown stance ${a}`).toBe(
        true,
      );
    }
    for (const u of known) {
      expect(
        assigned.has(u),
        `EcologyStance ${u} never assigned to a starting faction`,
      ).toBe(true);
    }
  });

  it("controlStatusLabel returns a distinct non-empty UPPERCASE label for every PartnerControlStatus", () => {
    const labels = new Set<string>();
    for (const s of PARTNER_CONTROL_STATUS) {
      const label = controlStatusLabel(s as PartnerControlStatus);
      expect(label.length).toBeGreaterThan(0);
      expect(label).toBe(label.toUpperCase());
      expect(labels.has(label), `duplicate control-status label ${label}`).toBe(
        false,
      );
      labels.add(label);
    }
    expect(labels.size).toBe(PARTNER_CONTROL_STATUS.length);
  });

  // tsc reachability anchors.
  it("type-side anchors compile", () => {
    const _a: AppointmentMethod[] = APPOINTMENT_METHOD as AppointmentMethod[];
    const _i: IntelItemKind[] = INTEL_ITEM_KIND as IntelItemKind[];
    const _e: EcologyStance[] = ECOLOGY_STANCE as EcologyStance[];
    const _c: PartnerControlStatus[] =
      PARTNER_CONTROL_STATUS as PartnerControlStatus[];
    expect(_a.length + _i.length + _e.length + _c.length).toBe(
      APPOINTMENT_METHOD.length +
        INTEL_ITEM_KIND.length +
        ECOLOGY_STANCE.length +
        PARTNER_CONTROL_STATUS.length,
    );
  });
});
