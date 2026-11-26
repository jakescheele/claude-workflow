---
name: release
description: Ship base_branch into release_branch through a pull request. Fetches and compares the branches, drafts a changelog, checks each in-dev issue (complete or hold), runs the project's "Release steps", opens the release PR, merges it after confirmation without squashing, closes shipped issues, and optionally tags. Use when the user asks to release, ship to production, or merge dev into main.
---

# /workflow:release: ship base_branch into release_branch

The only sanctioned way work moves from `base_branch` to `release_branch`. Five phases:
prepare, project steps, open the PR, merge, close out. Every outward-facing action
(merging, tagging, closing issues) asks first. One confirmation per phase is enough.

**Hard rules for this skill**
- The main checkout stays on `base_branch`. Never `git checkout` the release branch; compare
  and tag against `origin/<release_branch>` instead.
- Never commit or push directly to a protected branch. The release lands through a PR merged
  server-side with `gh pr merge`. Any change that has to land first (a version bump) gets its
  own branch and PR.
- Never use `--no-verify`. If a hook blocks something, stop and report it.
- Never resolve merge conflicts automatically. Show them and ask.

---

## Phase 0: Load settings

1. Find the main checkout. Inside a worktree, use the first entry of `git worktree list`:
   ```bash
   git worktree list
   ```
   `cd` to that path (call it `$REPO_ROOT`). A worktree may already hold `base_branch`, so
   the release must run from the main checkout.
2. Read `$REPO_ROOT/.claude/workflow.md`. If it is missing, stop:
   "No `.claude/workflow.md` found. Run `/workflow:setup` first."
3. Take `base_branch`, `release_branch`, `release_merge_method`, `merge_method`,
   `protected_branches`, `verify`, `worktree_dir`, `install`, `copy_into_worktree`,
   `commit_trailer`, and `issues` from the frontmatter (defaults are in the template). Also read
   the `## Release steps` section if present.
4. If `release_branch` is `none`, stop: "This repo has one long-lived branch
   (`<base_branch>`), so there is nothing to release. Work ships when `/workflow:finish` merges it."
5. Check what else is in flight:
   ```bash
   gh pr list --base <base_branch> --state open --json number,title,headRefName
   ```
   If any PR into `base_branch` is open, list them and ask (AskUserQuestion) whether to
   continue. Releasing mid-flight can ship someone else's half-finished work.

---

## Phase 1: Prepare

1. **Sync** (the main checkout is on `base_branch`; switch to it only if it is not and the tree is clean):
   ```bash
   git fetch origin --tags
   git pull --ff-only origin <base_branch>
   ```
   Compare against `origin/<release_branch>` everywhere below, never the local branch,
   which is usually stale.
2. **Anything to release?**
   ```bash
   git log origin/<release_branch>..origin/<base_branch> --oneline
   ```
   If empty, stop: "`<base_branch>` is already up to date with `<release_branch>`. Nothing to release."
   Also check the reverse (`origin/<base_branch>..origin/<release_branch>`): commits on the release
   branch that are missing from base (a hotfix) mean the PR may conflict. Surface them.
3. **Changelog and scope:**
   ```bash
   git log origin/<release_branch>..origin/<base_branch> --oneline --no-merges
   git diff origin/<release_branch>...origin/<base_branch> --stat
   gh pr list --base <base_branch> --state merged --search "merged:>=<date of last release merge>" --json number,title
   ```
   Draft a changelog grouped by conventional prefix: `feat` under Added, `fix` under Fixed,
   `refactor`/`perf` under Improved, everything else under Other. Reference PR numbers.
   Keep it as the draft for the PR body and the tag notes.
4. **Verify in-dev issues** (skip when `issues.enabled` is false). The label means "merged to
   base, pending release", but some issues hold deliberate post-release work (a migration to run
   later, a dashboard toggle, a follow-up in a comment). Closing those as shipped loses that work.
   ```bash
   gh issue list --label "<issues.in_dev_label>" --state open --json number,title
   gh issue view <number> --json number,title,body,state,comments
   ```
   Read every issue in full (for many, spawn a `general-purpose` agent to read them in parallel).
   For each, decide:
   - **complete**: everything it describes is in this release.
   - **hold**: it records work this release does not satisfy.

   Also collect **release notes**: SQL to run, an env var or dashboard change, a manual step, an
   ordering constraint. Print `#N, title, [complete|hold], one-line reason` for each, then the
   release notes. **If a note says something must happen before the merge, stop and handle it first.**

---

## Phase 2: Project release steps

Run the bullets under `## Release steps` in order. If the section is missing or empty, skip this phase.

- A step marked `(confirm)` needs a yes via AskUserQuestion before it runs. Offer a skip option.
- A step marked `(after merge)` is deferred to Phase 4 step 4. Unmarked steps and `(before merge)`
  steps run now. (Older files may say "After merge" in the text instead; treat it the same.)
