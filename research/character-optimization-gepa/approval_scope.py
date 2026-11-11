"""Owner approval scope *inspection*, not an approval issuer or live sender.

The existing MyeongHa authority model has no verified GEPA spending approval
source wired here. Claim strings, CI fixtures, and checkboxes are never trusted.
A real signed/governed approval reader and a network-enforced gateway must be
integrated separately before the live path may ever be enabled.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable
from budget_ledger import ROLES


class ApprovalHold(ValueError):
    pass


def _text(value, label):
    if not isinstance(value, str) or not value.strip() or len(value) > 200:
        raise ApprovalHold(label)
    return value


def _number(value, label, *, zero=False):
    if type(value) is not int or value < (0 if zero else 1):
        raise ApprovalHold(label)
    return value


_FIELDS = frozenset({
    'schema_version', 'decision_id', 'decision_kind', 'decision_status',
    'run_id', 'target_id', 'manifest_sha256', 'policy_hash',
    'model_id', 'provider_id', 'roles', 'data_scopes', 'max_total_micro_usd',
    'max_attempts', 'valid_from_epoch', 'expires_epoch', 'authority_ref',
})
_DATA_SCOPES = frozenset({'synthetic_development', 'approved_development'})


@dataclass(frozen=True)
class ApprovalScopeInspection:
    """Non-authorizing result; never a security token or payment permission."""
    decision_ref: str
    scope_matches: bool
    issuer_authenticated: bool = False
    paid_transport_authorized: bool = False


def inspect_approval_scope(*, host_record: object, policy, request: dict,
                           run_manifest_sha256: str, now_epoch: int,
                           run_budget_micro_usd: int, run_attempt_cap: int,
                           requested_data_scope: str) -> ApprovalScopeInspection:
    """Check a host-supplied candidate record, *not* caller-provided authority.

    The host must not forward a client-provided record as host_record. Even if
    all fields match, this only checks scope and never authenticates the issuer.
    """
    if not isinstance(host_record, dict) or set(host_record) != _FIELDS:
        raise ApprovalHold('trusted_decision_unavailable_or_invalid')
    if not isinstance(request, dict):
        raise ApprovalHold('request_shape')
    _text(run_manifest_sha256, 'manifest')
    if not run_manifest_sha256.startswith('sha256:'):
        raise ApprovalHold('manifest_hash')
    _number(now_epoch, 'clock', zero=True)
    _number(run_budget_micro_usd, 'budget')
    _number(run_attempt_cap, 'attempt_cap')
    if requested_data_scope not in _DATA_SCOPES:
        raise ApprovalHold('data_scope_unapproved')
    record = host_record
    for k in ('decision_id', 'decision_kind', 'decision_status', 'run_id',
              'target_id', 'manifest_sha256', 'policy_hash', 'model_id',
              'provider_id', 'authority_ref'):
        _text(record[k], k)
    if record['schema_version'] != 'research-budget-approval-scope-v1':
        raise ApprovalHold('approval_schema')
    if record['decision_kind'] != 'gepa_paid_experiment' or record['decision_status'] != 'approved':
        raise ApprovalHold('not_a_paid_research_approval')
    if (not isinstance(record['roles'], list) or not record['roles'] or
            any(not isinstance(r, str) for r in record['roles']) or
            len(set(record['roles'])) != len(record['roles'])):
        raise ApprovalHold('roles_shape')
    if any(not isinstance(r, str) or r not in ROLES for r in record['roles']):
        raise ApprovalHold('unknown_role')
    if (not isinstance(record['data_scopes'], list) or not record['data_scopes']
            or any(not isinstance(s, str) for s in record['data_scopes'])
            or len(set(record['data_scopes'])) != len(record['data_scopes'])
            or any(s not in _DATA_SCOPES for s in record['data_scopes'])):
        raise ApprovalHold('data_scope_shape')
    for name in ('max_total_micro_usd', 'max_attempts', 'valid_from_epoch', 'expires_epoch'):
        _number(record[name], name, zero=name == 'valid_from_epoch')
    if not record['valid_from_epoch'] <= now_epoch < record['expires_epoch']:
        raise ApprovalHold('approval_expired_or_not_yet_valid')
    expected = {'run_id': policy.run_id, 'target_id': policy.target_id,
                'manifest_sha256': run_manifest_sha256,
                'policy_hash': policy.policy_hash,
                'model_id': policy.model_id, 'provider_id': policy.provider}
    if any(record[key] != value for key, value in expected.items()):
        raise ApprovalHold('approval_scope_mismatch')
    if (request.get('run_id') != policy.run_id or
            request.get('target_id') != policy.target_id or
            request.get('model_id') != policy.model_id or
            request.get('role') not in record['roles'] or
            request.get('role') not in policy.allowed_roles or
            requested_data_scope not in record['data_scopes']):
        raise ApprovalHold('request_outside_approval')
    if (run_budget_micro_usd > record['max_total_micro_usd'] or
            run_attempt_cap > record['max_attempts']):
        raise ApprovalHold('requested_budget_exceeds_scope')
    if request.get('approvalRef') is not None:
        raise ApprovalHold('client_approval_claim_rejected')
    return ApprovalScopeInspection(decision_ref=record['decision_id'], scope_matches=True)


def require_authenticated_paid_approval(*, claim_ref: str | None,
                                         trusted_decision_reader: Callable | None = None):
    """Mandatory security boundary. No trusted approval issuer is connected.

    Do not treat an injected test callback, matching scope, or an approvalRef
    as authorization to open provider transport. Real decision provenance must
    be verified against the existing governance authority first.
    """
    if claim_ref is not None:
        _text(claim_ref, 'approval_claim')
    raise ApprovalHold('owner_approval_authority_not_configured')
