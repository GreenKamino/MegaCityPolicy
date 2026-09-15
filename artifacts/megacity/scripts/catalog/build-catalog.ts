// @ts-nocheck
/**
 * MEGACITY — "Everything You Can Build" reference catalog → PDF.
 *
 * Single, repeatable generator. Sources every entry directly from the live
 * engine data files (no hand-typing):
 *   1. EXTRACT  — imports the engine data modules below and bracket-walks the
 *                 inline `const CATEGORIES` city-construction catalog straight
 *                 out of app/(game)/construction.tsx (parsed as text because
 *                 that file pulls in React Native and can't be imported here).
 *   2. NORMALIZE — assembles everything into one `d` object grouped by section.
 *   3. RENDER   — builds a dark, dystopian styled HTML document and prints it
 *                 to PDF via the repo-root puppeteer + the system chromium.
 *   4. VERIFY   — fails loudly on source drift (missing marker, unbalanced
 *                 brackets, city-count change) and writes a machine-readable
 *                 counts file next to the PDF for auditing.
 *
 * Run it with:
 *   pnpm --filter @workspace/megacity run catalog:pdf
 *
 * Output:
 *   dist-download/MEGACITY_CATALOG.pdf
 *   dist-download/MEGACITY_CATALOG_COUNTS.json
 *
 * Out of scope (documented in their own exports): research / tech tree /
 * policies, and launchable wildlands operations (they are timed operations,
 * not buildables/recruitables/products).
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import puppeteer from "puppeteer";

import {
  ALL_COMMODITIES,
  COMMODITY_CATEGORY_LABELS,
  VEHICLES_COMMODITIES,
} from "@/engine/commodities";
import { ITEM_DEFS, CRAFTING_RECIPES } from "@/engine/inventoryData";
import { AUGMENTS, AUGMENT_CATEGORIES } from "@/engine/augments";
import { IMPLANTS, IMPLANT_CATEGORIES } from "@/engine/implants";
import {
  WEAPONS,
  VEHICLE_WEAPONS,
  NUCLEAR_WEAPONS,
  MISSILES,
  WEAPON_CATEGORIES,
  VEHICLE_WEAPON_CATEGORIES,
  NUCLEAR_WEAPON_CATEGORIES,
  AMMO_TYPES,
  ADDITIONAL_AMMO,
} from "@/engine/weapons";
import { MINING_VEHICLES, MINING_JOBS } from "@/engine/miningData";
import {
  MILITARY_BUILDINGS,
  MILITARY_BUILDING_CATEGORIES,
} from "@/engine/militaryBuildings";
import { MEGA_PROJECTS } from "@/engine/megaProjects";
import {
  SD_BUILDINGS,
  SD_COMMODITIES,
  SD_DEMOGRAPHICS,
} from "@/engine/addons/sixthDay";
import { BB_BUILDINGS, BB_UNIT_TYPES } from "@/engine/addons/bigBrother";
import { CLASS_DEFS, TIER_DEFS, SQUAD_ROLES } from "@/engine/retinueData";
import { UNIT_CATEGORIES } from "@/engine/contracts";
import { FACTION_SIGNATURE_UNITS, ORDNANCE_OPTIONS } from "@/engine/combatData";
import { CLASS_LABELS } from "@/engine/bodyguardData";
import { OFFICER_POSITIONS, TRAIT_DEFS } from "@/engine/officers";
import { CITIZEN_TRAITS } from "@/engine/traits";
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from "@/engine/innerCircleData";
import { TEAM_ROLES } from "@/engine/lawOpsData";

// ── locate the megacity package root (works run from the package or repo root)
function resolveMC() {
  const probe = "app/(game)/construction.tsx";
  const cands = [process.cwd(), path.join(process.cwd(), "artifacts/megacity")];
  for (const c of cands) {
    if (fs.existsSync(path.join(c, probe))) return c;
  }
  throw new Error(
    "build-catalog: cannot locate the megacity package root. Run via: pnpm --filter @workspace/megacity run catalog:pdf",
  );
}
const MC = resolveMC();
const COUNTS_OUT = path.join(MC, "dist-download/MEGACITY_CATALOG_COUNTS.json");

// ── themes ───────────────────────────────────────────────────────────────────
// The catalog renders in two skins from the same data + markup: the dark
// colored "screen" edition and a white, grayscale "print" edition. Only the CSS
// custom properties (and the puppeteer header/footer colors) differ between them.
const THEMES = {
  dark: {
    label: "dark",
    out: "MEGACITY_CATALOG.pdf",
    headerBg: "#0a0d0e",
    footerColor: "#5b6b6a",
    footerBg: "#0a0d0e",
    vars: `
      --bg:#0a0d0e; --panel:#11181a; --panel2:#0e1416; --line:#1f2b2d;
      --txt:#cfdad8; --muted:#7e8f8d; --dim:#5b6b6a;
      --green:#5fe08a; --amber:#f0b24a; --red:#ff6f61; --cyan:#52c4d4;
      --purple:#b98be0; --blue:#6aa6ff; --rust:#d98b5a;
      --head:#eef6f4; --head2:#eaf2f0;
      --cover-bg:radial-gradient(120% 80% at 50% 0%,#13201f 0%,#0a0d0e 60%);
      --grid-line:#13211f; --title-glow:0 0 28px rgba(95,224,138,.18);
      --stripe:rgba(255,255,255,.012); --tdline:#15201f;`,
  },
  light: {
    label: "grayscale (print)",
    out: "MEGACITY_CATALOG_PRINT.pdf",
    headerBg: "#ffffff",
    footerColor: "#5a5a5a",
    footerBg: "#ffffff",
    // Pure neutral grays (R=G=B) — no hue, so it prints clean on B&W or color
    // printers without burning color ink. Category accents become distinct
    // shades of gray to retain a little visual coding.
    vars: `
      --bg:#ffffff; --panel:#f4f4f4; --panel2:#ececec; --line:#d2d2d2;
      --txt:#1b1b1b; --muted:#5a5a5a; --dim:#8c8c8c;
      --green:#1b1b1b; --amber:#4a4a4a; --red:#2e2e2e; --cyan:#6a6a6a;
      --purple:#3d3d3d; --blue:#565656; --rust:#777777;
      --head:#0d0d0d; --head2:#1b1b1b;
      --cover-bg:#ffffff;
      --grid-line:#ededed; --title-glow:none;
      --stripe:rgba(0,0,0,.03); --tdline:#e3e3e3;`,
  },
};
// Default builds both editions; pass --print/--light or --dark to limit.
const _args = process.argv.slice(2);
const THEMES_TO_BUILD =
  _args.includes("--print") || _args.includes("--light")
    ? ["light"]
    : _args.includes("--dark")
      ? ["dark"]
      : ["dark", "light"];

// ── live engine data, grouped by catalog section ─────────────────────────────
const d = {
  commodities: {
    all: ALL_COMMODITIES,
    categoryLabels: COMMODITY_CATEGORY_LABELS,
    vehicles: VEHICLES_COMMODITIES,
    sixthDay: SD_COMMODITIES,
  },
  items: { defs: ITEM_DEFS, recipes: CRAFTING_RECIPES },
  augments: { defs: AUGMENTS, categories: AUGMENT_CATEGORIES },
  implants: { defs: IMPLANTS, categories: IMPLANT_CATEGORIES },
  weapons: {
    personal: WEAPONS,
    vehicle: VEHICLE_WEAPONS,
    nuclear: NUCLEAR_WEAPONS,
    missiles: MISSILES,
    ammo: [...AMMO_TYPES, ...ADDITIONAL_AMMO],
    ordnance: ORDNANCE_OPTIONS,
    categories: WEAPON_CATEGORIES,
    vehicleCategories: VEHICLE_WEAPON_CATEGORIES,
    nuclearCategories: NUCLEAR_WEAPON_CATEGORIES,
  },
  vehicles: { mining: MINING_VEHICLES },
  miningJobs: MINING_JOBS,
  buildings: {
    military: MILITARY_BUILDINGS,
    militaryCategories: MILITARY_BUILDING_CATEGORIES,
    sixthDay: SD_BUILDINGS,
    bigBrother: BB_BUILDINGS,
    mega: MEGA_PROJECTS,
  },
  units: {
    classes: CLASS_DEFS,
    tiers: TIER_DEFS,
    squadRoles: SQUAD_ROLES,
    contractCategories: UNIT_CATEGORIES,
    factionSignature: FACTION_SIGNATURE_UNITS,
    bodyguardClasses: CLASS_LABELS,
    bigBrother: BB_UNIT_TYPES,
  },
  demographics: {
    officers: OFFICER_POSITIONS,
    officerTraits: TRAIT_DEFS,
    citizenTraits: CITIZEN_TRAITS,
    innerCircleLabels: ROLE_LABELS,
    innerCircleDescriptions: ROLE_DESCRIPTIONS,
    lawOpsRoles: TEAM_ROLES,
    sixthDay: SD_DEMOGRAPHICS,
  },
};

// ── extract const CATEGORIES (city construction) from construction.tsx ──────
function extractCategories() {
  const src = fs.readFileSync(path.join(MC, "app/(game)/construction.tsx"), "utf8");
  const marker = "const CATEGORIES: Category[] = ";
  const mi = src.indexOf(marker);
  if (mi === -1)
    throw new Error(
      "extractCategories: CATEGORIES marker not found in construction.tsx — source drift",
    );
  const start = src.indexOf("[", mi + marker.length - 1);
  let depth = 0, inStr = false, q = "", end = -1;
  for (let i = start; i < src.length; i++) {
    const ch = src[i], prev = src[i - 1];
    if (inStr) { if (ch === q && prev !== "\\") inStr = false; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = true; q = ch; continue; }
    if (ch === "[") depth++;
    else if (ch === "]") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1)
    throw new Error(
      "extractCategories: unbalanced brackets — could not find end of CATEGORIES array",
    );
  const slice = src.slice(start, end + 1);
  const tmp = path.join(MC, "dist-download/.cats.tmp.mjs");
  fs.writeFileSync(tmp, "export const CATEGORIES = " + slice + ";");
  return import("file://" + tmp).then((m) => { fs.unlinkSync(tmp); return m.CATEGORIES; });
}

// ── helpers ────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (n) => Number(n).toLocaleString("en-US");
const cr = (n) => `${num(n)} cr`;
const titleCase = (s) => String(s).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const upper = (s) => String(s).replace(/[_-]+/g, " ").toUpperCase();
function effObj(o) {
  if (!o || typeof o !== "object") return "";
  return Object.entries(o).map(([k, v]) => {
    const sign = typeof v === "number" && v > 0 ? "+" : "";
    return `${titleCase(k)} ${sign}${v}`;
  }).join(" · ");
}
const itemName = (id) => (d.items.defs.find((x) => x.id === id)?.name) || titleCase(id);

// reusable fragments
const card = ({ title, tag, meta, body, accent }) => `
  <div class="card${accent ? " card--" + accent : ""}">
    <div class="card-head"><span class="card-title">${esc(title)}</span>${tag ? `<span class="tag">${esc(tag)}</span>` : ""}</div>
    ${meta ? `<div class="card-meta">${meta}</div>` : ""}
    ${body ? `<div class="card-body">${esc(body)}</div>` : ""}
  </div>`;
const grid = (cards) => `<div class="grid">${cards.join("")}</div>`;
const cols = (items) => `<div class="cols">${items.map((t) => `<div class="col-item">${esc(t)}</div>`).join("")}</div>`;
const subhead = (label, count) => `<h3 class="sub">${esc(label)}${count != null ? `<span class="count">${num(count)}</span>` : ""}</h3>`;
function table(headers, rows) {
  return `<table class="stat"><thead><tr>${headers.map((h, i) => `<th${i === 0 ? "" : ' class="n"'}>${esc(h)}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i === 0 ? ' class="nm"' : ' class="n"'}>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
function groupBy(arr, fn) {
  const m = new Map();
  for (const x of arr) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return [...m.entries()];
}

// ── section builders ─────────────────────────────────────────────────────────
function sectionBuildings(CATEGORIES) {
  const cityTotal = CATEGORIES.reduce((a, c) => a + c.buildings.length, 0);
  let h = "";
  // 1A city construction
  h += subhead("1A · City Construction", cityTotal);
  h += `<p class="lead">Every structure you can raise in your sector, by department.</p>`;
  for (const cat of CATEGORIES) {
    // group by subcategory if present
    const subs = {};
    for (const b of cat.buildings) {
      const k = b.subcategory || "_";
      (subs[k] = subs[k] || []).push(b);
    }
    const subKeys = Object.keys(subs);
    const multi = subKeys.length > 1 || (subKeys.length === 1 && subKeys[0] !== "_");
    h += `<h4 class="grp">${esc(cat.label)} <span class="grp-count">${cat.buildings.length}</span></h4>`;
    for (const sk of subKeys) {
      if (multi) h += `<div class="subgrp">${esc(sk === "_" ? "GENERAL" : sk)}</div>`;
      h += grid(subs[sk].map((b) => card({
        title: b.label,
        meta: `<span class="hl-amber">${esc(b.effect || "")}</span>` +
          `<span class="cost">${cr(b.cost)}${b.steelCost ? ` · ${num(b.steelCost)} steel` : ""}</span>`,
        body: b.description,
        accent: "build",
      })));
    }
  }
  // 1B military
  h += subhead("1B · Military Installations", d.buildings.military.length);
  const milGroups = groupBy(d.buildings.military, (b) => b.category);
  for (const [k, arr] of milGroups) {
    h += `<h4 class="grp">${esc(d.buildings.militaryCategories[k] || upper(k))} <span class="grp-count">${arr.length}</span></h4>`;
    h += grid(arr.map((b) => card({
      title: b.name,
      meta: `<span class="cost">Build ${cr(b.buildCost)} · Upkeep ${num(b.upkeep)}/t · ${num(b.personnel)} staff${b.defenseBonus ? ` · +${b.defenseBonus} def` : ""}</span>`,
      body: b.description, accent: "mil",
    })));
  }
  // 1C sixth day
  h += subhead("1C · Genetics & Cloning — The Sixth Day", d.buildings.sixthDay.length);
  const sdG = groupBy(d.buildings.sixthDay, (b) => b.category);
  for (const [k, arr] of sdG) {
    h += `<h4 class="grp">${esc(upper(k))} <span class="grp-count">${arr.length}</span></h4>`;
    h += grid(arr.map((b) => card({
      title: b.name,
      meta: `<span class="cost">${cr(b.baseCost)} · ${num(b.perTickCost)}/t upkeep</span>`,
      body: b.description, accent: "gene",
    })));
  }
  // 1D big brother
  h += subhead("1D · Surveillance State — Big Brother", d.buildings.bigBrother.length);
  const bbG = groupBy(d.buildings.bigBrother, (b) => b.category);
  for (const [k, arr] of bbG) {
    h += `<h4 class="grp">${esc(upper(k))} <span class="grp-count">${arr.length}</span></h4>`;
    h += grid(arr.map((b) => card({
      title: b.name,
      meta: `<span class="cost">${cr(b.baseCost)} · ${num(b.perTickCost)}/t upkeep</span>`,
      body: b.description, accent: "watch",
    })));
  }
  // 1E mega projects
  h += subhead("1E · Mega Projects", d.buildings.mega.length);
  h += `<p class="lead">Civilization-defining megastructures — multi-phase builds with their own planning and construction costs.</p>`;
  h += grid(d.buildings.mega.map((m) => card({
    title: m.name,
    meta: `<span class="cost">Plan ${cr(m.planningCost)} · Build ${cr(m.constructionCost)} · ${num(m.steelCost)} steel · ${num(m.workforceRequired)} workers · ${num(m.ticksToComplete)}t</span>` +
      (m.completionEffects?.length ? `<span class="hl-green">${esc(m.completionEffects.map((e) => e.label).join(" · "))}</span>` : ""),
    body: m.description, accent: "build",
  })));
  return h;
}

function sectionResources() {
  let h = `<p class="lead">Tradeable commodities, raw inputs, and processed materials that flow through your economy — ${num(d.commodities.all.length)} in total, grouped by class.</p>`;
  const byCat = groupBy(d.commodities.all, (x) => x.category);
  // order by category-label key order, then leftovers
  const order = Object.keys(d.commodities.categoryLabels);
  byCat.sort((a, b) => {
    const ia = order.indexOf(a[0]); const ib = order.indexOf(b[0]);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  for (const [k, arr] of byCat) {
    h += subhead(d.commodities.categoryLabels[k] || upper(k), arr.length);
    h += cols(arr.map((x) => x.name));
  }
  return h;
}

function sectionItems() {
  let h = "";
  // 3A inventory items
  h += subhead("3A · Inventory Items", d.items.defs.length);
  h += `<p class="lead">Equippable gear, armor, consumables, and relics held in your stash.</p>`;
  for (const [k, arr] of groupBy(d.items.defs, (x) => x.category)) {
    h += `<h4 class="grp">${esc(upper(k))}S <span class="grp-count">${arr.length}</span></h4>`;
    h += grid(arr.map((it) => card({
      title: it.name, tag: it.rarity ? upper(it.rarity) : "",
      meta: `<span class="cost">${it.value ? cr(it.value) : "—"}${it.equipSlot ? ` · ${titleCase(it.equipSlot)}` : ""}</span>` +
        (effObj(it.effects) ? `<span class="hl-green">${esc(effObj(it.effects))}</span>` : ""),
      body: it.description, accent: "item",
    })));
  }
  // 3B recipes
  h += subhead("3B · Crafting Recipes", d.items.recipes.length);
  h += grid(d.items.recipes.map((r) => {
    const ing = r.ingredients.map((i) => `${i.quantity}× ${itemName(i.defId)}`).join(" + ");
    const rc = Object.entries(r.resourceCost || {}).map(([k, v]) => `${num(v)} ${k}`).join(" · ");
    return card({
      title: r.name,
      meta: `<span class="recipe">${esc(ing)} <span class="arrow">&rarr;</span> ${esc(itemName(r.resultDefId))}</span>` +
        `<span class="cost">${esc(rc)}${r.ticksRequired ? ` · ${r.ticksRequired}t` : ""}</span>`,
      body: r.description, accent: "item",
    });
  }));
  // 3C augments
  h += subhead("3C · Bio-Augmentations", d.augments.defs.length);
  h += `<p class="lead">Grafted enhancements that push the body past its factory limits.</p>`;
  const augByCat = groupBy(d.augments.defs, (x) => x.category);
  const augOrder = d.augments.categories.map((c) => c.id);
  augByCat.sort((a, b) => augOrder.indexOf(a[0]) - augOrder.indexOf(b[0]));
  for (const [k, arr] of augByCat) {
    const label = d.augments.categories.find((c) => c.id === k)?.label || upper(k);
    h += `<h4 class="grp">${esc(label)} <span class="grp-count">${arr.length}</span></h4>`;
    h += grid(arr.map((a) => card({
      title: a.name,
      meta: effObj(a.effects) ? `<span class="hl-green">${esc(effObj(a.effects))}</span>` : "",
      body: a.description, accent: "aug",
    })));
  }
  // 3D implants
  h += subhead("3D · Cybernetic Implants", d.implants.defs.length);
  h += `<p class="lead">Hardware bolted into flesh — chrome where the meat used to be.</p>`;
  const impByCat = groupBy(d.implants.defs, (x) => x.category);
  const impOrder = d.implants.categories.map((c) => c.id);
  impByCat.sort((a, b) => impOrder.indexOf(a[0]) - impOrder.indexOf(b[0]));
  for (const [k, arr] of impByCat) {
    const label = d.implants.categories.find((c) => c.id === k)?.label || upper(k);
    h += `<h4 class="grp">${esc(label)} <span class="grp-count">${arr.length}</span></h4>`;
    h += grid(arr.map((a) => card({
      title: a.name, tag: a.rarity ? upper(a.rarity) : "",
      meta: `<span class="cost">${a.cost ? cr(a.cost) : "—"}</span>`,
      body: a.description, accent: "aug",
    })));
  }
  return h;
}

function sectionWeapons() {
  let h = "";
  h += subhead("4A · Personal Weapons", d.weapons.personal.length);
  for (const [k, arr] of groupBy(d.weapons.personal, (x) => x.category)) {
    h += `<h4 class="grp">${esc(d.weapons.categories[k] || upper(k))} <span class="grp-count">${arr.length}</span></h4>`;
    h += table(["Weapon", "DMG", "ACC", "RoF", "Range", "Cost"], arr.map((w) => [
      `<b>${esc(w.name)}</b><span class="td-desc">${esc(w.description || "")}</span>`,
      w.damage, w.accuracy, w.rateOfFire, w.range, num(w.cost),
    ]));
  }
  h += subhead("4B · Vehicle Weapon Systems", d.weapons.vehicle.length);
  for (const [k, arr] of groupBy(d.weapons.vehicle, (x) => x.category)) {
    h += `<h4 class="grp">${esc(d.weapons.vehicleCategories[k] || upper(k))} <span class="grp-count">${arr.length}</span></h4>`;
    h += table(["System", "DMG", "Range", "Cost"], arr.map((w) => [
      `<b>${esc(w.name)}</b>${w.description ? `<span class="td-desc">${esc(w.description)}</span>` : ""}`,
      w.damage ?? "—", w.range ?? "—", w.cost != null ? num(w.cost) : "—",
    ]));
  }
  h += subhead("4C · Missiles & Rockets", d.weapons.missiles.length);
  h += table(["Munition", "Tier", "DMG", "Range", "Blast", "Guidance", "Cost"], d.weapons.missiles.map((w) => [
    `<b>${esc(w.name)}</b><span class="td-desc">${esc(w.description || "")}</span>`,
    w.tier ?? "—", w.damage ?? "—", w.range ?? "—", w.blastRadius ?? "—", titleCase(w.guidance || "—"), num(w.cost),
  ]));
  h += subhead("4D · Nuclear Arsenal", d.weapons.nuclear.length);
  h += `<p class="lead warn">The options nobody admits to keeping. Yields in kilotons.</p>`;
  for (const [k, arr] of groupBy(d.weapons.nuclear, (x) => x.category)) {
    h += `<h4 class="grp">${esc(d.weapons.nuclearCategories[k] || upper(k))} <span class="grp-count">${arr.length}</span></h4>`;
    h += table(["Device", "Yield (kt)", "Range", "Cost"], arr.map((w) => [
      `<b>${esc(w.name)}</b><span class="td-desc">${esc(w.description || "")}</span>`,
      w.yield != null ? num(w.yield) : "—", w.range ?? "—", num(w.cost),
    ]));
  }
  // 4E ammunition
  h += subhead("4E · Ammunition", d.weapons.ammo.length);
  h += `<p class="lead">Rounds and warheads fed to the guns above. Cost is per 100.</p>`;
  for (const [k, arr] of groupBy(d.weapons.ammo, (x) => x.category)) {
    h += `<h4 class="grp">${esc(upper(k))} <span class="grp-count">${arr.length}</span></h4>`;
    h += table(["Ammunition", "Cost / 100", "DMG ×"], arr.map((a) => [
      `<b>${esc(a.name)}</b><span class="td-desc">${esc(a.description || "")}</span>`,
      num(a.costPer100), `${a.damage_modifier}×`,
    ]));
  }
  // 4F ordnance loadouts
  h += subhead("4F · Ordnance Loadouts", d.weapons.ordnance.length);
  h += table(["Loadout", "DMG ×", "Ammo Cost", "Fuel Cost", "Morale Dmg"], d.weapons.ordnance.map((o) => [
    `<b>${esc(o.name)}</b><span class="td-desc">${esc(o.description || "")}</span>`,
    `${o.damageMod}×`, num(o.ammoCost), num(o.fuelCost), num(o.moraleDamage),
  ]));
  return h;
}

function sectionVehicles() {
  let h = `<p class="lead">Heavy machinery and rolling stock — operational mining fleets and manufactured vehicle goods.</p>`;
  h += subhead("5A · Mining & Extraction Fleet", d.vehicles.mining.length);
  h += grid(d.vehicles.mining.map((v) => card({
    title: v.name,
    meta: `<span class="cost">${cr(v.cost)} · +${v.efficiency} efficiency</span>`,
    body: v.description, accent: "veh",
  })));
  h += subhead("5B · Manufactured Vehicles & Parts", d.commodities.vehicles.length);
  h += `<p class="lead">Produced and traded as commodities (also listed under Resources & Materials).</p>`;
  h += cols(d.commodities.vehicles.map((v) => v.name));
  return h;
}

function sectionUnits() {
  let h = "";
  // 6A troop classes
  h += subhead("6A · Troop Classes", d.units.classes.length);
  h += grid(d.units.classes.map((c) => card({
    title: c.name,
    meta: `<span class="cost">${cr(c.recruitCost)} · ${num(c.upkeepPerTick)}/t · ${c.baseHP} HP · ${c.baseCombat} cbt</span>` +
      `<span class="hl-green">${esc([...(c.strengths || [])].join(", "))}</span>` +
      (c.weaknesses?.length ? `<span class="hl-red">Weak: ${esc(c.weaknesses.join(", "))}</span>` : ""),
    body: c.description, accent: "unit",
  })));
  // 6B promotion tiers
  h += subhead("6B · Promotion Tiers", d.units.tiers.length);
  h += table(["Rank", "Tier", "XP Req.", "Promote Cost", "Combat ×"], d.units.tiers.map((t) => [
    `<b>${esc(t.label)}</b>`, t.rank, num(t.xpRequired), num(t.promoteCost), `${t.combatMult}×`,
  ]));
  // 6C squad roles
  h += subhead("6C · Squad Roles", d.units.squadRoles.length);
  h += grid(d.units.squadRoles.map((r) => card({ title: r.label, body: r.description, accent: "unit" })));
  // 6D hireable contract units
  h += subhead("6D · Hireable Contract Units", d.units.contractCategories.length);
  h += `<p class="lead">Forces you can recruit on contract, by branch.</p>`;
  for (const [k, arr] of groupBy(d.units.contractCategories, (x) => x.category)) {
    h += `<h4 class="grp">${esc(upper(k))} <span class="grp-count">${arr.length}</span></h4>`;
    h += table(["Unit", "Hire", "Batch", "Upkeep"], arr.map((u) => [
      `<b>${esc(u.label)}</b><span class="td-desc">${esc(u.description || "")}</span>`,
      num(u.hireCost), `×${u.hireBatch}`, `${num(u.upkeepPerUnit)}/t`,
    ]));
  }
  // 6E bodyguards
  h += subhead("6E · Personal Bodyguard Archetypes", Object.keys(d.units.bodyguardClasses).length);
  h += cols(Object.values(d.units.bodyguardClasses).map((v) => titleCase(v)));
  // 6F surveillance units
  h += subhead("6F · Surveillance Units — Big Brother", d.units.bigBrother.length);
  h += grid(d.units.bigBrother.map((u) => card({ title: u.name, body: u.description, accent: "watch" })));
  // 6G enemy signature units
  const facCount = Object.values(d.units.factionSignature).reduce((a, v) => a + v.length, 0);
  h += subhead("6G · Enemy Signature Units", facCount);
  h += `<p class="lead">The named threats each hostile faction fields against you.</p>`;
  for (const [fac, arr] of Object.entries(d.units.factionSignature)) {
    h += `<h4 class="grp">${esc(upper(fac))} <span class="grp-count">${arr.length}</span></h4>`;
    h += grid(arr.map((u) => card({ title: u.displayName, body: u.blurb, accent: "enemy" })));
  }
  return h;
}

function sectionDemographics() {
  let h = "";
  // 7A officers
  h += subhead("7A · Officer Positions", d.demographics.officers.length);
  h += `<p class="lead">Appointable command and administrative posts, by department.</p>`;
  for (const [dep, arr] of groupBy(d.demographics.officers, (x) => x.department)) {
    h += `<h4 class="grp">${esc(upper(dep))} <span class="grp-count">${arr.length}</span></h4>`;
    h += cols(arr.map((o) => o.position));
  }
  // 7B inner circle
  const icKeys = Object.keys(d.demographics.innerCircleLabels);
  h += subhead("7B · Inner Circle Roles", icKeys.length);
  h += grid(icKeys.map((k) => card({
    title: d.demographics.innerCircleLabels[k],
    body: d.demographics.innerCircleDescriptions[k], accent: "role",
  })));
  // 7C law ops roles
  h += subhead("7C · Law Operations Team Roles", d.demographics.lawOpsRoles.length);
  h += grid(d.demographics.lawOpsRoles.map((r) => card({ title: r.name, body: r.description, accent: "role" })));
  // 7D officer traits
  h += subhead("7D · Officer Traits", d.demographics.officerTraits.length);
  for (const [cat, arr] of groupBy(d.demographics.officerTraits, (x) => x.category)) {
    h += `<h4 class="grp">${esc(upper(cat))} <span class="grp-count">${arr.length}</span></h4>`;
    h += grid(arr.map((t) => card({
      title: t.name,
      meta: t.effects ? `<span class="hl-green">${esc(t.effects)}</span>` : "",
      body: t.description, accent: "trait",
    })));
  }
  // 7E citizen traits
  h += subhead("7E · Citizen Traits", d.demographics.citizenTraits.length);
  h += grid(d.demographics.citizenTraits.map((t) => card({
    title: t.name,
    meta: effObj(t.effects) ? `<span class="hl-green">${esc(effObj(t.effects))}</span>` : "",
    body: t.description, accent: "trait",
  })));
  // 7F clone demographics
  const sd = Object.values(d.demographics.sixthDay);
  h += subhead("7F · Clone Demographics — The Sixth Day", sd.length);
  h += grid(sd.map((x) => card({ title: x.label, body: x.description, accent: "gene" })));
  // 7G mining jobs
  h += subhead("7G · Mining Jobs", d.miningJobs.length);
  h += table(["Job", "Wage", "Skill"], d.miningJobs.map((j) => [
    `<b>${esc(j.name)}</b><span class="td-desc">${esc(j.description || "")}</span>`,
    `${num(j.wage)}/t`, titleCase(j.skill),
  ]));
  return h;
}

// ── assemble document ────────────────────────────────────────────────────────
async function build() {
  const CATEGORIES = await extractCategories();
  const cityTotal = CATEGORIES.reduce((a, c) => a + c.buildings.length, 0);
  const EXPECT_CITY = 498;
  if (cityTotal !== EXPECT_CITY) {
    throw new Error(`city building count drift: extracted ${cityTotal}, expected ${EXPECT_CITY}. Update EXPECT_CITY if construction.tsx changed intentionally.`);
  }
  const buildTotal = cityTotal + d.buildings.military.length + d.buildings.sixthDay.length + d.buildings.bigBrother.length + d.buildings.mega.length;
  const weaponTotal = d.weapons.personal.length + d.weapons.vehicle.length + d.weapons.missiles.length + d.weapons.nuclear.length + d.weapons.ammo.length + d.weapons.ordnance.length;
  const facCount = Object.values(d.units.factionSignature).reduce((a, v) => a + v.length, 0);
  const unitTotal = d.units.classes.length + d.units.tiers.length + d.units.squadRoles.length + d.units.contractCategories.length +
    Object.keys(d.units.bodyguardClasses).length + d.units.bigBrother.length + facCount;
  const demoTotal = d.demographics.officers.length + Object.keys(d.demographics.innerCircleLabels).length +
    d.demographics.lawOpsRoles.length + d.demographics.officerTraits.length + d.demographics.citizenTraits.length +
    Object.keys(d.demographics.sixthDay).length + d.miningJobs.length;
  const itemTotal = d.items.defs.length + d.items.recipes.length + d.augments.defs.length + d.implants.defs.length;
  const vehTotal = d.vehicles.mining.length + d.commodities.vehicles.length;

  const sections = [
    { n: 1, key: "build", title: "BUILDINGS & CONSTRUCTIONS", count: buildTotal, sub: "Structures you can raise across city, military, genetics, surveillance & mega projects", html: sectionBuildings(CATEGORIES) },
    { n: 2, key: "res", title: "RESOURCES & MATERIALS", count: d.commodities.all.length, sub: "Every commodity in the economy", html: sectionResources() },
    { n: 3, key: "item", title: "ITEMS, PRODUCTS & AUGMENTS", count: itemTotal, sub: "Gear, recipes, bio-augments & cybernetic implants", html: sectionItems() },
    { n: 4, key: "weap", title: "WEAPONS", count: weaponTotal, sub: "Personal, vehicle, missile & nuclear armaments, plus ammunition", html: sectionWeapons() },
    { n: 5, key: "veh", title: "VEHICLES", count: vehTotal, sub: "Mining fleets & manufactured vehicles", html: sectionVehicles() },
    { n: 6, key: "unit", title: "UNITS & FORCES", count: unitTotal, sub: "Troops, contracts, bodyguards & enemy signatures", html: sectionUnits() },
    { n: 7, key: "demo", title: "DEMOGRAPHICS, ROLES & JOBS", count: demoTotal, sub: "Officers, inner circle, traits & occupations", html: sectionDemographics() },
  ];

  const toc = sections.map((s) => `
    <div class="toc-row toc--${s.key}">
      <span class="toc-n">${String(s.n).padStart(2, "0")}</span>
      <span class="toc-t">${esc(s.title)}<span class="toc-sub">${esc(s.sub)}</span></span>
      <span class="toc-c">${num(s.count)}</span>
    </div>`).join("");

  const body = sections.map((s) => `
    <section class="section sec--${s.key}">
      <div class="sec-banner">
        <div class="sec-n">${String(s.n).padStart(2, "0")}</div>
        <div class="sec-titles"><h2>${esc(s.title)}</h2><div class="sec-sub">${esc(s.sub)}</div></div>
        <div class="sec-count"><span>${num(s.count)}</span><label>entries</label></div>
      </div>
      ${s.html}
    </section>`).join("");

  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const grandTotal = buildTotal + d.commodities.all.length + itemTotal + weaponTotal + vehTotal + unitTotal + demoTotal;

  const renderHtml = (themeCss) => `<!doctype html><html><head><meta charset="utf-8"><style>${themeCss}</style></head><body>
  <div class="cover">
    <div class="cover-grid"></div>
    <div class="cover-tag">MEGACITY · SECTOR MARSHAL</div>
    <h1 class="cover-title">THE FIELD<br><span>CATALOG</span></h1>
    <div class="cover-rule"></div>
    <p class="cover-desc">Everything you can build, craft, recruit, and command in the city.<br>Generated directly from the game's data — ${num(grandTotal)} catalogued entries.</p>
    <div class="cover-stats">
      ${sections.map((s) => `<div class="cstat cstat--${s.key}"><span>${num(s.count)}</span><label>${esc(s.title.split(/[&,]/)[0].trim())}</label></div>`).join("")}
    </div>
    <div class="cover-foot">CLASSIFIED REFERENCE DOCUMENT · ${esc(today)}</div>
  </div>

  <section class="toc-page">
    <h2 class="toc-h">CONTENTS</h2>
    ${toc}
    <div class="toc-note">Counts are pulled live from the engine data files. Research, the tech tree, and policies are documented in their own exports and are out of scope for this catalog.</div>
  </section>

  ${body}
  </body></html>`;

  const distDir = path.join(MC, "dist-download");
  fs.mkdirSync(distDir, { recursive: true });

  let chromium = "";
  try { chromium = execSync("command -v chromium").toString().trim(); } catch { /* fall through */ }
  if (!chromium) chromium = process.env.PUPPETEER_EXECUTABLE_PATH || "";
  const browser = await puppeteer.launch({
    ...(chromium ? { executablePath: chromium } : {}),
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const written = [];
  for (const tkey of THEMES_TO_BUILD) {
    const theme = THEMES[tkey];
    const outPath = path.join(distDir, theme.out);
    const page = await browser.newPage();
    await page.setContent(renderHtml(CSS(theme.vars)), { waitUntil: "networkidle0" });
    await page.pdf({
      path: outPath, format: "A4", printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="width:100%;background:${theme.headerBg};padding:7mm 0;margin:0;-webkit-print-color-adjust:exact;"></div>`,
      footerTemplate: `<div style="width:100%;font-family:Arial;font-size:7px;color:${theme.footerColor};background:${theme.footerBg};padding:4px 11mm 0;display:flex;justify-content:space-between;-webkit-print-color-adjust:exact;">
        <span style="letter-spacing:1px;">MEGACITY · THE FIELD CATALOG</span>
        <span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
      margin: { top: "12mm", bottom: "13mm", left: "0", right: "0" },
    });
    await page.close();
    const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
    written.push(`${theme.label} → ${theme.out} (${kb} KB)`);
  }
  await browser.close();

  // verification artifact: machine-readable counts for auditing
  const counts = {
    generatedAt: new Date().toISOString(),
    grandTotal,
    sections: {
      buildings: { total: buildTotal, city: cityTotal, military: d.buildings.military.length, sixthDay: d.buildings.sixthDay.length, bigBrother: d.buildings.bigBrother.length, mega: d.buildings.mega.length },
      resources: { total: d.commodities.all.length },
      items: { total: itemTotal, items: d.items.defs.length, recipes: d.items.recipes.length, augments: d.augments.defs.length, implants: d.implants.defs.length },
      weapons: { total: weaponTotal, personal: d.weapons.personal.length, vehicle: d.weapons.vehicle.length, missiles: d.weapons.missiles.length, nuclear: d.weapons.nuclear.length, ammo: d.weapons.ammo.length, ordnance: d.weapons.ordnance.length },
      vehicles: { total: vehTotal, mining: d.vehicles.mining.length, manufactured: d.commodities.vehicles.length },
      units: { total: unitTotal, classes: d.units.classes.length, tiers: d.units.tiers.length, squadRoles: d.units.squadRoles.length, contracts: d.units.contractCategories.length, bodyguards: Object.keys(d.units.bodyguardClasses).length, surveillance: d.units.bigBrother.length, enemySignature: facCount },
      demographics: { total: demoTotal, officers: d.demographics.officers.length, innerCircle: Object.keys(d.demographics.innerCircleLabels).length, lawOps: d.demographics.lawOpsRoles.length, officerTraits: d.demographics.officerTraits.length, citizenTraits: d.demographics.citizenTraits.length, cloneDemographics: Object.keys(d.demographics.sixthDay).length, miningJobs: d.miningJobs.length },
    },
  };
  // structural invariant: every section must have entries
  for (const [name, s] of Object.entries(counts.sections)) {
    if (!s.total || s.total < 1) throw new Error(`section "${name}" rendered 0 entries — extraction likely broke`);
  }
  fs.writeFileSync(COUNTS_OUT, JSON.stringify(counts, null, 2));

  console.log(`PDFs written to ${distDir}:`);
  for (const w of written) console.log(`  • ${w}`);
  console.log(`Counts written: ${COUNTS_OUT}`);
  console.log(`Grand total entries: ${num(grandTotal)} | buildings ${buildTotal} (city ${cityTotal}) | resources ${d.commodities.all.length} | items+aug+imp ${itemTotal} | weapons ${weaponTotal} | vehicles ${vehTotal} | units ${unitTotal} | demographics ${demoTotal}`);
}

// ── styling ──────────────────────────────────────────────────────────────────
const CSS = (V) => `
:root{${V}}
*{box-sizing:border-box;}
@page{size:A4;margin:12mm 0 13mm 0;}
html,body{margin:0;padding:0;}
body{background:var(--bg);color:var(--txt);font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:8.6px;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
section,.cover{padding:0 12mm;}
h2,h3,h4{margin:0;font-weight:800;letter-spacing:.04em;}
b{color:var(--head2);font-weight:700;}

/* cover */
.cover{position:relative;height:271mm;display:flex;flex-direction:column;justify-content:center;page-break-after:always;overflow:hidden;background:var(--cover-bg);}
.cover-grid{position:absolute;inset:0;background-image:linear-gradient(var(--grid-line) 1px,transparent 1px),linear-gradient(90deg,var(--grid-line) 1px,transparent 1px);background-size:18mm 18mm;opacity:.5;mask-image:linear-gradient(180deg,transparent,#000 30%,#000 70%,transparent);}
.cover-tag{position:relative;color:var(--green);letter-spacing:.5em;font-size:11px;font-weight:700;margin-bottom:8mm;}
.cover-title{position:relative;font-size:62px;line-height:.92;font-weight:900;letter-spacing:.02em;margin:0;color:var(--head);text-shadow:var(--title-glow);}
.cover-title span{color:var(--green);}
.cover-rule{position:relative;width:70mm;height:3px;background:linear-gradient(90deg,var(--green),transparent);margin:6mm 0;}
.cover-desc{position:relative;color:var(--muted);font-size:11px;line-height:1.6;max-width:130mm;margin:0 0 12mm;}
.cover-stats{position:relative;display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;max-width:150mm;}
.cstat{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--green);padding:4mm 4mm;border-radius:2px;}
.cstat span{display:block;font-size:22px;font-weight:900;color:var(--head);line-height:1;}
.cstat label{display:block;font-size:7px;letter-spacing:.16em;color:var(--muted);margin-top:2.5mm;text-transform:uppercase;}
.cstat--build{border-left-color:var(--green);} .cstat--res{border-left-color:var(--rust);}
.cstat--item{border-left-color:var(--cyan);} .cstat--weap{border-left-color:var(--red);}
.cstat--veh{border-left-color:var(--amber);} .cstat--unit{border-left-color:var(--purple);}
.cstat--demo{border-left-color:var(--blue);}
.cover-foot{position:absolute;bottom:14mm;left:12mm;color:var(--dim);letter-spacing:.32em;font-size:8px;}

/* toc */
.toc-page{page-break-after:always;padding-top:14mm;}
.toc-h{font-size:30px;color:var(--head);letter-spacing:.12em;border-bottom:2px solid var(--green);padding-bottom:4mm;margin-bottom:8mm;}
.toc-row{display:flex;align-items:center;gap:6mm;padding:4mm 0;border-bottom:1px solid var(--line);}
.toc-n{font-size:22px;font-weight:900;color:var(--green);width:14mm;}
.toc-t{flex:1;font-size:13px;font-weight:800;letter-spacing:.05em;color:var(--head2);display:flex;flex-direction:column;}
.toc-sub{font-size:8px;font-weight:500;letter-spacing:0;color:var(--muted);margin-top:1mm;}
.toc-c{font-size:18px;font-weight:900;color:var(--txt);}
.toc--res .toc-n{color:var(--rust);} .toc--item .toc-n{color:var(--cyan);} .toc--weap .toc-n{color:var(--red);}
.toc--veh .toc-n{color:var(--amber);} .toc--unit .toc-n{color:var(--purple);} .toc--demo .toc-n{color:var(--blue);}
.toc-note{margin-top:10mm;color:var(--dim);font-size:8.5px;font-style:italic;line-height:1.6;border-left:2px solid var(--line);padding-left:4mm;}

/* section banner */
.section{page-break-before:always;padding-top:3mm;}
.sec-banner{display:flex;align-items:center;gap:5mm;background:linear-gradient(90deg,var(--panel),transparent);border-left:4px solid var(--green);padding:5mm 5mm;margin:0 0 5mm;border-radius:2px;}
.sec--res .sec-banner{border-left-color:var(--rust);} .sec--item .sec-banner{border-left-color:var(--cyan);}
.sec--weap .sec-banner{border-left-color:var(--red);} .sec--veh .sec-banner{border-left-color:var(--amber);}
.sec--unit .sec-banner{border-left-color:var(--purple);} .sec--demo .sec-banner{border-left-color:var(--blue);}
.sec-n{font-size:34px;font-weight:900;color:var(--green);line-height:1;}
.sec--res .sec-n{color:var(--rust);} .sec--item .sec-n{color:var(--cyan);} .sec--weap .sec-n{color:var(--red);}
.sec--veh .sec-n{color:var(--amber);} .sec--unit .sec-n{color:var(--purple);} .sec--demo .sec-n{color:var(--blue);}
.sec-titles{flex:1;} .sec-titles h2{font-size:19px;color:var(--head);}
.sec-sub{font-size:8.5px;color:var(--muted);margin-top:1.5mm;letter-spacing:.02em;}
.sec-count{text-align:right;} .sec-count span{font-size:22px;font-weight:900;color:var(--head);}
.sec-count label{display:block;font-size:7px;letter-spacing:.18em;color:var(--muted);text-transform:uppercase;}

/* subsection + group heads */
h3.sub{font-size:13px;color:var(--head2);letter-spacing:.06em;margin:7mm 0 3mm;padding-bottom:2mm;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:baseline;}
h3.sub .count{font-size:11px;color:var(--green);font-weight:900;}
.lead{color:var(--muted);font-size:9px;margin:0 0 4mm;font-style:italic;}
.lead.warn{color:var(--red);opacity:.85;}
h4.grp{font-size:9px;letter-spacing:.16em;color:var(--amber);text-transform:uppercase;margin:5mm 0 2.5mm;display:flex;align-items:center;gap:3mm;}
h4.grp:after{content:"";flex:1;height:1px;background:var(--line);}
.grp-count{color:var(--dim);font-weight:700;}
.subgrp{font-size:8px;letter-spacing:.14em;color:var(--cyan);margin:3mm 0 2mm;text-transform:uppercase;font-weight:700;}

/* card grid */
.grid{display:grid;grid-template-columns:1fr 1fr;gap:2.5mm;}
.card{background:var(--panel);border:1px solid var(--line);border-left:2px solid var(--dim);border-radius:2px;padding:2.6mm 3mm;break-inside:avoid;}
.card-head{display:flex;justify-content:space-between;align-items:baseline;gap:2mm;}
.card-title{font-weight:800;color:var(--head);font-size:9px;letter-spacing:.02em;}
.tag{font-size:6.5px;letter-spacing:.1em;color:var(--bg);background:var(--muted);padding:.6mm 1.4mm;border-radius:2px;font-weight:800;white-space:nowrap;}
.card-meta{margin-top:1.4mm;display:flex;flex-direction:column;gap:.6mm;}
.card-meta>span{font-size:7.6px;}
.cost{color:var(--txt);font-variant-numeric:tabular-nums;}
.recipe{color:var(--txt);} .arrow{color:var(--green);font-weight:900;}
.hl-amber{color:var(--amber);font-weight:600;} .hl-green{color:var(--green);} .hl-red{color:var(--red);}
.card-body{margin-top:1.6mm;color:var(--muted);font-size:7.7px;line-height:1.42;}
.card--build{border-left-color:var(--green);} .card--mil{border-left-color:var(--red);}
.card--gene{border-left-color:var(--purple);} .card--watch{border-left-color:var(--blue);}
.card--item{border-left-color:var(--cyan);} .card--aug{border-left-color:var(--purple);}
.card--veh{border-left-color:var(--amber);} .card--unit{border-left-color:var(--green);}
.card--enemy{border-left-color:var(--red);} .card--role{border-left-color:var(--blue);}
.card--trait{border-left-color:var(--cyan);}

/* multi-column name lists */
.cols{column-count:4;column-gap:5mm;break-inside:avoid;}
.col-item{font-size:8px;color:var(--txt);padding:.9mm 0 .9mm 3mm;border-left:1.5px solid var(--line);margin-bottom:.5mm;break-inside:avoid;}

/* stat tables */
table.stat{width:100%;border-collapse:collapse;margin-bottom:2mm;break-inside:auto;}
table.stat th{font-size:6.8px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);text-align:left;padding:1.6mm 2mm;border-bottom:1px solid var(--line);}
table.stat th.n{text-align:right;}
table.stat td{padding:1.6mm 2mm;border-bottom:1px solid var(--tdline);vertical-align:top;font-size:8.2px;}
table.stat td.n{text-align:right;font-variant-numeric:tabular-nums;color:var(--txt);white-space:nowrap;}
table.stat td.nm{width:46%;}
table.stat tr{break-inside:avoid;}
.td-desc{display:block;color:var(--muted);font-size:7.4px;line-height:1.4;margin-top:.5mm;}
table.stat tbody tr:nth-child(even){background:var(--stripe);}
`;

build().catch((e) => { console.error(e); process.exit(1); });
