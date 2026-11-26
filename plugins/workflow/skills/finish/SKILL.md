---
name: finish
description: Finish a feature branch from its worktree. Syncs with base_branch, runs every verify command and the configured review, updates docs and records lessons, commits, pushes, opens a PR into base_branch, merges only after you confirm, updates issue labels, and asks before cleaning up the worktree and branches. Settings come from .claude/workflow.md.
---

# /workflow:finish

Takes the current feature branch from "work done" to "merged into `base_branch`". Phases: setup, sync and verify, commit, push and PR, merge, cleanup. Stop and report on any failure; never guess past an error.

**Hard rules (every phase):** never commit to a branch in `protected_branches` or to `base_branch`; never use `--no-verify`, `--force`, `--force-with-lease`, rebase, or `gh pr merge --admin`/`--auto`; never merge without an explicit yes; never switch the main checkout to a feature branch; never delete anything without asking first.

## Phase 0: Setup and guards

1. **Find the roots.**
   ```bash
   WT_ROOT=$(git rev-parse --show-toplevel)
   REPO_ROOT=$(git worktree list --porcelain | sed -n '1s/^worktree //p')   # main checkout
   BRANCH=$(git branch --show-current)
   ```
2. **Read settings.** Read `$WT_ROOT/.claude/workflow.md` (fall back to `$REPO_ROOT/.claude/workflow.md`). If neither exists, STOP: "This repo has no `.claude/workflow.md`. Run `/workflow:setup` first." Parse the YAML frontmatter; any missing key takes the default shown in the plugin template. Also note the `## Docs`, `## Lessons`, and `## Implementation rules` sections.
3. **Branch guard.** If `BRANCH` is empty (detached HEAD), equals `base_branch` or `release_branch`, or is listed in `protected_branches`, STOP: "`/workflow:finish` merges a feature branch into `<base_branch>`; switch to your feature worktree first."
4. **Worktree guard.** `$WT_ROOT` must be inside `<worktree_dir>` (relative paths resolve against `$REPO_ROOT`). If not, STOP and explain that this skill runs inside a worktree made by `/workflow:implement`. Exception: if `CLAUDE_CODE_REMOTE` is set (web session, no worktrees), continue on the current branch and skip every worktree step below.
5. **Plan file.** List plans with `find "$REPO_ROOT/.claude/plans" -maxdepth 1 -name '*.md' 2>/dev/null` (a bare glob errors in zsh when there are none) and look for one whose `> **Branch:**` line equals `BRANCH`; remember its path and any `> **Issue:** #N` lines. If plan files exist but none matches, warn ("active plan is for `<other branch>` at `<worktree>`") and ask before continuing.
6. **GitHub repo.** `REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)` and `DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name)`. Pass `--repo "$REPO"` to every `gh` call (a redirected `origin` URL confuses `gh`).
7. **Existing PR.** `gh pr list --repo "$REPO" --head "$BRANCH" --state all --json number,state,url`. If a PR is already `MERGED`, skip to Phase 4 step 4 (labels), then Phase 5. If one is `OPEN`, reuse it in Phase 3 instead of creating another.

## Phase 1: Sync with base and verify

1. **Sync with `origin/<base_branch>`** so verify and review run on what will actually merge.
   ```bash
   git fetch origin <base_branch>
   git log --oneline HEAD..origin/<base_branch>
   ```
   If the log is empty, go to step 3. Otherwise:
   - If the tree is dirty, commit it first as `wip: checkpoint before syncing with <base_branch>` (stage as in Phase 2 step 2; hooks still run).
   - Merge, never rebase: `git merge origin/<base_branch> --no-edit`.
   - **On conflict, STOP.** List conflicted files (`git diff --name-only --diff-filter=U`) and the base commits behind each (`git log --oneline HEAD..origin/<base_branch> -- <file>`). Read those commits. Default proposal: keep the base branch's fix and adapt this branch to it. Show the proposed resolution and ask with AskUserQuestion before committing the merge. If the user wants out, `git merge --abort` and stop.
   - **Overlap without conflict:** files changed on both sides (`git diff --name-only origin/<base_branch>...HEAD`, then `git log --oneline ORIG_HEAD..origin/<base_branch> -- <those files>`). Save as `BASE_OVERLAP` for the review; a clean textual merge can still undo a fix.
