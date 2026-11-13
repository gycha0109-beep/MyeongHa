"""Synthetic, no-network guards for pinned Python/GEPA environment provenance."""
import json
import unittest
from types import SimpleNamespace

from verify_gepa_environment import (
    EXPECTED_PYTHON, EXPECTED_REQUIREMENT, EXPECTED_SOURCE, EXPECTED_URL,
    EnvironmentMismatch, verify_runtime_identity,
)

VALID_LOCK = "# only research VCS source\n" + EXPECTED_REQUIREMENT + "\n"


def fake_distribution(*, commit=EXPECTED_SOURCE, revision=EXPECTED_SOURCE,
                      url=EXPECTED_URL, name="gepa"):
    return SimpleNamespace(
        metadata={"Name": name},
        read_text=lambda filename: json.dumps({
            "url": url, "vcs_info": {
                "vcs": "git", "commit_id": commit, "requested_revision": revision,
            },
        }) if filename == "direct_url.json" else None,
    )


class SourceIdentityTests(unittest.TestCase):
    def check(self, **kwargs):
        return verify_runtime_identity(
            python_version=EXPECTED_PYTHON, lock_contents=VALID_LOCK,
            distribution=fake_distribution(), **kwargs)

    def test_exact_source_version_is_an_unapproved_research_receipt(self):
        result = self.check()
        self.assertEqual(result["gepaSourceCommit"], EXPECTED_SOURCE)
        self.assertFalse(result["transitiveDependenciesFullyLocked"])
        self.assertFalse(result["externalCallsAuthorized"])
        self.assertFalse(result["productionEligible"])

    def test_unexpected_python_or_requirement_is_rejected(self):
        for version in ((3, 14, 9), (3, 15, 0), (3, 13, 9)):
            with self.subTest(version=version), self.assertRaisesRegex(
                    EnvironmentMismatch, "python_image_version"):
                verify_runtime_identity(
                    python_version=version, lock_contents=VALID_LOCK,
                    distribution=fake_distribution())
        for lock in ("gepa\n", VALID_LOCK + "other==1.0\n",
                     VALID_LOCK.replace(EXPECTED_SOURCE, "f" * 40)):
            with self.subTest(lock=lock), self.assertRaisesRegex(
                    EnvironmentMismatch, "unexpected_requirement"):
                verify_runtime_identity(
                    python_version=EXPECTED_PYTHON, lock_contents=lock,
                    distribution=fake_distribution())

    def test_installed_vcs_identity_must_match_not_just_version(self):
        for fake in (
            fake_distribution(commit="f" * 40),
            fake_distribution(revision="f" * 40),
            fake_distribution(url="https://untrusted.invalid/gepa.git"),
            fake_distribution(name="not-gepa"),
        ):
            with self.subTest(metadata=fake.metadata), self.assertRaises(
                    EnvironmentMismatch):
                verify_runtime_identity(
                    python_version=EXPECTED_PYTHON, lock_contents=VALID_LOCK,
                    distribution=fake)

    def test_missing_or_malformed_source_receipt_is_rejected(self):
        for direct_url in (None, "{}", "not-json", '{"url":"https://invalid"}'):
            dist = SimpleNamespace(metadata={"Name": "gepa"},
                                   read_text=lambda filename: direct_url)
            with self.subTest(receipt=direct_url), self.assertRaises(
                    EnvironmentMismatch):
                verify_runtime_identity(
                    python_version=EXPECTED_PYTHON, lock_contents=VALID_LOCK,
                    distribution=dist)


if __name__ == "__main__":
    unittest.main()
