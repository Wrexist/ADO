# DESKTOP.md — distributable desktop app (decision record + operations)

Date: 2026-07-17 · Status: **shipped v1** (wrapper + release pipeline; first installer lands
when the first `v*` tag is pushed)

## What Isac asked for

"Click a download, get a .exe, it installs and works" — i.e. distribute the AI Control Center
like a product, not a git clone. This document records the research, the decision, and how to
cut a release.

## Research summary (2026)

Three realistic ways to ship a local-first Node+web app as a desktop download:

| Option | How our Fastify+SQLite server runs | Installer/updater story | Verdict |
| --- | --- | --- | --- |
| **Electron + electron-builder** | Directly in the main process (Electron ships Node) | NSIS `.exe` is the default Windows target; GitHub Releases + `electron-updater` is the standard pipeline (tag → CI builds → updater finds them) | **Chosen** |
| Tauri v2 | Must be compiled into a separate "sidecar" binary (pkg/Node SEA), spawned and supervised | Small installers (~96% smaller hello-world), but sidecar packaging + Windows cross-builds add real complexity | Rejected: our backend IS Node with a native module; sidecar-izing it buys size we don't need at complexity we'd pay for |
| Plain `npm install` + autostart scripts (status quo) | As today | None — requires git/node/terminal | Kept for developers; fails the "click and install" bar |

Key facts that drove the choice:

- Electron is the path of least *risk* for a Node-server app: the server runs in-process, no
  second runtime, no IPC bridge to a sidecar. Dolt's engineering write-up reached the same
  conclusion for the same shape of app (separate Node service beside the UI).
- `better-sqlite3` is a native module: it must be **rebuilt for Electron's ABI** and **unpacked
  from the asar archive**. electron-builder does both (automatic `@electron/rebuild` +
  `asarUnpack`) — this is a solved problem on its happy path, and a documented footgun off it.
- NSIS is the right Windows target for "download from a website/GitHub" distribution (MSI is
  for enterprise fleet deployment). The installer GUID derives from `appId` — **never change
  `appId`** (`com.wrexist.acc`) or upgrades/uninstalls break.
- Auto-update: `electron-updater` against **GitHub Releases** is the simplest reliable backend —
  electron-builder uploads the installers plus `latest*.yml` manifests; the packaged app checks
  them on boot. No server of ours involved.

### Code signing (the honest part)

- **Unsigned Windows builds trigger SmartScreen** ("Windows protected your PC" → More info →
  Run anyway). That is expected and unavoidable without signing; the download page must say so
  plainly rather than pretend otherwise.
- The 2026-current fix is **Azure Artifact Signing** (formerly "Trusted Signing"): GA, the
  cheapest route to Microsoft-trusted signatures, now open to self-employed individuals (US/
  CA/EU/UK). Note: even *signed* new files can see SmartScreen until reputation accrues —
  Microsoft's own guidance, and a live issue in early 2026 when Microsoft rotated intermediate
  CAs. Signing is a "reduce, then eliminate over time" measure, not an instant bypass.
- macOS: unsigned apps need right-click → Open (Gatekeeper), and **`electron-updater` on macOS
  requires a signed app** — auto-update is Windows/Linux-only until an Apple Developer ID is
  added. The updater is wrapped in try/catch and simply logs + skips where unsupported.
- When Isac wants signing: add the Azure Artifact Signing action (Windows) and
  `CSC_LINK`/notarytool secrets (macOS) to `release.yml` — electron-builder supports both
  natively. Until then, releases ship unsigned **and say so**.

## Architecture shipped

```
apps/desktop/
  src/main.ts      Electron main: PATH fix for GUI launches → free-port probe →
                   buildServer({ port, accToken, dbPath: userData/acc.sqlite,
                   webOrigin: http://127.0.0.1:<port> }) → serves the BUILT web
                   bundle same-origin → BrowserWindow(http://127.0.0.1:<port>)
                   → electron-updater check (packaged only, non-fatal)
  src/preload.ts   Parses --acc-config=<json> from additionalArguments and exposes
                   window.__ACC_DESKTOP__ = { serverUrl: '', accToken } (contextIsolation on)
  scripts/build.mjs esbuild-bundles main+preload (server TS included; externals:
                   electron, better-sqlite3)
  electron-builder.yml  appId com.wrexist.acc · win nsis · mac dmg+zip · linux AppImage ·
                   asar + asarUnpack better-sqlite3 · extraResources: web dist ·
                   publish: github
```

