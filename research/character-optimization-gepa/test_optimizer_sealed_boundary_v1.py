"""Synthetic OS-path denial unit tests; never read real/private holdout data."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from optimizer_sealed_boundary_v1 import (
    OptimizerIsolationDenied, verify_optimizer_sealed_boundary,
)


class OptimizerSealedBoundaryTests(unittest.TestCase):
    def test_host_sentinel_absent_inside_optimizer_passes_without_granting_authority(self):
        with tempfile.TemporaryDirectory() as root:
            code = Path(root) / "code"
            code.mkdir()
            result = verify_optimizer_sealed_boundary(
                str(Path(root) / "unmounted" / "synthetic-secret.json"),
                research_code_root=str(code),
                sealed_container_root=str(Path(root) / "private-sealed"),
            )
            self.assertFalse(result["hostSealedFixturePresentInsideOptimizer"])
            self.assertFalse(result["privateSealedMountPresentInsideOptimizer"])
            self.assertFalse(result["realHoldoutIndependenceEstablished"])
            self.assertFalse(result["externalCallsAuthorized"])

    def test_host_sentinel_is_rejected_if_mounted_or_readable(self):
        with tempfile.TemporaryDirectory() as root:
            code = Path(root) / "code"
            code.mkdir()
            sentinel = Path(root) / "synthetic-secret.json"
            sentinel.write_text("static synthetic marker", encoding="utf-8")
            with self.assertRaisesRegex(OptimizerIsolationDenied, "optimizer_can_locate"):
                verify_optimizer_sealed_boundary(
                    str(sentinel), research_code_root=str(code),
                    sealed_container_root=str(Path(root) / "private-sealed"),
                )

    def test_mount_directory_is_rejected_even_with_missing_host_path(self):
        with tempfile.TemporaryDirectory() as root:
            code = Path(root) / "code"
            code.mkdir()
            sealed = Path(root) / "private-sealed"
            sealed.mkdir()
            with self.assertRaisesRegex(OptimizerIsolationDenied, "optimizer_can_locate"):
                verify_optimizer_sealed_boundary(
                    str(Path(root) / "absent.json"), research_code_root=str(code),
                    sealed_container_root=str(sealed),
                )

    def test_dangling_symlink_counts_as_exposure(self):
        with tempfile.TemporaryDirectory() as root:
            code = Path(root) / "code"
            code.mkdir()
            link = Path(root) / "sentinel.json"
            link.symlink_to(Path(root) / "missing-original.json")
            with self.assertRaisesRegex(OptimizerIsolationDenied, "optimizer_can_locate"):
                verify_optimizer_sealed_boundary(
                    str(link), research_code_root=str(code),
                    sealed_container_root=str(Path(root) / "private-sealed"),
                )

    def test_requires_abs_host_path_and_source_mount(self):
        with tempfile.TemporaryDirectory() as root:
            good = Path(root) / "code"
            good.mkdir()
            with self.assertRaisesRegex(OptimizerIsolationDenied, "absolute_sealed"):
                verify_optimizer_sealed_boundary(
                    "relative-synthetic-secret.json", research_code_root=str(good),
                    sealed_container_root=str(Path(root) / "private-sealed"),
                )
            with self.assertRaisesRegex(OptimizerIsolationDenied, "research_code_mount_missing"):
                verify_optimizer_sealed_boundary(
                    str(Path(root) / "absent.json"),
                    research_code_root=str(Path(root) / "missing-code"),
                    sealed_container_root=str(Path(root) / "private-sealed"),
                )

    def test_model_credentials_are_denied_even_with_no_mounted_holdout(self):
        with tempfile.TemporaryDirectory() as root:
            code = Path(root) / "code"
            code.mkdir()
            with patch.dict(os.environ, {"OPENROUTER_API_KEY": "synthetic-only-secret"}):
                with self.assertRaisesRegex(OptimizerIsolationDenied, "model_credentials"):
                    verify_optimizer_sealed_boundary(
                        str(Path(root) / "absent.json"),
                        research_code_root=str(code),
                        sealed_container_root=str(Path(root) / "private-sealed"),
                    )


if __name__ == "__main__":
    unittest.main()
