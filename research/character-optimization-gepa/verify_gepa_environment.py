"""Fail-closed GEPA research image identity and hashed build-wheel receipt.

The official VCS revision and all PEP 517 build wheels are pinned. The OS
apt archive, Python base image package closure, and future real-model transport
remain separate unproven boundaries.
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
# Official GEPA pyproject at the pinned commit requires setuptools>=77.0.1, wheel, build.
# packaging and pyproject_hooks are the full build==1.3.0 dependency closure on Python 3.14.
EXPECTED_BUILD_PACKAGES = (
    ("build", "1.3.0", "7145f0b5061ba90a1500d60bd1b13ca0a8a4cebdd0cc16ed8adf1c0e739f43b4"),
    ("packaging", "25.0", "29572ef2b1f17581046b3a2227d5c611fb25ec70ca1ba8554b24b0e69331a484"),
    ("pyproject_hooks", "1.2.0", "9e5c6bfa8dcc30091c74b0cf803c81fdd29d94f01992a7707bc97babb1141913"),
    ("setuptools", "80.9.0", "062d34222ad13e0cc312a4c02d73f059e86a4acbfbdea8f8f76b28c99f306922"),
    ("wheel", "0.45.1", "708e7481cc80179af0e556bbf0cc00b8444c7321e2700b8d8580231d13017248"),
)


class EnvironmentMismatch(ValueError):
    pass


def _active(contents):
    return [line.strip() for line in contents.splitlines()
            if line.strip() and not line.lstrip().startswith("#")]


def verify_runtime_identity(*, python_version=None, distribution=None,
                            lock_contents=None, build_lock_contents=None,
                            build_dist_versions=None):
    version = tuple(sys.version_info[:3] if python_version is None else python_version)
    if version != EXPECTED_PYTHON:
        raise EnvironmentMismatch("python_image_version")
    if lock_contents is None:
        lock_contents = (Path(__file__).parent / "requirements.lock").read_text(
            encoding="utf-8")
    if _active(lock_contents) != [EXPECTED_REQUIREMENT]:
        raise EnvironmentMismatch("unexpected_requirement")
    if build_lock_contents is None:
        build_lock_contents = (Path(__file__).parent / "build-requirements-hashed.lock").read_text(
            encoding="utf-8")
    expected_build = [f"{name}=={version} --hash=sha256:{sha}"
                      for name, version, sha in EXPECTED_BUILD_PACKAGES]
    if _active(build_lock_contents) != expected_build:
        raise EnvironmentMismatch("unexpected_build_wheel_hash_lock")
    try:
        actual_versions = (build_dist_versions if build_dist_versions is not None else
                           {name: metadata.version(name) for name, _, _ in EXPECTED_BUILD_PACKAGES})
        if not isinstance(actual_versions, dict) or actual_versions.keys() != {
                name for name, _, _ in EXPECTED_BUILD_PACKAGES} or any(
                    actual_versions[name] != version for name, version, _ in EXPECTED_BUILD_PACKAGES):
            raise EnvironmentMismatch("build_dependency_version")
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
    except (metadata.PackageNotFoundError, LookupError, KeyError, TypeError, ValueError) as e:
        if isinstance(e, EnvironmentMismatch):
            raise
        raise EnvironmentMismatch("gepa_metadata_or_build_dependencies") from None
    return {"pythonVersion": ".".join(map(str, version)),
            "gepaSourceCommit": EXPECTED_SOURCE,
            "buildBackendWheelLockMatchesExpected": True,
            "buildBackendVersionsMatchExpected": True,
            "buildIsolationRuntimeAttested": False,
            "buildDependenciesVerified": len(EXPECTED_BUILD_PACKAGES),
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
