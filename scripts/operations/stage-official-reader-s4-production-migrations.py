#!/usr/bin/env python3
"""Stage only the exact dormant Official Reader 1740..2300 migration sequence.

Produces a transaction-ready ordered file list and faithful SQL history
statements. Does not connect to a database or execute migrations.
"""
import argparse
import hashlib
import json
import os
import pathlib
import re

VERSION_FIRST = 1740
VERSION_LAST = 2300
VERSIONS = tuple(range(VERSION_FIRST, VERSION_LAST + 1, 10))
EXPECTED_COUNT = 57


def stage(source_dir: pathlib.Path, output_dir: pathlib.Path) -> None:
    if not source_dir.is_dir():
        raise ValueError("Approved source directory is unavailable")
    if output_dir.exists():
        raise ValueError("Refusing to overwrite existing staging output")
    files = []
    for version in VERSIONS:
        candidates = sorted(source_dir.glob(f"{version}_*.sql"))
        if len(candidates) != 1:
            raise ValueError(f"Missing or ambiguous approved Reader migration {version}")
        path = candidates[0]
        if path.is_symlink() or not path.is_file():
            raise ValueError("Source migrations must be regular files")
        if not re.fullmatch(r"[a-z0-9_]+", path.stem):
            raise ValueError("Unsafe migration file name")
        if version != 1740 and "official_reader" not in path.name and "portone_verified_official_reader" not in path.name:
            raise ValueError("Unrelated migration is included in Reader scope")
        data = path.read_bytes()
        sql = data.decode("utf-8")
        if not sql.strip() or "\x00" in sql:
            raise ValueError("Empty or binary migration")
        # No script may terminate the one PostgreSQL transaction or write
        # the provenance ledger independently of a successful DDL application.
        if re.search(r"(?im)^\s*(?:begin|start\s+transaction|commit|rollback)\s*;",sql):
            raise ValueError("Migration contains a transaction control statement")
        if re.search(r"(?i)\bsupabase_migrations\s*\.\s*schema_migrations\b",sql):
            raise ValueError("Migration modifies the history ledger")
        files.append((version, path, sql, hashlib.sha256(data).hexdigest()))
    if len(files) != EXPECTED_COUNT:
        raise ValueError("Reader migration frontier is inconsistent")

    output_dir.mkdir(mode=0o700,parents=False)
    os.chmod(output_dir,0o700)
    history = []
    for version, path, sql, digest in files:
        tag = f"$mh_reader_{digest[:20]}$"
        if tag in sql:
            raise ValueError("Unsafe SQL history delimiter collision")
        name = path.stem.split("_",1)[1]
        history.append(
            "insert into supabase_migrations.schema_migrations "
            "(version,name,statements) values "
            f"('{version}','{name}',array[{tag}{sql}{tag}]::text[]);\n"
        )
    records = {
        "contract": "myeongha-reader-s4-scoped-forward-migrations-v1",
        "first": VERSION_FIRST,
        "last": VERSION_LAST,
        "count": EXPECTED_COUNT,
        "files": [{
            "version": version,
            "name": path.name,
            "sha256": digest,
        } for version, path, _sql, digest in files],
    }
    # No copied SQL goes into GitHub Actions artifacts. This manifests only
    # source code hashes; full SQL exists solely inside the temporary, private
    # staging directory and the authorized production schema history.
    for name, content in (
        ("history.sql", "".join(history)),
        ("manifest.json", json.dumps(records,indent=2,ensure_ascii=True)+"\n"),
        ("ordered-files.txt", "\n".join(str(path) for _,path,_,_ in files)+"\n"),
    ):
        f = output_dir / name
        f.write_text(content,encoding="utf-8")
        f.chmod(0o600)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=pathlib.Path,required=True)
    parser.add_argument("--output-dir", type=pathlib.Path,required=True)
    args = parser.parse_args()
    stage(args.source_dir,args.output_dir)
