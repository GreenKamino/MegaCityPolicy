import { useEffect, useState } from "react";

type Listener = (visible: boolean) => void;

let paletteVisible = false;
const listeners = new Set<Listener>();

function setVisible(next: boolean): void {
  paletteVisible = next;
  for (const listener of listeners) listener(next);
}

export function openCommandPalette(): void {
  setVisible(true);
}

export function closeCommandPalette(): void {
  setVisible(false);
}

export function toggleCommandPalette(): void {
  setVisible(!paletteVisible);
}

export function isCommandPaletteVisible(): boolean {
  return paletteVisible;
}

export function useCommandPalette() {
  const [visible, setLocalVisible] = useState(paletteVisible);

  useEffect(() => {
    listeners.add(setLocalVisible);
    setLocalVisible(paletteVisible);
    return () => {
      listeners.delete(setLocalVisible);
    };
  }, []);

  return {
    visible,
    show: openCommandPalette,
    hide: closeCommandPalette,
    toggle: toggleCommandPalette,
  };
}