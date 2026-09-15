import { describe, expect, it } from "vitest";
import { createSlotLock, isSaveSessionCurrent } from "@/engine/saveLock";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("save session concurrency guard", () => {
  it("invalidates post-save side effects when the commander changes mid-write", async () => {
    const requestedBy = { epoch: 4, profileId: "commander-a" };
    let current = { epoch: 4, profileId: "commander-a", active: true };
    const write = deferred();
    const sideEffects: string[] = [];

    const inFlight = (async () => {
      expect(isSaveSessionCurrent(
        requestedBy,
        current.epoch,
        current.profileId,
        current.active,
      )).toBe(true);
      await write.promise;
      if (isSaveSessionCurrent(
        requestedBy,
        current.epoch,
        current.profileId,
        current.active,
      )) {
        sideEffects.push("updated-active-profile");
      }
    })();

    current = { epoch: 5, profileId: "commander-b", active: false };
    write.resolve();
    await inFlight;

    expect(sideEffects).toEqual([]);
  });

  it("invalidates profile updates when the commander changes during metadata refresh", async () => {
    const requestedBy = { epoch: 8, profileId: "commander-a" };
    let current = { epoch: 8, profileId: "commander-a", active: true };
    const metadataRefresh = deferred();
    const profileWrites: string[] = [];

    const afterLocalCommit = (async () => {
      expect(isSaveSessionCurrent(
        requestedBy,
        current.epoch,
        current.profileId,
        current.active,
      )).toBe(true);
      await metadataRefresh.promise;
      if (isSaveSessionCurrent(
        requestedBy,
        current.epoch,
        current.profileId,
        current.active,
      )) {
        profileWrites.push("synced-old-city-into-current-profile");
      }
    })();

    current = { epoch: 9, profileId: "commander-b", active: false };
    metadataRefresh.resolve();
    await afterLocalCommit;

    expect(profileWrites).toEqual([]);
  });

  it("does not coalesce same-numbered slots belonging to different profiles", async () => {
    const lock = createSlotLock();
    const firstWrite = deferred();
    const calls: string[] = [];

    const first = lock.run("profile-a:slot-1", async () => {
      calls.push("a-start");
      await firstWrite.promise;
      calls.push("a-finish");
    });
    const second = lock.run("profile-b:slot-1", async () => {
      calls.push("b");
    });

    await second;
    expect(calls).toEqual(["a-start", "b"]);
    firstWrite.resolve();
    await first;
    expect(calls).toEqual(["a-start", "b", "a-finish"]);
  });
});