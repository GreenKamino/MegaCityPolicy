// Web-only spatial (directional) focus navigation. Powers keyboard arrow-key
// and gamepad D-pad/stick navigation on the Steam/desktop build by moving the
// browser's native focus between on-screen interactive elements based on their
// geometry. No-op on native (callers guard with Platform.OS, but every export
// here is also defensive so importing on native is harmless).

import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

export type Direction = "up" | "down" | "left" | "right";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[role="button"]:not([aria-disabled="true"])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type Rect = { left: number; right: number; top: number; bottom: number; cx: number; cy: number };

function rectOf(el: Element): Rect | null {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  // Off-screen / collapsed elements are skipped.
  if (r.bottom < 0 || r.top > (window.innerHeight || 0) || r.right < 0 || r.left > (window.innerWidth || 0)) {
    return null;
  }
  return {
    left: r.left,
    right: r.right,
    top: r.top,
    bottom: r.bottom,
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
  };
}

function isVisible(el: HTMLElement): boolean {
  if (el.getAttribute("aria-hidden") === "true") return false;
  if ((el as any).disabled) return false;
  const style = window.getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none" || style.pointerEvents === "none") return false;
  if (parseFloat(style.opacity || "1") === 0) return false;
  return true;
}

// When a modal/dialog is open RNW marks it [aria-modal="true"] and traps focus
// inside it. Scope the candidate search to the top-most such container so
// directional nav can never reach the chrome behind an open modal.
function searchRoot(): ParentNode {
  if (typeof document === "undefined") return document as any;
  const modals = document.querySelectorAll('[aria-modal="true"]');
  if (modals.length > 0) return modals[modals.length - 1];
  return document;
}

export function getFocusables(): HTMLElement[] {
  if (!isWeb || typeof document === "undefined") return [];
  const root = searchRoot();
  const list = Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)) as HTMLElement[];
  return list.filter((el) => isVisible(el) && rectOf(el) !== null);
}

// Directional scoring: a candidate must lie predominantly in `dir` from the
// origin. Score = primary-axis gap + a heavy penalty for off-axis drift, so we
// prefer the closest aligned neighbour (TV/console-style navigation).
function score(origin: Rect, cand: Rect, dir: Direction): number | null {
  const TOL = 4; // small tolerance so same-row/col siblings still qualify
  let primaryGap: number;
  let offAxis: number;
  switch (dir) {
    case "up":
      if (cand.bottom > origin.top + TOL) return null;
      primaryGap = origin.cy - cand.cy;
      offAxis = Math.abs(cand.cx - origin.cx);
      break;
    case "down":
      if (cand.top < origin.bottom - TOL) return null;
      primaryGap = cand.cy - origin.cy;
      offAxis = Math.abs(cand.cx - origin.cx);
      break;
    case "left":
      if (cand.right > origin.left + TOL) return null;
      primaryGap = origin.cx - cand.cx;
      offAxis = Math.abs(cand.cy - origin.cy);
      break;
    case "right":
      if (cand.left < origin.right - TOL) return null;
      primaryGap = cand.cx - origin.cx;
      offAxis = Math.abs(cand.cy - origin.cy);
      break;
  }
  if (primaryGap <= 0) return null;
  return primaryGap + offAxis * 2.5;
}

function focusEl(el: HTMLElement): void {
  try {
    el.focus({ preventScroll: true } as any);
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  } catch {
    try {
      el.focus();
    } catch {}
  }
}

