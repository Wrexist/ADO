# Packaged Windows profile evidence

Current evidence (2026-09-28): [read-only native schema inspection](native-schema-inspection.md) and [artifact/probe hashes](native-schema-evidence.json) supersede the older migration inspection described here. The original probe called `openDb()` after app shutdown, which could itself finish a migration. The corrected probe inspects read-only and compares the full ledger/schema against an independent memory reference. Baselines 0008 and 0019 now both pass through migration 0023 on a fresh artifact built from revision `79d4bdd`.

The Windows unpacked Electron artifact has been built and started with its actual
packaged resources, SQLite native module, renderer/preload and DPAPI helper. This
is distinct from a source-server test or the earlier credential-only probe.

Desktop accepts `--profile-dir=<absolute path>` before taking its instance lock.
Both userData and sessionData use that directory. `--hidden` suppresses the window
and boot-error dialog; `--no-update-check` disables the release check for that
launch. Defaults are unchanged. No credential is passed through these arguments.

To reproduce, build in a separate source/dependency copy: `npm ci`, `npm run build`,
then `npx electron-builder --dir --win --x64 --publish never` from `apps/desktop`.
Electron rebuilding better-sqlite3 must not replace the Node ABI module in the
normal development copy. From the development copy run
`npm run smoke:packaged-profile -- <absolute path to win-unpacked/ai-control-center.exe>`.

The probe allocates a synthetic profile, an old database through migration 0008,
a historical accepted run, disabled project-agent policy, a retained custom
prompt, a plaintext access key and a plaintext Figma credential. It launches the
real packaged app three times with isolated Windows app-data/temp directories and no
configured scanner paths. The renderer uses its real private preload channel and
authenticated API. No provider request, agent dispatch or update is requested.

The first launch also creates genuine legacy Electron ciphertext using that
profile's safeStorage key. The second launch migrates that encoding to DPAPI;
the third reopens the migrated profile without regeneration.

All launches verify the selected profile paths, migrated credentials, retained
history and unverified connection status. After normal shutdown, all original
run fields and prompt/policy file bytes must match, no historical approval may be
invented and SQLite integrity_check must pass. The temporary evidence is retained;
no original profile is opened. Launch and shutdown have explicit deadlines.

The first packaged attempt exposed a real shutdown deadlock: desktop awaited
server.close while its renderer still held the SSE connection. Server shutdown
now rejects new streams and ends owned streams, releasing subscriptions/timers
before waiting for HTTP shutdown. A real HTTP regression test and a new packaged
migration/reopen run passed after the fix. The first hung fixture was explicitly
terminated and is not counted as a pass.

Evidence hashes are in `packaged-profile-evidence.json`. The measured artifact is
unsigned (Get-AuthenticodeSignature: NotSigned), uses Electron 44.4.5 / Node
24.21.0, and is an unpacked application. NSIS installation, upgrade/rollback,
real-user backup restoration, full profile data/crash coverage and signing remain
open. No complete R1/R4 gate or real-profile acceptance follows from this fixture.
