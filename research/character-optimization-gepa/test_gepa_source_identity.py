"""Synthetic, no-network guards for pinned Python/GEPA and hash-locked build tools."""
import json
import unittest
from types import SimpleNamespace

from verify_gepa_environment import (
    EXPECTED_PYTHON, EXPECTED_REQUIREMENT, EXPECTED_SOURCE, EXPECTED_URL,
    EXPECTED_BUILD_PACKAGES, EnvironmentMismatch, verify_runtime_identity,
)

VALID_LOCK = "# only research VCS source\n" + EXPECTED_REQUIREMENT + "\n"
VALID_BUILD_LOCK = "# hashes checked by pip\n" + "\n".join(
    f"{name}=={version} --hash=sha256:{sha}" for name, version, sha in EXPECTED_BUILD_PACKAGES) + "\n"
VALID_BUILD_VERSIONS = {name: version for name, version, _ in EXPECTED_BUILD_PACKAGES}


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
        config = {"python_version": EXPECTED_PYTHON, "lock_contents": VALID_LOCK,
                  "build_lock_contents": VALID_BUILD_LOCK,
                  "build_dist_versions": VALID_BUILD_VERSIONS,
                  "distribution": fake_distribution()}
        config.update(kwargs)
        return verify_runtime_identity(**config)

    def test_exact_source_and_build_wheels_are_an_unapproved_research_receipt(self):
        result = self.check()
        self.assertEqual(result["gepaSourceCommit"], EXPECTED_SOURCE)
        self.assertTrue(result["buildBackendWheelLockMatchesExpected"])
        self.assertTrue(result["buildBackendVersionsMatchExpected"])
        self.assertFalse(result["buildIsolationRuntimeAttested"])
        self.assertEqual(result["buildDependenciesVerified"], 5)
        self.assertFalse(result["transitiveDependenciesFullyLocked"])
        self.assertFalse(result["externalCallsAuthorized"])
        self.assertFalse(result["productionEligible"])

    def test_unexpected_python_or_requirement_is_rejected(self):
        for version in ((3, 14, 9), (3, 15, 0), (3, 13, 9)):
            with self.subTest(version=version), self.assertRaisesRegex(
                    EnvironmentMismatch, "python_image_version"):
                self.check(python_version=version)
        for lock in ("gepa\n", VALID_LOCK + "other==1.0\n",
                     VALID_LOCK.replace(EXPECTED_SOURCE, "f" * 40)):
            with self.subTest(lock=lock), self.assertRaisesRegex(
                    EnvironmentMismatch, "unexpected_requirement"):
                self.check(lock_contents=lock)

    def test_build_wheel_hash_lock_must_be_exact_and_complete(self):
        for other in (VALID_BUILD_LOCK.replace("sha256:", "sha256:0", 1),
                      VALID_BUILD_LOCK.replace("setuptools==80.9.0", "setuptools==81.0.0"),
                      VALID_BUILD_LOCK.replace("build==1.3.0", "build>=1.3.0"),
                      VALID_BUILD_LOCK + "untrusted==1.0 --hash=sha256:" + "a"*64 + "\n",
                      "\n".join(VALID_BUILD_LOCK.splitlines()[:-1]) + "\n"):
            with self.subTest(lock=other[:80]), self.assertRaisesRegex(
                    EnvironmentMismatch, "unexpected_build_wheel_hash_lock"):
                self.check(build_lock_contents=other)

    def test_installed_build_tool_version_mismatch_or_missing_dependency_denied(self):
        for unexpected in (
            {**VALID_BUILD_VERSIONS, "build": "1.2.2"},
            {k: v for k, v in VALID_BUILD_VERSIONS.items() if k != "packaging"},
            {**VALID_BUILD_VERSIONS, "another": "1.0.0"},
        ):
            with self.subTest(deps=unexpected), self.assertRaisesRegex(
                    EnvironmentMismatch, "build_dependency_version"):
                self.check(build_dist_versions=unexpected)

    def test_installed_vcs_identity_must_match_not_just_version(self):
        for fake in (
            fake_distribution(commit="f" * 40),
            fake_distribution(revision="f" * 40),
            fake_distribution(url="https://untrusted.invalid/gepa.git"),
            fake_distribution(name="not-gepa"),
        ):
            with self.subTest(metadata=fake.metadata), self.assertRaises(
                    EnvironmentMismatch):
                self.check(distribution=fake)

    def test_missing_or_malformed_source_receipt_is_rejected(self):
        for direct_url in (None, "{}", "not-json", '{"url":"https://invalid"}'):
            dist = SimpleNamespace(metadata={"Name": "gepa"},
                                   read_text=lambda filename: direct_url)
            with self.subTest(receipt=direct_url), self.assertRaises(
                    EnvironmentMismatch):
                self.check(distribution=dist)


if __name__ == "__main__":
    unittest.main()