Supporting seams (kept tiny, each independently tested):

- **Server**: `SERVE_WEB_DIR` / `serveWebDir` env — registers `@fastify/static` and an SPA
  fallback (GET, non-`/api`/`/events`/`/health` → `index.html`). Desktop mode serves the web
  app **same-origin**, so CORS/token behavior is identical to dev, and the port can be
  ephemeral (probed before boot so the Host allow-list and CORS origin stay exact).
- **Web**: `lib/config.ts` prefers `window.__ACC_DESKTOP__` (set by the preload) over the
  build-time `VITE_*` values; `serverUrl: ''` makes every fetch/SSE relative — same-origin.
- **Token**: generated once (`crypto.randomBytes(24)`), stored `0600` in the OS user-data dir,
  passed to the server as an override and to the renderer via the preload. No `.env` file
  involved in the packaged app; the data dir is the OS-standard location, not the install dir.
- **PATH**: GUI-launched apps on macOS/Linux get a minimal PATH; the runner needs the user's
  `claude` CLI. `fix-path` (shell-env capture) runs before the server boots. Windows inherits
  the user PATH already.

## How to cut a release

```bash
git tag v0.1.0 && git push origin v0.1.0
```

`.github/workflows/release.yml` builds on windows/macos/ubuntu runners and attaches
`ACC-Setup-<version>.exe`, `.dmg`, `.AppImage` plus updater manifests to the GitHub Release
for that tag. The Setup page and README point at `releases/latest`. Version comes from
`apps/desktop/package.json` — bump it in the same commit as the tag.

Local packaging (needs the platform's toolchain; unsigned):

```bash
npm run build -w @ado/web && npm run dist -w @ado/desktop   # current OS installer
```

## Verified here vs. verified on CI

- Verified in this repo's gate: desktop main/preload typecheck; the server's static/SPA mode
  (tests); the web config override seam; a Linux `electron-builder --dir` smoke build when the
  environment allows the Electron binary download.
- Only CI can verify: the actual Windows NSIS `.exe`, macOS `.dmg`, native-module rebuild per
  platform, and Release uploads — that's what `release.yml` exists for. Do not claim an
  installer exists until the tag's release shows the assets.

## Sources

- electron-builder NSIS target + configuration: https://www.electron.build/docs/nsis/ ·
  https://www.electron.build/docs/configuration/ · target guide https://www.electron.build/docs/targets/
- 2026 distribution walkthrough (tag → Actions → Releases → electron-updater):
  https://dev.to/raxxostudios/how-to-build-and-distribute-an-electron-desktop-app-in-2026-24nk
- better-sqlite3 in Electron (rebuild + asar unpack):
  https://github.com/electron-userland/electron-builder/issues/5317 ·
  https://github.com/WiseLibs/better-sqlite3/issues/736
- Code signing: https://www.electronjs.org/docs/latest/tutorial/code-signing ·
  https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options ·
  Azure Artifact Signing experience reports https://melatonin.dev/blog/code-signing-on-windows-with-azure-trusted-signing/ ·
  https://weblog.west-wind.com/posts/2025/Jul/20/Fighting-through-Setting-up-Microsoft-Trusted-Signing ·
  SmartScreen reputation https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation ·
  2026 CA-rotation regression https://learn.microsoft.com/en-us/answers/questions/5855708/trusted-signing-regression-in-smartscreen-reputati
- Electron vs Tauri for a Node backend: https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/ ·
  https://www.gethopp.app/blog/tauri-vs-electron · sidecar approach https://dev.to/marcin_codes/tauri-nodejs-alternative-to-electron-2l9l
