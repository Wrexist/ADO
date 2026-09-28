# Reference context review in the task-run UI

The run review now includes optional reference packages for the selected task revision, checkout and base commit. The operator selects committed paths, previews exact source bytes, saves an immutable package, records a reason and confirms a reference-only approval. Approval and selecting the package for a run are separate actions. The run request includes the exact package ID, digest and review version.

The panel lives outside the dispatch form: pressing Enter in the review reason cannot start a run. A selected package remains selected but blocks dispatch if it is revoked, fails to load or no longer matches the displayed task/checkout/base. Removing reference context requires an explicit action. The server retains its independent validation before execution; the UI never grants filesystem or execution permissions.

Package creation, review and run submission retain request identities during retries. Lost responses can be retried without duplicating durable records. Changes to source selection reset the prior decision draft. Once a run request has been submitted, its source/provider/context choices are frozen for a retry. Review text survives failures. Historical approval is labelled as historical, with filesystem freshness explicitly unverified by a package read.

Authenticated package discovery returns at most 50 metadata summaries per page, ordered by creation timestamp and package ID. The cursor is bound to its task. Lists contain no source text, paths or review reasons. A separate status request supports revocation when source content is inaccessible; malformed stored packages still fail integrity checks.

## Evidence

- `npm run verify`: typecheck, lint, 437 tests in 98 files and build passed. Final typecheck/lint and rebuilt browser checks cover subsequent focus-margin and decision-reset refinements.
- `contextPackages.test.ts`: tied timestamps across 51 packages produce complete, nonoverlapping pages; a cursor for another task is refused. Metadata listing remains possible when registered secrets prevent source reads.
- `contextSource.test.ts`: list authentication, no-store response, bounded metadata and invalid cursor rejection through the production API, alongside the existing real Git/profile restart tests.
- `scripts/probe-context-packages.mts`: isolated Git repository and disk profile, production context APIs and the built renderer at 1536/390 px in both themes. Real requests are committed before deliberately losing save/approval responses; retries retain identities and yield one package/review. External HTML remains text. Revocation blocks selected context; a new Git HEAD refuses approval and preserves the reason. Package discovery survives browser reload. No run is created.
- The probe captures and refuses dispatch as an explicit UI fixture, verifying the exact selected context binding and unchanged retry payload. One content-read refusal is also simulated; metadata lookup and revocation use the real API. These fixtures are not evidence of provider execution or sandbox protection.
- The final probe asserts the focused package heading clears mobile navigation. Screenshots and source/build hashes are recorded in `context-packages-ui-evidence.json`.
- `npm run smoke` passed against the built app, including the existing no-context dispatch path, authentication, recovery, project registry and task review flows. Fresh canonical Command/Ops screenshots were retained.
- The Universe regression probe was adapted to the current project details disclosures and passed again, including unchanged planning and zero runs. Refreshed evidence is in `universe-ui-evidence.json`; log `controlos-context-ui-universe-regression.log`.

Local logs: `controlos-context-ui-verify.log`, `controlos-context-ui-final-checks.log`, `controlos-context-ui-focused.log`, `controlos-context-ui-probe.log`, `controlos-context-ui-smoke.log`. Images in `smoke-shots/` contain synthetic DEMO material. The existing large JavaScript chunk warning remains.

## Remaining scope

B12 is not complete. Instruction roles, verified handoff provenance, full stale-memory treatment and live provider/sandbox canary acceptance remain open. T10/T11 and full R1–R4 gates are unchanged. Native profile upgrades for the context schemas also require their own evidence. A successful browser test is not proof of a published release or real pilot utility.
