import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createInitialState } from "@/engine/initialState";
import { performBlackMarketPurchase } from "@/engine/blackMarketActions";
import { runTick } from "@/engine/formulas";
import { migrateState } from "@/engine/saveLoad";
import { sanitizeState } from "@/engine/sanitizer";

const blackMarketScreenSource = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../app/(game)/blackmarket.tsx",
  ),
  "utf8",
);

const weapons = {
  id: "bm-weapons-cache" as const,
  name: "Weapons Cache",
  price: 5000,
  riskLevel: 75,
};

describe("black-market purchases", () => {
  it("delivers the advertised effect, reports success, and books the spend on the next tick", () => {
    const before = createInitialState();
    const result = performBlackMarketPurchase(before, weapons, () => 0.99);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.delivered).toBe(true);
    expect(result.next.resources.credits).toBe(before.resources.credits - weapons.price);
    expect(result.next.resources.ammo).toBe(before.resources.ammo + 10);
    expect(result.next.cityStats.defenseRating).toBe(before.cityStats.defenseRating + 5);
    expect(result.next.messages[0].title).toContain("DELIVERED");
    expect(result.next.blackMarketHistory).toEqual([
      expect.objectContaining({
        itemId: weapons.id,
        itemName: weapons.name,
        cost: weapons.price,
        outcome: "delivered",
        tick: before.totalTicks,
      }),
    ]);

    const tick = runTick({ ...before, ...result.next }).newState;
    expect(runTick({ ...before, ...result.next }).entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Black Market Purchase", delta: -weapons.price }),
      ]),
    );
    expect(tick.pendingTickEntries).toEqual([]);
  });

  it("charges a seized deal, applies the investigation penalty, and reports failure", () => {
    const before = createInitialState();
    const result = performBlackMarketPurchase(before, weapons, () => 0);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.delivered).toBe(false);
    expect(result.next.resources.credits).toBe(before.resources.credits - weapons.price);
    expect(result.next.resources.ammo).toBe(before.resources.ammo);
    expect(result.next.cityStats.corruption).toBe(before.cityStats.corruption + 5);
    expect(result.next.cityStats.unrest).toBe(before.cityStats.unrest + 3);
    expect(result.next.messages[0].title).toContain("SEIZED");
    expect(result.next.blackMarketHistory).toEqual([
      expect.objectContaining({
        itemId: weapons.id,
        itemName: weapons.name,
        cost: weapons.price,
        outcome: "seized",
      }),
    ]);

    const tickResult = runTick({ ...before, ...result.next });
    expect(tickResult.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Black Market Purchase", delta: -weapons.price, severity: "warning" }),
      ]),
    );
  });

  it("does not record an audit entry when a purchase cannot be confirmed", () => {
    const before = { ...createInitialState(), resources: { ...createInitialState().resources, credits: 1 } };
    const result = performBlackMarketPurchase(before, weapons, () => 0.99);

    expect(result).toEqual({ ok: false, reason: expect.stringContaining("Insufficient credits") });
    expect(before.resources.credits).toBe(1);
    expect(before.blackMarketHistory).toEqual([]);
  });

  it("keeps confirmed purchases through the save migration and sanitizer pipeline", () => {
    const before = createInitialState();
    const result = performBlackMarketPurchase(before, weapons, () => 0.99);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const persisted = JSON.parse(JSON.stringify({ ...before, ...result.next }));
    const reloaded = sanitizeState(migrateState(persisted));

    expect(reloaded.blackMarketHistory).toEqual(result.next.blackMarketHistory);
  });

  it("keeps delivered and seized confirmations clear after collapsing and reopening a market card", () => {
    // The RN screen imports a large native graph, so assert the real screen
    // source directly while the engine tests above prove both result states.
    expect(blackMarketScreenSource).toMatch(
      /expanded === item\.id \? null : item\.id/,
    );
    expect(blackMarketScreenSource).toContain(
      'showModal("ACQUIRED", `${item.name} delivered. Effect applied: ${item.effect}`',
    );
    expect(blackMarketScreenSource).toContain(
      'showModal("SEIZED", `${item.name} was seized. The deal failed; an investigation was opened.',
    );

    const purchaseHandlerStart = blackMarketScreenSource.indexOf(
      "const result = performBlackMarketPurchase(item as EngineBlackMarketItem);",
    );
    const acquiredBranch = blackMarketScreenSource.indexOf(
      'showModal("ACQUIRED"',
      purchaseHandlerStart,
    );
    const seizedBranch = blackMarketScreenSource.indexOf(
      'showModal("SEIZED"',
      purchaseHandlerStart,
    );
    expect(purchaseHandlerStart).toBeGreaterThan(-1);
    expect(acquiredBranch).toBeGreaterThan(purchaseHandlerStart);
    expect(seizedBranch).toBeGreaterThan(acquiredBranch);

    // GameModal must remain outside the expanded card map. Otherwise closing
    // and reopening a card can silently unmount the confirmation state.
    const modalRender = blackMarketScreenSource.indexOf(
      "<GameModal {...modal} onDismiss={hideModal} />",
    );
    const cardMapStart = blackMarketScreenSource.indexOf("{filtered.map");
    expect(modalRender).toBeGreaterThan(cardMapStart);
    expect(modalRender).toBeGreaterThan(
      blackMarketScreenSource.lastIndexOf("</Pressable>", modalRender),
    );
  });
});