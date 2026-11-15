"""Synthetic proof for strict Debian package-set/hash pre-install checks."""
import hashlib
from pathlib import Path
import tempfile
import unittest

from verify_apt_archives import EXPECTED_COUNT, ArchiveMismatch, inspect_apt_archive


class AptArchiveLockTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.dir = Path(self.temp.name)
        self.names = [
            "git_1%3a2.47.3-0+deb13u1_amd64.deb",
            "git-man_1%3a2.47.3-0+deb13u1_all.deb",
        ] + [f"synthetic{i:02d}_1.0_amd64.deb" for i in range(EXPECTED_COUNT - 2)]
        self.contents = {}
        for name in self.names:
            contents = ("synthetic-" + name).encode("utf8")
            (self.dir / name).write_bytes(contents)
            self.contents[name] = contents
        self.manifest = "\n".join(
            hashlib.sha256(self.contents[name]).hexdigest() + "  " + name
            for name in sorted(self.names)) + "\n"

    def test_exact_31_archives_pass_without_any_network(self):
        out = inspect_apt_archive(self.manifest, self.dir)
        self.assertEqual(out, {"platform": "linux/amd64", "aptArchivesVerified": 31})

    def test_missing_extra_or_changed_archive_rejected(self):
        bad = self.dir / self.names[-1]
        bad.write_bytes(b"modified")
        with self.assertRaisesRegex(ArchiveMismatch, "deb_sha256_mismatch"):
            inspect_apt_archive(self.manifest, self.dir)
        bad.write_bytes(self.contents[self.names[-1]])
        bad.unlink()
        with self.assertRaisesRegex(ArchiveMismatch, "archive_file_set"):
            inspect_apt_archive(self.manifest, self.dir)
        bad.write_bytes(self.contents[self.names[-1]])
        (self.dir / "unlisted_1.0_amd64.deb").write_bytes(b"extra")
        with self.assertRaisesRegex(ArchiveMismatch, "archive_file_set"):
            inspect_apt_archive(self.manifest, self.dir)

    def test_manifest_changes_and_duplicate_entries_rejected(self):
        for bad in (
            self.manifest.replace("a", "b", 1),
            self.manifest + "0" * 64 + "  unrelated_1.0_amd64.deb\n",
            self.manifest.replace("git-man_1%3a2.47.3-0+deb13u1_all.deb",
                                  "git-man_1%3a2.47.4-0+deb13u1_all.deb"),
            self.manifest.replace("git_1%3a2.47.3-0+deb13u1_amd64.deb",
                                  "git_1%3a2.47.4-0+deb13u1_amd64.deb"),
            self.manifest.replace("  ", " ", 1),
            self.manifest.replace("git_1%3a2.47.3-0+deb13u1_amd64.deb",
                                  "git-man_1%3a2.47.3-0+deb13u1_all.deb"),
        ):
            with self.subTest(bad=bad[:30]), self.assertRaises(ArchiveMismatch):
                inspect_apt_archive(bad, self.dir)

    def test_actual_repository_manifest_contains_fixed_31_amd64_packages(self):
        path = Path(__file__).parent / "apt-amd64-20261104.sha256"
        text = path.read_text(encoding="utf8")
        lines = text.splitlines()
        self.assertEqual(len(lines), EXPECTED_COUNT)
        self.assertTrue(all(len(line.split("  ")[0]) == 64 for line in lines))
        self.assertTrue(all(line.endswith(("_amd64.deb", "_all.deb")) for line in lines))


if __name__ == "__main__":
    unittest.main()
