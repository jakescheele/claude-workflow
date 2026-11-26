---
name: implement
description: Start a feature or fix in its own git worktree off the project's base branch, optionally link and claim a GitHub issue, write a plan for approval, then implement and verify it. Reads all project settings from .claude/workflow.md. Use when the user wants to build, fix, or change something in a repo set up with /workflow:setup.
argument-hint: "[feature description | #issue]"
---

# /workflow:implement

The user's request: $ARGUMENTS

Below, "the request" means that text (a feature description, or an issue reference like `#42`). Runs: Session Guard, Phase 1 Setup, Phase 2 Plan (needs approval), Phase 3 Implement. If there is no request and no active plan applies, ask the user what to build.

## Step 0: Load settings

1. Find the main checkout (this works from inside a worktree too):
   ```bash
   MAIN_ROOT=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
   ```
2. Read `.claude/workflow.md` from the current worktree if you are in one (`git rev-parse --show-toplevel`), else from `$MAIN_ROOT`, falling back to `$MAIN_ROOT` if the worktree has none. `/workflow:finish` uses the same order, so a branch that edits workflow.md sees the same settings in both. If neither exists, STOP and tell the user: "This repo has no `.claude/workflow.md`. Run `/workflow:setup` first." Do nothing else.
3. Parse the YAML frontmatter. Keys left out take the defaults shown in the plugin template. Keep these in mind for the whole run: `base_branch`, `protected_branches`, `branch_pattern`, `worktree_dir`, `worktree_naming`, `install`, `copy_into_worktree`, `worktree_setup`, `dev_server`, `verify`, `commit_trailer`, `checkpoint_commits`, `issues.*`. Also read the body sections `## Plan sections`, `## Implementation rules`, `## Agents`, `## Docs`, `## Lessons` if present.
4. Read `$MAIN_ROOT/CLAUDE.md` (and any CLAUDE.md it points to). Its rules apply throughout.

Below, `<base>` means `base_branch` and `<wt_dir>` means `$MAIN_ROOT/<worktree_dir>`.

## Hard rules (apply in every phase)

- The main checkout (`$MAIN_ROOT`) always stays on `<base>`. Never run `git checkout`/`git switch` to a feature branch there. Fetching, and fast-forward pulling `<base>` there, is fine.
- Every feature branch lives in its own worktree under `<wt_dir>`. All edits happen inside that worktree.
- Never commit or push to a branch in `protected_branches`. Never force-push. Never use `--no-verify` (or skip hooks any other way). If a hook fails, fix the cause and retry.
- Ask before deleting anything: files, branches, worktrees, labels, issue comments.
- Never start a dev server or other long-running process. Print the command for the user instead.
- Never print or commit the contents of files listed in `copy_into_worktree` (they usually hold secrets).
- Any time you give the user a `cd` command, put it alone in its own fenced `bash` block with the fully resolved absolute path, unless `## Implementation rules` says how to format commands for this project.

**Web and phone sessions** (`CLAUDE_CODE_REMOTE` is set): the session already runs in its own disposable checkout, so there are no worktrees. Create the feature branch right there (`git fetch origin <base>` then `git switch -c <branch> origin/<base>`), skip the worktree steps (Phase 1 steps 5 and 9, the copy step, and the dev server command), and keep everything else, including the plan file and approval. In the Session Guard, treat this checkout as the feature's worktree: write its path on the plan's `Worktree` line, and do not stop because it is not on `<base>`. If `gh` is not available, use the GitHub MCP tools for issue and PR steps when they are loaded; otherwise tell the user exactly which issue step to do by hand and continue.

---

## Session Guard (run every time, before anything else)

1. List plan files with `find "$MAIN_ROOT/.claude/plans" -name '*.md' 2>/dev/null` (a bare `*.md` glob errors in zsh when there are none; plans can sit in subfolders when `worktree_naming` is `nested`). For each, read the `> **Worktree:**`, `> **Branch:**` and optional `> **Issue:**` header lines. Also run `git worktree list`: worktrees with no plan file (older or hand-made ones) are mentioned in one line, never touched.
2. Run `git branch --show-current` and `git rev-parse --show-toplevel`.
3. **Inside a worktree** (toplevel is under `<wt_dir>`): the current branch must match the plan whose `Worktree` is this directory. If it does not match, or no plan exists for it, tell the user "You're on `<current>` but the active feature here is `<expected>` at `<worktree>`." and STOP. Ask how to proceed; never continue silently on the wrong branch. If it matches and there is no request or the request refers to this work, resume at the right phase (Phase 2 if the plan is not approved yet, else Phase 3).
4. **In the main checkout:** if the current branch is not `<base>`, STOP and tell the user the main checkout should be on `<base>`; ask them how to proceed (do not switch it yourself if it has uncommitted changes). If active plans exist, list them in one line. If one matches the request (same issue or clearly the same work), ask via `AskUserQuestion`: `Resume <branch>` / `Start new work`. Resuming means `cd` into its worktree and continuing at Phase 2 or 3.
5. Otherwise this is fresh work: go to Phase 1.

