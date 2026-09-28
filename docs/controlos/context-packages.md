# Durable context packages and explicit reference review

Migration `0022_context_packages` adds immutable source packages and append-only review history. A package binds selected source bytes to its task revision, task-snapshot hash, repository, checkout and base commit. Its digest covers the complete stored payload. SQLite triggers refuse edits/deletion of package content and review history. Reads check payload/file digests, byte counts and review ordering; invalid data is not replaced by empty defaults.

## API

- `POST /api/planning/tasks/:id/context/packages`: the source-preview selection plus a stable UUID `id`. The server re-reads the selected committed files before storing the package. Reusing the same ID and request returns the original package; changed content under that request ID is rejected.
- `GET /api/context/packages/:id`: the exact package and historical reviews, with `no-store`. Registered secrets are checked again before source content is returned.
- `GET /api/context/packages/:id/status`: digest, review version and historical decision without source text or review reasons. This remains available when source access is refused due to newly registered secrets.
- `POST /api/context/packages/:id/review`: `id` (decision UUID), `version` (current review version), `digest`, `decision` (`approved_for_context` or `revoked`) and a nonempty `reason`. The authenticated local-owner API supplies the actor identity; clients cannot provide one.

Approval rechecks the current task revision, checkout identity, HEAD and every selected blob/hash before recording the decision. A changed task or base requires a new package. Revocation does not require the original files to remain available. Review writes use optimistic versions and a unique per-package sequence. Retries cannot duplicate decisions or turn a later revocation back into the earlier approval. Decision replay reports the latest state.

Approval here means explicit acceptance of these bytes as reference context. It does not authorize a process, another project, filesystem access, merge, deploy or result acceptance. Reads report `freshness: not_checked`: a historical review is not proof of the current filesystem state. Provider use will need its own fresh check at dispatch/start. This is still the shared local-owner credential trust boundary, not proof of a distinct human identity.

UTF-8 source decoding now preserves a leading BOM, keeping saved text byte-equivalent to the blob used for its SHA-256 digest. This corrected an inconsistency discovered while adding package integrity checks.

## Validation and remaining scope

Store tests cover immutable content, exact request/decision retries, stale digest/version refusal, revocation, newly registered secrets, write-failure rollback, corrupt storage and changed task revisions. Production API tests use a real disk profile and Git repository: create/approve, restart, exact-byte persistence (including BOM), changed-HEAD refusal and successful revocation. They assert unchanged planning state and zero runs.

`npm run verify` passed type checking, lint, 433 tests in 97 files and builds on Windows x64 / Node 22.18.0. Source/log hashes are recorded in `context-packages-evidence.json`. Logs: `controlos-context-packages-focused.log`, `controlos-context-packages-store.log`, `controlos-context-packages-verify.log`.

The package-review UI, dispatch integration, separately approved instruction roles, handoff provenance, provider context accounting and full sandbox/provider canary acceptance remain open under B12/T10/T11. The native installer/upgrade/restore path for migration 0022 is not accepted by these server tests. No new full acceptance scenario is marked passed.
