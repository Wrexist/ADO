import { useEffect, useState } from 'react';
import { factsForBundle, suggestNextBuild, type IosAppFacts, type TestFlightAutofill, type TestFlightProfile } from '@ado/shared';
import { Button, Card, Chip, Icon, cx } from '../kit';
import { timeAgo } from '../lib/time';
import {
  deleteTestFlightProfile,
  deployTestFlight,
  fetchTestFlightAutofill,
  fetchTestFlightProfiles,
  saveTestFlightProfile,
} from '../lib/testflight';

const input =
  'h-9 rounded-tile border bg-elevated px-3 text-body text-text1 placeholder:text-text3 focus:border-primary/50 focus:outline-none';

/** One saved template row: facts + last deploy + the per-deploy version form.
 *  Exported — the Deployments page reuses it for quick deploys across projects. */
export function ProfileRow({ profile, facts, repoLabel, onChanged }: {
  profile: TestFlightProfile;
  /** The matching Xcode project's live facts (bundle-matched), for version prefill. */
  facts: IosAppFacts | null;
  /** Shown when the row renders outside its project page (the Deployments list). */
  repoLabel?: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Version is entered EVERY deploy — pre-filled from the repo's real current values.
  const [marketing, setMarketing] = useState('');
  const [build, setBuild] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const openForm = () => {
    setOpen((v) => !v);
    setNote(null);
    if (!open) {
      setMarketing(facts?.marketingVersion ?? '');
      setBuild(suggestNextBuild(facts?.buildNumber));
    }
  };

  const deploy = async () => {
    setBusy(true);
    setNote(null);
    try {
      const { runId, version } = await deployTestFlight(profile.id, { marketingVersion: marketing.trim(), buildNumber: build.trim() });
      setNote({ tone: 'ok', text: `Deploy ${version} dispatched — run ${runId.slice(0, 12)} (see Agents).` });
      onChanged();
    } catch (e) {
      setNote({ tone: 'err', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      await deleteTestFlightProfile(profile.id);
      onChanged();
    } catch (e) {
      setNote({ tone: 'err', text: (e as Error).message });
    }
  };

  return (
    <div className="rounded-tile bg-elevated/40 p-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium text-text1">
            {profile.name}
            {repoLabel ? <span className="ml-2 rounded-full bg-elevated px-2 py-0.5 text-label font-normal text-text3">{repoLabel}</span> : null}
          </p>
          <p className="mt-0.5 truncate font-mono text-label text-text3">
            {profile.bundleId} · {profile.scheme} · {profile.configuration}
          </p>
        </div>
        <button
          type="button"
          aria-label={`Delete template ${profile.name}`}
          title="Delete template"
          onClick={() => void remove()}
          className="shrink-0 rounded px-1 text-body leading-none text-text3 transition-colors duration-150 ease-soft hover:text-danger"
        >
          ×
        </button>
        <Button size="sm" onClick={openForm}>{open ? 'Close' : 'Deploy…'}</Button>
      </div>
      <p className="mt-1 text-label text-text3">
        {profile.lastDeployTs && profile.lastVersion
          ? `Last deploy: ${profile.lastVersion} · ${timeAgo(profile.lastDeployTs)}`
          : 'Never deployed from here.'}
      </p>

      {open ? (
        <div className="mt-2 border-t pt-2.5">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-label text-text3">
              Version
              <input value={marketing} onChange={(e) => setMarketing(e.target.value)} placeholder="1.4.2" aria-label="Marketing version" className={cx(input, 'w-24')} />
            </label>
            <label className="flex flex-col gap-1 text-label text-text3">
              Build
              <input value={build} onChange={(e) => setBuild(e.target.value)} placeholder="59" aria-label="Build number" className={cx(input, 'w-20')} />
            </label>
            <Button size="sm" onClick={() => void deploy()} disabled={busy || !marketing.trim() || !build.trim()}>
              {busy ? 'Dispatching…' : 'Dispatch deploy'}
            </Button>
          </div>
          <p className="mt-1.5 text-label text-text3">
            {facts
              ? `Current in repo: ${facts.marketingVersion ?? '?'} (${facts.buildNumber ?? '?'}) — build pre-bumped for you.`
              : 'Enter the version this build should carry.'}
          </p>
          {note ? <p className={cx('mt-1.5 text-label', note.tone === 'ok' ? 'text-success' : 'text-danger')}>{note.text}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** The new-template form — pre-filled from the live auto-fill probe. */
function NewTemplateForm({ repoId, facts, onSaved, onCancel }: {
  repoId: string;
  facts: IosAppFacts | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [scheme, setScheme] = useState(facts?.schemes[0] ?? '');
  const [bundleId, setBundleId] = useState(facts?.bundleId ?? '');
  const [teamId, setTeamId] = useState(facts?.teamId ?? '');
  const [configuration, setConfiguration] = useState('Release');
  const [testNotes, setTestNotes] = useState('');
  const [credentialsNote, setCredentialsNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      await saveTestFlightProfile({
        repoId,
        name: name.trim(),
        scheme: scheme.trim(),
        bundleId: bundleId.trim(),
        teamId: teamId.trim() || undefined,
        configuration: configuration.trim() || 'Release',
        testNotes: testNotes.trim() || undefined,
        credentialsNote: credentialsNote.trim() || undefined,
      });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-tile border bg-app p-3">
      <div className="flex flex-col gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name — e.g. Bloom · App Store" aria-label="Template name" className={input} />
        <div className="flex gap-2">
          <input value={scheme} onChange={(e) => setScheme(e.target.value)} placeholder="Scheme" aria-label="Xcode scheme" list={`tf-schemes-${repoId}`} className={cx(input, 'flex-1')} />
          <datalist id={`tf-schemes-${repoId}`}>
            {(facts?.schemes ?? []).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <input value={configuration} onChange={(e) => setConfiguration(e.target.value)} placeholder="Release" aria-label="Configuration" className={cx(input, 'w-28')} />
        </div>
        <div className="flex gap-2">
          <input value={bundleId} onChange={(e) => setBundleId(e.target.value)} placeholder="Bundle id — com.you.app" aria-label="Bundle id" className={cx(input, 'flex-1 font-mono')} />
          <input value={teamId} onChange={(e) => setTeamId(e.target.value)} placeholder="Team id" aria-label="Team id" className={cx(input, 'w-32 font-mono')} />
        </div>
        <textarea value={testNotes} onChange={(e) => setTestNotes(e.target.value)} rows={2} placeholder="Tester notes — what should testers try in this build?" aria-label="Tester notes" className="rounded-tile border bg-elevated p-3 text-body text-text1 placeholder:text-text3 focus:border-primary/50 focus:outline-none" />
        <input value={credentialsNote} onChange={(e) => setCredentialsNote(e.target.value)} placeholder="Credentials pointer — e.g. ASC key in ~/.appstoreconnect (never the key itself)" aria-label="Credentials pointer" className={input} />
      </div>
      {err ? <p className="mt-2 text-label text-danger">{err}</p> : null}
      <div className="mt-2.5 flex items-center gap-2">
        <Button size="sm" onClick={() => void save()} disabled={busy || !name.trim() || !scheme.trim() || !bundleId.trim()}>
          {busy ? 'Saving…' : 'Save template'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

/**
 * TestFlight — saved, named deploy templates for this project. The stable facts live in the
 * template; the version/build is entered on EVERY deploy (pre-filled from the repo's real
 * Xcode files, build pre-bumped). Deploy dispatches a real agent run in this repo — the
 * per-project Agent-dispatch switch and cwd allow-list apply like everywhere else.
 */
export function TestFlightCard({ repoId }: { repoId: string }) {
  const [profiles, setProfiles] = useState<TestFlightProfile[] | null>(null);
  const [autofill, setAutofill] = useState<TestFlightAutofill | null>(null);
  const [autofillErr, setAutofillErr] = useState(false); // not scanned locally → manual entry
  const [adding, setAdding] = useState(false);
  // Multi-app monorepos: which Xcode project drives the new-template prefill + provenance.
  const [project, setProject] = useState('');

  const refresh = () => {
    fetchTestFlightProfiles(repoId).then(setProfiles).catch(() => setProfiles([]));
  };
  useEffect(() => {
    setProfiles(null);
    setAutofill(null);
    setAutofillErr(false);
    setAdding(false);
    setProject('');
    refresh();
    fetchTestFlightAutofill(repoId)
      .then(setAutofill)
      .catch(() => setAutofillErr(true));
  }, [repoId]);

  const apps = autofill?.apps ?? [];
  const selected = apps.find((a) => a.project === project) ?? apps[0] ?? null;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-section font-semibold text-text1">TestFlight</h2>
        {!adding ? (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Icon name="plus" size={13} /> New template
          </Button>
        ) : null}
      </div>

      {apps.length > 1 ? (
        <select
          value={selected?.project ?? ''}
          onChange={(e) => setProject(e.target.value)}
          aria-label="Xcode project"
          title="This repo holds several Xcode projects — pick which app to template"
          className="mt-2 h-8 max-w-full rounded-tile border bg-elevated px-2 font-mono text-label text-text2 focus:border-primary/50 focus:outline-none"
        >
          {apps.map((a) => (
            <option key={a.project} value={a.project}>
              {a.project}
            </option>
          ))}
        </select>
      ) : null}

      <p className="mt-1.5 text-label text-text3">
        {selected ? (
          <>
            Auto-filled from <span className="font-mono text-text2">{selected.sources.join(' · ')}</span>
            {selected.marketingVersion ? (
              <> · current {selected.marketingVersion} ({selected.buildNumber ?? '?'})</>
            ) : null}
          </>
        ) : autofillErr ? (
          'Not scanned locally — fill the template manually.'
        ) : autofill ? (
          'No Xcode project detected in this repo — fill the template manually.'
        ) : (
          'Probing the repo…'
        )}
      </p>

      {adding ? (
        <NewTemplateForm
          key={selected?.project ?? 'manual'} // switching the picker re-prefills the form
          repoId={repoId}
          facts={selected}
          onSaved={() => {
            setAdding(false);
            refresh();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      <div className="mt-3 flex flex-col gap-2">
        {profiles === null ? (
          <p className="text-label text-text3">Loading…</p>
        ) : profiles.length > 0 ? (
          profiles.map((p) => (
            <ProfileRow key={p.id} profile={p} facts={factsForBundle(autofill, p.bundleId)} onChanged={refresh} />
          ))
        ) : !adding ? (
          <p className="text-label text-text3">
            No saved templates yet — save one and every future deploy is two fields and a click.
          </p>
        ) : null}
      </div>

      {profiles && profiles.length > 0 ? (
        <p className="mt-2 text-label text-text3">
          <Chip size="sm">how it works</Chip> Deploy dispatches a real agent in this repo: it sets your version, archives the
          scheme, and uploads — reporting only what actually happened.
        </p>
      ) : null}
    </Card>
  );
}
