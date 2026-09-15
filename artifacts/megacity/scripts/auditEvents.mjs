#!/usr/bin/env node
// Static audit of engine/events.ts — finds drift, dead-effects, missing
// responses, weak choices. Read-only. Outputs a categorized report.
//
// Usage:  node scripts/auditEvents.mjs
//
// Dead-effect detection: GameEvent.effects type includes a few keys the
// engine's applyEventEffects/applyResponseEffects functions do NOT apply
// (silent dead code). EventResponse.effects type also has a tighter set.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(root, "engine/events.ts"), "utf8");

// Effect keys the engine ACTUALLY applies in applyEventEffects (top-level events)
const APPLIED_EVENT_EFFECT_KEYS = new Set([
  "credits","food","water","power","fuel","unrest","crime","happiness",
  "lawOrder","corruption","employment","defenseRating","medSupplies","tradeIncome",
]);
// Effect keys the engine ACTUALLY applies in applyResponseEffects (player choices)
const APPLIED_RESPONSE_EFFECT_KEYS = new Set([
  "credits","food","water","power","unrest","crime","happiness",
  "lawOrder","corruption","defenseRating","medSupplies","tradeIncome","employment",
]);

// Detect every effects: { ... } literal and what context it's in.
// Heuristic: if the line also contains 'label:' it's a response (player
// choice). Otherwise it's a top-level event effect.
const findings = {
  deadEventEffects: [],     // top-level event uses key engine ignores
  deadResponseEffects: [],  // response uses key engine ignores
  weakChoices: [],          // event with only 1 response option
  duplicateIds: [],
  outOfBandMagnitudes: [],  // |delta| > 30 for a clamped 0-100 stat
  zeroEffects: [],          // effects: {} — pointless event
  smartQuotes: [],          // unicode " " ' ' that should be plain
};

// 1) Walk effect blocks
const effectRegex = /effects:\s*\{([^}]*)\}/g;
let m;
let lineOffset = 0;
const lines = src.split("\n");

function lineNumberAt(idx) {
  return src.slice(0, idx).split("\n").length;
}

function ctxLine(idx) {
  return lines[lineNumberAt(idx) - 1] ?? "";
}

while ((m = effectRegex.exec(src)) !== null) {
  const block = m[1];
  const idx = m.index;
  const line = ctxLine(idx);
  const isResponse = /label:/.test(line) || /\{\s*id:\s*"[^"]+",\s*label:/.test(line);
  const allowed = isResponse ? APPLIED_RESPONSE_EFFECT_KEYS : APPLIED_EVENT_EFFECT_KEYS;
  const keys = [...block.matchAll(/(\w+)\s*:/g)].map((mm) => mm[1]);

  if (keys.length === 0) {
    findings.zeroEffects.push({ line: lineNumberAt(idx), snippet: line.trim().slice(0, 120) });
    continue;
  }

  for (const k of keys) {
    if (!allowed.has(k)) {
      const target = isResponse ? findings.deadResponseEffects : findings.deadEventEffects;
      target.push({ key: k, line: lineNumberAt(idx), snippet: line.trim().slice(0, 140) });
    }
  }

  // Magnitude check on clamped 0-100 stats
  const magRegex = /(unrest|crime|happiness|lawOrder|corruption|employment)\s*:\s*(-?\d+)/g;
  let mm;
  while ((mm = magRegex.exec(block)) !== null) {
    const delta = parseInt(mm[2], 10);
    if (Math.abs(delta) > 30) {
      findings.outOfBandMagnitudes.push({
        key: mm[1], delta, line: lineNumberAt(idx),
        snippet: line.trim().slice(0, 140),
      });
    }
  }
}

// 2) Duplicate event IDs (events only — top-level objects with id + title)
const eventDefRegex = /\{\s*id:\s*"([a-z_][a-z0-9_]*)"[^}]*?title:/gi;
const idCounts = new Map();
const idLines = new Map();
let mm2;
while ((mm2 = eventDefRegex.exec(src)) !== null) {
  const id = mm2[1];
  idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  if (!idLines.has(id)) idLines.set(id, lineNumberAt(mm2.index));
}
for (const [id, count] of idCounts) {
  if (count > 1) findings.duplicateIds.push({ id, count, firstLine: idLines.get(id) });
}

// 3) Weak choices: events whose responseOptions array contains only 1 entry.
// Covers BOTH (a) RESPONSE_MAP table entries referenced by responseOptions,
// and (b) inline responseOptions: [ ... ] arrays defined directly on events.

