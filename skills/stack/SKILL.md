---
name: stack
description: >
  Use when someone asks to inspect, track, sync, merge, document, reconcile
  readiness, or undo stacked pull requests / merge requests with the local
  squash-safe `stack` CLI on GitHub or GitLab.
---

# Stack

Use the local `stack` CLI for squash-safe stacked change repair. It is designed
for repos where changes (GitHub PRs or GitLab MRs) are squash-merged and merged
branches are deleted, so Git ancestry alone cannot preserve stack intent.

## Critical: State Is Shared Across Worktrees

Linked Git worktrees share their common Git directory. That means every
worktree also shares `.git/stack/state.json`, `.git/stack/undo.json`, and
repo-local `stack.*` configuration. Visibility does not imply ownership.

Treat each connected stack as implicitly owned by one worktree. Before a
mutation, inspect `git worktree list --porcelain`, the current branch,
`git status --short`, and `stack status`. Then pass a branch from the owned
stack explicitly:

```bash
stack sync <owned-stack-branch>
stack sync --apply <owned-stack-branch>
stack merge <owned-stack-root>
```

Never mutate another worktree's stack or run stack mutations concurrently
across worktrees without explicit coordination. If this worktree has no stack,
create an independent stack instead of attaching new work to an unrelated
visible stack. When the current branch is off-stack, bare `stack status` and
`stack sync` can show the repo-wide forest; treat that as read-only discovery,
not permission for a bare apply.

## Setup

Works against GitHub (via `gh`) and GitLab (via `glab`). Install and
authenticate the matching CLI before running `stack`.

- `github.com` and `gitlab.com` are detected automatically from `origin`.
- Enterprise host: `git config stack.codeHost github|gitlab` (or `STACK_CODE_HOST` env override).
- Custom trunks: `git config stack.trunks dev,develop,main,master`.
- Readiness policy: `git config stack.readinessMode unmanaged|all-ready|root-ready`.
- Drop the attribution link from stack blocks: `git config stack.blockLink false`.

Repo-local `stack.*` config is shared by linked worktrees. Changing
`stack.readinessMode` changes their default policy, but does not grant ownership
of another worktree's stack.

Keep ordinary editing and commits on plain `git`. Use `stack` only for stack
intent, inspection, sync, merge, and undo.

## Mental Model

```text
dev
└─ stack-a  #101
   └─ stack-b  #102
      └─ stack-c  #103
```

Stack intent is persisted in `.git/stack/state.json` as stack links (branch,
parent, merge-base anchor, change number). Mutating workflows write
`.git/stack/undo.json` so `stack undo --apply` can restore the previous state.
Do not edit these files by hand — run `stack sync` to preview, `stack sync --apply` to fix.

## Readiness Modes

Readiness is provider-neutral across GitHub PRs and GitLab MRs. The effective
mode comes from `--readiness-mode`, then `git config stack.readinessMode`, then
the default `unmanaged` mode. The flag is a one-command override and does not
rewrite Git config.

Configuration is validated at startup. An invalid configured value is an error
even when a command flag is present; fix or unset it before continuing.

| Mode         | Behavior                                                               |
| ------------ | ---------------------------------------------------------------------- |
| `unmanaged`  | Preserve existing readiness and use the host default for new changes.  |
| `all-ready`  | Make every change in the selected stack ready.                         |
| `root-ready` | Make each configured-trunk-targeting root ready and descendants draft. |

Use `sync` to convert or reconcile an existing stack. Preview the exact scope
and readiness changes, then apply them:

```bash
stack sync <owned-stack-branch> --readiness-mode root-ready
stack sync --apply <owned-stack-branch> --readiness-mode root-ready
```

Readiness changes can trigger checks and reviews. `merge` does not promote a
draft current root immediately before attempting to merge it. Run the scoped
`stack sync --apply` first, wait for required checks, and then merge. After a
root lands and descendant repair finishes, `merge` applies the effective mode
to the remaining stack.

```bash
gh pr checks <root-change> --watch                    # GitHub
glab ci status --branch <root-branch> --wait          # GitLab
```

## Happy Path

Create changes with the right target branches so the stack is self-describing.
For GitHub:

```bash
gh pr create --base dev --head stack-a
gh pr create --base stack-a --head stack-b
```

