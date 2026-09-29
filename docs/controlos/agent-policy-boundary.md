# Agent policy boundary and billing guard (T10, T32)

## Findings

- `claude -p` ran with default setting sources inside a clone of the target
  repository. A committed `.claude/settings.json` (permissions, hooks) or
  `.mcp.json` in an untrusted repository could change the agent's policy or
  run a hook, independently of how ControlOS frames context text.
- The prompt, up to 64 KiB with reference context, was passed on the command
  line: visible to other local processes and beyond the Windows 32,767
  character limit.
- Workspaces lived under the profile directory (next to the database and
  credential store) and, in development, under the ControlOS checkout, so a run
  inherited ControlOS's own `CLAUDE.md` and sat three levels below `.env`.
- Nothing checked how the Claude CLI was signed in. An API key in the
  environment, a key helper or an API-console login would bill per token with
  no budget chosen (T32).

## Changes

- Claude is spawned with `--setting-sources user` (only the owner's user
  settings; repository `project`/`local` settings and their hooks are not
  loaded) and `--strict-mcp-config` (repository `.mcp.json` is ignored). The
  prompt is written to stdin; argv carries only flags.
- Workspaces move to `%LOCALAPPDATA%\ControlOS\workspaces\<profile hash>`
  (`$XDG_CACHE_HOME/controlos/workspaces/...` elsewhere): outside the profile
  and outside the ControlOS tree, separate per profile.
- The stream adapter requires the init event to report `apiKeySource: "none"`
  (subscription sign-in). Any other value, or a missing field, stops the run
  at init, before its first model request, with a plain explanation. There is
  deliberately no API-billing mode, so there is no hidden fallback and no
  budget to choose; enabling paid mode would require an explicit budget first.

## Evidence

- `runner/claudePolicy.test.ts`: a local child records argv and stdin; a
  ~66 KB prompt arrives intact on stdin, argv contains none of it and equals
  the expected policy flags.
- `runner/runner.test.ts` "API billing guard": init with `ANTHROPIC_API_KEY`,
  `apiKeyHelper` or no source is refused; a run whose init reports an API key
  fails with the explanation and records no usage.
- `runner/workspaceRoot.test.ts`: the root is outside the profile directory
  and the repository, stable per profile and distinct between profiles.
- One controlled real call with the installed Claude Code 2.1.284
  (`claude -p ... --setting-sources user --strict-mcp-config --max-turns 1`,
  prompt on stdin) succeeded and reported `apiKeySource: none` and no MCP
  servers.
- `scripts/verify.sh`: 493 tests passed.

## Limits

The repository's own `CLAUDE.md` still loads as instructions inside its
workspace, and instruction files are not hashed (T11). Codex is unchanged
(already sandboxed without network). Reads outside the workspace are not
prevented by an OS sandbox (T14). Server-side features that use a stored
Anthropic key (command parser, diagnoser, auto-review) are not agent runs and
are outside this guard. Old workspaces under the previous location are left in
place. T10, T14 and T32 acceptance remain open.
