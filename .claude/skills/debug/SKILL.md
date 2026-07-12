---
name: debug
description: Triage and reproduce a bug in this repo, then fix the cause (not the symptom). Use for a bug report, a failing test, a flaky test, or "why is X wrong?".
---

# Debugging here

1. **Reproduce first — write the failing test.** Prefer a `vitest` case that fails for the reported reason before touching source. For UI/flow bugs, drive it: `npm run smoke` or a focused Playwright interaction.
2. **Root-cause, don't symptom-patch.** Explain WHY it happens. Real examples from this repo: a stable event id made the bus dedup silently drop updates (scanner/GitHub); `active--` living past the last `await` leaked a runner slot. The fix targets the cause.
3. **Check the class elsewhere.** A stable-id bug, an unbounded map, an unguarded `await` — grep for siblings and fix them too.
4. **Determinism for flakes.** Fake the clock/network, isolate shared state, `await` properly. Never "fix" a flake with retries or sleeps. Prove it: N green runs.
5. **Report** the root cause, the minimal fix, and anything the fix could affect. Then `npm run verify`.
