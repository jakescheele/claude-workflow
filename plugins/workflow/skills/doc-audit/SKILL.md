---
name: doc-audit
description: Audit this repo's docs (the files listed under "## Docs" in .claude/workflow.md, plus CLAUDE.md) against the actual code with parallel read-only agents, report conflicts, undocumented code, unimplemented specs and stale claims, then walk the user through resolving each item. Use when the user asks to audit, check or sync docs against the codebase, or suspects doc drift.
---

# /workflow:doc-audit: docs vs code

Finds drift between what the docs claim and what the code does. Read-heavy, spawns parallel agents, and never edits source code. Doc edits happen only in Phase 4, item by item, after the user chooses them.

## Phase 0: Load settings

1. Find the repo root: `git rev-parse --show-toplevel`. Run everything from there.
2. Read `<root>/.claude/workflow.md`. If it is missing, tell the user to run `/workflow:setup` first and stop.
3. From its frontmatter, note `issues.enabled` (default true). From its body, read the `## Docs` section if present.
4. Read `<root>/CLAUDE.md` (and any nested CLAUDE.md files it points to). Collect:
   - hard rules ("never", "always", "must") that can be checked in code,
   - paths, file-structure claims, tokens, commands and accessors it names,
   - any docs it says are out of scope (business, notes, archive, research folders). Those are never audited.

## Phase 1: Decide the scope

**If `## Docs` exists:** the audit set is every doc listed there, plus CLAUDE.md. A line may point at a folder (audit every file in it) or carry a note after a colon (for example `docs/AGENT_GUIDE.md: how-to-find table`); treat the note as the part of that doc to check. Special lines: `Code: <paths>` after a doc names the code it describes (compare against those paths); `(flag only)` docs are audited but resolutions for them are reported to the user, never edited; `TODO list: <path>` is the TODO doc for the "Add a TODO" option; `Skip in audits: <paths>` are never audited. Group the docs into 2 or 3 audit areas by theme (data/schema/auth, structure/routes/APIs, UI/conventions/status are typical splits) and state the grouping in one short list before launching. No confirmation needed.

**If `## Docs` is absent:** discover candidates:
- `README.md`, `CLAUDE.md`, and everything under `docs/` (list with `git ls-files 'docs/**' '*.md'`, skipping `node_modules`, vendored and generated folders),
- skip folders whose names suggest intent rather than code state (`business`, `notes`, `archive`, `research`, `meetings`, `99-*`).

Then propose exactly 3 audit areas, each with its doc list and the code paths it will compare against, and ask the user with `AskUserQuestion` to accept, edit or drop areas. After the audit, offer to write the accepted doc list into a `## Docs` section of `.claude/workflow.md` so next time skips this step (ask first; it is a config change).

## Phase 2: Parallel audit

Launch one `Explore` agent per area, all in a single message so they run concurrently (thoroughness "medium"). Give each agent a self-contained brief:

- the exact doc paths for its area and the code paths to compare them with,
- the relevant CLAUDE.md hard rules,
- the four categories below, with the instruction to return findings as `category | doc file:line | code file:line | one-line description`,
- "report patterns, not one-offs": a convention broken in one file is a code-review item; broken consistently across files means the doc has drifted,
- "read only: do not edit anything".

What each agent checks, as it applies to its docs:
- **Named things exist:** files, directories, routes, tables, columns, endpoints, functions, env vars, scripts, design tokens, CSS classes. Check both directions (in doc but not code, in code but not doc).
- **Described behavior matches:** data flows, auth/onboarding steps, request/response shapes, navigation wiring, deploy steps.
- **Indexes and maps:** "how to find X" tables, code maps, file-structure trees. Flag rows pointing at moved or deleted files and important files missing from the map.
- **Status docs:** TODOs, known issues, "current status" and gotcha/workaround entries that the code has since resolved or removed.
- **CLAUDE.md hard rules:** consistent violations in code are conflicts (the rule or the code is wrong).

## Phase 3: Report

Merge the agents' findings, drop duplicates, and verify any finding that looks surprising with a quick read before reporting it. Group related items ("6 ERD tables have outdated column lists" is one entry, not six). Give `file:line` references.

1. **Conflicts** (doc says X, code says Y). Highest priority: one of them is wrong.
2. **Undocumented** (in code, not in docs). Should be added to the relevant doc or map.
3. **Unimplemented** (in docs, not in code). Often planned work; listed, not treated as errors.
4. **Stale** (doc describes something that was true once: resolved TODOs, fixed known issues, removed workarounds, outdated status claims).

If nothing is wrong, say so plainly: a clean audit is a result worth stating.

## Phase 4: Resolution

Walk the items in order: Conflicts, then Undocumented, then Stale. For each, ask with `AskUserQuestion`:

- **Update doc**: edit the doc to match the code (show the intended change in the question when it is not obvious).
- **Open an issue** (only if `issues.enabled`): for when the code is what's wrong. Run `gh label list --limit 100` once first and pick existing labels only; search `gh issue list --state open --search "<terms>"` to avoid duplicates. Show title and labels in the question before creating.
- **Add a TODO**: note it in the repo's TODO doc if one exists (otherwise this option is omitted).
- **Ignore**: a known, intentional gap.

To avoid question fatigue, after the first answer in a category ask once: "Apply the same choice to all remaining items in this category?" Apply doc edits as they are chosen.

Do not ask about **Unimplemented** items; list them at the end as a reminder.

Finish with a summary: docs edited (paths), issues opened (numbers), items ignored, and the unimplemented list. Nothing is committed; the edits are left in the working tree for the user's normal branch and PR flow.

## Rules

- Never modify source code. If a resolution needs a code change, it becomes an issue or a TODO.
- Never audit the out-of-scope folders found in Phase 0 or 1, even if an agent wanders into them.
- Never delete a doc or a doc section without an explicit yes for that specific deletion; prefer updating or marking it stale.
- Keep the report concise; the user reads it before answering a run of questions.
