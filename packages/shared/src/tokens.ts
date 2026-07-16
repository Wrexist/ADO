/**
 * Design tokens — the single TypeScript source of truth for the look of both views.
 * Values are transcribed 1:1 from docs/DESIGN_SPEC.md §tokens. The Tailwind theme
 * (apps/web/tailwind.config.ts) IMPORTS this file, so a hex exists in exactly one place
 * and components use named utilities, never raw hex (CLAUDE.md convention 3).
 *
 * Keep this module pure data (no imports) — the Tailwind config loader depends on that.
 */

export const tokens = {
  color: {
    // surfaces — near-black with a blue-violet cast, separated by steps not shadows
    bgApp: '#0A0A12', // page background
    bgPanel: '#0F0F19', // sidebar / right rail
    bgCard: '#14141F', // cards
    bgElevated: '#1B1B29', // inner tiles, inputs, hover

    // borders — 1px everywhere; lift on hover
    border: 'rgba(255,255,255,0.07)',
    borderHover: 'rgba(255,255,255,0.12)',

    // text ramp
    text1: '#F4F5FA', // headings, values
    text2: '#9CA0B4', // labels, descriptions
    text3: '#5E6274', // timestamps, hints

    // brand + status
    primary: '#7C5CFF', // violet — buttons, active nav, focus
    gradientFrom: '#A855F7', // violet → pink progress gradient start
    gradientTo: '#EC4899', // progress gradient end
    success: '#22C55E', // active dots, operational, green progress
    warning: '#F59E0B', // testing/queued, amber progress
    info: '#38BDF8', // cyan accents (UI Generator, network chart)
    danger: '#EF4444', // alerts badge
  },

  /** Language dot colors (View B Projects Overview). */
  language: {
    typescript: '#3B82F6', // blue
    swift: '#F97316', // orange
    liquid: '#14B8A6', // teal
    python: '#EAB308', // yellow
  },

  font: {
    // Inter (self-hosted via @fontsource in Phase 1); Geist is an acceptable fallback face.
    family: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    weight: { regular: 400, medium: 500, semibold: 600 },
    // sizes in px — see DESIGN_SPEC
    size: {
      pageTitle: 28, // 24–28 page title
      sectionTitle: 15,
      body: 13,
      label: 11, // labels / uppercase eyebrows
      statValue: 28, // 26–28 semibold stat values, tabular-nums
    },
  },

  radius: {
    card: 16,
    tile: 10, // inner tiles / inputs
    pill: 9999, // full pills
  },

  motion: {
    hoverMs: 150, // 150ms ease on hover (border + bg lift)
    ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },

  layout: {
    canonicalWidth: 1536, // 1:1 is judged here; graceful to 1280, scroll below
    gracefulWidth: 1280,
    viewA: { sidebar: 224, rightRail: 360, topBar: 64, mainMin: 640 },
    viewB: { sidebar: 200 },
  },
} as const;

export type Tokens = typeof tokens;
export type ColorToken = keyof typeof tokens.color;
export type LanguageToken = keyof typeof tokens.language;
