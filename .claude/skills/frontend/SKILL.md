---
name: frontend
description: Build or change React UI in apps/web the way this repo requires — kit + tokens only, honest states, accessible, zero console errors. Use for any component, page, or view change.
---

# Frontend here (conventions 1–4)

- **Kit + tokens only.** Compose from `apps/web/src/kit` — a view-specific one-off must be promoted to the kit first. NO raw hex; everything from `tokens.ts`/Tailwind theme.
- **No fabricated numbers.** Render only from the bus store (`useBus`) via `lib/selectors`. Missing data → stale/offline/"unavailable"/"collecting data" — never a plausible number. Sparklines need ≥2 real samples; radial rings need an explicit denominator.
- **Every state.** loading / empty / error / degraded — never a blank screen. Live/elapsed values sit in reserved fixed-width tabular slots (no reflow).
- **Zustand discipline.** Select the stable `s.state`; derive OUTSIDE the selector (a derived object inside the selector re-renders infinitely).
- **a11y.** Keyboard-reachable, visible focus, `aria-label` on icon-only controls.
- **No dead buttons.** Every control navigates or acts, or routes to an honest `/planned/:slug` placeholder — never a no-op.
- **Finish ritual.** `npm run smoke` must render `/command`·`/ops`·`/prompts` with ZERO console errors; screenshots at the canonical 1536px viewport for review.
