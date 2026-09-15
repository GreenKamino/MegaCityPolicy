import { describe, expect, it } from "vitest";

import { createInitialState } from "@/engine/initialState";
import {
  NEWS_FEED_CAP,
  annexationNews,
  assassinationAttemptNews,
  constructionSurgeNews,
  coupLaunchedNews,
  edictEnactedNews,
  edictLapsedNews,
  eventResolvedNews,
  firstBuildingNews,
  megaProjectCompleteNews,
  occupationNews,
  plotFoiledNews,
  pushNewsItem,
  rivalWarDeclaredNews,
  seasonChangeNews,
  terrorStrikeNews,
  totalWarNews,
  treatyCollapsedNews,
  treatySignedNews,
  warConcludedNews,
  warDeclaredNews,
  warExhaustionNews,
  warPeaceNews,
  type NewsFeedItem,
} from "@/engine/newsFeed";
import { migrateState } from "@/engine/saveLoad";
import { ARRAY_CAPS, sanitizeState } from "@/engine/sanitizer";
import type { GameState } from "@/engine/types";

// Task #480: reactive city news. state.newsFeed is a new persisted field, so
// these tests pin down (a) the ring-buffer semantics every emission site
// relies on, (b) the copy rules (no exclamation marks — user preference), and
// (c) save compatibility: old saves without the field load with a safe
// default, and oversized/garbage feeds are capped by the sanitizer.

const item = (n: number): NewsFeedItem => ({
  id: `news-test-${n}`,
  headline: `TEST HEADLINE ${n}`,
  tick: n,
});

describe("pushNewsItem ring buffer", () => {
  it("handles an undefined feed (legacy state mid-tick) by starting fresh", () => {
    const out = pushNewsItem(undefined, item(1));
    expect(out).toEqual([item(1)]);
  });

  it("prepends newest-first, same convention as state.messages", () => {
    const out = pushNewsItem([item(1)], item(2));
    expect(out.map((n) => n.id)).toEqual(["news-test-2", "news-test-1"]);
  });

  it("never mutates the input array", () => {
    const input = [item(1)];
    const frozen = Object.freeze(input);
    const out = pushNewsItem(frozen as NewsFeedItem[], item(2));
    expect(input).toHaveLength(1);
    expect(out).toHaveLength(2);
  });

  it("caps the feed at NEWS_FEED_CAP, evicting the oldest entries", () => {
    let feed: NewsFeedItem[] = [];
    for (let i = 0; i < NEWS_FEED_CAP + 10; i++) {
      feed = pushNewsItem(feed, item(i));
    }
    expect(feed).toHaveLength(NEWS_FEED_CAP);
    // Newest first: the most recent push leads, the earliest pushes are gone.
    expect(feed[0].id).toBe(`news-test-${NEWS_FEED_CAP + 9}`);
    expect(feed.some((n) => n.id === "news-test-0")).toBe(false);
  });

  it("is idempotent on duplicate ids (strict-mode double reducer run)", () => {
    const feed = pushNewsItem([item(1)], item(1));
    expect(feed).toHaveLength(1);
  });

  it("NEWS_FEED_CAP matches the sanitizer's ARRAY_CAPS entry", () => {
    expect(ARRAY_CAPS.newsFeed).toBe(NEWS_FEED_CAP);
  });
});

