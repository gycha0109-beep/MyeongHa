#!/usr/bin/env python3
"""One-off repository-wide literal terminology replacement.

Replace every occurrence of the exact UTF-8 string 대리자 with 연결자
in tracked text files, and in tracked paths. Exclude binary payloads.
"""
from __future__ import annotations

import os
import subprocess
from pathlib import Path

OLD = "대리자"
NEW = "연결자"
old_bytes = OLD.encode("utf-8")
new_bytes = NEW.encode("utf-8")

tracked = subprocess.check_output(["git", "ls-files", "-z"]).split(b"\0")
paths = [os.fsdecode(p) for p in tracked if p]
matched_files = 0
occurrences = 0
renamed_files = 0
skipped_binary = []

# Prepare renames in advance, fail closed on path collision.
moves = [(p, p.replace(OLD, NEW)) for p in paths if OLD in p]
destinations = [d for _, d in moves]
if len(destinations) != len(set(destinations)):
    raise SystemExit("Conflicting renamed paths")
for src, dst in moves:
    if dst in paths and dst != src and dst not in [s for s, _ in moves]:
        raise SystemExit(f"Rename collision: {dst}")

for name in paths:
    path = Path(name)
    if not path.is_file() or path.is_symlink():
        continue
    data = path.read_bytes()
    if old_bytes not in data:
        continue
    if b"\0" in data or data.startswith((b"\xff\xfe", b"\xfe\xff")):
        skipped_binary.append(name)
        continue
    try:
        data.decode("utf-8")
    except UnicodeDecodeError:
        skipped_binary.append(name)
        continue
    occurrences += data.count(old_bytes)
    path.write_bytes(data.replace(old_bytes, new_bytes))
    matched_files += 1

for src, dst in moves:
    p, q = Path(src), Path(dst)
    if p.exists():
        q.parent.mkdir(parents=True, exist_ok=True)
        p.rename(q)
        renamed_files += 1

print(f"replaced_occurrences={occurrences}; modified_text_files={matched_files}; renamed_paths={renamed_files}")
print(f"skipped_binary_files={skipped_binary}")
if skipped_binary:
    raise SystemExit("Cannot claim exhaustive replacement: binary matches exist")
if occurrences == 0 and renamed_files == 0:
    raise SystemExit("No matches found; verify base branch and encoding")

# Ensure no tracked text, including renamed paths, retains the exact old token.
residual = []
for old_path in paths:
    new_path = Path(old_path.replace(OLD, NEW))
    if not new_path.is_file() or new_path.is_symlink():
        continue
    data = new_path.read_bytes()
    if old_bytes in data:
        residual.append(str(new_path))
if residual:
    raise SystemExit(f"Residual matches: {residual}")
