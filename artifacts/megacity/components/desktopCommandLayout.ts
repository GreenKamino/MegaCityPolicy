export const DESKTOP_COMMAND_PANE_WIDTH = 248;
export const DESKTOP_COMMAND_GRID_COLUMNS = 5;
export const DESKTOP_COMMAND_BUTTON_SIZE = 40;
export const DESKTOP_COMMAND_GRID_GAP = 4;
export const WIDE_DESKTOP_STATUS_MIN_HEIGHT = 38;

export function getCommandGridRows(destinationCount: number): number {
  return Math.ceil(Math.max(0, destinationCount) / DESKTOP_COMMAND_GRID_COLUMNS);
}

export function getCommandGridHeight(destinationCount: number): number {
  const rows = getCommandGridRows(destinationCount);
  if (rows === 0) return 0;
  return rows * DESKTOP_COMMAND_BUTTON_SIZE + (rows - 1) * DESKTOP_COMMAND_GRID_GAP;
}

export function getCommandGridWidth(): number {
  return DESKTOP_COMMAND_GRID_COLUMNS * DESKTOP_COMMAND_BUTTON_SIZE
    + (DESKTOP_COMMAND_GRID_COLUMNS - 1) * DESKTOP_COMMAND_GRID_GAP;
}