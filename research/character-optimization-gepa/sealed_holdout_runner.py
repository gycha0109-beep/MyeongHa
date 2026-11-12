"""Isolated synthetic-only final-evaluator contract; NEVER a live or approved holdout.

No provider clients or prompts. A real private/paid final evaluator remains unimplemented.
One-shot SQLite admission prevents accidental replay within the SAME persistent state store.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
import sqlite3
import stat


class HoldoutDenied(ValueError):
    pass


DIMENSIONS = frozenset({
    'korean_naturalness', 'response_relevance', 'agency', 'persona_fidelity',
    'relationship_fit', 'continuity', 'repetition', 'efficiency',
})
HARD_FAILURES = frozenset({
    'fabricated_memory', 'cross_character_or_user_leak',
    'canon_or_authority_violation', 'unsupported_relationship',
    'provider_or_cost_violation',
})
FIXTURE_KEYS = frozenset({
    'schemaVersion', 'datasetRole', 'sourceType', 'families',
})
FAMILY_KEYS = frozenset({
    'familyId', 'baselineScores', 'candidateScores', 'hardFailures', 'uncertainty',
})
FROZEN_KEYS = frozenset({
    'schemaVersion', 'characterId', 'runManifestSha256', 'candidateSha256',
    'optimizationFamilyIds', 'frozenBeforeSealedEvaluation',
    'externalCallsAuthorized', 'productionEligible',
})


def _deny(code: str) -> None:
    raise HoldoutDenied('SEALED_HOLDOUT_DENIED:' + code)


def _sha(value: object) -> bool:
    return (isinstance(value, str) and len(value) == 64 and
            all(c in '0123456789abcdef' for c in value))


def _scores(value: object) -> bool:
    return (type(value) is dict and value.keys() == DIMENSIONS and
            all(type(v) in (float, int) and 0 <= v <= 1 for v in value.values()))


def _within(parent: Path, target: Path) -> bool:
    return target == parent or parent in target.parents


def _private_file(path: Path, *, must_exist: bool) -> None:
    if not path.is_absolute() or path.is_symlink():
        _deny('private_absolute_non_symlink_path_required')
    parent = path.parent
    if not parent.is_dir() or parent.is_symlink() or stat.S_IMODE(parent.stat().st_mode) & 0o077:
        _deny('private_directory_0700_required')
    if must_exist:
        if not path.is_file() or stat.S_IMODE(path.stat().st_mode) & 0o077:
            _deny('private_input_0600_required')
    elif path.exists():
        if not path.is_file() or stat.S_IMODE(path.stat().st_mode) & 0o077:
            _deny('private_ledger_0600_required')


def _check_no_network() -> None:
    if any(os.getenv(k) for k in ('OPENROUTER_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY')):
        _deny('model_credentials_available')
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.7)
        if sock.connect_ex(('1.1.1.1', 443)) == 0:
            _deny('network_is_not_isolated')


def _validate_fixture(fixture: object, frozen: object) -> list[dict]:
    if (type(fixture) is not dict or fixture.keys() != FIXTURE_KEYS or
            fixture['schemaVersion'] != 'myeongha-synthetic-sealed-evaluation-v1' or
            fixture['datasetRole'] != 'sealed_holdout' or
            fixture['sourceType'] != 'synthetic_fixture' or
            type(fixture['families']) is not list or not (2 <= len(fixture['families']) <= 20)):
        _deny('synthetic_sealed_fixture_only')
    if (type(frozen) is not dict or frozen.keys() != FROZEN_KEYS or
            frozen['schemaVersion'] != 'myeongha-frozen-candidate-test-v1' or
            frozen['characterId'] != 'yeoul' or
            not _sha(frozen['runManifestSha256']) or not _sha(frozen['candidateSha256']) or
            frozen['frozenBeforeSealedEvaluation'] is not True or
            frozen['externalCallsAuthorized'] is not False or
            frozen['productionEligible'] is not False or
            type(frozen['optimizationFamilyIds']) is not list or
            not frozen['optimizationFamilyIds'] or
            any(type(x) is not str or not x.startswith('synthetic-')
                for x in frozen['optimizationFamilyIds']) or
            len(set(frozen['optimizationFamilyIds'])) != len(frozen['optimizationFamilyIds'])):
        _deny('untrusted_frozen_candidate')
    ids = set()
    excluded = set(frozen['optimizationFamilyIds'])
    for family in fixture['families']:
        if type(family) is not dict or family.keys() != FAMILY_KEYS:
            _deny('private_text_or_invalid_family_field')
        fid = family['familyId']
        if (type(fid) is not str or not fid.startswith('synthetic-') or len(fid) > 90
                or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-_' for c in fid)
                or fid in ids or fid in excluded):
            _deny('cross_split_or_duplicate_family')
        ids.add(fid)
        if not _scores(family['baselineScores']) or not _scores(family['candidateScores']):
            _deny('dimension_scores_invalid')
        failures = family['hardFailures']
        if (type(failures) is not list
                or any(type(v) is not str or v not in HARD_FAILURES for v in failures)
                or len(set(failures)) != len(failures)
                or type(family['uncertainty']) is not bool):
            _deny('hard_failure_or_uncertainty_invalid')
    return fixture['families']


def evaluate_once(fixture_file: Path, frozen_file: Path, ledger_file: Path,
                  *, require_isolation: bool = False) -> dict:
    """Read an isolated synthetic fixture; consume its hash exactly once per ledger.

    The ledger is only a local replay guard, not an authenticated source or true
    user approval. It intentionally burns the reservation before comparison.
    """
    fixture_file = Path(fixture_file)
    frozen_file = Path(frozen_file)
    ledger_file = Path(ledger_file)
    location = Path(__file__).resolve()
    # CI binds this research directory directly at /opt/myeongha. In a checkout
    # the script lives below repository/research/character-optimization-gepa.
    source_root = (Path('/opt/myeongha') if location.parent == Path('/opt/myeongha')
                   else location.parents[2])
    if len({fixture_file, frozen_file, ledger_file}) != 3 or any(
        _within(source_root, p) for p in (fixture_file, frozen_file, ledger_file)):
        _deny('separate_private_inputs_outside_repo')
    for path in (fixture_file, frozen_file):
        _private_file(path, must_exist=True)
    _private_file(ledger_file, must_exist=False)
    if require_isolation:
        _check_no_network()
    if fixture_file.stat().st_size > 128 * 1024 or frozen_file.stat().st_size > 4096:
        _deny('oversized_private_fixture')
    holdout_bytes = fixture_file.read_bytes()
    candidate_bytes = frozen_file.read_bytes()
    try:
        fixture = json.loads(holdout_bytes.decode('utf-8'))
        frozen = json.loads(candidate_bytes.decode('utf-8'))
    except (ValueError, UnicodeError):
        _deny('invalid_json_fixture')
    families = _validate_fixture(fixture, frozen)
    holdout_sha = hashlib.sha256(holdout_bytes).hexdigest()
    candidate_sha = frozen['candidateSha256']
    conn = sqlite3.connect(ledger_file, timeout=10, isolation_level=None)
    try:
        os.chmod(ledger_file, 0o600)
        conn.execute('CREATE TABLE IF NOT EXISTS sealed_uses (holdout_sha TEXT PRIMARY KEY, candidate_sha TEXT NOT NULL, manifest_sha TEXT NOT NULL)')
        conn.execute('BEGIN IMMEDIATE')
        try:
            conn.execute('INSERT INTO sealed_uses VALUES (?, ?, ?)',
                         (holdout_sha, candidate_sha, frozen['runManifestSha256']))
            conn.execute('COMMIT')
        except sqlite3.IntegrityError:
            conn.execute('ROLLBACK')
            _deny('sealed_holdout_already_consumed')
        except Exception:
            conn.execute('ROLLBACK')
            raise
    finally:
        conn.close()
    hard = sum(bool(row['hardFailures']) for row in families)
    unsure = sum(row['uncertainty'] for row in families)
    regressions = sum(any(row['candidateScores'][d] < row['baselineScores'][d]
                          for d in DIMENSIONS) for row in families)
    score_deltas = [sum(row['candidateScores'][d] - row['baselineScores'][d]
                        for d in DIMENSIONS) / len(DIMENSIONS) for row in families]
    return {
        'schemaVersion': 'myeongha-synthetic-sealed-result-v1',
        'candidateSha256': candidate_sha, 'runManifestSha256': frozen['runManifestSha256'],
        'familyCount': len(families), 'hardFailureFamilies': hard,
        'uncertainFamilies': unsure, 'regressionFamilies': regressions,
        'meanFamilyDelta': sum(score_deltas) / len(score_deltas),
        'sealedSourceHashIncludedInOutput': False,
        'familyPromptsOrIndividualScoresExported': False,
        'syntheticOnly': True, 'externalCalls': 0,
        'independentPrivateHoldoutValidated': False,
        'ownerReviewVerified': False, 'qualityGainEstablished': False,
        'candidateRegistryStage': 'proposed', 'productionEligible': False,
        'decision': 'HOLD_SYNTHETIC_OS_PROBE_NOT_INDEPENDENT_EVIDENCE',
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--sealed', type=Path, required=True)
    parser.add_argument('--frozen', type=Path, required=True)
    parser.add_argument('--ledger', type=Path, required=True)
    args = parser.parse_args()
    try:
        result = evaluate_once(args.sealed, args.frozen, args.ledger, require_isolation=True)
    except (HoldoutDenied, OSError, sqlite3.Error):
        # Never emit user-provided content or private paths, even on failure.
        raise SystemExit('SEALED_HOLDOUT_EVALUATION_REFUSED') from None
    print(json.dumps(result, sort_keys=True, separators=(',', ':')))


if __name__ == '__main__':
    main()
