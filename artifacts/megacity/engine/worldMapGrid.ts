import { WORLD_MAP_BOUNDS } from "./worldMap";

export const GRID_COLS = 68;
export const GRID_ROWS = 68;
export const EXT_COLS = 68;
export const EXT_ROWS = 68;
export const TOTAL_COLS = EXT_COLS + GRID_COLS;
export const TOTAL_ROWS = EXT_ROWS + GRID_ROWS;

const COL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const COL_LABELS: string[] = [];
for (let i = 0; i < GRID_COLS; i++) {
  if (i < 26) COL_LABELS.push(COL_LETTERS[i]);
  else if (i < 52) COL_LABELS.push("A" + COL_LETTERS[i - 26]);
  else COL_LABELS.push("B" + COL_LETTERS[i - 52]);
}

const CELL_W = WORLD_MAP_BOUNDS.maxX / GRID_COLS;
const CELL_H = WORLD_MAP_BOUNDS.maxY / GRID_ROWS;

export function toGridRef(x: number, y: number): string {
  const col = Math.min(GRID_COLS - 1, Math.max(0, Math.floor(x / CELL_W)));
  const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor(y / CELL_H)));
  return `${COL_LABELS[col]}${row + 1}`;
}

export function fromGridRef(ref: string): { x: number; y: number } | null {
  const m = ref.match(/^(-?)([AB]?[A-Z])(-?\d+)$/);
  if (!m) return null;
  const neg = m[1] === "-";
  if (neg) return null;
  const colStr = m[2];
  const col = COL_LABELS.indexOf(colStr);
  const row = parseInt(m[3], 10);
  if (col < 0) return null;
  const rowIdx = row - 1;
  if (rowIdx < 0 || rowIdx >= GRID_ROWS) return null;
  return {
    x: Math.round(col * CELL_W + CELL_W / 2),
    y: Math.round(rowIdx * CELL_H + CELL_H / 2),
  };
}

export function getColLabel(i: number): string {
  return COL_LABELS[i] ?? "?";
}

export function getRowLabel(i: number): string {
  return String(i + 1);
}

export function getFullColLabel(totalIdx: number): string {
  if (totalIdx < EXT_COLS) {
    const mirrorIdx = EXT_COLS - 1 - totalIdx;
    return `-${COL_LABELS[mirrorIdx] ?? "?"}`;
  }
  return COL_LABELS[totalIdx - EXT_COLS] ?? "?";
}

export function getFullRowLabel(totalIdx: number): string {
  if (totalIdx < EXT_ROWS) {
    return String(totalIdx - EXT_ROWS);
  }
  return String(totalIdx - EXT_ROWS + 1);
}

export function getFullCellRef(totalCol: number, totalRow: number): string {
  return `${getFullColLabel(totalCol)}${getFullRowLabel(totalRow)}`;
}

export function fromFullGridRef(ref: string): { x: number; y: number; extended: boolean } | null {
  const m = ref.match(/^(-?)([AB]?[A-Z])(-?\d+)$/);
  if (!m) return null;
  const neg = m[1] === "-";
  const colStr = m[2];
  const col = COL_LABELS.indexOf(colStr);
  if (col < 0) return null;
  const rowNum = parseInt(m[3], 10);
  if (neg) {
    const mirrorCol = EXT_COLS - 1 - col;
    const totalRow = rowNum < 0 ? (EXT_ROWS + rowNum) : (EXT_ROWS + rowNum - 1);
    if (mirrorCol < 0 || mirrorCol >= EXT_COLS || totalRow < 0 || totalRow >= TOTAL_ROWS) return null;
    return {
      x: Math.round(mirrorCol * CELL_W + CELL_W / 2) - WORLD_MAP_BOUNDS.maxX,
      y: totalRow < EXT_ROWS
        ? Math.round((totalRow - EXT_ROWS) * CELL_H)
        : Math.round((totalRow - EXT_ROWS) * CELL_H + CELL_H / 2),
      extended: true,
    };
  }
  const rowIdx = rowNum - 1;
  if (col < 0 || col >= GRID_COLS || rowIdx < 0 || rowIdx >= GRID_ROWS) return null;
  return {
    x: Math.round(col * CELL_W + CELL_W / 2),
    y: Math.round(rowIdx * CELL_H + CELL_H / 2),
    extended: false,
  };
}