2. **Refresh dependencies.** If the merge changed a manifest or lockfile (`git diff --name-only ORIG_HEAD HEAD`) and `install` is not `none`, run `install` in `$WT_ROOT`. Stale dependencies produce confident, wrong type errors.
3. **Verify.** First run any `## Finish steps` bullet marked `(before verify)` whose "when <paths> changed" condition matches the branch diff (or that has no condition). Then run every command in `verify`, in order, from `$WT_ROOT`. (Skip only if step 1 merged nothing and this session already ran a passing verify on exactly this tree; say so.) On the first failure, show the output and STOP; the user fixes it, then re-runs `/workflow:finish`. If `verify` is empty, say so plainly.
4. **Review.** Measure the change: `git diff --shortstat origin/<base_branch>...HEAD` plus uncommitted work (`git diff --shortstat HEAD`). Save `DIFF_LINES` (insertions + deletions).
   - First, if the review agent's definition says it only covers certain file types and the diff touches none of them, say so and skip it (the line-count rule below still applies).
   - `review: <agent-name>`: spawn a subagent with `subagent_type: "<agent-name>"`; if that type is unavailable, spawn `general-purpose` and tell it to read and follow `.claude/agents/<agent-name>.md` exactly.
   - `review: builtin`: run the `code-review` skill on the branch diff. If the Skill tool refuses it, spawn a `general-purpose` reviewer for correctness bugs instead.
   - `review: none`: skip, unless `DIFF_LINES >= review_required_lines`, in which case run the builtin review anyway and say why.

   Scope every review to `git diff origin/<base_branch>...HEAD` plus uncommitted changes, include the `## Implementation rules` section and `BASE_OVERLAP` (a regression of a base-branch fix is blocking), and ask for findings with file:line, each marked "introduced by this branch" or "pre-existing". Relay the findings to the user (the subagent report is not shown automatically). If the branch introduced violations, STOP and ask with AskUserQuestion: "Fix them now (Recommended)" / "Ignore and continue" (record the reason for the PR body). Pre-existing findings are reported, not blocking.
5. **Docs sync.** For each file under `## Docs`, check whether the branch diff affects what it describes. Also scan the whole of CLAUDE.md (not just sections named in `## Docs`) for statements the diff makes untrue, such as workflow or command descriptions.
   - Code conflicts with the doc: STOP and ask "(a) update the doc to match the code, or (b) change the code to match the doc?"
   - Code adds something the doc does not cover: update the doc now, on this branch.
   - Docs marked `(flag only)`: report what changed to the user, do not edit.
6. **Lessons sweep.** Follow `${CLAUDE_SKILL_DIR}/../_shared/knowledge-capture.md` over the whole session, including fix rounds and anything learned while resolving the sync merge.

## Phase 2: Commit

1. **Show the branch.** `git diff --stat origin/<base_branch>...HEAD` and `git status`. Summarize what changed across the whole branch.
2. **Stage.** In a worktree, `git add -A` is acceptable, but first scan `git status --porcelain` and never stage `.env*`, keys, credentials, or build output; unstage and warn if any appear. Nothing to stage (everything checkpointed) is normal.
3. **Message.** Conventional commit from the branch type (`feat/` gives `feat: ...`; also `fix`, `refactor`, `docs`, `chore`). It becomes the PR title and, with `merge_method: squash`, the subject on `<base_branch>`, so describe the whole branch. Short dash bullets in the body for what and why.
4. **Approve.** If there is something to commit, AskUserQuestion: "Use this message for the final commit and the PR title?" If everything was already checkpointed, ask only about the PR title (derived from the whole branch). Options: "Use it" / "Edit it" (take their text).
5. **Commit** if anything is staged. Append a `Co-Authored-By:` trailer (the attribution line this session was given, else `Co-Authored-By: Claude <noreply@anthropic.com>`) only when `commit_trailer` is true; when false, add no co-author trailer at all.
   ```bash
   git commit -F <message-file>
   ```
   If a hook fails, fix the cause and commit again (a new commit, not `--amend`). Never bypass hooks.

## Phase 3: Push and PR

