import type { Config } from 'tailwindcss';
// Relative import on purpose: tokens.ts is pure data (zero imports), so the PostCSS/jiti
// config loader stays dependency-free while the hex values live in exactly ONE place
// (packages/shared/src/tokens.ts — CLAUDE.md convention 3, audit L1).
import { tokens } from '../../packages/shared/src/tokens';

const c = tokens.color;

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        app: c.bgApp,
        panel: c.bgPanel,
        card: c.bgCard,
        elevated: c.bgElevated,
        text1: c.text1,
        text2: c.text2,
        text3: c.text3,
        primary: c.primary,
        'gradient-from': c.gradientFrom,
        'gradient-to': c.gradientTo,
        success: c.success,
        warning: c.warning,
        info: c.info,
        danger: c.danger,
        // single-value alias (gradient end) for the 'pink' tone. Named `magenta` so it
        // can never collide with Tailwind's default `pink` palette object.
        magenta: c.gradientTo,
      },
      borderColor: {
        DEFAULT: c.border,
        hover: c.borderHover,
      },
      borderRadius: {
        card: `${tokens.radius.card}px`,
        tile: `${tokens.radius.tile}px`,
      },
      fontFamily: {
        sans: ["'Inter'", 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        label: [`${tokens.font.size.label}px`, { lineHeight: '16px' }],
        body: [`${tokens.font.size.body}px`, { lineHeight: '20px' }],
        section: [`${tokens.font.size.sectionTitle}px`, { lineHeight: '22px' }],
        stat: [`${tokens.font.size.statValue}px`, { lineHeight: '34px' }],
        title: [`${tokens.font.size.pageTitle}px`, { lineHeight: '34px' }],
      },
      transitionTimingFunction: {
        soft: tokens.motion.ease,
      },
    },
  },
  plugins: [],
};

export default config;
