---
# .claude/workflow.md: per-project settings for the `workflow` plugin.
# Every /workflow:* skill reads this file first. Keys left out use the default shown.

base_branch: dev              # feature branches start here and PR back into it
release_branch: main          # /workflow:release PRs base_branch into this. Use "none" if the repo has one long-lived branch.
protected_branches: [main, dev]

# Branch names. Placeholders: <type> (feat|fix|refactor|docs|chore), <slug>, <issue>
branch_pattern: "<type>/<slug>"   # with issue numbers: "<type>/i<issue>-<slug>"
worktree_dir: .claude/worktrees   # worktree path = <worktree_dir>/<worktree name>
worktree_naming: flat             # flat: feat/x -> feat-x. nested: keep the folders (worktrees/feat/x, plans/feat/x.md)

install: npm install              # run inside a new worktree. "none" to skip.
copy_into_worktree: [.env.local]  # gitignored files copied from the main checkout into a new worktree
worktree_setup: []                # commands run in every new worktree after install, without asking (e.g. seed local data).
                                  # Failures warn, never stop. Only list commands you trust to run unattended; use project
                                  # dependencies (npx can download a missing package) and note any external services they call.
dev_server: [npm run dev]         # printed for the user; never started by Claude. Several allowed.

# Run in order before every commit. All must pass.
verify:
  - npx tsc --noEmit
  - npm test --if-present

review: code-review           # project agent in .claude/agents to review the diff before commit,
                              # "builtin" for the /code-review skill, or "none"
review_required_lines: 300    # diffs this large always get a review, even if review is "none"

merge_method: squash          # feature -> base_branch: squash | merge | rebase
release_merge_method: merge   # base_branch -> release_branch

issues:
  enabled: true               # link work to GitHub issues
  required: false             # true: no branch without an issue
  claim_label: "status: in-progress"
  claim_when: after_plan      # after_plan: claim once the plan is approved. before_plan: claim first, so two people can't plan the same issue
  claim_marker: workflow-claim  # first line of claim comments is <!-- claim_marker -->; match it if your own tooling reads claims
  in_dev_label: "status: in-dev"   # set when merged to base_branch; issue closes at release
  type_labels: {feat: enhancement, fix: bug, docs: documentation}   # label for issues the skills create; unlisted types (chore, refactor) get none
  milestone: ""               # milestone for created issues, if the repo uses one

commit_trailer: true          # add the Co-Authored-By: Claude trailer to commits (not PRs). false if a deploy host rejects unknown co-authors (Vercel Hobby).
checkpoint_commits: ask       # during /workflow:implement: ask | auto (commit and push after each passing verify, e.g. for branch previews) | never

version_file: package.json    # where the release version lives ("none" if unversioned)
tag:
  enabled: true               # /workflow:release offers a GitHub release + tag after merge
  prefix: v                   # v1.4.0
  prerelease: false           # true marks the GitHub release as a pre-release (beta builds)
---

# Workflow notes

Free-form sections the skills read when present. Delete any that don't apply.

## Plan sections
Extra sections /workflow:implement adds to every plan, after "Files to Modify".
- Database Changes: migrations, RLS, or "None"

## Implementation rules
Project-specific rules to follow while implementing (beyond CLAUDE.md).

## Agents
Project agents (in .claude/agents) to use while implementing, and when.
- supabase: any migration, RLS or edge function change

## Finish steps
Extra steps for /workflow:finish. Markers: (before verify), (in PR checklist),
(after merge), (after cleanup). Add "when <paths> changed" to make a step conditional.
- Regenerate bundled assets when assets/ changed (before verify)
- Deploy changed Supabase edge functions (in PR checklist)

## Release steps
Extra steps for /workflow:release, in order. Markers:
(before merge) or (after merge): when it runs, default before merge.
(confirm): ask before running it. (gate): if it fails, stop the release.
- Bump the version in package.json (before merge) (confirm)
- Verify the production deploy at https://example.com (after merge)

## Docs
Which docs /workflow:finish keeps in sync and /workflow:doc-audit checks.
Mark a doc "(flag only)" to have changes reported to you instead of edited.
- docs/AGENT_GUIDE.md: how-to-find table. Code: src/app
- docs/project-specs/CONVENTIONS.md
- docs/business/ (flag only)
- TODO list: docs/TODO.md
- Skip in audits: docs/archive/, docs/notes/

## Lessons
Where /workflow:finish records durable lessons (incident causes, deploy traps, corrections).
- Platform gotchas: docs/project-specs/platform-gotchas.md

## Meetings
Settings for /workflow:log-meeting.
- Notes folder: docs/meetings/
- Index: docs/meetings/README.md
- Note format: model on the two most recent notes
- Related: link each note to docs/partnerships.md
