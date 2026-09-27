# Local planning domain

Migration 0011 adds tasks, dependency edges, milestones, Inbox captures and immutable
revision snapshots. The `/tasks` view uses these tables through authenticated
`/api/planning` routes. Existing runs and scanner TASK.md observations remain
historical/observational data; they are not automatically converted into tasks.

Tasks own their title, intended outcome, scope, exclusions, acceptance criteria,
priority, project/repository/milestone links and dependencies. A task's project is
immutable; its repository and milestone must belong to that project. Dependencies
may explicitly refer to another project's task, but do not transfer its ownership
or context. GitHub issue URLs are references only: this feature neither reads their
status nor writes to GitHub.

Criteria have their own IDs and required/optional flags. Editing a title or
reordering unchanged criteria preserves those identities and flags. New or
rewritten criteria get new IDs and are required by default in the editor.

Updates require the current version. Validation, task fields, outgoing dependency
edges and the new revision commit together. Adding an edge traverses existing
edges before writing and rejects a cycle with its task names and IDs. Failed
validation leaves no changed title, incremented version, partial edge or revision.
Revision snapshots are append-only, enforced by SQLite triggers. Authenticated
history reads expose the stored versions, including archived captures.

The planning editor can use draft, ready, blocked and archived. Ready requires an
outcome, scope and a required acceptance criterion; it describes a sufficiently
defined plan, not permission to execute. Unaccepted dependencies are shown
separately. Queued, active, awaiting_review and accepted are reserved for dedicated
execution/review operations and are rejected by ordinary planning writes. Neither
process exit nor an external issue can mark these tasks accepted. A separate
[reviewed dispatch operation](task-execution.md) now binds an exact task revision
to a checkout/base and run. Successful exit leaves the task awaiting review;
[criterion-level review](task-criteria.md) uses a separate, current-result-bound
acceptance operation. Ordinary planning edits still cannot accept a task.

Milestones contain versioned exit criteria and planned/active/archived status. An
active milestone requires a required exit criterion. No invented deadline,
forecast or completion claim is stored. Criterion-level milestone completion is
not yet implemented.

Inbox capture accepts text without a project. A caller-generated UUID and content
hash deduplicate retries; reuse for different content conflicts. Conversion writes
a draft task, Inbox-to-task link and both revisions in one transaction. Repeating
the exact conversion returns the same task. A different conversion after success
conflicts. Capture retries in the open page retain the same key and payload until
the server confirms. These are online local-host semantics: browser-persistent
offline drafts, reconnect synchronization and device pairing remain R3 work.

Evidence uses synthetic content and isolated databases. `planning.test.ts` covers
cycles of multiple lengths, ownership, state restrictions, immutable history,
optimistic versions, duplicate capture/conversion and rollback when revision
persistence fails. `planningApi.test.ts` demonstrates T07 through the HTTP handlers
and reopens the real temporary SQLite profile. `scripts/smoke-planning.mjs` uses a
real local HTTP server and SQLite with demo content, rather than mocked planning
responses: desktop/mobile create, edit, cyclic-edge rejection with unchanged
snapshot, capture/conversion, milestone edit and reload. No provider is started.

The project registry still reserves nextTaskId. Context packets, Today/capacity planning, offline drafts and
full acceptance of B11/R1–R4 remain separate unfinished work.