// Move native focus one step in `dir`. Returns true if focus moved (caller can
// then preventDefault), false if there was no candidate in that direction (so
// the caller can fall back to scrolling or sub-tab switching).
export function moveFocus(dir: Direction): boolean {
  if (!isWeb || typeof document === "undefined") return false;
  const focusables = getFocusables();
  if (focusables.length === 0) return false;

  const active = document.activeElement as HTMLElement | null;
  const activeRect = active && focusables.includes(active) ? rectOf(active) : null;

  if (!activeRect) {
    // Nothing focused yet — focus the element nearest the top-left so the
    // first key/D-pad press always lands somewhere sensible.
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of focusables) {
      const r = rectOf(el);
      if (!r) continue;
      const s = r.top + r.left * 0.1;
      if (s < bestScore) {
        bestScore = s;
        best = el;
      }
    }
    if (best) {
      focusEl(best);
      return true;
    }
    return false;
  }

  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of focusables) {
    if (el === active) continue;
    const r = rectOf(el);
    if (!r) continue;
    const s = score(activeRect, r, dir);
    if (s !== null && s < bestScore) {
      bestScore = s;
      best = el;
    }
  }
  if (best) {
    focusEl(best);
    return true;
  }
  return false;
}

// Fallback when a vertical focus move finds no candidate: the next item is
// usually just below/above the fold of a scrollable list (rectOf skips
// fully-offscreen elements, and virtualized lists don't even render them), so
// a D-pad press would otherwise be silently swallowed and the player could
// never reach the rest of the list (Steam Deck bug report: building list on
// the construction screen). Scrolls the nearest scrollable ancestor of the
// focused element — or the tallest visible scrollable on screen when nothing
// is focused — so the next press has a candidate. Returns true if it scrolled.
function isScrollableY(el: HTMLElement): boolean {
  if (el.scrollHeight <= el.clientHeight + 1) return false;
  const oy = window.getComputedStyle(el).overflowY;
  return oy === "auto" || oy === "scroll";
}

export function scrollForDirection(dir: Direction): boolean {
  if (!isWeb || typeof document === "undefined") return false;
  if (dir !== "up" && dir !== "down") return false;

  let target: HTMLElement | null = null;
  const active = document.activeElement as HTMLElement | null;
  let node: HTMLElement | null = active && active !== document.body ? active : null;
  while (node && node !== document.body) {
    if (isScrollableY(node)) {
      target = node;
      break;
    }
    node = node.parentElement;
  }
  if (!target) {
    // Nothing focused (or no scrollable ancestor): scroll the tallest visible
    // scrollable container inside the current search root (modal-aware).
    const root = searchRoot();
    let bestArea = 0;
    for (const el of Array.from(root.querySelectorAll("div")) as HTMLElement[]) {
      if (!isScrollableY(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height <= 0 || r.width <= 0) continue;
      if (r.bottom < 0 || r.top > (window.innerHeight || 0)) continue;
      const area = r.width * r.height;
      if (area > bestArea) {
        bestArea = area;
        target = el;
      }
    }
  }
  if (!target) return false;

  const before = target.scrollTop;
  const step = Math.max(80, Math.round(target.clientHeight * 0.6));
  try {
    target.scrollBy({ top: dir === "down" ? step : -step, behavior: "smooth" });
  } catch {
    target.scrollTop = before + (dir === "down" ? step : -step);
  }
  // With smooth scrolling scrollTop may not have changed yet — report based on
  // whether movement in that direction is possible at all.
  const canMove =
    dir === "down"
      ? before < target.scrollHeight - target.clientHeight - 1
      : before > 1;
  return canMove;
}

// Activate (click) the currently focused element, mirroring a tap. Used by the
// gamepad "A" button. Returns true if something was activated.
export function activateFocused(): boolean {
  if (!isWeb || typeof document === "undefined") return false;
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body) return false;
  try {
    active.click();
    return true;
  } catch {
    return false;
  }
}

// Drop focus back to the body (gamepad "B" / cancel can use this to clear a
// stuck focus ring). Returns true if it cleared an element.
export function clearFocus(): boolean {
  if (!isWeb || typeof document === "undefined") return false;
  const active = document.activeElement as HTMLElement | null;
  if (active && active !== document.body) {
    try {
      active.blur();
      return true;
    } catch {}
  }
  return false;
}
