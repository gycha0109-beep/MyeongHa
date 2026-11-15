"""Fail closed when a sealed fixture is mounted into the actual GEPA process.

This checks a concrete OS mount boundary, not confidentiality of an arbitrary
unknown real dataset. The optimizer is still synthetic and has no provider IO.
"""
from __future__ import annotations

import os
from pathlib import Path

class OptimizerIsolationDenied(RuntimeError):
    pass


def verify_optimizer_sealed_boundary(host_file, *,
                                      sealed_container_root="/private/sealed",
                                      research_code_root="/opt/myeongha"):
    """Check paths using lstat: even dangling symlinks must be treated as exposure."""
    if not isinstance(host_file, str) or not os.path.isabs(host_file):
        raise OptimizerIsolationDenied("absolute_sealed_source_path_required")
    if (not isinstance(sealed_container_root, str)
            or not os.path.isabs(sealed_container_root)
            or not isinstance(research_code_root, str)
            or not os.path.isabs(research_code_root)):
        raise OptimizerIsolationDenied("expected_container_paths_required")
    if not Path(research_code_root).is_dir():
        raise OptimizerIsolationDenied("research_code_mount_missing")
    if any(os.environ.get(key) for key in (
        "OPENROUTER_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"
    )):
        raise OptimizerIsolationDenied("model_credentials_not_allowed")
    # The real GEPA process sees only the explicit code and synthetic-proof mounts.
    # Check *both* the canonical private mount and the host's concrete sentinel.
    # lexists catches symlinks even if their targets are missing.
    if (os.path.lexists(host_file)
            or os.path.lexists(sealed_container_root)):
        raise OptimizerIsolationDenied("optimizer_can_locate_sealed_source")
    return {
        "schemaVersion": "character-gepa-synthetic-os-mount-boundary-v1",
        "hostSealedFixturePresentInsideOptimizer": False,
        "privateSealedMountPresentInsideOptimizer": False,
        "modelCredentialsPresent": False,
        "realHoldoutIndependenceEstablished": False,
        "externalCallsAuthorized": False,
        "productionEligible": False,
    }
