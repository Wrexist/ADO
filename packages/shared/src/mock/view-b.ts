/**
 * View B — Ops Dashboard fixtures. Illustrative numbers mirror view-b.png (per-view,
 * council B1) with one deliberate fix: the reference contradicts itself (header says
 * "12 projects active", its stat says 23) — our fixture agrees with itself (23/23).
 * Charts carry a real basis: radial has an explicit denominator, sparklines have >=2
 * points (council S3). Content uses the REAL portfolio.
 */
import type { ViewBMock } from './types';

export const MOCK_VIEW_B: ViewBMock = {
  header: {
    greeting: 'Good morning, Isac 👋',
    subtitle: 'Everything looks great. 23 projects active.',
  },

  stats: [
    {
      id: 'repositories',
      label: 'Repositories',
      value: '23',
      delta: { label: '3 this week', trend: 'up', tone: 'success' },
      icon: 'github',
      iconTone: 'violet',
    },
    {
      // 8 running of 10 runner/CI slots — the ring is a ratio, never a lone integer.
      id: 'active-builds',
      label: 'Active Builds',
      value: '8',
      sub: 'Running now',
      icon: 'builds',
      iconTone: 'violet',
      chart: { kind: 'radial', value: 8, max: 10, tone: 'violet' },
    },
    {
      id: 'ai-agents',
      label: 'AI Agents',
      value: '12',
      sub: 'All systems active',
      icon: 'agents',
      iconTone: 'success',
      chart: { kind: 'sparkline', points: [8, 9, 9, 10, 10, 11, 11, 11, 12, 12, 12, 12], tone: 'success' },
    },
    {
      id: 'deployments',
      label: 'Deployments',
      value: '15',
      delta: { label: '5 today', trend: 'up', tone: 'success' },
      icon: 'cloud',
      iconTone: 'info',
    },
    {
      // Formula becomes deterministic + documented in Phase 2 (council D3); fixture shape only.
      id: 'system-health',
      label: 'System Health',
      value: '98%',
      sub: 'Excellent',
      icon: 'health',
      iconTone: 'success',
      chart: { kind: 'sparkline', points: [96, 97, 96, 97, 98, 97, 98, 98, 97, 98, 98, 98], tone: 'success' },
    },
  ],

  projectTabs: ['All', 'Repositories', 'Games', 'Apps', 'Services'],

  projects: [
    {
      id: 'sentinel',
      name: 'SENTINEL',
      subtitle: 'Tactical defense game',
      language: 'typescript',
      stars: 34,
      prs: 3,
      status: { kind: 'building', label: 'Building', detail: '2m 15s' },
    },
    {
      id: 'bloom',
      name: 'Bloom',
      subtitle: 'iOS health & beauty scanner',
      language: 'swift',
      stars: 21,
      prs: 2,
      status: { kind: 'deploying', label: 'Deploying' },
    },
    {
      id: 'atlas',
      name: 'Atlas',
      subtitle: 'Portfolio knowledge hub',
      language: 'typescript',
      stars: 12,
      prs: 1,
      status: { kind: 'live', label: 'Live', detail: 'v2.4.1' },
    },
    {
      id: 'dynasty-manager',
      name: 'Dynasty Manager',
      subtitle: 'Sports dynasty sim (Steam)',
      language: 'typescript',
      stars: 45,
      prs: 4,
      status: { kind: 'live', label: 'Live', detail: 'v0.9.2' },
    },
    {
      id: 'wrexist-ops',
      name: 'wrexist-ops',
      subtitle: 'Ops & gates service',
      language: 'python',
      stars: 9,
      prs: 1,
      status: { kind: 'testing', label: 'Testing', detail: '12 tests' },
    },
  ],

  buildQueue: [
    {
      id: 'bq-142',
      repo: 'SENTINEL',
      jobLabel: '#142 Build and Test',
      branch: 'main',
      state: 'running',
      elapsedSec: 135,
      durationLabel: '2m 15s',
    },
    {
      id: 'bq-89',
      repo: 'Bloom',
      jobLabel: '#89 Archive for TestFlight',
      branch: 'develop',
      state: 'running',
      elapsedSec: 92,
      durationLabel: '1m 32s',
    },
    {
      id: 'bq-231',
      repo: 'wrexist-ops',
      jobLabel: '#231 Run Tests',
      branch: 'main',
      state: 'running',
      elapsedSec: 45,
      durationLabel: '45s',
    },
    {
      // Queued rows have NO duration — honest absence, not a fake 0s (council B3/S2).
      id: 'bq-54',
      repo: 'Dynasty Manager',
      jobLabel: '#54 Deploy to Production',
      branch: 'main',
      state: 'queued',
      elapsedSec: null,
      durationLabel: null,
    },
  ],

  activity: [
    {
      id: 'act-b1',
      icon: 'check',
      title: 'SENTINEL',
      detail: 'Build completed successfully',
      ts: '2026-07-09T07:58:00.000Z',
      agoLabel: '2m ago',
      tone: 'success',
    },
    {
      id: 'act-b2',
      icon: 'cloud',
      title: 'Bloom',
      detail: 'Deployment to TestFlight',
      ts: '2026-07-09T07:55:00.000Z',
      agoLabel: '5m ago',
      tone: 'info',
    },
    {
      id: 'act-b3',
      icon: 'code',
      title: 'Code Review Agent',
      detail: 'Code review completed',
      ts: '2026-07-09T07:48:00.000Z',
      agoLabel: '12m ago',
      tone: 'success',
    },
    {
      id: 'act-b4',
      icon: 'database',
      title: 'Atlas',
      detail: 'Database backup completed',
      ts: '2026-07-09T07:00:00.000Z',
      agoLabel: '1h ago',
      tone: 'violet',
    },
    {
      id: 'act-b5',
      icon: 'clock',
      title: 'Dynasty Manager',
      detail: 'Build #54 queued',
      ts: '2026-07-09T06:00:00.000Z',
      agoLabel: '2h ago',
      tone: 'warning',
    },
  ],

  agentRoster: [
    { id: 'code-review', name: 'Code Review Agent', statusLine: 'Analyzing 5 PRs', state: 'active' },
    // Deliberately idle: exercises the idle roster state (council S1).
    { id: 'bug-finder', name: 'Bug Finder', statusLine: 'Idle — last scan 1h ago', state: 'idle' },
    { id: 'performance', name: 'Performance Agent', statusLine: 'Monitoring systems', state: 'active' },
    { id: 'security', name: 'Security Agent', statusLine: 'Checking vulnerabilities', state: 'active' },
  ],
  addAgentLabel: '+ Add new agent',

  assistant: {
    placeholder: 'Ask AI anything about your projects…',
    chips: ['Analyze codebase', 'Fix bugs', 'Optimize performance', 'Generate tests'],
  },

  monitor: [
    {
      id: 'cpu',
      label: 'CPU Usage',
      valuePct: 32,
      tone: 'info',
      points: [28, 34, 30, 42, 38, 31, 29, 36, 44, 33, 30, 32],
    },
    {
      id: 'memory',
      label: 'Memory',
      valuePct: 68,
      tone: 'violet',
      points: [61, 63, 66, 64, 67, 70, 68, 66, 69, 71, 67, 68],
    },
    {
      id: 'network',
      label: 'Network',
      valuePct: 42,
      tone: 'success',
      points: [38, 45, 40, 52, 47, 39, 44, 50, 41, 46, 43, 42],
    },
  ],

  quickActions: [
    { id: 'create-repo', label: 'Create Repository', icon: 'repo' },
    { id: 'new-agent', label: 'New AI Agent', icon: 'agent' },
    { id: 'deploy', label: 'Deploy Application', icon: 'cloud' },
    { id: 'workflow', label: 'Run Workflow', icon: 'workflow' },
    { id: 'analytics', label: 'View Analytics', icon: 'chart' },
    { id: 'secrets', label: 'Manage Secrets', icon: 'lock' },
  ],

  deployments: [
    {
      id: 'dep-1',
      name: 'SENTINEL',
      env: 'production',
      envLabel: 'Production',
      ts: '2026-07-09T07:58:00.000Z',
      agoLabel: '2m ago',
      ok: true,
    },
    {
      id: 'dep-2',
      name: 'Bloom',
      env: 'testflight',
      envLabel: 'TestFlight',
      ts: '2026-07-09T07:55:00.000Z',
      agoLabel: '5m ago',
      ok: true,
    },
    {
      id: 'dep-3',
      name: 'wrexist-ops',
      env: 'staging',
      envLabel: 'Staging',
      ts: '2026-07-09T07:00:00.000Z',
      agoLabel: '1h ago',
      ok: true,
    },
  ],

  // Honest placeholder — DATA_MAP marks plan/billing as "not wired yet" static v1 pages.
  proPlan: { title: 'Pro Plan', body: 'Unlimited access', cta: 'Upgrade' },
};
