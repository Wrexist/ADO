/**
 * Setup requirements catalog — the single source of truth for the tools, extensions,
 * and configuration the AI Control Center needs to run for real (not just in --demo).
 *
 * Same trust model as connectors.ts: PRESENTATION + detection/install RECIPES only, no
 * secrets. The local server probes each requirement's real status on the machine and can
 * one-click install the auto-installable ones (npm globals, editor extensions). GUI apps
 * and account logins can't be silently installed by any dashboard — those become an honest
 * "open the official installer / copy the command / connect" action, never a fake button.
 *
 * The install COMMAND for each item is derived server-side from this catalog by `id`; the
 * client never sends a command string (allow-list, CLAUDE.md convention 10/§V2).
 */

export type ReqCategory = 'runtime' | 'cli' | 'extension' | 'app' | 'account' | 'config';

/** How the server detects whether a requirement is already satisfied. */
export type DetectSpec =
  | { via: 'command'; command: string; args?: string[]; versionRe?: string }
  | { via: 'vscode-ext'; extensionId: string }
  | { via: 'connection'; connectionId: string }
  | { via: 'env'; envVar: string }
  | { via: 'manual' }; // can't be auto-detected — always reported as "action needed"

/** How the server (or the user) installs it. Only the first two are server-auto-installable. */
export type InstallSpec =
  | { via: 'npm-global'; package: string }
  | { via: 'vscode-ext'; extensionId: string } // needs the `code` CLI on PATH; else use deepLink
  | { via: 'manual' }; // guided only — open docsUrl / deepLink / copy a command

export interface Requirement {
  id: string;
  name: string;
  category: ReqCategory;
  /** true = the app can't do its core job without it; false = recommended/optional. */
  required: boolean;
  blurb: string; // what it is
  why: string; // why THIS project needs it
  detect: DetectSpec;
  install: InstallSpec;
  docsUrl?: string; // official install/learn-more page
  deepLink?: string; // e.g. vscode:extension/… or a login URL
  /** Copyable shell commands (labelled per platform/manager) for guided installs. */
  commands?: { label: string; command: string }[];
  /** In-app route for connect-style items (e.g. add a token on the Connections page). */
  actionTo?: string;
  actionLabel?: string;
}

export interface ReqCategoryMeta {
  id: ReqCategory;
  title: string;
  blurb: string;
}

export const REQ_CATEGORIES: ReqCategoryMeta[] = [
  { id: 'runtime', title: 'Core runtime', blurb: 'What the dashboard itself runs on.' },
  { id: 'cli', title: 'Command-line tools', blurb: 'CLIs the server shells out to — the agent runner lives here.' },
  { id: 'extension', title: 'Editor extensions', blurb: 'Claude inside your editor.' },
  { id: 'app', title: 'Applications', blurb: 'Desktop apps in the loop.' },
  { id: 'account', title: 'Accounts & sign-in', blurb: 'Logins that power the agents — the real "connect your subscription".' },
  { id: 'config', title: 'Configuration', blurb: 'Local settings the app needs before it can see your work.' },
];

const R = (r: Requirement): Requirement => r;

