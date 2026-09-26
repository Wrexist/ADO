/**
 * Deploy-outcome watcher: upload claims await independent confirmation.
 * but only from evidence: the agent's final message must contain the exact outcome marker
 * (TESTFLIGHT_UPLOADED <bundleId> <version> (<build>) or TESTFLIGHT_FAILED <step>), and an
 * uploaded marker must name the template's own bundle id. A run that finished without a
 * marker records NOTHING — an unverified deploy never becomes a green row (convention 1).
 */
import { parseDeployMarker } from '@ado/shared';
import type { Bus } from '../bus';
import type { TestFlightProfileStore } from './store';

export interface WatchDeps {
  bus: Bus;
  store: TestFlightProfileStore;
  repoName: (repoId: string) => string;
  log?: (msg: string) => void;
}

/** Returns the runner onRunDone hook. Never throws (the runner guards it anyway). */
export function testflightRunDone(deps: WatchDeps): (runId: string, info: { repoId: string; ok: boolean; resultText: string | null }) => void {
  const log = deps.log ?? (() => {});
  return (runId, info) => {
    const profile = deps.store.list().find((p) => p.lastDeployRunId === runId);
    if (!profile) return; // not a TestFlight deploy run

    const marker = parseDeployMarker(info.resultText);
    if (!marker) {
      log(`testflight: run ${runId} finished ${info.ok ? 'ok' : 'failed'} without an outcome marker — no deploy recorded (honest unknown)`);
      return;
    }
    if (marker.status === 'uploaded' && marker.bundleId !== profile.bundleId) {
      log(`testflight: run ${runId} claimed upload for '${marker.bundleId}' but the template is '${profile.bundleId}' — refusing to record`);
      return;
    }
    // Contradictory evidence: an "uploaded" claim from a run that exited unsuccessfully is
    // an unknown, not a success — record nothing rather than a green row (conv. 1).
    if (marker.status === 'uploaded' && !info.ok) {
      log(`testflight: run ${runId} reported an upload but exited unsuccessfully — refusing to record`);
      return;
    }

    const ok = marker.status === 'uploaded';
    const ts = new Date().toISOString();
    if (ok) {
      deps.bus.publish({
        id: `tf-upload-claim:${runId}`, type: 'activity.appended', ts,
        source: { kind: 'runner', ref: runId },
        payload: { item: { id: `tf-upload-claim:${runId}`, title: deps.repoName(profile.repoId),
          detail: 'Agent reported a TestFlight upload. Confirmation from App Store Connect is still required.',
          ts, repoId: profile.repoId, icon: 'rocket', tone: 'warning' } },
      });
      log(`testflight: upload claimed by ${runId}; awaiting independent App Store Connect evidence`);
      return;
    }
    deps.bus.publish({
      id: `tf-deploy:${runId}`,
      type: 'deploy.recorded',
      ts,
      source: { kind: 'runner', ref: runId },
      payload: {
        deployment: {
          id: `tf-deploy:${runId}`,
          name: deps.repoName(profile.repoId),
          env: 'testflight',
          ts,
          ok,
          repoId: profile.repoId,
        },
      },
    });
    log(`testflight: deploy failed at "${marker.step}" - failure recorded`);
  };
}