// (a) RESPONSE_MAP / EXPANSION_RESPONSE_MAP table entries
const respMapRegex = /^\s{2}([a-z_][a-z0-9_]*):\s*\[\s*$([\s\S]*?)^\s{2}\],/gm;
let rm;
while ((rm = respMapRegex.exec(src)) !== null) {
  const key = rm[1];
  const body = rm[2];
  const count = (body.match(/\{\s*id:\s*"/g) ?? []).length;
  if (count === 1) findings.weakChoices.push({ source: "RESPONSE_MAP", key, choiceCount: count, line: lineNumberAt(rm.index) });
}

// (b) Inline responseOptions arrays. Find each opening `responseOptions: [`
// and walk forward, balancing brackets, to the matching `]`. Then count
// `{ id: "..."` literals inside (those are the choice objects).
const inlineStartRegex = /responseOptions:\s*\[/g;
let im;
while ((im = inlineStartRegex.exec(src)) !== null) {
  let i = inlineStartRegex.lastIndex; // first char inside the [
  let depth = 1;
  let inStr = false;
  let strCh = "";
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (inStr) {
      if (c === "\\") { i += 2; continue; }
      if (c === strCh) inStr = false;
    } else {
      if (c === '"' || c === "'") { inStr = true; strCh = c; }
      else if (c === "[" || c === "{") depth++;
      else if (c === "]" || c === "}") depth--;
    }
    i++;
  }
  const body = src.slice(inlineStartRegex.lastIndex, i - 1);
  const count = (body.match(/\{\s*id:\s*"/g) ?? []).length;
  if (count === 1) {
    // Find which event this belongs to: walk back to the enclosing
    // `id: "..."` for context.
    const before = src.slice(0, im.index);
    const idMatch = [...before.matchAll(/id:\s*"([a-z_][a-z0-9_]*)"/g)].pop();
    findings.weakChoices.push({
      source: "inline",
      key: idMatch ? idMatch[1] : "(unknown)",
      choiceCount: count,
      line: lineNumberAt(im.index),
    });
  }
}

// 4) Smart-quote / unicode typos in player-facing strings
const stringContentRegex = /(?:title|description|label|body):\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
let sm;
while ((sm = stringContentRegex.exec(src)) !== null) {
  const content = sm[1];
  if (/[\u201C\u201D\u2018\u2019]/.test(content)) {
    findings.smartQuotes.push({ line: lineNumberAt(sm.index), snippet: content.slice(0, 80) });
  }
}

// Render report
function section(title, items, fmt) {
  console.log(`\n=== ${title} (${items.length}) ===`);
  if (items.length === 0) { console.log("  (none)"); return; }
  for (const item of items.slice(0, 30)) console.log("  " + fmt(item));
  if (items.length > 30) console.log(`  ... +${items.length - 30} more`);
}

console.log("MEGACITY events.ts AUDIT");
console.log(`source: engine/events.ts (${lines.length} lines)`);

section("DEAD EVENT EFFECTS (engine silently drops)", findings.deadEventEffects,
  (i) => `L${i.line}  '${i.key}'  ${i.snippet}`);

section("DEAD RESPONSE EFFECTS (engine silently drops)", findings.deadResponseEffects,
  (i) => `L${i.line}  '${i.key}'  ${i.snippet}`);

section("DUPLICATE EVENT IDS", findings.duplicateIds,
  (i) => `'${i.id}' x${i.count}  first @ L${i.firstLine}`);

section("WEAK CHOICES (only 1 response)", findings.weakChoices,
  (i) => `L${i.line}  [${i.source}] ${i.key}: ${i.choiceCount} choice`);

section("OUT-OF-BAND MAGNITUDES (|Δ| > 30 on clamped 0-100 stat)",
  findings.outOfBandMagnitudes,
  (i) => `L${i.line}  ${i.key}: ${i.delta}  ${i.snippet}`);

section("ZERO-EFFECT BLOCKS (effects: {})", findings.zeroEffects,
  (i) => `L${i.line}  ${i.snippet}`);

section("SMART-QUOTE TYPOS (curly quotes in strings)", findings.smartQuotes,
  (i) => `L${i.line}  ${i.snippet}`);

const totalIssues =
  findings.deadEventEffects.length +
  findings.deadResponseEffects.length +
  findings.duplicateIds.length +
  findings.weakChoices.length +
  findings.outOfBandMagnitudes.length +
  findings.zeroEffects.length +
  findings.smartQuotes.length;

console.log(`\nTOTAL ISSUES: ${totalIssues}`);
process.exit(0);
