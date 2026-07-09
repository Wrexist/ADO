import { useState, type ReactNode } from 'react';
import { MOCK_VIEW_A, MOCK_VIEW_B } from '@ado/shared/mock';
import {
  AgentTile,
  AvatarStack,
  Button,
  Card,
  Chip,
  CountBadge,
  EmptyState,
  FeedRow,
  GradientProgress,
  Icon,
  IconTile,
  MiniArea,
  PillTabs,
  RadialRing,
  SectionHeader,
  Sparkline,
  StatCard,
  StatusDot,
  type IconName,
  type Tone,
} from '../kit';

/**
 * /kit — the living demo of every kit component in EVERY state, including the
 * failure / idle / empty / degraded states the reference images omit (council S1).
 * Gate p1 requires these states designed and signed off here, not invented later.
 */

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-section font-semibold text-text1">{title}</h2>
        {note ? <p className="text-label text-text3">{note}</p> : null}
      </div>
      <Card className="p-5">{children}</Card>
    </section>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-label uppercase tracking-wider text-text3">{children}</p>;
}

const ICONS: IconName[] = [
  'overview', 'repos', 'games', 'agents', 'templates', 'keys', 'integrations', 'code', 'wand',
  'database', 'chart', 'rocket', 'pipeline', 'releases', 'settings', 'team', 'billing', 'search',
  'plus', 'calendar', 'bell', 'chevronDown', 'dots', 'grid', 'list', 'star', 'branch', 'check',
  'clock', 'cloud', 'health', 'lock', 'workflow', 'send', 'user', 'github', 'chat', 'sparkle', 'tokens',
];

const TONES: Tone[] = ['violet', 'success', 'warning', 'info', 'danger', 'pink', 'muted'];

