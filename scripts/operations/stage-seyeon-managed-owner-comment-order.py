#!/usr/bin/env python3
"""Stage six immutable history SQL files with managed-owner COMMENT reordered.

The original SQL under supabase/migrations/ remains byte-for-byte untouched.
Only existing trailing COMMENT ON FUNCTION statements move immediately BEFORE
GRANT OWNER ROLE / ALTER FUNCTION OWNER, so Supabase's non-superuser postgres
can comment while still the function creator. GRANT / REVOKE ROLE membership
statements remain untouched and in their original order.
"""
import argparse
import os
from pathlib import Path
import re
import subprocess
import sys

# Exact immutable Git blob IDs for the six approved historical source files.
APPROVED = {
    "1400_relationship_apply_context_v1.sql": "a5616e211d4d324905a846aa273955b3903fa265",
    "1410_relationship_event_apply_command_v1.sql": "2650e849e0ded188642ccdcd81022b35cb7e2b6e",
    "1420_relationship_reliability_context_v1.sql": "c273a827f3e144f790557dae8d1d31c0846ac202",
    "1430_relationship_adjustment_commands_v1.sql": "c244966b545081f1ddd6b1ef1619f75ac1645d1d",
    "1440_relationship_projection_rebuild_v1.sql": "78d128294f7a04099be514e933e072241cda3fa6",
    "1450_relationship_snapshot_runtime_v1.sql": "2b9fba98ad6d4e72c8bfe37e6b234216de52de2b",
}
MARKER = "revoke myeongha_relationship_apply_owner from current_user;"
COMMENT_TAIL = re.compile(
    r"(?is)^\s*(?:comment\s+on\s+function\s+public\.[a-z_][a-z0-9_]*\s*"
    r"\([^)]*\)\s+is\s+'(?:''|[^'])*';\s*)+$"
)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    source = args.source_dir.resolve(strict=True)
    output = args.output_dir.resolve(strict=True)
    if source == output or source in output.parents:
        raise ValueError("staging directory must not nest within immutable source")
    if any(output.iterdir()):
        raise ValueError("staging directory must start empty")

    for file_name, expected_blob in APPROVED.items():
        file_path = source / file_name
        source_bytes = file_path.read_bytes()
        actual_blob = subprocess.check_output(
            ["git", "hash-object", "--", str(file_path)], text=True
        ).strip()
        if actual_blob != expected_blob:
            raise ValueError(f"HOLD_MANAGED_OWNER_STAGING: unexpected source blob: {file_name}")
        sql = source_bytes.decode("utf-8", errors="strict")
        if sql.count(MARKER) != 1:
            raise ValueError(f"HOLD_MANAGED_OWNER_STAGING: unexpected role grant shape: {file_name}")
        before, trailing_comments = sql.split(MARKER, 1)
        if not COMMENT_TAIL.fullmatch(trailing_comments):
            raise ValueError(f"HOLD_MANAGED_OWNER_STAGING: non-comment SQL after REVOKE: {file_name}")
        grant_marker = "grant myeongha_relationship_apply_owner to current_user;"
        if before.lower().count(grant_marker) != 1:
            raise ValueError(f"HOLD_MANAGED_OWNER_STAGING: unexpected scoped owner grant: {file_name}")
        prefix, owned_operations = before.split(grant_marker, 1)
        # The source's closing REVOKE (and its grant/owner/ACL statements)
        # remain in the ORIGINAL order. Only metadata COMMENT moves to a point
        # where current_user is still creator and owner of the new function.
        patched = (
            prefix.rstrip() + "\\n\\n" + trailing_comments.strip() + "\\n\\n" +
            grant_marker + owned_operations + MARKER + "\\n"
        )
        if patched.count(MARKER) != 1 or patched.count(grant_marker) != 1:
            raise ValueError("staged SQL changed owner membership statement multiplicity")
        target = output / file_name
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as file_out:
            file_out.write(patched.encode("utf-8"))
    print("PASS_MANAGED_OWNER_COMMENT_ORDER: six immutable-source migration SQL staged")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"HOLD_MANAGED_OWNER_COMMENT_ORDER: {exc}", file=sys.stderr)
        sys.exit(1)