describe("headline builders", () => {
  const state = { ...createInitialState(), totalTicks: 77 } as GameState;
  const all = [
    edictEnactedNews(state, "curfew", "Curfew Protocol"),
    edictLapsedNews(state, "curfew", "Curfew Protocol"),
    firstBuildingNews(state, "habBlockMegaTowers", "Hab-Block Mega Tower"),
    constructionSurgeNews(state, "habBlockMegaTowers", "Hab-Block Mega Tower", 6),
    megaProjectCompleteNews(state, "orbital_lift", "Orbital Lift"),
    eventResolvedNews(state, "evt_1", "Water Riots", "Deploy Marshals"),
    seasonChangeNews(state, "winter"),
    // Task #493: war / diplomacy / intrigue coverage.
    warDeclaredNews(state, "ferrograd", "Ferrograd"),
    // Task #496: engine-started rival wars get their own third-party copy.
    rivalWarDeclaredNews(state, "war-1", "Ferrograd", "LA CITY"),
    warPeaceNews(state, "war-1", "Ferrograd"),
    warExhaustionNews(state, "war-1", "MegaCity", "Ferrograd"),
    totalWarNews(state, "war-1", "MegaCity", "Ferrograd"),
    warConcludedNews(state, "war-1", "MegaCity", "Ferrograd"),
    annexationNews(state, "ferrograd", "Ferrograd"),
    occupationNews(state, "ferrograd", "Ferrograd"),
    treatySignedNews(state, "neg-1", "Ferrograd", "Arms Limitation Talks"),
    treatyCollapsedNews(state, "neg-1", "Ferrograd", "Arms Limitation Talks"),
    coupLaunchedNews(state, "plot-1", "The Corps"),
    terrorStrikeNews(state, "plot-1", "The Gangs"),
    assassinationAttemptNews(state, "plot-1", "The Cult"),
    plotFoiledNews(state, "plot-1", "The Gangs", "Terror Cell"),
  ];

  it("every builder bakes the tick into the id so repeat facts never collide", () => {
    for (const n of all) {
      expect(n.id).toContain("-77");
      expect(n.tick).toBe(77);
    }
    expect(new Set(all.map((n) => n.id)).size).toBe(all.length);
  });

  it("embeds the specific subject so distinct facts produce distinct strings", () => {
    expect(edictEnactedNews(state, "curfew", "Curfew Protocol").headline).toContain("CURFEW PROTOCOL");
    expect(eventResolvedNews(state, "evt_1", "Water Riots", "Deploy Marshals").headline).toContain(
      "DEPLOY MARSHALS",
    );
    expect(constructionSurgeNews(state, "x", "Recycling Plant", 6).headline).toContain("6 NEW RECYCLING PLANT");
  });

  it("obeys the copy rules: no exclamation marks, no lowercase-only sentences", () => {
    for (const n of all) {
      expect(n.headline).not.toContain("!");
      expect(n.headline).toBe(n.headline.normalize());
      expect(n.headline.length).toBeGreaterThan(20);
    }
  });

  it("covers all four seasons with distinct copy", () => {
    const seasons = (["spring", "summer", "autumn", "winter"] as const).map(
      (s) => seasonChangeNews(state, s).headline,
    );
    expect(new Set(seasons).size).toBe(4);
  });

  it("war/diplomacy/intrigue builders embed the named parties", () => {
    expect(warDeclaredNews(state, "x", "Ferrograd").headline).toContain("FERROGRAD");
    expect(rivalWarDeclaredNews(state, "w", "Ferrograd", "LA CITY").headline).toContain("FERROGRAD");
    expect(rivalWarDeclaredNews(state, "w", "Ferrograd", "LA CITY").headline).toContain("LA CITY");
    expect(warPeaceNews(state, "w", "Ferrograd").headline).toContain("FERROGRAD");
    expect(totalWarNews(state, "w", "MegaCity", "Ferrograd").headline).toContain("FERROGRAD");
    expect(annexationNews(state, "x", "Ferrograd").headline).toContain("FERROGRAD");
    expect(occupationNews(state, "x", "Ferrograd").headline).toContain("FERROGRAD");
    expect(treatySignedNews(state, "n", "Ferrograd", "Arms Limitation Talks").headline).toContain(
      "ARMS LIMITATION TALKS",
    );
    expect(coupLaunchedNews(state, "p", "The Corps").headline).toContain("THE CORPS");
    expect(terrorStrikeNews(state, "p", "The Gangs").headline).toContain("THE GANGS");
    expect(assassinationAttemptNews(state, "p", "The Cult").headline).toContain("THE CULT");
    expect(plotFoiledNews(state, "p", "The Gangs", "Terror Cell").headline).toContain("TERROR CELL");
  });

  it("phrasing variants rotate deterministically by tick and stay distinct", () => {
    // Same tick — same string (replay / strict-mode double-run stability).
    expect(warDeclaredNews(state, "x", "Ferrograd").headline).toBe(
      warDeclaredNews(state, "x", "Ferrograd").headline,
    );
    // Across ticks, more than one phrasing appears for each rotating builder.
    const acrossTicks = (build: (s: GameState) => string) =>
      new Set([0, 1, 2].map((t) => build({ ...state, totalTicks: t } as GameState))).size;
    expect(acrossTicks((s) => warDeclaredNews(s, "x", "Ferrograd").headline)).toBeGreaterThan(1);
    expect(acrossTicks((s) => rivalWarDeclaredNews(s, "w", "Ferrograd", "LA CITY").headline)).toBeGreaterThan(1);
    expect(acrossTicks((s) => warPeaceNews(s, "w", "Ferrograd").headline)).toBeGreaterThan(1);
    expect(acrossTicks((s) => annexationNews(s, "x", "Ferrograd").headline)).toBeGreaterThan(1);
    expect(acrossTicks((s) => occupationNews(s, "x", "Ferrograd").headline)).toBeGreaterThan(1);
    expect(acrossTicks((s) => treatySignedNews(s, "n", "F", "Talks Deal").headline)).toBeGreaterThan(1);
    expect(acrossTicks((s) => coupLaunchedNews(s, "p", "The Corps").headline)).toBeGreaterThan(1);
    expect(acrossTicks((s) => terrorStrikeNews(s, "p", "The Gangs").headline)).toBeGreaterThan(1);
    expect(acrossTicks((s) => plotFoiledNews(s, "p", "The Gangs", "Coup").headline)).toBeGreaterThan(1);
  });
});

describe("save compatibility", () => {
  it("a legacy save without newsFeed loads with a safe empty default", () => {
    const fresh = createInitialState();
    const legacy = { ...fresh } as Record<string, unknown>;
    delete legacy.newsFeed;
    const out = migrateState(legacy as unknown as GameState);
    expect(Array.isArray(out.newsFeed)).toBe(true);
    expect(out.newsFeed).toHaveLength(0);
    // Full pipeline: sanitize must also pass through without throwing.
    const sane = sanitizeState(out);
    expect(Array.isArray(sane.newsFeed)).toBe(true);
  });

  it("an oversized newsFeed in a tampered save is capped by the sanitizer", () => {
    const fresh = createInitialState();
    const bloated: NewsFeedItem[] = [];
    for (let i = 0; i < 500; i++) bloated.push(item(i));
    const state = { ...fresh, newsFeed: bloated } as GameState;
    const sane = sanitizeState(migrateState(state));
    expect(sane.newsFeed!.length).toBeLessThanOrEqual(NEWS_FEED_CAP);
  });

  it("a non-array newsFeed does not crash the load pipeline", () => {
    const fresh = createInitialState();
    const state = { ...fresh, newsFeed: "garbage" } as unknown as GameState;
    expect(() => sanitizeState(migrateState(state))).not.toThrow();
  });
});
