# OpenShip reference and ControlOS adaptation

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
