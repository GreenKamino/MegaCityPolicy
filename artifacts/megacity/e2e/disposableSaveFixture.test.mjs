import assert from "node:assert/strict";
import test from "node:test";
import LZString from "lz-string";

import {
  assertNoPlayerSaveStorage,
  decodeSaveEnvelope,
  disposableStorageKeys,
  encodeSaveEnvelope,
  isPlayerSaveKey,
  removeFixtureStorage,
  writeFixtureState,
} from "./disposableSaveFixture.mjs";

const { compressToUTF16 } = LZString;

test("round-trips an edited compressed envelope while preserving integrity metadata", () => {
  const original = { totalTicks: 4, buildings: { waterPumpStations: 2 } };
  const edited = { ...original, totalTicks: 5 };
  const raw = JSON.stringify({
    v: 2,
    checksum: "checksum-for-the-original-state",
    data: compressToUTF16(JSON.stringify(original)),
  });

  assert.deepEqual(decodeSaveEnvelope(raw), original);
  const nextRaw = encodeSaveEnvelope(raw, edited);
  const nextEnvelope = JSON.parse(nextRaw);
  assert.equal(nextEnvelope.v, 2);
  assert.equal(nextEnvelope.checksum, "checksum-for-the-original-state");
  assert.deepEqual(decodeSaveEnvelope(nextRaw), edited);
});

test("rejects malformed or undecodable fixture payloads instead of silently writing them", () => {
  assert.throws(
    () => decodeSaveEnvelope("{not-json}", "construction fixture"),
    /construction fixture was not valid JSON/,
  );
  assert.throws(
    () => decodeSaveEnvelope(JSON.stringify({ v: 2, data: "not-lz-string" }), "research fixture"),
    /research fixture could not be decompressed|contained invalid state JSON/,
  );
});

test("disposable cleanup removes primary, backup, and temporary keys", async () => {
  const values = new Map(disposableStorageKeys("@fixture").map((key) => [key, "present"]));
  globalThis.window = {
    localStorage: {
      removeItem(key) {
        values.delete(key);
      },
    },
  };
  const page = {
    evaluate(fn, argument) {
      return Promise.resolve(fn(argument));
    },
  };

  await removeFixtureStorage(page, "@fixture");
  assert.deepEqual([...values], []);
});

test("writes edited state into the requested disposable key", async () => {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      setItem(key, value) {
        values.set(key, value);
      },
    },
  };
  const page = {
    evaluate(fn, argument) {
      return Promise.resolve(fn(argument));
    },
  };
  const templateRaw = JSON.stringify({
    v: 2,
    checksum: "original-checksum",
    data: compressToUTF16(JSON.stringify({ totalTicks: 1 })),
  });

  await writeFixtureState(page, "@fixture", { totalTicks: 2 }, { templateRaw });
  assert.deepEqual(decodeSaveEnvelope(values.get("@fixture")), { totalTicks: 2 });
});

test("player-save guard covers direct, legacy, profile, and metadata keys", () => {
  for (const key of [
    "@megacity_slot_1",
    "@megacity_save",
    "@megacity_profiles_index",
    "@megacity_profile_commander_slot_1",
    "@megacity_active_profile",
  ]) {
    assert.equal(isPlayerSaveKey(key), true, key);
  }
  assert.equal(isPlayerSaveKey("@megacity_e2e_research_queue_reload_1"), false);
});

test("player-save guard reports keys without mutating storage", async () => {
  globalThis.window = {
    localStorage: {
      "@megacity_slot_1": "present",
      getItem() {
        return null;
      },
    },
  };
  const page = {
    evaluate(fn) {
      return Promise.resolve(fn());
    },
  };

  await assert.rejects(
    () => assertNoPlayerSaveStorage(page, "research fixture"),
    /research fixture touched player save storage/,
  );
});