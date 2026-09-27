# Universe: explicit relations through an accessible list

Universe reads projects, Inbox ideas and milestones from their existing registers. A resource reference is a separate, manually entered title, reference and source. References remain plain text: opening this page never fetches an address, reads a referenced file or grants a provider access.

The primary interface is a searchable list with record-type and project filters, record details, assigned-project navigation and an unfiltered list of explicit relations. Record identities distinguish equal names. Relations can be followed even when the destination is outside the current project filter. Tab and Enter reach records, relation endpoints and create/remove controls; selecting a record moves focus to its detail heading. The page uses the existing light/dark theme and responsive navigation.

Supported manual annotations are `belongs_to`, `depends_on`, `shares_resource` and `related_to`. Each records a source. The two symmetric kinds canonicalize their endpoints to prevent reversed duplicates. These annotations do not move a record, change task dependency eligibility or widen execution permissions. No automated relation suggestions or spatial graph are implemented. The source specification permits a simple relationship table for v1 and keeps the list primary.

Migration `0021_universe` adds profile-local resources and relations. Creation uses stable client request identities; changed retries are rejected. Removal checks the version and retains a tombstone so an old creation retry cannot resurrect a deleted record. A resource with live relations cannot be removed until those relations are removed. Failed refreshes keep the last snapshot, label it stale and disable mutations until refresh succeeds. Failed saves retain form contents; fields are disabled during a save.

## Local validation

- `apps/server/src/projects/universe.test.ts` uses the production API and an isolated disk profile. It covers authentication, restart persistence, duplicate and stale requests, missing/self endpoints, deletion guards, tombstone retries, unchanged planning data and zero agent runs.
- `node --import tsx scripts/probe-universe.mts` builds the web app and runs its real API with synthetic data. It compares project identities against Projects, visits all four record kinds with Tab/Enter, follows a relation outside the selected filter, creates and removes a resource/relation on the narrow layout, exercises failed-refresh recovery, and checks 1536/768/390-pixel light/dark layouts without horizontal overflow or page errors.
- Source, asset and screenshot hashes are recorded in `universe-ui-evidence.json`. Screenshots in ignored `smoke-shots/` explicitly use DEMO data. Theme transitions finish before capture.
- Long save errors retain the draft without overflow. A separate 200 percent CSS-zoom check runs with reduced motion; it is not native browser zoom acceptance. `npm run verify` passed type checking, lint, 423 tests in 94 files and builds; `npm run smoke` passed. Logs: `controlos-universe-verify.log`, `controlos-universe-smoke.log`, `controlos-universe-probe-final.log`.

This is local list-first Universe evidence. It is not a screen-reader user study, packaged migration/installer acceptance, OS sandbox, live provider execution or real pilot session. Native upgrade/restore acceptance for migration 0021 remains open. Full R1–R4 gates remain separate.
