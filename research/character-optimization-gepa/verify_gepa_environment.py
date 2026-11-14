"""Fail-closed runtime identity check for the pinned, offline GEPA research image.

A VCS commit and fixed Python image do NOT guarantee a complete transitive
build dependency lock. Never treat this check as live-model authorization.
"""
from __future__ import annotations

import importlib.metadata as metadata
import json
from pathlib import Path
import sys

EXPECTED_PYTHON = (3, 14, 10)
EXPECTED_SOURCE = "ce5b0d6e3d6af6c6dbec6de2c54536bbb961d309"
EXPECTED_URL = "https://github.com/gepa-ai/gepa.git"
EXPECTED_REQUIREMENT = f"gepa @ git+{EXPECTED_URL}@{EXPECTED_SOURCE}"


class EnvironmentMismatch(ValueError):
    pass


def verify_runtime_identity(*, python_version=None, distribution=None,
                            lock_contents=None):
    version = tuple(sys.version_info[:3] if python_version is None else python_version)
    if version != EXPECTED_PYTHON:
        raise EnvironmentMismatch("python_image_version")
    if lock_contents is None:
        lock_contents = (Path(__file__).parent / "requirements.lock").read_text(
            encoding="utf-8")
    active = [line.strip() for line in lock_contents.splitlines()
              if line.strip() and not line.lstrip().startswith("#")]
    if active != [EXPECTED_REQUIREMENT]:
        raise EnvironmentMismatch("unexpected_requirement")
    try:
        dist = distribution if distribution is not None else metadata.distribution("gepa")
        if str(dist.metadata["Name"]).lower() != "gepa":
            raise EnvironmentMismatch("package_identity")
        source = json.loads(dist.read_text("direct_url.json") or "{}")
        info = source.get("vcs_info")
        if (source.get("url", "").rstrip("/") != EXPECTED_URL
                or not isinstance(info, dict)
                or info.get("vcs") != "git"
                or info.get("commit_id") != EXPECTED_SOURCE
                or info.get("requested_revision") != EXPECTED_SOURCE):
            raise EnvironmentMismatch("gepa_commit_identity")
    except (LookupError, KeyError, TypeError, ValueError) as e:
        if isinstance(e, EnvironmentMismatch):
            raise
        raise EnvironmentMismatch("gepa_metadata") from None
    return {"pythonVersion": ".".join(map(str, version)),
            "gepaSourceCommit": EXPECTED_SOURCE,
            "externalCallsAuthorized": False,
            "productionEligible": False,
            "transitiveDependenciesFullyLocked": False}


if __name__ == "__main__":
    try:
        result = verify_runtime_identity()
    except (EnvironmentMismatch, OSError):
        print("GEPA_PINNED_RUNTIME_REFUSED", file=sys.stderr)
        raise SystemExit(2) from None
    print(json.dumps(result, sort_keys=True))
