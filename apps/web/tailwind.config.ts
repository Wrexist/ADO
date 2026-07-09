import type { Config } from 'tailwindcss';

/**
 * Tailwind theme — mirrors packages/shared/src/tokens.ts (both derive from
 * docs/DESIGN_SPEC.md §tokens). Values are inlined here (not imported) so the
 * PostCSS/jiti config loader stays dependency-free and robust. Keep the two in sync;
 * Phase 1 may add a codegen step that derives this theme from tokens.ts.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        app: '#0A0A12',
        panel: '#0F0F19',
        card: '#14141F',
        elevated: '#1B1B29',
        text1: '#F4F5FA',
        text2: '#9CA0B4',
        text3: '#5E6274',
        primary: '#7C5CFF',
        'gradient-from': '#A855F7',
        'gradient-to': '#EC4899',
        success: '#22C55E',
        warning: '#F59E0B',
        info: '#38BDF8',
        danger: '#EF4444',
      },
      borderColor: {
        DEFAULT: 'rgba(255,255,255,0.07)',
        hover: 'rgba(255,255,255,0.12)',
      },
      borderRadius: {
        card: '16px',
        tile: '10px',
      },
      fontFamily: {
        sans: ["'Inter'", 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        label: ['11px', { lineHeight: '16px' }],
        body: ['13px', { lineHeight: '20px' }],
        section: ['15px', { lineHeight: '22px' }],
        stat: ['28px', { lineHeight: '34px' }],
        title: ['28px', { lineHeight: '34px' }],
      },
      transitionTimingFunction: {
        soft: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