- A step marked `(gate)` that fails stops the release. Any other failing step: show the output
  and ask whether to stop (recommended) or continue. Never report a failed check as passed.
- **A step that changes files** (a version bump, an in-app changelog entry) cannot be committed on
  `base_branch`. Land it like any other change:
  1. Create a worktree from `origin/<base_branch>` at `<worktree_dir>/chore-release-<version>` on
     branch `chore/release-<version>`; run `install`, copy `copy_into_worktree` files.
  2. Make the edit. For user-facing copy (release notes shown in the app), show the draft and let
     the user reword it before writing.
  3. Run every `verify` command; all must pass. Commit (`chore: bump version to <version>`, with the
     Co-Authored-By trailer only if `commit_trailer` is true), push the branch, open a PR into
     `base_branch`, and merge it with `merge_method` after one confirmation.
  4. Back in `$REPO_ROOT`, re-run Phase 1 steps 1 to 3 so the changelog includes the bump. Remove
     the worktree.

  If the user would rather do it themselves, stop and tell them to re-run `/workflow:release` after.
- The release version comes from `version_file` (default `package.json`; `none` means the
  project is unversioned, so skip versions and tags entirely). A bump step may set it first.
  If that version is unchanged since the last release (`git show origin/<release_branch>:<file>`),
  say so: the release would ship under a number that already means something else.

---

## Phase 3: Open the PR

1. If an open PR from `base_branch` into `release_branch` already exists, reuse it (update its body).
2. Title: `Release: <3 to 6 word summary>`, under 70 characters. Write the body to a file in the
   scratchpad and pass it with `--body-file`:
   ```bash
   gh pr create --base <release_branch> --head <base_branch> --title "Release: <summary>" --body-file <path>
   ```
   Body sections: `## Release summary` (merging base into release), `### Included` (the changelog),
   `### Closes on release` (complete issues as `#N title`; avoid `Closes #N` keywords so GitHub does not
   close held issues), `### Held back` (hold issues and why), `### Manual steps` (release notes, or "None"),
   `### Checks` (each `verify` command and Release step, with its result). End with the Claude Code
   attribution line.
3. Print the PR URL.

---

## Phase 4: Merge (requires confirmation)

1. Ask via AskUserQuestion: "Merge `<base_branch>` into `<release_branch>`? This updates production."
   Options: `Review on GitHub first (Recommended)` / `Merge now` / `Cancel`. Put the diffstat in the
   preview. Never auto-merge.
2. On review-first or cancel: print the PR URL and stop. Issues stay open until it merges.
3. On merge, use `release_merge_method` (default `merge`):
   ```bash
   gh pr merge <number> --<release_merge_method>
   gh pr view <number> --json state,mergeCommit
   ```
   Never pass `--squash` unless `release_merge_method` is explicitly `squash`: squashing collapses
   the feature history built on the base branch and makes the next release diff against a commit
   that base does not contain. `gh pr merge` can print a local error like "already used by
   worktree"; trust the `state` field (`MERGED`). Record `MERGE_SHA` from `mergeCommit.oid`.
   If the merge is blocked (failing checks, required review, conflicts), report it and stop.
4. Refresh refs without leaving `base_branch`, then run the deferred "After merge" Release steps
   (respecting `(confirm)`):
   ```bash
   git fetch origin <release_branch> --tags
   ```

---

## Phase 5: Close out (one confirmation)

1. **Ask once** via AskUserQuestion (multiSelect), listing each in-dev issue as
   `#N, title, [complete|hold], reason` with the complete ones pre-selected, plus a
   `Tag <prefix><version>` option when `tag.enabled` is true (default), a version is known, and
   that tag does not already exist (`git tag -l "<prefix><version>"`; `tag.prefix` defaults to `v`;
   the examples below assume it). If the tag exists, say so; never move or overwrite a tag.
2. **Close the selected issues:**
   ```bash
   gh issue close <number> --comment "Released in v<version> (PR #<pr>, merge commit <MERGE_SHA>)."
   gh issue edit <number> --remove-label "<issues.in_dev_label>"
   ```
   Use "this release" when there is no version.
3. **Comment on held issues**, keeping them open with their label: what shipped, and the step
   still outstanding, so the next session is not misled.
4. **Tag** (if selected), on the merge commit, never on a local branch tip:
   ```bash
   gh release create "v<version>" --target <MERGE_SHA> --title "v<version>" --notes-file <changelog path>
   ```
   Tags are not branch pushes, so protected-branch rules still hold.
5. **Report:** PR URL, merge method, version and tag (or "untagged"), issues closed, issues held
   with reasons, and every manual step from the release notes or Release steps that still needs running.