1. **Re-check base.** `git fetch origin <base_branch>`; if it moved since Phase 1, repeat Phase 1 steps 1 to 3 (merge, install, verify) before pushing.
2. **Push:** `git push -u origin "$BRANCH"`. If rejected as non-fast-forward, do not force: show the error and ask.
3. **Issues** (only if `issues.enabled`). Collect `#N` from the plan file's `> **Issue:**` lines. If `issues.required` is true and there are none, ask before opening the PR.
4. **PR body.** Write it to a temp file (works in bash and PowerShell):
   ```markdown
   Closes #N            (one line per issue; omit if none)

   ## Summary
   - <what changed and why>

   ## Docs impact
   - <docs updated, lessons recorded, or "None">

   ## Test plan
   - [x] `<each verify command>` passes
   - [ ] <feature-specific manual checks, e.g. run `<dev_server>` and ...>
   - [ ] <each `## Finish steps` bullet marked `(in PR checklist)` whose condition matches>
   - [ ] <other post-merge steps the diff needs, if any>

   <review notes: ignored findings and why, if any>

   <the PR attribution line this session was given, if any>
   ```
   `commit_trailer` only governs commits; the PR attribution line is always fine.
5. **Create** (or, for an existing open PR, `gh pr edit` the title and body):
   ```bash
   gh pr create --repo "$REPO" --base <base_branch> --head "$BRANCH" --title "<approved subject>" --body-file <file>
   ```
   Print the PR URL.

## Phase 4: Merge (only after confirmation)

1. **Size.** `gh pr view <n> --repo "$REPO" --json additions,deletions`. Large means `additions + deletions >= review_required_lines`.
2. **Ask** with AskUserQuestion.
   - Normal: "Merge PR #<n> into <base_branch> with <merge_method>?" Options: "Yes, merge it" / "No, I'll handle it manually".
   - Large: state the count plainly ("This PR changes 2,885 lines"), put `git diff --stat origin/<base_branch>...HEAD` in the option preview, and offer "Review it first (Recommended)" / "Merge anyway". "Review it first" means do not merge.
3. **Merge** on a yes:
   ```bash
   gh pr merge <n> --repo "$REPO" --<merge_method>     # no --delete-branch; Phase 5 handles branches after asking
   gh pr view <n> --repo "$REPO" --json state,mergeCommit,headRefOid
   ```
   `gh pr merge` can print `fatal: '<base_branch>' is already used by worktree ...` after the remote merge already succeeded. Whatever the exit code, trust `state`: `MERGED` means continue; anything else means show the error and ask. If it failed on required checks or reviews, report that and stop; never use `--admin`.
4. **Labels** (only if merged and `issues.enabled`). Gather issue numbers from closing keywords in the PR body and commits:
   ```bash
   gh pr view <n> --repo "$REPO" --json body,commits -q '.body, .commits[].messageHeadline, .commits[].messageBody' \
     | grep -oiE '(close[sd]?|fix(e[sd])?|resolve[sd]?) #[0-9]+' | grep -oE '[0-9]+' | sort -u
   ```
   - `base_branch` is not the default branch (issue closes at release): `gh issue edit <N> --repo "$REPO" --add-label "<in_dev_label>" --remove-label "<claim_label>"`.
   - `base_branch` is the default branch (for example `main` with `release_branch: none`): GitHub closes the issue on merge, so only remove `<claim_label>`.
   Print one summary line. Skip silently if there are no issues.
5. **After-merge steps.** Run `## Finish steps` bullets marked `(after merge)` whose condition matches, asking first for anything outward-facing (deploys, migrations).
6. **Declined:** say the PR is open for manual review, that issue labels change only after it merges (re-running `/workflow:finish` then picks them up), and go to Phase 5.

## Phase 5: Cleanup (ask first)

1. **Main checkout.** `cd "$REPO_ROOT"`. If it is not on `base_branch`, do not switch it; tell the user and skip the pull. Otherwise, after a merge, first check for local copies the pull would silently overwrite: for each file the merge adds (`git diff --name-only --diff-filter=A HEAD origin/<base_branch>` after a fetch) that already exists in the main checkout as an untracked or ignored file, compare it with the merged version; if they differ, show the diff and ask before pulling. Then `git pull --ff-only origin <base_branch>`; if that refuses (local edits or divergence), show why and ask. Never touch unrelated uncommitted work there.
2. **Safety checks before offering removal.**
   - Uncommitted or unpushed work in the worktree: `git -C <worktree> status --porcelain` and `git -C <worktree> log --oneline @{u}..`. Anything listed means removal would lose it; say so.
   - Processes running from the worktree (a dev server breaks when its folder disappears):
     ```bash
     for p in $(lsof -tiTCP -sTCP:LISTEN 2>/dev/null); do lsof -a -p $p -d cwd -Fn 2>/dev/null | grep -F "<worktree path>"; done
     ```
3. **Ask once** with AskUserQuestion, listing exactly what would be removed and the results of step 2.
   - **Merged:** "Clean up: worktree `<path>`, local branch, remote branch, plan file?" Options: "Yes, remove all four (Recommended)" / "Keep everything".
   - **Not merged:** "The PR is still open. Remove anything?" Options: "Keep everything (Recommended)" / "Remove only the worktree". Never offer to delete the remote branch (that closes the PR) or the local branch.
4. **On yes** (only what was approved):
   - Worktree: `git worktree remove <path>` (no `--force`). If git refuses because of local files, show them and ask before using `--force`.
   - Local branch (merged only, never a protected branch): delete with `git branch -D "$BRANCH"` only if `git rev-parse "$BRANCH"` equals `headRefOid`; `-d` fails after squash merges. If the SHA differs, keep it and say it holds unshipped commits.
   - Remote branch (merged only): if `git ls-remote --heads origin "$BRANCH"` prints `headRefOid`, run `git push origin --delete "$BRANCH"`; a different SHA means keep it and say so. Then `git fetch --prune origin` and confirm `ls-remote` prints nothing; if it still does, say so.
   - Plan file: `rm -f <plan file>` so a later `/workflow:implement` does not think the feature is active.
5. **Main checkout deps.** If the merge changed manifests or lockfiles and `install` is not `none`, run `install` in `$REPO_ROOT`.
6. **After-cleanup steps.** List `## Finish steps` bullets marked `(after cleanup)` and run them after asking.
7. **Report** what actually happened: PR URL and state, issues labeled, what was removed and what was kept, anything the user must do (restart `<dev_server>`, apply migrations, review flagged business docs). Never report a deletion that did not happen.
