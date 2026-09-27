# Project, repository and checkout registry

The `/projects` view stores planning projects separately from scanner observations,
GitHub repositories and local checkouts. Migration 0010 adds four SQLite tables;
it leaves historical scanner IDs, runs, policies and user files intact. Existing
observations are candidates for explicit import, not automatically created projects.

A project has its own UUID, user-owned name, kind, goal, lifecycle, focus and manual
priority. Updates require the current version and reject lost updates. Repository
observations never overwrite these fields. The next-task field is reserved and
currently null. [Tasks, Inbox and milestones](planning-domain.md) now have a separate
planning store; choosing a project's next task remains subsequent work.

GitHub repository identity uses the API's numeric repository ID, stored as a string,
plus the host. Owner/name is a mutable label. Successful observations update the
name and exact default-branch spelling while retaining the imported UUID. Missing
default-branch metadata stays unknown. This is not a verified branch-head commit
or a dispatch baseline. Offline/failed refreshes leave the last observation and its
timestamp in SQLite. No new retry loop is introduced.

Local imports require a source already present in both scanner observations and
the scanner's directory map. Clients cannot supply an arbitrary path. Import reads
Git metadata and directory identities; it does not stage, commit, clean, stash or
write project files. The canonical folder, volume/file identity and common Git
directory identity distinguish checkouts from repositories. Worktrees share a
repository identity; directory aliases collapse to one checkout. A folder rename
on the same filesystem retains the checkout UUID after a new scanner observation.
A replacement folder or replacement Git directory is refused rather than silently
inheriting the previous identity. An unborn repository can be registered with no
observed commit; import does not make it ready for agent execution.

Associating a local checkout with an imported GitHub repository is an explicit
choice. Its recognized origin URL must match that repository's observed URL.
Already associated checkouts/common Git directories cannot silently be reassigned.
This association is owner-selected metadata, not proof of clone ancestry, branch
freshness or execution permission. Arbitrary remotes and embedded credentials are
not copied into the registry's canonical remote field.

Identity limits are explicit: the host key currently hashes OS and hostname within
the local profile; it is not device authentication. Moving between volumes, cloning
to another machine, rebuilding `.git`, restoring a profile on a new host and reuse
of filesystem identifiers require a future reconciliation workflow. Directory
checks do not provide an OS sandbox or eliminate same-user races. Stored checkout
metadata is an observation, not continuous proof that the folder still exists.

Registry APIs require the existing owner token. Project import changes neither
feature switches nor the dispatch allow-list and starts no process. The legacy
repository view retains scanner/connection controls. No automatic migration of
pilot projects or destructive identity merge is performed.

Regression evidence is in `projects/registry.test.ts` and `registryApi.test.ts`:
similar GitHub names with different IDs, observed rename/default-branch updates,
manual field preservation, optimistic concurrency, real Git worktrees, folder
rename/profile reopen, dirty files/index/config preservation, unborn repositories,
replacement directories, aliases, explicit matching association, authentication,
CORS PUT and unchanged disabled agent settings. Browser smoke uses clearly marked
demo metadata for create/edit/import/reload, edit focus and 1536/390 px rendering;
real persistence is exercised separately through the API tests.

Full T01/T02/T03/T34 and B10 remain unaccepted. Tasks/context isolation, selection
of an API-verified default-branch commit, commit-specific CI freshness and the
complete offline-roadmap scenario are still required. This registry is groundwork
for an independent task domain; process exit status does not become task status.