export function KitPage() {
  const agentPoints = MOCK_VIEW_B.stats.find((s) => s.id === 'ai-agents')!.chart!;
  const cpu = MOCK_VIEW_B.monitor[0];
  const [demoTab, setDemoTab] = useState('all');

  return (
    <div className="min-h-screen min-w-[1280px] bg-app p-8 text-text1">
      <header className="mb-8">
        <p className="text-label uppercase tracking-wider text-text3">Prompt 1.0 · shared component kit</p>
        <h1 className="mt-1 text-title font-semibold">/kit — every component, every state</h1>
        <p className="mt-2 max-w-[70ch] text-body text-text2">
          Views compose ONLY from these. States the reference images omit (failure, idle, empty,
          degraded) are designed here first — sign-off on this page is a p1 gate criterion.
        </p>
      </header>

      <div className="grid max-w-[1200px] grid-cols-2 gap-6">
        <Section title="Icon" note="minimal geometric set — glyph fidelity is a P3.5 concern">
          <div className="flex flex-wrap gap-3 text-text2">
            {ICONS.map((n) => (
              <span key={n} title={n} className="flex h-8 w-8 items-center justify-center rounded-tile bg-elevated">
                <Icon name={n} size={16} />
              </span>
            ))}
          </div>
        </Section>

        <Section title="IconTile" note="tinted surfaces, three sizes">
          <div className="flex flex-wrap items-center gap-3">
            {TONES.map((t) => (
              <IconTile key={t} icon="agents" tone={t} />
            ))}
            <IconTile icon="rocket" tone="info" size="lg" />
            <IconTile icon="check" tone="success" size="sm" />
          </div>
        </Section>

        <Section title="StatusDot" note="'muted' is the honest idle/unknown tone; dotAfter for status rows">
          <div className="flex flex-wrap gap-5">
            <StatusDot tone="success" label="Active" />
            <StatusDot tone="success" label="Operational" />
            <StatusDot tone="warning" label="Degraded" />
            <StatusDot tone="danger" label="Down" />
            <StatusDot tone="muted" label="Idle" />
            <StatusDot tone="info" label="Deploying" />
            <StatusDot tone="success" label="Operational" dotAfter />
          </div>
        </Section>

        <Section title="Button / PillTabs" note="primary · outline · ghost · disabled; active tab = elevated pill">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <Button>
                <Icon name="plus" size={14} />
                New
              </Button>
              <Button variant="outline">
                <Icon name="sparkle" size={14} />
                AI Assistant
              </Button>
              <Button variant="ghost">
                Sort: Recently Updated
                <Icon name="chevronDown" size={13} />
              </Button>
              <Button disabled>Disabled</Button>
              <Button size="sm">Small</Button>
            </div>
            <PillTabs
              tabs={MOCK_VIEW_A.repoTabs}
              activeId={demoTab}
              onChange={setDemoTab}
            />
          </div>
        </Section>

        <Section title="Chip" note="tags, counts, branches, envs, statuses">
          <div className="flex flex-wrap items-center gap-2.5">
            <Chip>Game</Chip>
            <Chip>App</Chip>
            <Chip>Library</Chip>
            <Chip tone="violet">main</Chip>
            <Chip tone="info">develop</Chip>
            <Chip tone="success" dot>Live v2.4.1</Chip>
            <Chip tone="warning" dot>Building 2m 15s</Chip>
            <Chip tone="info" dot>Deploying</Chip>
            <Chip tone="warning" dot>Testing 12 tests</Chip>
            <Chip tone="success">Production</Chip>
            <Chip tone="info">TestFlight</Chip>
            <Chip tone="warning">Staging</Chip>
            <span className="flex items-center text-body text-text2">
              count <CountBadge>12</CountBadge>
            </span>
          </div>
        </Section>

        <Section
          title="GradientProgress"
          note="the one loud element; indeterminate = honest 'running (opaque)' (no guessed %)"
        >
          <div className="flex flex-col gap-4">
            <div><Label>success 100% (gradient)</Label><GradientProgress pct={100} /></div>
            <div><Label>running 48% (amber)</Label><GradientProgress pct={48} tone="warning" /></div>
            <div><Label>queued 10% (amber)</Label><GradientProgress pct={10} tone="warning" /></div>
            <div><Label>failed 32% (red)</Label><GradientProgress pct={32} tone="danger" /></div>
            <div><Label>running (opaque) — indeterminate</Label><GradientProgress indeterminate /></div>
            <div>
              <Label>slim agent tones</Label>
              <div className="flex flex-col gap-2">
                <GradientProgress pct={95} tone="success" slim />
                <GradientProgress pct={76} tone="info" slim />
                <GradientProgress pct={93} tone="pink" slim />
              </div>
            </div>
          </div>
        </Section>

        <Section title="Sparkline / RadialRing / MiniArea" note="custom SVG, no chart deps; <2 samples = flat 'collecting data' line — never an invented curve">
          <div className="flex flex-wrap items-end gap-8">
            <div><Label>sparkline (12 samples)</Label><Sparkline points={agentPoints.kind === 'sparkline' ? agentPoints.points : []} tone="success" /></div>
            <div><Label>2 samples (floor)</Label><Sparkline points={[4, 9]} tone="info" /></div>
            <div><Label>collecting data (&lt;2)</Label><Sparkline points={[]} /></div>
            <div><Label>radial 8 of 10</Label><RadialRing value={8} max={10} /></div>
            <div><Label>radial 3 of 10</Label><RadialRing value={3} max={10} tone="info" /></div>
            <div><Label>mini area (CPU)</Label><MiniArea points={cpu.points} tone={cpu.tone as Tone} /></div>
            <div><Label>mini area collecting</Label><MiniArea points={[]} /></div>
          </div>
        </Section>

        <Section title="StatCard" note="delta · sub-dot · radial visual · sparkline visual · tinted">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total Repositories" value="12" delta={{ label: '2 this week', trend: 'up', tone: 'success' }} icon="repos" iconTone="violet" />
            <StatCard label="Active Agents" value="8" sub="6 running" subDotTone="success" icon="agents" iconTone="success" />
            <StatCard label="AI Tokens Used" value="≈2.4M" delta={{ label: '12% vs last week', trend: 'up', tone: 'warning' }} icon="tokens" iconTone="warning" />
            <StatCard label="Tokens (degraded)" value="≈—" sub="tokens unavailable" icon="tokens" iconTone="warning" />
            <StatCard label="Active Builds" value="8" sub="Running now" visual={<RadialRing value={8} max={10} />} />
            <StatCard label="System Health" value="98%" sub="Excellent" tinted="success" visual={<Sparkline points={[96, 97, 96, 97, 98, 97, 98, 98]} tone="success" />} />
          </div>
        </Section>

        <Section title="AgentTile" note="pct=null renders the versioned-adapter fallback: opaque + reserved-width slot">
          <div className="grid grid-cols-2 gap-3">
            <AgentTile icon="code" name="Code Assistant" statusLine="Analyzing code…" pct={95} tone="success" />
            <AgentTile icon="wand" name="UI Generator" statusLine="Generating UI…" pct={76} tone="info" />
            <AgentTile icon="agents" name="Unknown Stream Agent" statusLine="running (opaque)" pct={null} tone="muted" />
            <AgentTile icon="games" name="Game Builder" statusLine="Building features…" pct={87} tone="violet" />
          </div>
        </Section>

        <Section title="FeedRow" note="reserved tabular time slot — live updates never reflow the row">
          <div className="flex flex-col divide-y divide-white/[0.05]">
            {MOCK_VIEW_A.activity.slice(0, 3).map((a) => (
              <FeedRow key={a.id} icon={a.icon as IconName} tone={a.tone as Tone} title={a.title} detail={a.detail} time={a.agoLabel} />
            ))}
          </div>
        </Section>

        <Section title="EmptyState" note="missing data renders as missing — never a plausible number">
          <EmptyState icon="bell" title="No activity yet" hint="Events appear here as soon as the bus records them (Phase 2)." />
        </Section>

        <Section title="AvatarStack" note="agent monograms replace fake teammates (no-fabrication rule)">
          <div className="flex items-center gap-8">
            <AvatarStack ids={['builder']} />
            <AvatarStack ids={['builder', 'reviewer', 'tester']} />
            <AvatarStack ids={['builder', 'reviewer', 'tester']} overflow={4} />
          </div>
        </Section>

        <Section title="SectionHeader">
          <div className="flex flex-col gap-4">
            <SectionHeader title="All Repositories" action="View all repositories" />
            <SectionHeader title="Running Agents" action="View all agents" />
            <SectionHeader title="System Status" />
          </div>
        </Section>
      </div>
    </div>
  );
}
