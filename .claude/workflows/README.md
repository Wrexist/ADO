# `.claude/workflows/` — orchestration recipes

Deterministic multi-agent recipes for this repo. Each file is a Claude Code **Workflow** script:
a JS program that fans work out across subagents (`agent`/`parallel`/`pipeline`), so control flow
(loops, fan-out, verify passes) is code, not left to one model's judgment.

They encode the patterns that keep this repo honest — **adversarial verify** (every finding must
survive an independent agent trying to refute it), **loop-until-dry** (keep hunting until rounds go
quiet), and **judge panels** (score independent designs, synthesise the winner) — so a session gets
the same rigor without hand-holding.

> **Cost:** each run spawns many subagents and spends real tokens. They only run when you explicitly
> opt in (say "use a workflow", or run the slash command). Nothing here runs on its own.

## The set

| Workflow | Does | Reach for it |
|----------|------|--------------|
| **understand** | Parallel readers map a subsystem → one cited map. Read-only. | Before touching unfamiliar code, or "how does X work?" |
| **ship-feature** | Map area → 3 independent designs → judge panel → one vetted plan. Writes no code. | Start of a non-trivial feature, before building. |
| **review** | Diff reviewed through this repo's lenses, every finding adversarially verified. | Before committing a change (scopes to the diff). |
| **audit** | Whole-codebase sweep vs conventions → dedupe → verify → prioritised fix list. | Periodic health check / pre-gate (broader than review). |
| **harden** | Loop-until-dry bug hunt, each bug confirmed by a 3-lens majority vote. | Depth over speed: "find every bug here." |
| **verify-gate** | Verifier agent runs `verify`(+`smoke`) ∥ convention audit ∥ completeness critic → one pass/block. | The done-gate before calling a change finished. |

A natural lifecycle chains them: `understand` → `ship-feature` → *(build)* → `review`/`harden` → `verify-gate`.

## Running one

In a session that has opted into orchestration:

```
use a workflow: review                      # review the working diff
use a workflow: understand {question:"how does SSE gap-replay work"}
use a workflow: ship-feature {request:"add a per-repo deploy history panel"}
use a workflow: harden {target:"the runner", paths:["apps/server/src/runner"]}
use a workflow: verify-gate {base:"origin/main"}
```

Each takes an optional `args` object (documented in the file's `meta.whenToUse`). `harden` and any
loop respect a `+budget` directive when given; otherwise they stop on their own dry-round / round cap.

## Conventions these scripts follow

- **`meta` is a pure literal** (name, description, whenToUse, phases) — no computed values.
- **`pipeline()` by default**, `parallel()` only as a genuine barrier (dedupe-across / early-exit).
- **Structured output via JSON Schema** so findings come back typed, not parsed from prose.
- **Adversarial verify defaults to `real:false`** — a finding earns its place, it isn't assumed.
- **No `Date.now()` / `Math.random()` / `new Date()`** (they break resume) — rounds/angles vary by index.
- **The lenses ARE this repo's conventions** (CLAUDE.md): no-fabrication, typed-events-only,
  design-tokens-only, token-gated mutations, versioned adapters for unstable interfaces.

To add one: copy the shape of `review.js`, keep `meta` a literal, and make the verify pass
adversarial. Keep the fan-out proportional to the task.
