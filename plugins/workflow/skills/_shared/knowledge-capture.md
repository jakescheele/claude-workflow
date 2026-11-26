# Knowledge capture: the lessons sweep

Shared reference for `workflow` skills. Not an invocable skill (there is no `SKILL.md` here). `/workflow:finish` runs it after docs sync and before the commit.

Claude's auto-memory (`~/.claude/projects/<repo>/memory/`) lives on one machine and never reaches git, so a lesson saved only there is invisible to collaborators, other machines, and future clones. The sweep moves durable, project-relevant knowledge into the repo, on the current branch, so it ships with the PR.

## Inputs

From `<repo root>/.claude/workflow.md`:
- `## Lessons`: destinations for lessons, as `- <kind of lesson>: <path>` lines (for example `- Platform gotchas: docs/project-specs/platform-gotchas.md`).
- `## Docs`: docs the project keeps in sync. A lesson that fits one of these goes there.

Read each listed file before writing to it, and follow its existing format and any entry template it defines.

## The sweep

Run it over everything that happened in the session: the diff, debugging, failed attempts, conflict resolution during the sync merge, review findings, user corrections, and anything you were about to save to auto-memory.

1. **List candidate lessons.** A lesson qualifies only when it is all three:
   - **Durable.** Still true next month; not a status update about this branch.
   - **Not derivable from the code.** A future agent reading the code would not work it out quickly: a root cause that took a long investigation, an easy-to-miss config or deploy step, a third-party quirk, a recipe that worked after failed attempts, a correction the user had to make.
   - **Relevant to anyone on the repo.** Not a personal preference.
2. **Route each one** using the table below. Search first and extend an existing entry rather than adding a near-duplicate:
   ```bash
   grep -rn "<keyword>" <the Lessons and Docs paths> CLAUDE.md
   ```
3. **Write it on this branch**, in the target file's format. Include the concrete error text or symptom, since that is what the next person will search for. Add a date when the file's entries carry one.
4. **Report it** in the skill's summary ("Added lesson to `<path>`: <one line>") so the user can veto it before the PR merges.

If nothing qualifies, say so in one line and move on. Do not pad the docs.

## Where each lesson goes

| Lesson | Destination |
|--------|-------------|
| Matches a kind named under `## Lessons` | that file |
| Fits the subject of a file under `## Docs` (a convention, a spec, an agent guide's common mistakes) | that file |
| Non-negotiable rule every session must see up front | `CLAUDE.md`, kept to one line that links to the detailed doc |
| Change to the branch, PR, issue, or release process | tell the user: it belongs in `.claude/workflow.md` or the `workflow` plugin, not in a project doc |
| Product or business decision | flag it to the user; do not edit business or product docs |
| Open problem nobody has fixed yet | propose a GitHub issue and ask before creating it; add a lesson entry too if others will trip on it |
| No destination fits | ask the user where it belongs; suggest adding a line under `## Lessons`. Do not create a new doc file without a yes |

## What stays in personal auto-memory

Only things specific to one person or one machine:
- How this user likes to work (formatting, when to ask first, preferred dev setup or preview device).
- Account ownership and personal logins.
- Pointers such as "lesson X now lives in `<path>`".

Never put secrets (API keys, tokens, service-role keys, passwords) in either place.

If the session is not on a branch that will be PR'd, do not leave a team-relevant lesson memory-only: tell the user it needs a home and suggest a `docs/` branch for it.
