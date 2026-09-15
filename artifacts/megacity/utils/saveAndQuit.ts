export type SaveAndQuitHandlers = {
  saveGame: () => Promise<boolean>;
  quit: () => void;
  onSaveFailure: () => void;
};

/**
 * Keep the quit decision behind the save result. A failed save must never
 * proceed directly to quit, because the player could lose the current run.
 */
export async function saveAndQuit({
  saveGame,
  quit,
  onSaveFailure,
}: SaveAndQuitHandlers): Promise<boolean> {
  const saved = await saveGame();
  if (!saved) {
    onSaveFailure();
    return false;
  }
  quit();
  return true;
}