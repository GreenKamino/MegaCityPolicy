import { describe, it, expect } from "vitest";

import { indexById } from "../../hooks/useGameLookups";

describe("indexById (useGameLookups core)", () => {
  it("indexes items by their id field", () => {
    const arr = [
      { id: "a", value: 1 },
      { id: "b", value: 2 },
      { id: "c", value: 3 },
    ];
    const map = indexById(arr);
    expect(map.get("a")).toEqual({ id: "a", value: 1 });
    expect(map.get("b")?.value).toBe(2);
    expect(map.size).toBe(3);
  });

  it("returns an empty Map for undefined input", () => {
    const map = indexById<{ id: string }>(undefined);
    expect(map.size).toBe(0);
    expect(map.get("anything")).toBeUndefined();
  });

  it("returns an empty Map for empty array", () => {
    const map = indexById<{ id: string }>([]);
    expect(map.size).toBe(0);
  });

  it("when ids collide, later entries win (last-wins semantics)", () => {
    const arr = [
      { id: "x", value: 1 },
      { id: "x", value: 2 },
    ];
    const map = indexById(arr);
    expect(map.get("x")?.value).toBe(2);
    expect(map.size).toBe(1);
  });

  it("preserves the original object references in the map values", () => {
    const a = { id: "a", payload: { nested: true } };
    const b = { id: "b", payload: { nested: false } };
    const map = indexById([a, b]);
    expect(map.get("a")).toBe(a);
    expect(map.get("b")).toBe(b);
  });
});
