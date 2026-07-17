/**
 * Deploy-outcome watcher — turns a FINISHED deploy run into a real deploy.recorded event,
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
    log(
      ok
        ? `testflight: verified upload for ${profile.bundleId} ${marker.marketingVersion} (${marker.buildNumber}) — deploy recorded`
        : `testflight: deploy failed at "${marker.step}" — failure recorded`,
    );
  };
}
