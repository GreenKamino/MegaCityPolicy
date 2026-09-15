// Compatibility-only tombstones for content removed from the live catalog.
// These identifiers must never be reused: old saves can still contain them,
// so load-time sanitization and generic selectors consult this denylist.
export const LEGACY_DENIED_CONTENT_IDS: ReadonlySet<string> = new Set([
  "neon-shogunate",
  "neon_shogunate_protocol",
  "shogunate_protocol_violation",
  "lore_neon_shogunate",
  "tenno_9",
]);

/**
 * Stable location ids whose public names changed after they were already
 * available in saves. Keep these rules keyed by id so a replacement only
 * applies to intel about that location; historical prose elsewhere is left
 * untouched.
 */
const LEGACY_LOCATION_PRESENTATION_NAMES: ReadonlyMap<string, { retired: string; current: string }> = new Map([
  ["dusthaven", { retired: "Dusthaven", current: "Mexico City" }],
  ["iron-khanate", { retired: ["Iron", "Khanate"].join(" "), current: "LA CITY" }],
  ["nova-pacifica", { retired: "Nova Pacifica", current: "Megacity Pacifica" }],
  ["crimson-reach", { retired: "Crimson Reach", current: "Red Mesa" }],
  ["cheyenne-mountain", { retired: "Cheyenne Mountain", current: "USR (United States Remnants)" }],
]);

export function isLegacyDeniedContentId(value: unknown): value is string {
  return typeof value === "string" && LEGACY_DENIED_CONTENT_IDS.has(value);
}

/**
 * Rewrites retired location names embedded in old world-intel prose when the
 * record still carries the stable legacy location id. This keeps historical
 * event text compatible without changing unrelated narrative that happens to
 * mention a retired name.
 */
export function canonicalizeLegacyWorldIntelText(
  value: string | undefined,
  revealedId: unknown,
): string | undefined {
  if (typeof value !== "string") return value;
  const presentation = LEGACY_LOCATION_PRESENTATION_NAMES.get(String(revealedId));
  if (!presentation) return value;
  return value.replace(new RegExp(`\\b${presentation.retired}\\b`, "gi"), presentation.current);
}

const LEGACY_REFERENCE_KEYS = new Set([
  "factionId", "targetId", "locationId", "partnerId", "leaderId", "portraitId",
  "sourceId", "destinationId",
]);

/**
 * Removes retired catalog identities from persisted JSON-shaped state. This is
 * deliberately idempotent and only acts on exact identifiers, never prose.
 * A relation/selection carrying a retired reference is removed as a unit so a
 * partially scrubbed record cannot remain selectable after load.
 */
export function scrubLegacyContent<T>(value: T): T {
  const seen = new WeakMap<object, unknown>();
  const scrub = (current: unknown): unknown => {
    if (isLegacyDeniedContentId(current)) return undefined;
    if (!current || typeof current !== "object") return current;
    if (seen.has(current)) return seen.get(current);
    if (Array.isArray(current)) {
      const cleaned: unknown[] = [];
      seen.set(current, cleaned);
      for (const entry of current) {
        const next = scrub(entry);
        if (next !== undefined) cleaned.push(next);
      }
      return cleaned;
    }
    const record = current as Record<string, unknown>;
    if (
      isLegacyDeniedContentId(record.id) ||
      [...LEGACY_REFERENCE_KEYS].some((key) => isLegacyDeniedContentId(record[key]))
    ) return undefined;
    const cleaned: Record<string, unknown> = {};
    seen.set(current, cleaned);
    for (const [key, entry] of Object.entries(record)) {
      if (isLegacyDeniedContentId(key)) continue;
      const next = scrub(entry);
      if (next !== undefined) cleaned[key] = next;
    }
    return cleaned;
  };
  return (scrub(value) ?? {}) as T;
}