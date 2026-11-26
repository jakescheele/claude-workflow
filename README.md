# claude-workflow

A Claude Code plugin for a worktree-based feature workflow. One generic set of skills, set up
per repo by a small `.claude/workflow.md` file.

| Command | What it does |
|---|---|
| `/workflow:setup` | Writes this repo's `.claude/workflow.md` from what the repo already says about itself |
| `/workflow:implement <description or #issue>` | Links an issue, creates a worktree branch, plans with you, implements after approval |
| `/workflow:commit` | Verified checkpoint commit and push on the current feature branch |
| `/workflow:finish` | Lessons sweep, verify, review, sync with base, PR, merge after confirmation, cleanup after confirmation |
| `/workflow:release` | Changelog, PR from the base branch into the release branch, merge, close shipped issues, tag |
| `/workflow:doc-audit` | Compares docs to code and walks you through each conflict |
| `/workflow:log-meeting <fathom link>` | Turns a Fathom recording into a meeting note with personal details removed, then files the issues you approve |

The plugin also ships a **protected-branch guard**: before any `git commit` or `git push` that
would land on a protected branch, Claude Code asks you first. It runs with whichever of `python3`, `python` or `py`
works (so it also works on Windows), and if none does it stays out of the way.

## Install

```
/plugin marketplace add jakescheele/claude-workflow
/plugin install workflow@claude-workflow
```

Or let a repo recommend it: `/workflow:setup` offers to add the plugin to the repo's
`.claude/settings.json`, and Claude Code then offers it to everyone who opens that repo.

## Per-repo settings

Each repo has `.claude/workflow.md`: YAML settings (base and release branches, branch naming,
verify commands, review, merge style, issue labels) plus free-form sections (extra plan
sections, release steps, docs to keep in sync, where lessons go, meeting notes folder). See
[`plugins/workflow/templates/workflow.md`](plugins/workflow/templates/workflow.md) for every
key and its default.

## Rules the skills follow
- The main checkout stays on the base branch. Every feature branch gets its own worktree.
- Nothing is committed to a protected branch. Work lands through pull requests.
- Hooks are never skipped (`--no-verify`).
- Merging, tagging, closing issues and deleting worktrees or branches each need your confirmation.
- Dev servers are never started by Claude; the command is printed for you.

## Changing the plugin
Claude Code runs an installed copy from `~/.claude/plugins/cache/`, not a git checkout.
1. Change the skill on a feature branch, bump `version` in
   `plugins/workflow/.claude-plugin/plugin.json`, and merge it into `main` through a pull request.
2. On each machine, pick up the new version:
   ```
   claude plugin marketplace update claude-workflow
   claude plugin update workflow@claude-workflow
   ```
3. Start a new session (a running session keeps the skill text it already loaded).

To try a change before merging, point a session at the checkout with
`claude --plugin-dir ./plugins/workflow`.

## License
MIT
