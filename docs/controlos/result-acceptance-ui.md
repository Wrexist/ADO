# Exact result review through the built application

`node --import tsx scripts/probe-result-acceptance.mts` builds the web application
and exercises the production server over a loopback HTTP listener with a
disposable disk profile and two real Git repositories. No browser routes are
intercepted. Completed run rows are explicitly seeded fixtures, not claimed
provider executions. All screenshots say DEMO in the run title.

At both 1536 and 390 pixels, the browser starts real `npm run verify`, prepares a
separate result review and displays its exact content digest. Before confirmation,
a request for another human action and a TestFlight dispatch carrying that review
are refused. No new run or deployment-history entry appears and the review is
not consumed.

The probe then changes bytes in a tracked binary file whose name begins with a
space. Keyboard confirmation receives 409 from the production verifier. The UI
removes the previous passing verdict and review, focuses the rejection message,
and the persisted record has no acceptance and a revoked review. Restoring the
original bytes and running verification again does not revive that review. A
fresh review accepts the exact result once; replay is refused.

After closing and rebuilding the server against the same disk profile, both
revoked and consumed reviews remain refused. Each run retains exactly one
consumed review. The Node HTTP client closes its connections between requests so
the deliberate server restart cannot accidentally reuse a dead pooled socket;
mutating requests are never automatically retried by this probe.

The review heading now scrolls into view when the decision opens, with clearance
for mobile navigation. Error focus returns to the rejection message after the
confirmation panel disappears. The action/message row wraps on narrow screens.
The probe checks focus, mobile heading clearance and visible confirmation, both
themes, horizontal overflow and browser page errors. Six screenshots capture the
review and stale rejection. Hashes of the tested sources, built assets and images
are in `result-acceptance-ui-evidence.json`.

Scope: synthetic completed runs, real verification subprocesses and real local
HTTP/browser decisions. There is no provider run, Apple upload, OS sandbox or
task-criteria browser acceptance in this probe. A same-user process can still
change files after inspection; this is a content-bound decision, not a filesystem
lock. Full T26 and the R1–R4 gates remain open.

Validation on Windows/Node 22.18.0: the probe passed, `npm run verify` passed
typecheck/lint, 439 tests in 99 files and build, and `npm run smoke` passed the
broader built application checks. Logs are ignored local files:
`controlos-result-review-ui.log`, `controlos-result-review-verify.log` and
`controlos-result-review-smoke.log`. Fresh canonical images are
`smoke-shots/command.png` and `smoke-shots/ops.png`; they contain DEMO data.
The existing Vite chunk-size warning remains.
