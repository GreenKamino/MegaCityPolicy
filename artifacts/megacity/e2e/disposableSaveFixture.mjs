import LZString from "lz-string";

const { compressToUTF16, decompressFromUTF16 } = LZString;

const PLAYER_SAVE_PREFIX = "@megacity_slot_";
const LEGACY_SAVE_KEY = "@megacity_save";
const PROFILE_INDEX_KEY = "@megacity_profiles_index";
const ACTIVE_PROFILE_KEY = "@megacity_active_profile";
const PROFILE_PREFIX = "@megacity_profile_";

export const disposableStorageKeys = (key) => [key, `${key}_backup`, `${key}.tmp`];

function parseEnvelope(raw, label) {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error(`${label} was empty`);
  }

  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} was not valid JSON: ${error.message}`);
  }
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    throw new Error(`${label} did not contain a save envelope`);
  }

  const json = typeof envelope.data === "string"
    ? decompressFromUTF16(envelope.data)
    : raw;
  if (!json) throw new Error(`${label} could not be decompressed`);

  let state;
  try {
    state = JSON.parse(json);
  } catch (error) {
    throw new Error(`${label} contained invalid state JSON: ${error.message}`);
  }
  return { envelope, state };
}

/**
 * Decode the wrapped save format used by the game. A non-compressed JSON
 * payload remains supported so legacy fixture saves can still be inspected.
 */
export function decodeSaveEnvelope(raw, label = "fixture save") {
  return parseEnvelope(raw, label).state;
}

/**
 * Re-encode a state using the source envelope's metadata. In particular, the
 * old checksum is deliberately retained: browser fixtures edit valid saves in
 * the same way as an external editor, so the game can exercise its durable
 * integrityCompromised path instead of receiving a forged checksum.
 */
export function encodeSaveEnvelope(raw, state, label = "fixture save") {
  const { envelope } = parseEnvelope(raw, label);
  return JSON.stringify({
    ...envelope,
    data: compressToUTF16(JSON.stringify(state)),
  });
}

export async function readStorageRaw(page, key, label = `fixture storage key ${key}`) {
  const raw = await page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key);
  if (!raw) throw new Error(`${label} was not persisted`);
  return raw;
}

export async function readFixtureState(page, key, label = `fixture save ${key}`) {
  return decodeSaveEnvelope(await readStorageRaw(page, key, label), label);
}

export async function writeFixtureState(
  page,
  key,
  state,
  { templateRaw, label = `fixture save ${key}` } = {},
) {
  if (!templateRaw) throw new Error(`${label} has no source envelope`);
  const raw = encodeSaveEnvelope(templateRaw, state, label);
  await page.evaluate(({ storageKey, value }) => {
    window.localStorage.setItem(storageKey, value);
  }, { storageKey: key, value: raw });
}

export async function removeFixtureStorage(page, key) {
  await page.evaluate(({ storageKey, keys }) => {
    for (const candidate of keys) {
      window.localStorage.removeItem(candidate);
    }
  }, { storageKey: key, keys: disposableStorageKeys(key) });
}

export function isPlayerSaveKey(key) {
  return key.startsWith(PLAYER_SAVE_PREFIX) ||
    key === LEGACY_SAVE_KEY ||
    key === PROFILE_INDEX_KEY ||
    key.startsWith(PROFILE_PREFIX) ||
    key === ACTIVE_PROFILE_KEY;
}

export async function assertNoPlayerSaveStorage(page, label = "fixture") {
  const playerKeys = await page.evaluate(() =>
    Object.keys(window.localStorage).filter((key) => (
      key.startsWith("@megacity_slot_") ||
      key === "@megacity_save" ||
      key === "@megacity_profiles_index" ||
      key.startsWith("@megacity_profile_") ||
      key === "@megacity_active_profile"
    )),
  );
  if (playerKeys.length) {
    throw new Error(`${label} touched player save storage: ${JSON.stringify(playerKeys)}`);
  }
}