export const REQUIREMENTS: Requirement[] = [
  // ── Core runtime ────────────────────────────────────────────────────────────
  R({
    id: 'node',
    name: 'Node.js 20+',
    category: 'runtime',
    required: true,
    blurb: 'JavaScript runtime.',
    why: 'Runs the dashboard server and builds the web app. The whole monorepo targets Node 20+.',
    detect: { via: 'command', command: 'node', args: ['--version'], versionRe: 'v?(\\d+\\.\\d+\\.\\d+)' },
    install: { via: 'manual' },
    docsUrl: 'https://nodejs.org/en/download',
    commands: [
      { label: 'macOS (Homebrew)', command: 'brew install node@20' },
      { label: 'nvm (any OS)', command: 'nvm install 20 && nvm use 20' },
    ],
  }),
  R({
    id: 'git',
    name: 'Git',
    category: 'runtime',
    required: true,
    blurb: 'Version control.',
    why: 'The scanner reads git status/branch for every repo in PROJECT_DIRS — no git, no repositories.',
    detect: { via: 'command', command: 'git', args: ['--version'], versionRe: '(\\d+\\.\\d+\\.\\d+)' },
    install: { via: 'manual' },
    docsUrl: 'https://git-scm.com/downloads',
    commands: [
      { label: 'macOS (Homebrew)', command: 'brew install git' },
      { label: 'Debian/Ubuntu', command: 'sudo apt-get install -y git' },
    ],
  }),

  // ── Command-line tools ──────────────────────────────────────────────────────
  R({
    id: 'claude-cli',
    name: 'Claude Code CLI',
    category: 'cli',
    required: true,
    blurb: 'The `claude` command-line agent.',
    why: 'The agent runner shells out to `claude -p`. Without it on PATH, dispatched agents can’t run at all — this is the single most important install for the "run a prompt → agents do it" loop.',
    detect: { via: 'command', command: 'claude', args: ['--version'], versionRe: '(\\d+\\.\\d+\\.\\d+)' },
    install: { via: 'npm-global', package: '@anthropic-ai/claude-code' },
    docsUrl: 'https://docs.claude.com/en/docs/claude-code/overview',
    commands: [{ label: 'npm (global)', command: 'npm install -g @anthropic-ai/claude-code' }],
  }),
  R({
    id: 'gh-cli',
    name: 'GitHub CLI',
    category: 'cli',
    required: false,
    blurb: 'The `gh` command.',
    why: 'Optional. Handy for richer GitHub operations from agents; the dashboard’s own GitHub sync uses a token, not this.',
    detect: { via: 'command', command: 'gh', args: ['--version'], versionRe: '(\\d+\\.\\d+\\.\\d+)' },
    install: { via: 'manual' },
    docsUrl: 'https://cli.github.com',
    commands: [
      { label: 'macOS (Homebrew)', command: 'brew install gh' },
      { label: 'Debian/Ubuntu', command: 'sudo apt-get install -y gh' },
    ],
  }),

  // ── Editor extensions ───────────────────────────────────────────────────────
  R({
    id: 'vscode-claude',
    name: 'Claude Code for VS Code',
    category: 'extension',
    required: false,
    blurb: 'Claude Code inside your editor.',
    why: 'Recommended. Run and review agent work in VS Code alongside the dashboard. Auto-installs when the `code` CLI is on PATH; otherwise the deep link opens VS Code to install it.',
    detect: { via: 'vscode-ext', extensionId: 'anthropic.claude-code' },
    install: { via: 'vscode-ext', extensionId: 'anthropic.claude-code' },
    deepLink: 'vscode:extension/anthropic.claude-code',
    docsUrl: 'https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code',
    commands: [{ label: 'VS Code CLI', command: 'code --install-extension anthropic.claude-code' }],
  }),

  // ── Applications ────────────────────────────────────────────────────────────
  R({
    id: 'vscode',
    name: 'Visual Studio Code',
    category: 'app',
    required: false,
    blurb: 'Code editor.',
    why: 'Recommended editor, and it provides the `code` CLI used to one-click the extension above.',
    detect: { via: 'command', command: 'code', args: ['--version'], versionRe: '(\\d+\\.\\d+\\.\\d+)' },
    install: { via: 'manual' },
    docsUrl: 'https://code.visualstudio.com/download',
    commands: [{ label: 'macOS (Homebrew)', command: 'brew install --cask visual-studio-code' }],
  }),

  // ── Accounts & sign-in ──────────────────────────────────────────────────────
  R({
    id: 'claude-login',
    name: 'Claude sign-in (CLI)',
    category: 'account',
    required: true,
    blurb: 'Log the `claude` CLI into your Claude account.',
    why: 'This is how you "connect your subscription": the agent runner uses the CLI’s OWN login (your Pro/Max session), not any API key pasted in the dashboard. Run `claude` once and complete the browser sign-in on this machine.',
    detect: { via: 'manual' },
    install: { via: 'manual' },
    docsUrl: 'https://claude.ai',
    commands: [{ label: 'Sign in', command: 'claude  # then follow the browser prompt' }],
  }),
  R({
    id: 'github-token',
    name: 'GitHub token',
    category: 'account',
    required: false,
    blurb: 'A personal access token for GitHub sync.',
    why: 'Optional. Lists your GitHub repos (stars/PRs/CI) in the dashboard. Stored server-side, never sent to the browser.',
    detect: { via: 'connection', connectionId: 'github' },
    install: { via: 'manual' },
    actionTo: '/settings',
    actionLabel: 'Add on Connections',
    docsUrl: 'https://github.com/settings/tokens/new?scopes=repo,workflow&description=AI%20Control%20Center',
  }),

  // ── Configuration ───────────────────────────────────────────────────────────
  R({
    id: 'project-dirs',
    name: 'PROJECT_DIRS',
    category: 'config',
    required: true,
    blurb: 'Folders to scan for your repositories.',
    why: 'The dashboard only sees repos inside these directories — and agents can only run in scanned repos. Set it in .env, e.g. PROJECT_DIRS=/Users/you/code. Without it the dashboard has nothing to show or dispatch into.',
    detect: { via: 'env', envVar: 'PROJECT_DIRS' },
    install: { via: 'manual' },
    docsUrl: 'https://code.claude.com/docs/en/claude-code-on-the-web',
    commands: [{ label: '.env', command: 'PROJECT_DIRS=/absolute/path/to/your/code' }],
  }),
  R({
    id: 'acc-token',
    name: 'ACC_TOKEN',
    category: 'config',
    required: true,
    blurb: 'The shared secret the server and web use to talk.',
    why: 'The server refuses to boot without it, and the web must send the same value (VITE_ACC_TOKEN) or the UI shows offline. Generate with: openssl rand -hex 24.',
    detect: { via: 'env', envVar: 'ACC_TOKEN' },
    install: { via: 'manual' },
    commands: [
      { label: 'Generate', command: 'openssl rand -hex 24' },
      { label: '.env (both must match)', command: 'ACC_TOKEN=<value>\nVITE_ACC_TOKEN=<same value>' },
    ],
  }),
];

export const REQUIREMENT_BY_ID: Record<string, Requirement> = Object.fromEntries(
  REQUIREMENTS.map((r) => [r.id, r]),
);

// —— server→client status (dynamic; never fabricated) ————————————————————————————

export type ReqStatus = 'installed' | 'missing' | 'manual' | 'unknown';

export interface ProbeResult {
  id: string;
  status: ReqStatus;
  version: string | null; // parsed version if the detector found one
  detail: string | null; // honest note, e.g. "the `code` CLI was not found"
  installable: boolean; // can the server auto-install it right now?
  checkedTs: string;
}

export type InstallRunStatus = 'running' | 'done' | 'failed';

export interface InstallRun {
  runId: string;
  reqId: string;
  status: InstallRunStatus;
  command: string; // the exact command that ran (shown to the user — allow-listed, not secret)
  output: string[]; // stdout+stderr lines, in order
  code: number | null; // exit code once finished
  startedTs: string;
  endedTs: string | null;
}
