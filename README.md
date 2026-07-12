# stack

```ts
╭───STACK───╮
dev
└─ #101
   └─ #102
      └─ #103
╰───────────╯
```

Squash-safe stacked PR/MR repair for coding agents working in GitHub or GitLab
repos that squash-merge and delete branches.

`stack` is agent-first. Humans can run it directly, but the happy path is: let
the agent do normal code work with plain `git`, then use `stack` for stack
inspection, repair, merge, and undo workflows.

## Important: Git Worktrees Share Stack State

Linked worktrees use the same common Git directory, so they also share
`.git/stack/state.json`, `.git/stack/undo.json`, and repo-local `stack.*`
configuration. A visible stack is not automatically owned by the current
worktree.

Treat each connected stack as owned by one worktree. Pass a branch from that
owned stack to mutating commands, do not operate on another worktree's stack
without explicit coordination, and do not run stack mutations concurrently
across worktrees. If the current worktree does not have a stack, create an
independent one instead of attaching it to an unrelated visible stack.

## Install

```bash
npm install -g @kitlangton/stack
```

Install the agent skill too:

```bash
npx skills add kitlangton/stack --skill stack
```

Install and authenticate the matching host CLI:

```bash
gh auth login      # GitHub
glab auth login    # GitLab
```

## Agent Happy Path

1. Create stacked changes using normal git branches.
2. Open the root PR/MR against trunk, for example `main` or `dev`.
3. Open each child PR/MR against its parent branch.
4. Preview the stack:

```bash
stack sync <owned-stack-branch>
```

5. Apply the safe maintenance workflow:

```bash
stack sync --apply <owned-stack-branch>
```

6. Merge from the root when ready:

```bash
stack merge <owned-stack-root>
stack merge <owned-stack-root> --apply
```

Use `stack merge <owned-stack-root> --auto` when the code host should wait for
merge requirements, then repair descendants automatically after the root lands.

## What It Does

`stack sync --apply` is the common maintenance workflow:

- Infers stack links from PR/MR target branches.
- Records stack intent in `.git/stack/state.json`.
- Repairs descendants after parent branches move or land.
- Retargets PRs/MRs when needed.
- Reconciles PR/MR readiness according to the effective policy.
- Refreshes stack blocks in descriptions.
- Saves `.git/stack/undo.json` before mutations.

GitHub stack blocks use compact `#101` references. GitLab blocks use `!101`
references plus titles because bare GitLab MR links only show titles on hover.

If a repair fails, run:

```bash
stack history
stack undo
stack undo --apply
```

## GitHub And GitLab

Provider selection is automatic for public hosts:

- `github.com` uses `gh`.
- `gitlab.com` uses `glab`.

For enterprise hosts, configure the repo once:

```bash
git config stack.codeHost github  # or: gitlab
```

Use `STACK_CODE_HOST=github|gitlab` for a one-off override.

## Change Readiness

Readiness policy is provider-neutral and works for GitHub PRs and GitLab MRs.
Configure a repository default with:

```bash
git config stack.readinessMode root-ready
```

The supported modes are:

| Mode         | Behavior                                                                  |
| ------------ | ------------------------------------------------------------------------- |
| `unmanaged`  | Preserve existing readiness; use the code host's default for new changes. |
| `all-ready`  | Make every change in the selected stack ready.                            |
| `root-ready` | Make each trunk-targeting root ready and every descendant draft.          |

`unmanaged` is the default, preserving the behavior of earlier releases. A
command-line override takes precedence over Git config for that invocation; it
does not rewrite the configured default:

```bash
stack sync <owned-stack-branch> --readiness-mode root-ready
stack sync --apply <owned-stack-branch> --readiness-mode root-ready
stack merge <owned-stack-branch> --readiness-mode root-ready
```

An invalid configured value is a startup error even when a flag is present.
Fix it with `git config stack.readinessMode <mode>` or unset it before retrying.

Use `sync` as the explicit conversion and reconciliation path for an existing
stack: preview first, then apply. Readiness changes can start checks or reviews,
so `merge` does not make a draft current root ready immediately before trying to
merge it. Promote and reconcile first with `stack sync --apply`, wait for any
required checks, then run `stack merge`. After a root lands and descendants are
repaired, `merge` applies the effective mode to the remaining stack.

```bash
gh pr checks <root-change> --watch                    # GitHub
glab ci status --branch <root-branch> --wait          # GitLab
```

Applied readiness changes are recorded in the undo journal. `stack undo --apply`
restores the previous readiness along with branch tips, change targets, and
stack metadata. Undo does not unmerge a landed root; after a merge it restores
only the journaled state of the surviving stack. Each applied mutation replaces
the single shared journal, so inspect `stack history` before undoing.

## Trunk Branches

By default, `stack` treats `dev`, `main`, and `master` as trunk branches. Repos
that use another trunk, such as `develop`, can configure the trunk list:

```bash
git config stack.trunks dev,develop,main,master
```

## Stack Block Heading

Each stack block has a heading that links back to this project. To render a
plain `### Stack` heading without the attribution link — for example in
enterprise repos where external links trip compliance checks — set:

```bash
git config stack.blockLink false
```

The linked heading stays on by default. This is repo-local; use
`git config --global stack.blockLink false` to apply it everywhere.

## Example Output

```text
Sync preview

● main
└─ ● stack-a #101
   └─ ● stack-b #102

Would update PRs: #101, #102

Apply:
  stack sync --apply <owned-stack-branch>
```

```text
→ retarget #102 (stack-b) to main before merge
→ merge #101 (stack-a)
→ rebase stack-b onto main
→ push stack-b
→ update #102 stack block
```

## CLI Reference

```bash
stack status             # inspect the relevant local stack
stack skill               # print the stack skill (agent instruction set)
stack sync               # preview inference, repairs, and description updates
stack sync --apply       # apply the previewed maintenance workflow
stack sync <branch>      # preview only the stack containing branch
stack sync --apply <branch>
                         # apply only the stack containing branch
stack sync --apply --keep-going
                         # process independent stacks and report failures
stack sync --readiness-mode <unmanaged|all-ready|root-ready>
                         # preview an explicit readiness policy
stack doctor             # inspect repo, host, metadata, and journal health
stack merge              # dry-run the next root merge
stack merge --apply      # merge root and repair descendants
stack merge --readiness-mode <unmanaged|all-ready|root-ready>
                         # override configured readiness for this merge
stack merge --auto       # wait for host requirements, then merge and repair
stack merge --auto --through <branch-or-change>
                         # auto-merge roots through a bounded target
stack history            # show the last saved mutation journal
stack undo               # preview undo
stack undo --apply       # restore tips, targets, readiness, and metadata
```
