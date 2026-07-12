import { create } from 'zustand';

/** Open/close state for the global command palette (⌘K / top-bar search). */
interface PaletteStore {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const usePalette = create<PaletteStore>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
