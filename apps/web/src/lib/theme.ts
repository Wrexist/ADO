import { create } from 'zustand';
import { themes } from '@ado/shared';

export type Theme = keyof typeof themes;
const key = 'controlos.appearance';
function initialTheme(): Theme {
  try { return localStorage.getItem(key) === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}
function apply(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  for (const [name, hex] of Object.entries(themes[theme])) {
    const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)).join(' ');
    root.style.setProperty(`--controlos-${name}`, rgb);
  }
}
const initial = initialTheme();
apply(initial);
export const useTheme = create<{ theme: Theme; toggle: () => void }>((set, get) => ({
  theme: initial,
  toggle() {
    const theme = get().theme === 'light' ? 'dark' : 'light';
    apply(theme); set({ theme });
    try { localStorage.setItem(key, theme); } catch { /* Appearance still works without storage. */ }
  },
}));
