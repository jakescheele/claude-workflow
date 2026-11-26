#!/bin/sh
# Runs guard-protected-branch.py with whichever Python works here.
# Windows often has no python3, or only the Microsoft Store stub, so try
# python3, then python, then the py launcher, checking each one really runs.
# If none works, exit 0 with no output: the guard fails open and never blocks.
script="${0%/*}/guard-protected-branch.py"
for py in python3 python py; do
  if command -v "$py" >/dev/null 2>&1 && "$py" -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" >/dev/null 2>&1; then
    exec "$py" "$script"
  fi
done
exit 0
