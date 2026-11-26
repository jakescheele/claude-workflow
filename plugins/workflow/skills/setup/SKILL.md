---
name: setup
description: Create or update this repo's .claude/workflow.md, the settings file every /workflow:* skill reads (branches, verify commands, review, issues, release steps). Run once per repo, or again to change settings.
---

# /workflow:setup: configure this repo for the workflow plugin

Writes `<repo root>/.claude/workflow.md` from the plugin template, filled in from what the
repo already says about itself. Nothing is committed: the file is left for the user's normal
branch and PR flow.

## 1. Find the repo

```bash
git rev-parse --show-toplevel
```
Store as `$REPO_ROOT`. If this is not a git repo, stop: the workflow plugin only applies to
git projects.

If `$REPO_ROOT/.claude/workflow.md` exists, read it, show the current settings as a short
table, and ask what to change (AskUserQuestion). Edit only those keys, then go to step 5.

## 2. Gather facts (read-only, no questions yet)

Read the template: `${CLAUDE_SKILL_DIR}/../../templates/workflow.md`.

Then collect, without changing anything:
- **Branches:** `git branch -r` and `git remote show origin` (default branch). Does `dev` exist?
  That gives `base_branch` (dev if it exists, else the default branch) and `release_branch`
  (the default branch when `dev` exists, else `none`).
- **Project CLAUDE.md:** branch naming (e.g. an issue number in branch names), protected
  branches, verify commands, merge style, "no Co-Authored-By" notes, docs it says to keep in sync.
- **Package manager and scripts:** lockfile (`package-lock.json` npm, `pnpm-lock.yaml` pnpm,
  `yarn.lock` yarn, `bun.lockb` bun) and `package.json` scripts: typecheck, lint, test, build.
  Also `tsconfig.json`, `astro.config.*`, `pyproject.toml`, etc. for non-npm projects.
- **Review agent:** `.claude/agents/code-review.md` present? Otherwise `review: builtin`.
- **Worktree files:** gitignored env files in the main checkout (`.env`, `.env.local`), for
  `copy_into_worktree`. List names only; never print their contents.
- **Issues:** `gh label list --limit 100` for `status:` labels. `issues.enabled` is true when
  the repo uses GitHub issues.
- **Old per-repo skills:** existing `.claude/skills/{implement,finish,commit,release,doc-audit,log-meeting}`.
  Read them for project-specific steps (extra plan sections, release steps such as version
  bumps, builds or deploy checks, docs to sync, lessons files, meeting folders) so they move
  into the free-form sections instead of being lost.

## 3. Draft

Fill in the template. Keep its comments. Every value should trace back to a fact from step 2.
Where a fact was not found, keep the template default and add `# TBD: confirm` on that line.
Delete free-form sections that do not apply.

## 4. Review with the user

Show the full draft. Then list, in one short block:
- each value you inferred and where it came from
- every `TBD` line
- project-specific steps you carried over from old skills

Ask (AskUserQuestion): "Write this to .claude/workflow.md?" with options to write it, or to
change something first. Loop until approved. Never write without a yes.

## 5. Write and finish

Write the file. Then check `.gitignore` both ways with `git check-ignore -v <path>`:
- `.claude/workflow.md` (and `.claude/settings.json` if step 5.1 is accepted) must NOT be
  ignored, or it never reaches git or new worktrees. Repos often ignore `.claude/*` with
  exceptions; offer to add `!.claude/workflow.md` (and `!.claude/settings.json`) next to them.
- `.claude/plans/` and the `worktree_dir` folder MUST be ignored; offer to add them if not.

Then offer, as separate yes/no questions, never done silently:

1. **Recommend the plugin to everyone who opens this repo.** Merge into
   `$REPO_ROOT/.claude/settings.json` (create it if missing, keep every existing key):
   ```json
   {
     "extraKnownMarketplaces": {
       "claude-workflow": { "source": { "source": "github", "repo": "jakescheele/claude-workflow" } }
     },
     "enabledPlugins": { "workflow@claude-workflow": true }
   }
   ```
2. **Old skill copies.** If step 2 found per-repo copies, say that they still work as
   `/implement` etc. alongside `/workflow:implement`, and suggest removing them in a separate
   PR once the plugin has been used here for a while. Do not delete them now.

End by printing the next step: commit `.claude/workflow.md` (and settings.json) on a feature
branch right away, e.g. by running `/workflow:implement add workflow plugin config`. Until that
merges, the main checkout's copy is untracked: tell the user not to edit it in the meantime,
because the merge replaces it.

Also look at `worktree_setup`: if old skills ran extra commands in each new worktree (seeding
local data, generating files), carry them over there.

## Rules
- Read-only until the user approves the draft.
- No em dash characters in anything you write; use commas, colons or parentheses.
- Never print secret values from env files.
