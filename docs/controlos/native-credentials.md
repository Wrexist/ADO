# Windows credential migration

Windows desktop now uses `ControlOS.CredentialHost.exe` to protect each credential
directly with `ProtectedData` and `DataProtectionScope.CurrentUser`. Plaintext
travels only through private process pipes. The executable receives only the
operation name, has a minimal environment, bounded input/output and a deadline.
It returns generic failures and never falls back to plaintext. It is compiled
with the existing Windows .NET Framework compiler and packaged beside JobHost.

The first Electron 44.4.5 crash fixture exposed a missing guarantee in the old
implementation: encryption/decryption in one process passed, but immediate
owner exit in a fresh profile left no `Local State` file, and the next process
could not decrypt its stored access key. Direct DPAPI blobs passed the same
interruption/reopen fixture. This is measured process-crash evidence, not a
power-loss guarantee or a claim about every Electron version.

Existing plaintext access keys migrate to `os:dpapi:v1:`. Readable `os:v1:` keys
are decrypted through the original Electron provider and migrated. Connection
rows similarly migrate from plaintext or `electron-safe-storage-v1` to
`windows-dpapi-v1`. Each replacement is prepared and round-trip checked before
publication. Token bytes are flushed before rename. The two files migrate
independently, so interruption between them is safe to resume. Empty, malformed,
unreadable or undecryptable files stop startup instead of silently resetting.

An already lost Electron profile key cannot be reconstructed by this migration.
Preserve the affected profile and use a verified backup in a separate profile;
credentials may need to be re-entered. DPAPI requires the original Windows user
key material. Copying an app profile to a different OS account is not sufficient.
Same-user processes remain inside the trust boundary. CLI profiles retain their
existing protected plaintext storage. Non-Windows desktop keeps its prior codec.

## Reproduce local native evidence

Run `npm run smoke:native-profile` on Windows. It creates a disposable profile
with clearly synthetic keys and never opens the user's desktop profile. Five
Electron processes cover abrupt exit between migrations, completion, reopening,
legacy Electron-codec migration and a second reopening. Missing codec, denied
decryption and corrupt JSON preserve original bytes; unrelated settings stay
unchanged. Unit tests also cover corrupt token encodings, empty token files,
failed round-trip checks, tampered DPAPI blobs and unsupported decoder names.

This is credential-file migration acceptance evidence. Full application-profile
migration, real backup restoration, installer update and another OS user remain
unverified. No full R1 or R4 gate is marked passed.

API references: [Microsoft ProtectedData](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata)
and [Electron 44.4.5 safeStorage](https://raw.githubusercontent.com/electron/electron/v44.4.5/docs/api/safe-storage.md).
