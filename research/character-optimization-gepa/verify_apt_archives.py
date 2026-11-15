"""Verify the exact Debian amd64 Git build-tool archive closure before apt installation.

Only a deterministic 2026-11-04 Debian snapshot is supported. All 31 .deb files
must be present, regular, and match a repository-reviewed SHA-256. No network.
"""
from __future__ import annotations

import hashlib
from pathlib import Path
import re
import sys

EXPECTED_COUNT = 31
VALID_NAME = re.compile(r"^[a-z0-9][a-z0-9.+~-]*_[a-zA-Z0-9.%:+~-]+_(?:amd64|all)\.deb$")
VALID_LINE = re.compile(r"^([0-9a-f]{64})  ([^/\s]+\.deb)$")


class ArchiveMismatch(ValueError):
    pass


def inspect_apt_archive(manifest_text: str, archive_dir: Path) -> dict:
    if not isinstance(manifest_text, str):
        raise ArchiveMismatch("manifest_type")
    lines = manifest_text.splitlines()
    if len(lines) != EXPECTED_COUNT or any(not line or line != line.strip() for line in lines):
        raise ArchiveMismatch("manifest_cardinality")
    expected = {}
    for line in lines:
        entry = VALID_LINE.fullmatch(line)
        if not entry or not VALID_NAME.fullmatch(entry[2]):
            raise ArchiveMismatch("manifest_format")
        digest, name = entry.groups()
        if name in expected:
            raise ArchiveMismatch("manifest_duplicate")
        expected[name] = digest
    if not any(name.startswith("git_1%3a2.47.3-0+deb13u1_amd64.deb") for name in expected):
        raise ArchiveMismatch("missing_pinned_git")
    if not any(name.startswith("git-man_1%3a2.47.3-0+deb13u1_all.deb") for name in expected):
        raise ArchiveMismatch("missing_pinned_git_man")
    folder = Path(archive_dir)
    if not folder.is_dir() or folder.is_symlink():
        raise ArchiveMismatch("archive_dir")
    present = {item.name: item for item in folder.glob("*.deb")}
    if set(present) != set(expected):
        raise ArchiveMismatch("archive_file_set")
    for name, target in present.items():
        if not target.is_file() or target.is_symlink():
            raise ArchiveMismatch("non_regular_archive")
        digest = hashlib.sha256()
        with target.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != expected[name]:
            raise ArchiveMismatch("deb_sha256_mismatch")
    return {"platform": "linux/amd64", "aptArchivesVerified": len(expected)}


def main() -> int:
    if len(sys.argv) != 3:
        print("GEPA_APT_ARCHIVES_REFUSED", file=sys.stderr)
        return 2
    try:
        manifest = Path(sys.argv[1]).read_text(encoding="utf-8")
        inspected = inspect_apt_archive(manifest, Path(sys.argv[2]))
    except (ArchiveMismatch, OSError, UnicodeError):
        print("GEPA_APT_ARCHIVES_REFUSED", file=sys.stderr)
        return 2
    print("GEPA_APT_SHA256_PASS", inspected["aptArchivesVerified"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
