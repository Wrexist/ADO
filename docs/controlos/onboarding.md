# First-run onboarding

A new desktop user previously saw one card with two equal buttons ("Connect GitHub",
"Add a local folder"), nothing about Claude, and a Setup page that kept saying
"Set PROJECT_DIRS in .env" even after a folder was added in the app. Setup also
reported npm-installed tools (`npm`, `code`) as missing on Windows because Node cannot
spawn `.cmd` shims directly, and probes ran without `USERPROFILE`/`APPDATA`.

Changes:

- `/command` (and the 390 px overview) show a **Get started** checklist while there are
  no repositories: add the code folder (inline form, native "Browse…" in the desktop app),
  install and sign in to Claude Code (runs the catalog install/sign-in and waits for it),
  and optionally connect GitHub (token saved and checked immediately). Status per step
  comes from `/api/projects`, `/api/setup` and `/api/connections`.
- Afterwards a "Finish setup" reminder appears only while a required step is open.
- Setup counts folders added in the app, and computes that row live on each request.
  The requirement is now "Project folders" with an "Add a folder" action; Git has a
  `winget` command; the GitHub link no longer asks for the `workflow` scope.
- A Claude sign-in that is not a subscription (`authMethod` other than `claude.ai`) is
  shown as not ready, matching the runner's billing guard.
- Catalog tools resolve `.exe`/`.cmd` on PATH; `.cmd` runs through cmd.exe with plain
  arguments only (anything else is refused).

Evidence: `scripts/probe-onboarding.mts` (built renderer, production server, empty
profile, real read-only Setup probe; checklist at 1536/390 px, folder added and its
repository appears, Setup shows the folder row installed; `onboarding-evidence.json`,
`smoke-shots/onboarding-*.png`), `processControl.test.ts` (shim resolution, refusal of
non-plain arguments, a real `.cmd` run through the probe), `connectionStatus.test.ts`
(folder added via API marks Setup ready), `scripts/verify.sh` 504 tests, `npm run smoke`.

Limits: the NSIS installer's install/uninstall and the desktop folder picker are not
exercised by an automated test. The Claude install step needs Node.js/npm on the machine.
