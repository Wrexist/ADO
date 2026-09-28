# OpenShip reference and ControlOS adaptation

## Project overview refinement — 2026-09-28

Revisited upstream at [`89036eb45165c488d49ced99c76852eabc48d566`](https://github.com/oblien/openship/tree/89036eb45165c488d49ced99c76852eabc48d566). Read its `LICENSE`, `apps/dashboard/src/styles/theme.css`, `components/sidebar.tsx` and `app/(dashboard)/projects/components/ProjectCard.tsx`; visually inspected `docs/screenshots/screen.png`. The reference checkout was read only; none of its dependencies or services were started.

The useful pattern is a quiet workspace surrounding focused content: neutral surfaces, restrained borders, strong project identity, secondary metadata and explicit primary actions. Its current project row also distinguishes project identity, status and hosting information. ControlOS already had the first appearance adaptation below; this pass applies that hierarchy to the project registry.

- Projects now begin with their overview, search and lifecycle filter. Creation is an explicit `New project` action with keyboard focus moved to the name field. Hiding the editor retains its draft; cancelling explicitly clears it.
- Grid/list controls change layout only. Search covers name, kind and goal; counts are derived from the loaded registry. Empty registry and no matching results have different recovery actions.
- Cards show the goal, lifecycle, repository count, priority, focus and version. Full IDs, observation times, checkout paths and revisions remain available in keyboard-operable disclosures. Import remains an explicit, separately opened operation.
- Reload keeps unsaved editor changes, including the original optimistic version, so it cannot silently overwrite a newer edit. Failed requests retain the draft and focus the error message.
- Desktop navigation removes duplicate Settings/Deployments destinations, softens section labels and gives links 44px minimum height. Planned links retain readable contrast. Header actions use quieter surfaces and larger targets.

All changes are original implementations using existing ControlOS components and tokens. No upstream source, assets, branding or dependencies were copied. Upstream's Apache-2.0 authored-code license was checked; the existing third-party license caveat still applies. No deployment/authentication/SSH behavior has been imported.

Validation for this pass is recorded after the existing review below. These UI changes do not advance any R1–R4 acceptance scenario.

Reference reviewed: [oblien/openship](https://github.com/oblien/openship/tree/fc60144ddb0312ff88502e6e660141238a616951), commit `fc60144ddb0312ff88502e6e660141238a616951`.

Inspected the repository screenshot `docs/screenshots/screen.png`, dashboard theme, sidebar, dashboard shell and README. Source was cloned into an isolated temporary reference directory; no dependencies, installation scripts or deployment services were run.

## Applied to ControlOS

- Light neutral page with distinct white surfaces; neutral charcoal dark mode. Appearance persists locally and can be changed on desktop and mobile.
- Restrained accent color, explicit semantic status colors, visible focus, reduced-motion support and readable text contrast in both palettes.
- Floating grouped sidebar with selected-page semantics; persistent workspace navigation on detail pages.
- Larger body labels, quieter branding, clearer overview heading and a responsive center column. Existing event provenance, recovery warnings and process states remain visible.
- Generic workspace preferences replace a hardcoded person/role in the sidebar.

These are fresh implementations within the existing React/Vite component system. No OpenShip code, logo, illustrations or dependencies were copied. Its authored code is Apache-2.0 according to its repository license; bundled third-party components have separate license boundaries. This document records design inspiration, not a claim of compatibility, endorsement or a complete reproduction.

## Useful architecture patterns

OpenShip describes a separation between local control plane and remote execution target, immutable deployment configuration snapshots and distinct routing/certificate action-required states. These reinforce existing ControlOS decisions: distinguish host identity from project/repository/checkout, bind results and approvals to immutable evidence, and display provider/CI/deployment evidence separately. Its deployment, SSH, container and credential code has not been integrated or audited here. Product claims in its README are not validation of ControlOS capabilities.

## Validation scope

Theme contrast checks cover normal text against page/card/elevated surfaces and primary action text. Browser smoke exercises appearance changes, persistence across reload, keyboard operation, pairing and existing recovery and task flows with explicitly synthetic data. Layouts are checked at 390/1024/1280/1536 pixels. An initial 1024px overflow in the header and squeezed project identities in Ops were corrected; the dedicated appearance probe checks both document width and visible identity space. Theme screenshots wait for surface transitions to settle. Screenshots are review artifacts, not evidence of a real provider run or published release. Full R1–R4 acceptance remains separate.

### Refinement validation

`npm run verify` passed (436 tests / 98 files, typecheck, lint and build). The first browser run found that the status select's implicit label included option text; it was replaced with an explicit `htmlFor`/`id` label. The rebuilt full `npm run smoke` then passed, including existing authentication, recovery, task execution review and criterion review flows. Final typecheck/lint also cover that label correction.

New browser assertions cover explicit creation with keyboard focus, edit focus, draft preservation on reload, explicit repository import, keyboard metadata disclosure, combined search/status filters, empty-search recovery, keyboard grid/list selection and invariant registry data. New project screenshots cover 1536/768/390/375 px and 844×390 landscape in light/dark, with reduced motion at 375 px. Existing layout checks also pass at 1024/1280 px. Manually inspected the canonical Command/Ops screenshots, the new desktop project overview and the 375px dark overview. This is not a screen-reader or operating-system text-scaling certification.

Logs: `controlos-openship-refinement-verify.log`, `controlos-openship-refinement-final-checks.log`, `controlos-openship-refinement-smoke.log`. Screenshots: `smoke-shots/openship-projects-{light,dark,list}-{width}.png`, `command.png`, `ops.png`; all synthetic DEMO data. No real model/pilot execution, merge or publication. The existing Vite large-chunk warning remains (about 609 kB uncompressed JavaScript).
