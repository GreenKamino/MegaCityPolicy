import { describe, expect, it, vi } from "vitest";
import { saveAndQuit } from "../saveAndQuit";

describe("saveAndQuit", () => {
  it("does not quit when saving fails and asks for an explicit choice", async () => {
    const quit = vi.fn();
    const onSaveFailure = vi.fn();

    const result = await saveAndQuit({
      saveGame: async () => false,
      quit,
      onSaveFailure,
    });

    expect(result).toBe(false);
    expect(quit).not.toHaveBeenCalled();
    expect(onSaveFailure).toHaveBeenCalledOnce();
  });

  it("quits only after a successful save", async () => {
    const quit = vi.fn();
    const onSaveFailure = vi.fn();

    const result = await saveAndQuit({
      saveGame: async () => true,
      quit,
      onSaveFailure,
    });

    expect(result).toBe(true);
    expect(quit).toHaveBeenCalledOnce();
    expect(onSaveFailure).not.toHaveBeenCalled();
  });
});