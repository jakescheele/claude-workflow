---
name: commit
description: Checkpoint the current feature branch. Runs every verify command from .claude/workflow.md, stages safely, commits with an approved conventional message, and pushes the branch. Refuses protected branches and base_branch. No PR, merge, or cleanup; use /workflow:finish for that.
disable-model-invocation: true
---

# /workflow:commit

Commit and push work in progress on a feature branch so it is saved and visible. Use `/workflow:finish` to open a PR and merge.

**Hard rules:** never commit to `base_branch`, `release_branch`, or anything in `protected_branches`; never use `--no-verify`, `--force`, `--force-with-lease`, or rebase; never switch branches in the main checkout; never stage secrets.

## Phase 0: Setup and guards

1. **Find the roots.**
   ```bash
   WT_ROOT=$(git rev-parse --show-toplevel)
   REPO_ROOT=$(git worktree list --porcelain | sed -n '1s/^worktree //p')   # main checkout
   BRANCH=$(git branch --show-current)
   ```
2. **Read settings.** Read `$WT_ROOT/.claude/workflow.md` (fall back to `$REPO_ROOT/.claude/workflow.md`). If neither exists, STOP: "This repo has no `.claude/workflow.md`. Run `/workflow:setup` first." Parse the YAML frontmatter; missing keys take the template defaults.
3. **Branch guard.** If `BRANCH` is empty (detached HEAD), equals `base_branch` or `release_branch`, or is listed in `protected_branches`, STOP:
   > "You're on `<branch>`. Direct commits to protected branches are not allowed. Start a feature branch with `/workflow:implement` (or `git switch -c <type>/<slug>` in a new worktree)."
   Do not create or switch branches yourself.
4. **Where am I.** Note whether `$WT_ROOT` is inside `<worktree_dir>` (relative paths resolve against `$REPO_ROOT`). This decides how staging works in Phase 2. A web session (`CLAUDE_CODE_REMOTE` set) counts as isolated, like a worktree.

## Phase 1: Verify

1. Run every command in `verify`, in order, from `$WT_ROOT`.
2. On the first failure, show the output and STOP. Ask with AskUserQuestion: "Fix it now (Recommended)" / "Stop here". Never commit past a failing gate, and never skip a gate because the change "looks docs-only"; if a command has nothing to check, it passes on its own.
3. If `verify` is empty, say so plainly and continue.

No review or lessons sweep here; `/workflow:finish` runs those over the whole branch.

## Phase 2: Stage and commit

1. **Show changes:** `git status` and `git diff --stat`. If there is nothing to commit, say so and skip to Phase 3 (unpushed commits may still need pushing).
2. **Stage.**
   - Inside a worktree or web session: `git add -A` is acceptable after scanning `git status --porcelain`.
   - Anywhere else: stage specific files by name; ask if it is unclear which files belong to this checkpoint.
   - Never stage `.env*`, keys, credentials, or build output. If any are staged, unstage them and warn.
3. **Message.** Conventional commit from the branch type (`feat/` gives `feat: ...`; also `fix`, `refactor`, `docs`, `chore`). If the branch name has no type, infer it from the change. A concise subject on what this checkpoint changed, optional dash bullets for why.
4. **Approve.** AskUserQuestion: "Commit with this message?" Options: "Use it" / "Edit it" (take their text). If the session offers a commit-proposal tool that shows the message and files for approval, it can replace this step.
5. **Commit.** Append a `Co-Authored-By:` trailer (the attribution line this session was given, else `Co-Authored-By: Claude <noreply@anthropic.com>`) only when `commit_trailer` is true; when false, add no co-author trailer at all.
   ```bash
   git commit -F <message-file>
   ```
   If a hook fails, fix the cause and commit again as a new commit. Never bypass hooks and never `--amend` a commit that is already pushed.

## Phase 3: Push

1. `git push -u origin "$BRANCH"`.
2. If the push is rejected (remote has commits this checkout lacks), do not force. Show the error and ask with AskUserQuestion: "Merge origin/<branch> in, re-verify, and push (Recommended)" / "Stop here". On yes: `git fetch origin "$BRANCH"`, `git merge origin/"$BRANCH" --no-edit` (STOP and ask on conflict), re-run Phase 1, push again.
3. Confirm with `git log --oneline -1` and `git status -sb` (should show the branch in sync with its upstream).

## Report

One short summary: commit SHA and subject, branch pushed, verify commands that ran. Remind the user that `/workflow:finish` syncs with `<base_branch>`, reviews, and opens the PR.