For GitLab:

```bash
glab mr create --target-branch dev --source-branch stack-a
glab mr create --target-branch stack-a --source-branch stack-b
```

Then preview and apply the owned stack only:

```bash
stack sync <owned-stack-branch>
                        # preview inferred links, repairs, and readiness
stack sync --apply <owned-stack-branch>
                        # record links, repair, retarget, reconcile readiness
```

That's the common loop. Scoped `stack sync` previews; `stack sync --apply` does
the work. Repeat after any parent branch changes or a squash merge lands.

## Commands

- `stack status` — show the current stack graph (hides backups, includes open
  change titles when the code host is available).
- `stack skill` — print this skill for AI agent discovery.
- `stack doctor` — check Git, code-host access, stack metadata, trunks, and undo
  journal health without mutating anything.
- `stack track <branch> --onto <parent>` — manually record stack intent only
  when target branches don't already encode it.
- `stack sync [branch]` — preview inferred links and repairs (non-mutating).
  With no branch, it scopes to the current stack only when the current branch is
  stack-relevant; from an off-stack branch, it previews the repo-wide forest.
- `stack sync --apply [branch]` — infer links, remove stale links, repair
  descendants, retarget changes, reconcile readiness, refresh stack blocks,
  show a tree summary.
- `stack sync [--readiness-mode unmanaged|all-ready|root-ready]` — override the
  configured readiness policy for the preview or apply. This is the explicit
  conversion path for existing changes.
- `stack sync --apply --keep-going` — process independent stacks separately,
  report successes and failures, exit nonzero if any failed.
- `stack merge [branch]` — dry-run root merge plus descendant repair. Infers
  the root from the current branch.
- `stack merge --apply` — retarget child changes, squash-merge the root, repair
  descendants.
- `stack merge --auto` — retarget children, enable code-host auto-merge, wait,
  then repair descendants.
- `stack merge --auto --through <branch-or-change>` — repeat auto-merge one root
  at a time until the target lands.
- `stack merge [--readiness-mode unmanaged|all-ready|root-ready]` — override the
  configured readiness policy applied to the remaining stack after repair. It
  does not make a draft current root mergeable; reconcile that root with scoped
  `sync --apply` first.
- `stack history` — show the most recent applied repair journal.
- `stack undo` — dry-run restore of the last applied mutation.
- `stack undo --apply` — restore branch tips, change targets, readiness, and
  stack metadata. It does not unmerge a landed root; after merge, it restores
  only the journaled surviving-stack state.

Each applied mutation replaces the single shared undo journal. Run
`stack history` and confirm that the latest journal belongs to the owned stack
before previewing or applying undo.

## Stack Blocks

`stack sync --apply` and `stack merge --apply/--auto` refresh a deterministic
block in each open change description:

```md
<!-- stack:links:start -->

### [Stack](https://github.com/kitlangton/stack)

1. #101
2. #102
3. **#103** 👈 current
<!-- stack:links:end -->
```

Earlier entries are landed history. The current change is bold with `👈 current`.
GitHub uses `#123`; GitLab uses `!123 - Title`.

## Safety Rules

- Stack metadata, the undo journal, and repo-local `stack.*` config are shared
  by linked worktrees. Operate only on the current worktree's owned stack.
- Pass an owned branch to mutating `sync` and `merge` commands. Do not turn a
  repo-wide off-stack preview into a bare apply.
- Do not run stack mutations concurrently across worktrees.
- Require a clean current worktree before applying a mutation.
- Bare `stack sync` never mutates branches, changes, or stack metadata.
- `stack merge` is dry-run by default.
- Mutating commands need `--apply` (except `merge --auto`, which waits for the
  code host and repairs after the root lands).
- Never mutate trunk branches (`dev`, `main`, `master`, or any configured trunk).
- Before rebasing, the tool creates a local backup branch.
- Clean sibling worktrees can own branches being repaired or cleaned up; dirty
  sibling owners fail before mutation.
- If a replay fails, the tool aborts the cherry-pick, restores the original
  branch, keeps backups and the undo journal, and tells you which branch to
  repair before running `stack sync --apply` again.
- If output is unclear, inspect with `stack status`, `stack history`, or command
  help before applying.
