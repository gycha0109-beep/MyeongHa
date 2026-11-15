"""Freeze an actual *offline* GEPA result into an unapproved Node candidate packet.

Never export GEPA's eval_log, reflective datasets, private responses, or secrets.
This packet is a research proposal, not proof of the evaluator's provenance,
human approval, quality improvement, or permission to contact a provider.
"""
from __future__ import annotations

import hashlib
import math

from gepa_api_contract import _safe_expression
from runner import preflight, PreflightDenied, SHA


def freeze_offline_gepa_result(result, envelope, *, immutable_sources_sha256,
                               max_evals):
    """Build a minimal, fail-closed, JSON-compatible research candidate.

    The immutable source SHA and run manifest hash are *claims* supplied by the
    orchestrator, not independently authenticated runtime or owner evidence.
    Node must compare them to its own verified manifest before intake.
    """
    preflight(envelope)
    if not isinstance(immutable_sources_sha256, str) or not SHA.fullmatch(
            immutable_sources_sha256):
        raise PreflightDenied('immutable_sources_sha')
    if type(max_evals) is not int or not 1 <= max_evals <= 10:
        raise PreflightDenied('offline_evaluation_ceiling')

    slot = envelope['mutableSlot']
    candidate = getattr(result, 'best_candidate', None)
    if type(candidate) is not dict or set(candidate) != {slot}:
        raise PreflightDenied('gepa_result_slot')
    text = candidate[slot]
    if not _safe_expression(text):
        raise PreflightDenied('gepa_result_expression')

    score = getattr(result, 'best_score', None)
    count = getattr(result, 'total_evals', None)
    if (type(score) not in (int, float) or not math.isfinite(score)
            or not 0 <= score <= 1):
        raise PreflightDenied('gepa_result_score')
    if type(count) is not int or not 1 <= count <= max_evals:
        raise PreflightDenied('gepa_result_eval_count')

    return {
        'schemaVersion': 'character-gepa-frozen-result-v1',
        'optimizer': 'gepa',
        'runManifestSha256': envelope['runManifestSha256'],
        'sourceSeedSha256': envelope['candidateSha256'],
        'proposal': {
            'schemaVersion': 'character-expression-proposal-v1',
            'slot': slot,
            'text': text,
            'textSha256': hashlib.sha256(text.encode('utf-8')).hexdigest(),
            'pinnedContextSha256': immutable_sources_sha256,
            'status': 'pending_owner_review',
            'semanticSafetyVerified': False,
            'productionEligible': False,
        },
        'researchEvidence': {
            'bestScoreSyntheticOnly': float(score),
            'totalEvals': count,
            'sourceAuthenticated': False,
            'independentQualityGainEstablished': False,
            'ownerReviewGranted': False,
            'heldoutPassed': False,
            'releaseApproved': False,
        },
        'externalCallsAuthorized': False,
        'externalCalls': 0,
        'productionEligible': False,
    }
