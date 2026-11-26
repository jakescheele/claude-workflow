#!/usr/bin/env python3
"""PreToolUse(Bash) guard: ask before a git commit or push lands on a protected branch.

Protected branches come from `protected_branches` in <repo>/.claude/workflow.md,
default [main, dev]. Returns permissionDecision "ask", so the user can still
approve a deliberate exception. Fails open: any unexpected condition allows the
command, so the guard never blocks unrelated work.
"""
import json
import os
import re
import shlex
import subprocess
import sys

DEFAULT_PROTECTED = ["main", "dev"]


def git(cwd, *args):
    r = subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True, timeout=5)
    return r.returncode, r.stdout.strip()


def protected_branches(toplevel):
    path = os.path.join(toplevel, ".claude", "workflow.md")
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return DEFAULT_PROTECTED
    m = re.search(r"^protected_branches:\s*\[([^\]]*)\]", text, re.M)
    if not m:
        return DEFAULT_PROTECTED
    names = [n.strip().strip("\"'") for n in m.group(1).split(",")]
    return [n for n in names if n] or DEFAULT_PROTECTED


def segments(command):
    """Split a shell command on && || ; | into simple segments."""
    return [s.strip() for s in re.split(r"&&|\|\||;|\|", command) if s.strip()]


def check(command, cwd):
    """Return a reason string if the command needs confirmation, else None."""
    workdir = cwd
    for seg in segments(command):
        try:
            words = shlex.split(seg)
        except ValueError:
            continue
        if not words:
            continue
        if words[0] == "cd" and len(words) > 1:
            workdir = os.path.join(workdir, os.path.expanduser(words[1]))
            continue
        if words[0] != "git":
            continue
        # Resolve `git -C <dir>` and find the subcommand.
        i, gitdir = 1, workdir
        while i < len(words) and words[i].startswith("-"):
            if words[i] == "-C" and i + 1 < len(words):
                gitdir = os.path.join(workdir, os.path.expanduser(words[i + 1]))
                i += 2
            elif words[i] in ("-c",) and i + 1 < len(words):
                i += 2
            else:
                i += 1
        if i >= len(words) or words[i] not in ("commit", "push"):
            continue
        sub, rest = words[i], words[i + 1:]

        rc, toplevel = git(gitdir, "rev-parse", "--show-toplevel")
        if rc != 0:
            continue
        protected = protected_branches(toplevel)
        _, current = git(gitdir, "branch", "--show-current")

        if sub == "commit":
            has_commits = git(gitdir, "rev-parse", "--verify", "-q", "HEAD")[0] == 0
            if current in protected and has_commits:
                return f"This commits directly to protected branch `{current}`. Use a feature branch in a worktree instead."
        else:
            args = [a for a in rest if not a.startswith("-")]
            refspecs = args[1:]  # args[0] is the remote
            targets = []
            for ref in refspecs:
                dest = ref.split(":", 1)[-1].lstrip("+")
                dest = dest.removeprefix("refs/heads/")
                targets.append(current if dest == "HEAD" else dest)
            if not refspecs:
                targets.append(current)
            hit = [t for t in targets if t in protected]
            if hit:
                return f"This pushes to protected branch `{hit[0]}`. Changes should reach it through a pull request."
    return None


def main():
    try:
        data = json.load(sys.stdin)
        command = data.get("tool_input", {}).get("command", "")
        if "git" not in command or not re.search(r"\b(commit|push)\b", command):
            return
        reason = check(command, data.get("cwd") or os.getcwd())
    except Exception:
        return  # fail open
    if reason:
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "ask",
                "permissionDecisionReason": reason,
            }
        }))


if __name__ == "__main__":
    main()
