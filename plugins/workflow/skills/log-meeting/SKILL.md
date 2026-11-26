---
name: log-meeting
description: Turn a Fathom recording (public share link) into a PII-scrubbed meeting note in this repo's meetings folder, add it to the meetings index, and file the GitHub issues the user approves from the discussion. Use when the user shares a fathom.video link or asks to log, write up or summarize a meeting.
argument-hint: <fathom share link or token>
---

# /workflow:log-meeting: Fathom recording to meeting note + issues

Pulls the transcript from a public Fathom share link (no API key, works on the free plan), drafts a structured note following the repo's meeting convention, proposes issues, files only the ones the user picks, and links them back into the note and index.

Human in the loop: **the user approves the issue list before anything is filed**, and **nothing is committed**.

## 0. Load settings

1. Find the repo root: `git rev-parse --show-toplevel`. Run everything from there.
2. Read `<root>/.claude/workflow.md` and its `## Meetings` section. Expected lines:
   - `Notes folder:` where notes go (for example `docs/meetings/`)
   - `Index:` the index file with a table of meetings (optional)
   - `Note format:` a file describing the convention, or extra instructions (optional)
   - `Related:` docs a note should link to, such as a partner tracker (optional)
3. If workflow.md is missing, mention `/workflow:setup` but carry on. If `## Meetings` is missing (or has no notes folder), look for an obvious existing folder (`docs/meetings/`, `meetings/`, `notes/meetings/`) and ask the user with `AskUserQuestion` to confirm it or name another. At the end, offer to add a `## Meetings` section to workflow.md with what was used (ask first, it is a config change).
4. Read the index file (if any) and any README in the notes folder for the convention. Open the two most recent notes in the folder as models (one rich, one lean if they differ). If the folder is empty and no format is given, use the default structure in step 2.

## Argument

`$ARGUMENTS` is the Fathom share link (`https://fathom.video/share/<token>`) or a bare token. If missing, ask for it.

## 1. Fetch the transcript

```bash
node "${CLAUDE_SKILL_DIR}/fetch-fathom.mjs" "<share-link-or-token>"
```

Output sections: `MEETING TITLE`, `DATE HINT` (ISO date or `unknown`), `RECORDING URL`, `TRANSCRIPT` (speakers plus `@M:SS` markers), `ACTION ITEMS (Fathom)` (often `none available`; derive them from the transcript). On error (bad token, not shared), show the message and stop.

## 2. Draft the note

- **Filename:** `<notes folder>/YYYY-MM-DD-<slug>.md` unless the convention says otherwise. Date from `DATE HINT`, else the transcript heading, else today. Slug is kebab-case from the counterpart or topic.
- **Existing file:** if that path exists, ask before overwriting; it may be hand-edited.
- **Structure:** follow the convention and models. Default when none exists: `# Title`; a metadata block (Date, Counterpart, Recording = share URL, plus any `Related:` links); then **Purpose**, **Attendees**, **Key takeaways**, **Decisions**, **Action items** (grouped by owner, `- [ ]` checkboxes) and **Related**. Match depth to the meeting: a short check-in gets a lean note.
- **Link style:** reuse whatever the existing notes use (`[[wikilinks]]` or relative Markdown links).
- **Deep links:** cite specific moments as `[M:SS](<recording-url>?timestamp=<seconds>)`, converting `@M:SS` to seconds (`@13:07` becomes `787`).
- **Writing style:** this note is documentation; follow CLAUDE.md's rules for docs.

> **PII scrubbing is mandatory, whatever the convention says.** The raw transcript has
> emails in speaker labels (like `Name (someone@example.com)`) and may contain phone
> numbers, addresses or personal social handles. In the note, refer to people by
> **name and role only**. Never write an email, phone number, street address or
> personal handle into the note or into an issue body. Re-read the finished note and
> issue drafts for these before writing them.

## 3. Propose issues, then let the user pick

Skip this step if `issues.enabled` is false in workflow.md (list ideas in the note instead).

1. Discover labels so suggestions are valid: `gh label list --limit 100`. Use existing labels only; never create labels here. Prefer the labels in `issues.type_labels`, and add `--milestone "<issues.milestone>"` when one is set.
2. From the discussion, pick concrete product or engineering ideas worth tracking. Be selective: some ideas are better left as notes.
3. For each candidate, search for an existing open issue it merely refines:
   `gh issue list --state open --search "<key terms>" --json number,title --limit 10`.
   A refinement becomes "comment on #N" or just a link in the note, not a new issue.
4. Show a table: title, one-line scope, suggested labels, duplicate/related issue if any. Say which you recommend against filing and why.
5. Ask with `AskUserQuestion` (multiSelect) which to file. If there are more than 4 candidates, split across several multiSelect questions. File nothing that was not selected.

## 4. Create the approved issues

For each approved idea:

```bash
gh issue create --title "<title>" --label "<label>" --body "$(cat <<'EOF'
## Context
From the <counterpart/topic> meeting (<YYYY-MM-DD>). <why it came up>

## What to build
- ...

## Source
Recording @ M:SS: <recording-url>?timestamp=<seconds>
EOF
)"
```

Capture each returned issue URL. If an idea refines an existing issue and the user chose to comment there, use `gh issue comment <N>` with the same Source line (this posts publicly to the repo, so it needs the user's selection like any new issue).

If `gh` is unavailable (for example a web session), use the GitHub MCP tools instead (`mcp__github__list_issues`, `mcp__github__issue_write`, `mcp__github__add_issue_comment`), loading them with ToolSearch first.

## 5. Wire it up

- Put the real issue links into the note's action items, and add a **Product ideas surfaced** table mapping each idea to its issue, an existing issue it refines, or "not filed".
- Build issue URLs from `gh repo view --json url -q .url`, never a hard-coded owner/repo.
- Add a row to the index table (if there is an index), matching its columns and sort order.
- Mention any `Related:` tracker in the note, but edit that tracker only if the user asks.

## 6. Stop, do not commit

Leave the note and index edit in the working tree. Report: the note path, issues created (numbers and URLs), comments added, and ideas intentionally left unfiled. Committing goes through the user's normal branch and PR flow.

## Notes

- The helper relies only on the public share page. If Fathom changes its markup, the `call_id` and token parsing in `fetch-fathom.mjs` is where to look.
- The transcript stays in Fathom; never paste it raw into the repo.
