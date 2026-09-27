# Profile backup and recovery review

Profile backups use SQLite `VACUUM INTO`. Version 2 manifests include SHA-256 checksums for the database and each included configuration file. A repeated backup stamp is rejected without replacing the existing snapshot. Restore accepts legacy version 1 manifests, checks database integrity and foreign keys, and requires a new destination directory.

`connections.json` and the desktop access key are omitted from new manifests. Legacy connection files are also omitted during restore. This is not general secret redaction: historical prompts, events and other user-authored data can contain sensitive information. Protect backup storage accordingly. Local repository contents, uncommitted work, result repositories and installed tools are not included.

Run `npm run restore -- <backup.sqlite> <new-profile-directory>`. A persistent `restore-state.json` puts the new profile in recovery review mode. Interrupted or invalid markers fail startup instead of enabling execution. Start the CLI server with `DB_PATH` pointing to the restored `acc.sqlite`, or desktop with `--profile-dir=<absolute-directory>`.

In review mode, history remains readable, browser pairing works, queued jobs do not resume, old locks are not reconciled or released, scanners and system automation do not start, and mutating API requests return HTTP 423. Desktop skips its update check. The interface displays the recovery warning. This is not a byte-for-byte read-only database: opening a profile can apply schema migrations and initialize metadata.

There is deliberately no automatic promotion to an active profile. Do not remove the marker to bypass review. A supported promotion flow still needs reviewed repository/workspace references, recovery of local work, evidence about old processes, explicit decisions about queued jobs and locks, and re-entered credentials. Foreign-key checks do not prove that referenced files, repositories or remote resources still exist.

Validation: `backup.test.ts` covers credential omission, checksum tampering and preservation of duplicate-stamp backups. `recovery.test.ts` restores an actual temporary SQLite profile and starts the server twice with system services requested, checking zero process starts, unchanged queued/running rows and locks, denied mutations, readable history and interrupted-marker refusal. Browser smoke uses an explicit display fixture at 1536 and 390 pixels. These checks do not establish full T36 acceptance, a real user-profile restore, installer recovery or a complete crash matrix.
