/**
 * Credit-spend feedback contracts for the event and construction screens.
 *
 * These Expo screen modules are intentionally source-pinned here, matching
 * the existing officer feedback test: importing either screen would require
 * bootstrapping its full native/router graph just to verify a UI contract.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (rel: string) =>
  readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), rel), "utf8");

const eventCardSource = source("../../components/EventCard.tsx");
const constructionSource = source("../../app/(game)/construction.tsx");
const gameContextSource = source("../../context/GameContext.tsx");

describe("credit spend feedback", () => {
  it("event responses provide pressed feedback, haptics, toast cost, and a success debounce", () => {
    expect(eventCardSource).toContain('import { useToast } from "@/context/ToastContext";');
    expect(eventCardSource).toContain('import { playHaptic } from "@/engine/haptics";');
    expect(eventCardSource).toContain("responseCooldown");
    expect(eventCardSource).toContain("playHaptic(\"light\");");
    expect(eventCardSource).toContain(
      "showToast(`${labels} — ${spent.toLocaleString()}c spent`, \"success\");",
    );
    expect(eventCardSource).toContain("disabled={traitLocked || responseCooldown}");
    expect(eventCardSource).toContain("responseCooldownTimer.current = setTimeout(() => setResponseCooldown(false), 650);");
    expect(eventCardSource).toContain("pressed && !responseCooldown && styles.confirmBtnPressed");
  });

  it("construction orders confirm the spend, keep failures retryable, and debounce success", () => {
    expect(constructionSource).toContain('import { useToast } from "@/context/ToastContext";');
    expect(constructionSource).toContain('import { playHaptic } from "@/engine/haptics";');
    expect(constructionSource).toContain("buildGuardRef");
    expect(constructionSource).toContain("if (buildCooldown || buildGuardRef.current) return;");
    expect(constructionSource).toContain("buildGuardRef.current = false;");
    expect(constructionSource).toContain(
      "showToast(`BUILD ${effectiveCount}× ${def.label} — ${spentLine} spent`, \"success\");",
    );
    expect(constructionSource).toContain("disabled={buildCooldown}");
    expect(constructionSource).toContain("buildCooldownTimer.current = setTimeout(() => {");
  });

  it("event actions report whether the active event accepted the response", () => {
    expect(gameContextSource).toContain(
      "respondToEvent: (eventId: string, response: import(\"@/engine/types\").EventResponse) => boolean;",
    );
    expect(gameContextSource).toContain(
      "respondToEventMulti: (eventId: string, responses: import(\"@/engine/types\").EventResponse[]) => boolean;",
    );
    expect(gameContextSource).toContain("if (!prev.activeEvents.some((event) => event.id === eventId)) return prev;");
    expect(gameContextSource).toContain("if (responses.length === 0 || !prev.activeEvents.some((event) => event.id === eventId)) return prev;");
  });
});