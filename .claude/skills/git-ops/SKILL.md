---
name: git-ops
description: Git workflow for this repo — branches, commits, PRs, rebases. Use when committing, pushing, opening a PR, or resolving a merge/rebase.
---

# Git-ops here

- **Branch.** Develop on the designated feature branch; never push to the default branch without explicit permission. Create the branch locally if missing.
- **Commit per turn**, clear messages. End every commit message with the required trailers:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` and the `Claude-Session:` line. Never put the raw model ID anywhere pushed (commits/PRs/code).
- **Push:** `git push -u origin <branch>`; retry network failures up to 4× with exponential backoff (2/4/8/16s).
- **Force:** only `--force-with-lease`, never a bare `--force` (the pre-tool-use hook enforces this).
- **PRs only when asked.** Then mirror any `.github/PULL_REQUEST_TEMPLATE.md` section headings; skip template sections asking for secrets/tokens/internal hosts — describe only the diff. After creating a PR, `subscribe_pr_activity` and keep it green.
- **Merged PR = done.** Follow-up work restarts the branch from the latest default branch — never stack new commits on already-merged history.
- Only commit/push when the user asks; verify green first.
