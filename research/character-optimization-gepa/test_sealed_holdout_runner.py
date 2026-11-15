"""Synthetic-only tests: zero provider calls, zero real user data, no approval claims."""
from __future__ import annotations

import json
from pathlib import Path
import stat
import tempfile
import unittest

from sealed_holdout_runner import HoldoutDenied, evaluate_once

DIMENSIONS = [
    'korean_naturalness', 'response_relevance', 'agency', 'persona_fidelity',
    'relationship_fit', 'continuity', 'repetition', 'efficiency',
]


def fixture():
    def family(fid, base=0.5, next_score=0.7):
        return dict(familyId=fid, baselineScores={d: base for d in DIMENSIONS},
                    candidateScores={d: next_score for d in DIMENSIONS},
                    hardFailures=[], uncertainty=False)
    return dict(schemaVersion='myeongha-synthetic-sealed-evaluation-v1',
                datasetRole='sealed_holdout', sourceType='synthetic_fixture',
                families=[family('synthetic-sealed-1'), family('synthetic-sealed-2')])


def frozen():
    return dict(schemaVersion='myeongha-frozen-candidate-test-v1',
                characterId='yeoul', runManifestSha256='a'*64,
                candidateSha256='b'*64,
                optimizationFamilyIds=['synthetic-development-1', 'synthetic-validation-1'],
                frozenBeforeSealedEvaluation=True, externalCallsAuthorized=False,
                productionEligible=False)


class SealedHoldoutRunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.holdout = self.directory / 'sealed.json'
        self.candidate = self.directory / 'frozen.json'
        self.ledger = self.directory / 'one-shot.sqlite'
        self._write(self.holdout, fixture())
        self._write(self.candidate, frozen())

    def _write(self, path, contents):
        path.write_text(json.dumps(contents), encoding='utf-8')
        path.chmod(0o600)

    def _eval(self):
        return evaluate_once(self.holdout, self.candidate, self.ledger)

    def test_synthetic_runner_consumes_once_and_exports_only_aggregate(self):
        report = self._eval()
        self.assertEqual(report['familyCount'], 2)
        self.assertAlmostEqual(report['meanFamilyDelta'], 0.2)
        self.assertEqual(report['regressionFamilies'], 0)
        self.assertEqual(report['candidateRegistryStage'], 'proposed')
        self.assertEqual(report['externalCalls'], 0)
        self.assertFalse(report['independentPrivateHoldoutValidated'])
        self.assertNotIn('synthetic-sealed-1', json.dumps(report))
        self.assertEqual(stat.S_IMODE(self.ledger.stat().st_mode), 0o600)
        with self.assertRaisesRegex(HoldoutDenied, 'sealed_holdout_already_consumed'):
            self._eval()

    def test_replay_even_with_different_candidate_is_forbidden(self):
        self._eval()
        alt = frozen()
        alt['candidateSha256'] = 'c'*64
        self._write(self.candidate, alt)
        with self.assertRaisesRegex(HoldoutDenied, 'sealed_holdout_already_consumed'):
            self._eval()

    def test_development_or_validation_family_id_collision_is_blocked(self):
        data = fixture()
        data['families'][0]['familyId'] = frozen()['optimizationFamilyIds'][0]
        self._write(self.holdout, data)
        with self.assertRaisesRegex(HoldoutDenied, 'cross_split_or_duplicate_family'):
            self._eval()
        data['families'][0]['familyId'] = data['families'][1]['familyId']
        self._write(self.holdout, data)
        with self.assertRaisesRegex(HoldoutDenied, 'cross_split_or_duplicate_family'):
            self._eval()

    def test_forged_review_activation_or_private_user_fields_are_denied(self):
        data = fixture()
        data['families'][0]['user_message'] = 'private hidden test string'
        self._write(self.holdout, data)
        with self.assertRaisesRegex(HoldoutDenied, 'private_text_or_invalid_family_field'):
            self._eval()
        self._write(self.holdout, fixture())
        claimed = frozen()
        claimed['productionEligible'] = True
        self._write(self.candidate, claimed)
        with self.assertRaisesRegex(HoldoutDenied, 'untrusted_frozen_candidate'):
            self._eval()

    def test_real_or_unverified_holdout_declared_as_synthetic_is_rejected(self):
        data = fixture()
        data['sourceType'] = 'private_user_evaluation'
        self._write(self.holdout, data)
        with self.assertRaisesRegex(HoldoutDenied, 'synthetic_sealed_fixture_only'):
            self._eval()
        data['sourceType'] = 'synthetic_fixture'
        data['schemaVersion'] = 'other'
        self._write(self.holdout, data)
        with self.assertRaisesRegex(HoldoutDenied, 'synthetic_sealed_fixture_only'):
            self._eval()

    def test_hard_gates_uncertainty_and_single_family_regression_are_visible(self):
        data = fixture()
        data['families'][0]['candidateScores']['agency'] = 0.1
        data['families'][0]['hardFailures'] = ['fabricated_memory']
        data['families'][1]['uncertainty'] = True
        self._write(self.holdout, data)
        report = self._eval()
        self.assertEqual(report['hardFailureFamilies'], 1)
        self.assertEqual(report['uncertainFamilies'], 1)
        self.assertEqual(report['regressionFamilies'], 1)
        self.assertFalse(report['qualityGainEstablished'])

    def test_unknown_dimension_invalid_numbers_or_unknown_failure_are_blocked(self):
        data = fixture()
        data['families'][0]['baselineScores']['extra'] = 0.5
        self._write(self.holdout, data)
        with self.assertRaisesRegex(HoldoutDenied, 'dimension_scores_invalid'):
            self._eval()
        data = fixture()
        data['families'][0]['candidateScores']['agency'] = 1.2
        self._write(self.holdout, data)
        with self.assertRaisesRegex(HoldoutDenied, 'dimension_scores_invalid'):
            self._eval()
        data = fixture()
        data['families'][0]['hardFailures'].append('synthetic_custom_label')
        self._write(self.holdout, data)
        with self.assertRaisesRegex(HoldoutDenied, 'hard_failure_or_uncertainty_invalid'):
            self._eval()

    def test_reject_symlink_and_world_readable_holdout_or_state_directory(self):
        linked = self.directory / 'linked.json'
        linked.symlink_to(self.holdout)
        with self.assertRaisesRegex(HoldoutDenied, 'private_absolute_non_symlink_path_required'):
            evaluate_once(linked, self.candidate, self.ledger)
        self.holdout.chmod(0o644)
        with self.assertRaisesRegex(HoldoutDenied, 'private_input_0600_required'):
            self._eval()
        self.holdout.chmod(0o600)
        self.directory.chmod(0o755)
        with self.assertRaisesRegex(HoldoutDenied, 'private_directory_0700_required'):
            self._eval()

    def test_frozen_hash_binding_is_non_authoritative_and_required(self):
        candidate = frozen()
        candidate['candidateSha256'] = 'not-a-sha'
        self._write(self.candidate, candidate)
        with self.assertRaisesRegex(HoldoutDenied, 'untrusted_frozen_candidate'):
            self._eval()
        candidate = frozen()
        candidate['frozenBeforeSealedEvaluation'] = False
        self._write(self.candidate, candidate)
        with self.assertRaisesRegex(HoldoutDenied, 'untrusted_frozen_candidate'):
            self._eval()


if __name__ == '__main__':
    unittest.main()
