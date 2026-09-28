# Native migration inspection without observer writes

The earlier packaged-profile probe used `openDb()` for its post-launch inspection. That function applies migrations. It could therefore complete an omitted migration after the packaged process exited, weakening the evidence that the artifact itself performed the upgrade. Historical claims based on that inspection must not be treated as proof of every packaged migration.

The replacement `inspectProfileDatabase()` opens the observed SQLite file with `readonly: true` and `fileMustExist: true`. It compares the complete migration ledger, schema tables/indexes/triggers, integrity and foreign keys against an independently migrated **in-memory** reference. It never migrates, repairs or creates the observed database. Expected migration hashes are exact bytes, so this is a strict artifact-fixture check, not a production startup rule for arbitrary historical profiles.

The packaged migration probe checks that the artifact's migration journal matches the current source and that every packaged SQL file has the same content (allowing only Windows line-ending differences). Baseline fixtures are made from those artifact SQL files, retaining exact expected migration hashes. Before Electron starts, the new inspector must refuse the old database while leaving its file bytes unchanged. Only the packaged process can then perform the upgrade.

## Scenarios

- Baseline 0008: historical accepted run, disabled project-agent policy, retained custom prompt and plaintext connection/access keys.
- Baseline 0019: those records plus project/repository/checkout, task definition, immutable task revision and completed task-execution binding. Existing fields must be unchanged; migration 0023's three new execution-context fields must be null. Newly introduced Today, Universe and context tables must exist without invented rows.
- Each baseline launches the actual packaged app three times: plaintext migration, genuine legacy Electron ciphertext migration and a further reopen. The private preload channel, authenticated APIs, DPAPI encoding and normal shutdown are checked. The final schema includes all 24 migration files, through 0023.
- The restore probe also uses read-only inspection. Its intentional restore-guard table is explicitly included in the expected schema; arbitrary extra objects or altered guards are not ignored. Existing restore-mode API, retained rows/locks, missing-marker refusal and unchanged dirty repository/index checks remain in place.

The inspector regression first refuses an old schema without upgrading it, accepts the externally completed migration with a read-only handle, and refuses a missing immutable-context trigger. Missing files are not created. These controls distinguish observation from repair.

The artifact is built from a Git archive in a separate temporary dependency workspace. Electron's native-module rebuild does not touch the development workspace's Node-ABI SQLite module. Packaging uses `--dir --win --x64 --publish never`; launches use isolated synthetic profiles, `--hidden` and `--no-update-check`. No original profile, provider task or update service is used.

## Recorded result — 2026-09-28

All six migration/reopen launches passed for baselines 0008 and 0019, followed by two restored-profile launches and one deliberately refused missing-marker launch. The artifact was built from revision `79d4bdd`, using Node 22.18.0/npm 11.7.0, Electron 44.4.5 and its embedded Node 24.21.0. Its Authenticode status is `NotSigned`.

`npm run verify` passed 438 tests in 99 files, typecheck, lint and build. The final focused inspector regression, typecheck/lint and all native probes passed after explicit restore-guard schema support was added. Hashes and precise scope are in [native-schema-evidence.json](native-schema-evidence.json). Logs are the `controlos-native-schema-*.log` files in the development workspace; disposable native profiles and the isolated artifact remain available locally.

Reproduce with `node --import tsx scripts/probe-packaged-profile.mts <unpacked-executable> 8`, repeat with `19`, then run `node --import tsx scripts/probe-packaged-restore.mts <unpacked-executable>`. Build the artifact with independent dependencies as described in [packaged-profile.md](packaged-profile.md).

## Remaining scope

This is unpacked Windows application evidence. It does not prove NSIS installation, updater/rollback, signing, every interrupted/full-disk transaction, a real-user backup restore, OS sandboxing or pilot utility. Those requirements remain open. No complete R1/R4 gate or T35 scenario follows solely from these tests.
