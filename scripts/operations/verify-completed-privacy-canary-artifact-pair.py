#!/usr/bin/env python3
"""Validate only public manifests/ciphertext checksums of the pinned 2026-10-27 canary.
No decryption, Production queries, user identifiers, workflow dispatch, or mutation.
This is artifact integrity evidence, NOT an authoritative restored-state attestation.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile

BACKUP_RUN_ID = 40468157715
LEDGER_RUN_ID = 40468500587
SOURCE_CANARY_RUN_ID = 40468086758
BACKUP_SHA = "ed52c0cd442dfcf4396804275da2df74321f5799"
LEDGER_SHA = "711c8719a7e7ed2d42a333ec56463f008d2e1fc5"
PROJECT = "cnsfpcdiyofqvhpcegfc"
ALLOWED_KEYS = {"backupZip", "ledgerZip"}


def require(condition, code):
    if not condition:
        raise ValueError(code)


def load_artifact(path, tag):
    path = Path(path)
    require(path.exists() and path.is_file(), f"{tag}_ARTIFACT_MISSING")
    with ZipFile(path) as archive:
        names = archive.namelist()
        manifests = [n for n in names if n.endswith(".manifest.json")]
        ciphertexts = [n for n in names if n.endswith(".tar.gz.enc")]
        checksums = [n for n in names if n.endswith(".tar.gz.enc.sha256")]
        require(len(manifests) == len(ciphertexts) == len(checksums) == 1,
                f"{tag}_ARCHIVE_STRUCTURE_INVALID")
        manifest = json.loads(archive.read(manifests[0]))
        # Production backups can grow; never materialize the encrypted archive in RAM.
        digest = hashlib.sha256()
        with archive.open(ciphertexts[0]) as ciphertext:
            while chunk := ciphertext.read(1024 * 1024):
                digest.update(chunk)
        cipher_hash = digest.hexdigest()
        require(manifest.get("archive_name") == ciphertexts[0],
                f"{tag}_ENCRYPTED_ARCHIVE_NAME_MISMATCH")
        require(manifest.get("encrypted_sha256") == cipher_hash,
                f"{tag}_ENCRYPTED_ARCHIVE_DIGEST_MISMATCH")
        checksum_record = archive.read(checksums[0]).decode("ascii", errors="strict").strip()
        require(checksum_record.split()[0] == cipher_hash,
                f"{tag}_ENC_ARCHIVE_CHECKSUM_MISMATCH")
        return manifest


def parse_utc(s, code):
    require(isinstance(s, str), code)
    try:
        date = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(code) from exc
    require(date.tzinfo is not None and date.utcoffset().total_seconds() == 0, code)
    return date.astimezone(timezone.utc)


def verify(backup_zip, ledger_zip):
    backup = load_artifact(backup_zip, "BACKUP")
    ledger = load_artifact(ledger_zip, "LEDGER")
    require(backup.get("schema_version") == "myeongha-postgres-backup-artifact-v1",
            "BACKUP_MANIFEST_SCHEMA_INVALID")
    require(backup.get("project_ref") == PROJECT and backup.get("source_sha") == BACKUP_SHA,
            "BACKUP_ORIGIN_MISMATCH")
    require(ledger.get("schema_version") == "myeongha-postgres-privacy-recovery-ledger-artifact-v1",
            "LEDGER_SCHEMA_INVALID")
    require(ledger.get("backupRunId") == BACKUP_RUN_ID
            and ledger.get("backup_source_sha") == BACKUP_SHA
            and ledger.get("workflow_source_sha") == LEDGER_SHA,
            "LEDGER_BACKUP_PROVENANCE_MISMATCH")
    require(ledger.get("backup_artifact_name") == backup["archive_name"].removesuffix(".tar.gz.enc"),
            "LEDGER_BACKUP_ARCHIVE_IDENTITY_MISMATCH")
    cutoff = parse_utc(backup.get("created_at_utc"), "BACKUP_CUTOFF_INVALID")
    ledger_cutoff = parse_utc(ledger.get("backupCompletedAt"), "LEDGER_CUTOFF_INVALID")
    captured = parse_utc(ledger.get("capturedAt"), "LEDGER_CAPTURED_AT_INVALID")
    require(cutoff == ledger_cutoff and cutoff < captured, "PRIVACY_WINDOW_INVALID")
    require(ledger.get("sourceAuthorityClass") == "AUTHORITATIVE_CAPTURED_WINDOW_V1"
            and ledger.get("authoritativePostBackupSource") is True
            and ledger.get("candidateSourceAuthority") is False,
            "LEDGER_SOURCE_CLASS_INVALID")
    require(isinstance(ledger.get("eventCount"), int) and ledger["eventCount"] > 0
            and isinstance(ledger.get("eventTypeCounts"), dict)
            and ledger["eventTypeCounts"].get("ACCOUNT_DELETION_STARTED", 0) >= 1
            and sum(ledger["eventTypeCounts"].values()) == ledger["eventCount"],
            "LEDGER_NONZERO_EVENT_COUNTS_INVALID")
    require(ledger.get("replayPlannerAccepted") is True
            and ledger.get("authoritativePrivacyReconciliation") is False
            and ledger.get("futureSafePrivacyReconciliation") is False
            and ledger.get("drReady") is False,
            "LEDGER_UNSUPPORTED_DR_PROMOTION")
    require(parse_utc(ledger.get("authoritativeCoverageThrough"), "LEDGER_COVERAGE_INVALID")
            == captured, "LEDGER_CAPTURED_WINDOW_DRIFT")
    return {
        "status": "PASS_PUBLIC_ARTIFACT_PAIR_INTEGRITY_ONLY",
        "sourceCanaryRunId": SOURCE_CANARY_RUN_ID,
        "sourceCanaryRunConclusion": "failure",
        "governedBackupRunId": BACKUP_RUN_ID,
        "canonicalLedgerRunId": LEDGER_RUN_ID,
        "backupMigrationFrontier": backup.get("migration_frontier"),
        "backupCompletedAtUtc": backup["created_at_utc"],
        "ledgerCapturedAtUtc": ledger["capturedAt"],
        "ledgerEventCount": ledger["eventCount"],
        "accountDeletionStartedEventCount": ledger["eventTypeCounts"]["ACCOUNT_DELETION_STARTED"],
        "missingSuccessfulCanaryEvidenceArtifact": True,
        "authoritativeRecoveredStateReplayed": False,
        "authoritativePrivacyReconciliation": False,
        "futureSafePrivacyReconciliation": False,
        "drReady": False,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--backup-zip", required=True)
    parser.add_argument("--ledger-zip", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.backup_zip, args.ledger_zip), indent=2))
    except (ValueError, OSError, KeyError, TypeError) as error:
        raise SystemExit(f"FAIL_ARTIFACT_PAIR_INTEGRITY:{type(error).__name__}:{error}") from error