---

## Phase 1: Setup (automated, except the questions noted)

1. **Sync base without leaving it.**
   ```bash
   git -C "$MAIN_ROOT" fetch origin <base>
   ```
   If the main checkout is on `<base>` and has no staged or unstaged changes to tracked files (untracked files don't count), also run `git -C "$MAIN_ROOT" pull --ff-only origin <base>` and report how many commits it moved, in one line. If that fails, warn and continue: the worktree is created from `origin/<base>` anyway. If `origin/<base>` does not exist, STOP and tell the user `base_branch` looks wrong.

2. **Pick the type**, in this order: `fix` if it repairs broken behavior or mentions a bug; `docs` if only docs change; `chore` for config, tooling, dependencies, CI or repo housekeeping with no user-facing change; `refactor` if behavior stays the same; otherwise `feat`. The leading verb ("add", "update") does not decide it. If two fit equally, ask.

3. **Link an issue** (skip this step entirely if `issues.enabled` is false). Issue linking is required when `issues.required` is true or `branch_pattern` contains `<issue>`.
   a. **Resolve.** If the request names an issue (`#42`, `issue 42`), use it as `$ISSUE_NUM` and read its title with `gh issue view`. Otherwise search with 2 to 4 distinctive words from the description:
      ```bash
      gh issue list --state open --search "<key terms>" --json number,title,labels,assignees --limit 10
      ```
      Ask via `AskUserQuestion`. Options: each plausible match (`#N: title`), `Create new issue`, and `Skip issue tracking` (only when linking is not required).
   b. **Create** (only after the user picked it): `gh issue create --title "<from the request, without a conventional prefix like chore:>" --body "Tracked via /workflow:implement."`, adding `--label` from `issues.type_labels` for the type (if the type is listed there and the label exists; unlisted types get no type label) and `--milestone` when `issues.milestone` is set. Capture the number.
   c. **Block on an existing claim.** `gh issue view $ISSUE_NUM --json labels,assignees,comments`. If it already has `issues.claim_label`, STOP, show the latest claim comment (who, when, branch), and ask via `AskUserQuestion`: `Coordinate first` (abort) / `Pick a different issue` / `Take it over` (proceed and post a takeover comment).
   d. **Check the label exists:** `gh label list --search "<claim_label>"`. If it is missing, ask once before creating it.
   e. **Claim.** When `issues.claim_when` is `after_plan` (default), claim at the start of Phase 3, so a rejected plan leaves no stale claim. When it is `before_plan`, claim now, before planning, so two people cannot plan the same issue at once; if the plan is then rejected or abandoned, ask whether to remove the label and post a release comment.
      ```bash
      gh issue edit $ISSUE_NUM --add-label "<claim_label>"
      gh issue comment $ISSUE_NUM --body-file <tmp file>
      ```
      Comment body: first line `<!-- <issues.claim_marker> -->` (default `workflow-claim`; repos whose own tooling reads claim comments set their marker), then lines for author (`git config user.name`), started (ISO 8601 UTC), branch, and worktree path, plus any extra claim fields `## Implementation rules` asks for.
   f. Carry `$ISSUE_NUM` and its title forward to the plan header.

4. **Derive names.** Slug: 3 to 6 meaningful words from the issue title (or the request), lowercase, joined with hyphens. Drop filler words and file names, turn punctuation (`.`, `/`) into word breaks rather than gluing words together, and never cut a word in half; keep it under 50 characters. State the branch name in the setup summary. Fill `branch_pattern` with `<type>`, `<slug>`, `<issue>`. Worktree name = branch with `/` replaced by `-` when `worktree_naming` is `flat` (default), or the branch name as is when it is `nested` (folders like `feat/x`). Worktree path = `<wt_dir>/<worktree name>`. If the branch already exists locally or on origin, or is in `protected_branches`, STOP and ask.

5. **Create the worktree** from the fresh remote base, without tracking base:
   ```bash
   git -C "$MAIN_ROOT" worktree add --no-track -b <branch> "<worktree path>" origin/<base>
   ```
6. **Install.** Unless `install` is `none`, run it inside the worktree. Do not skip it for small or docs-only changes: the `verify` commands usually need it.

7. **Copy local files.** For each path in `copy_into_worktree` (relative to the repo root, subfolders allowed), copy `$MAIN_ROOT/<path>` to the same relative path in the worktree if the source exists, creating parent folders. Report which were copied or missing, never their contents.

7b. **Worktree setup.** Run each command in `worktree_setup` from the worktree root, in order (for example seeding local data). A failure is a warning, not a stop: report it and what it means, then continue.

8. **Print the dev server command(s)** (skip if `dev_server` is `none`; it may be one command or a list). Prose line, then for each command a fenced `bash` block containing only:
   ```bash
   cd <worktree path> && <command>
   ```
   Tell the user to run each in its own terminal. Do not run them.

9. **Work from the worktree** (`cd` into it) for every later step.

---

## Phase 2: Plan (requires user approval)

1. Read the docs relevant to the change: those listed under `## Docs` in workflow.md, plus anything CLAUDE.md points to for this area.
2. Explore existing patterns (similar pages, components, modules, tests, migrations). Reuse a pattern before inventing one.
3. Grep the files listed under `## Lessons` for the subsystems you will touch; these hold past incidents.
4. **Conflict risk.** Once you know the planned files:
   ```bash
   git fetch origin <base>
   git log --oneline --since="14 days ago" origin/<base> -- <planned files>
   gh pr list --base <base> --state open --limit 50 --json number,title,author,files
   git worktree list
   ```
   The plan must build on recent `<base>` commits to the same logic, not redo or undo them. List open PRs and other worktrees touching the same files.

Write the plan to `$MAIN_ROOT/.claude/plans/<worktree name>.md` (create parent folders for `nested` names) and show it to the user. It must start with this header so any later session can find the worktree:

```
> **Worktree:** `<worktree path>`
> **Branch:** `<branch>`
> **Issue:** #<number>: <title>            (omit when there is no issue)

## Implementation Plan
### Summary            (1 to 2 sentences)
### Files to Create    (path: purpose)
### Files to Modify    (path: what changes)
<one ### section per bullet under "## Plan sections" in workflow.md, each filled in or "None">
### Conflict Risk      (recent base commits, open PRs, other worktrees on the same files, or "None found")
### Docs Impact        (which docs need updating, or "None")
### Key Decisions
### Implementation Order
```

**STOP and wait for explicit approval before writing any code.** Use `AskUserQuestion`: "Does this plan look good? Any changes before I implement?" Put the full plan, kept terse, in the `preview` of every option, titled `Plan: <branch> (issue #N)`. Options: `Approve (Recommended)`, up to two scope variants if there is a real choice (each with its own preview), and `Revise the plan`. On revise, update the plan file and ask again.

---

## Phase 3: Implement (after approval)

**Gate.** Run the Session Guard. If not inside the worktree, find it from the plan's `Worktree` line (or `git worktree list`) and `cd` into it. If it no longer exists, STOP and tell the user to run `/workflow:implement` again. Do not recreate it silently.

**Claim the issue** now (Phase 1 step 3e), if one is linked, `issues.claim_when` is `after_plan`, and it is not yet claimed.

1. **Implement** the approved plan, following CLAUDE.md and every bullet under `## Implementation rules` in workflow.md. Use the project agents listed under `## Agents` when their condition applies; otherwise use a `.claude/agents/` agent only when it clearly fits a step.
2. **Verify.** Run each `verify` command in order from the worktree root. Fix failures and rerun until all pass. If a command fails because the tooling does not exist yet, report it and ask whether to skip that gate or add the tooling.
3. **Docs sync.** Update the docs named in the plan's Docs Impact and any `## Docs` entry the change makes stale. If the code conflicts with a doc, STOP and ask: update the doc, or revert the code? Rerun `verify` if doc sync touched code.
4. **No review here.** `/workflow:finish` reviews the whole branch once, after syncing with base. Only run a review now if the user asks for one.
5. **Checkpoint commit** (skip if `checkpoint_commits` is `never`). With `ask` (default), draft the commit message first, then ask via `AskUserQuestion` with the message in the question: `Commit and push (Recommended)` / `Commit only` / `Edit the message` / `Not now`. With `auto`, commit and push without asking after every passing verify (here and after each fix round), for repos whose preview builds track the branch; still never commit when verify fails. If committing:
   - `git branch --show-current` must match the plan's branch and must not be in `protected_branches`; otherwise STOP and run the Session Guard.
   - Run `git status --short` and check for secrets, files from `copy_into_worktree`, large binaries, or build output. Stage specific paths, not blindly.
   - Commit with a conventional subject matching the type (`feat: add follow button`). Add the `Co-Authored-By` trailer only if `commit_trailer` is true.
   - Push: first time `git push -u origin <branch>`, then `git push`. If push fails, warn and keep going.
   - Report one line: `Checkpoint: <short sha> <subject>`.
6. **Report** what was created and changed, doc updates, verify results, and anything left open. Re-print the dev server command (Phase 1 step 8 format) if one is configured.

## Follow-ups

- Change requests after implementation happen in the same worktree: implement, verify, then offer a checkpoint again. Before each fix round, `git fetch origin <base>` and mention any new base commits that touch this branch's files; merging base is left to `/workflow:finish`.
- The worktree and plan stay until `/workflow:finish`. Merging into `<base>` only ever happens there.
