"""Budgeted *synthetic* request gate. No network implementation or provider SDK.

A future real outbound gateway MUST run outside the network-denied optimizer and
must independently verify owner approval, token ceilings and provider prices.
"""
from __future__ import annotations
from dataclasses import dataclass

from budget_ledger import BudgetLedger, BudgetDenied, ROLES


class EgressDenied(ValueError):
    pass


@dataclass(frozen=True)
class SyntheticResponse:
    provider: str
    model: str
    actual_micro_usd: int | None
    successful: bool = True


class OfflineEgressGate:
    """Central reservation contract; synthetic responses only, never external IO."""

    def __init__(self, ledger: BudgetLedger, *, approved_models: dict[str, str]):
        if not isinstance(ledger, BudgetLedger) or not approved_models or any(
            not isinstance(model, str) or not model.strip() or not isinstance(provider, str)
            or not provider.strip() for model, provider in approved_models.items()
        ):
            raise EgressDenied('invalid_offline_gate_setup')
        self.ledger = ledger
        self.approved_models = dict(approved_models)

    def simulate(self, *, request_id: str, role: str, model_id: str,
                 max_charge_micro_usd: int, fixture: SyntheticResponse) -> dict[str, object]:
        if role not in ROLES or not isinstance(model_id, str) or model_id not in self.approved_models:
            raise EgressDenied('unapproved_role_or_model')
        if not isinstance(fixture, SyntheticResponse):
            raise EgressDenied('simulated_response_only')
        if (not isinstance(max_charge_micro_usd, int) or isinstance(max_charge_micro_usd, bool)
                or max_charge_micro_usd <= 0):
            raise EgressDenied('invalid_request_ceiling')
        reservation = self.ledger.reserve(request_id, role, max_charge_micro_usd)
        if reservation['send_permitted'] is not True:
            raise EgressDenied('duplicate_request_not_replayed')
        try:
            if not fixture.successful or fixture.actual_micro_usd is None:
                raise EgressDenied('unknown_provider_charge')
            if (fixture.provider != self.approved_models[model_id]
                    or fixture.model != model_id):
                raise EgressDenied('model_or_supplier_mismatch')
            if (not isinstance(fixture.actual_micro_usd, int) or isinstance(fixture.actual_micro_usd, bool)
                    or fixture.actual_micro_usd < 0):
                raise EgressDenied('invalid_provider_usage')
            self.ledger.settle(request_id, fixture.actual_micro_usd)
            return {'request_id': request_id, 'role': role,
                    'budget_state': 'settled', 'provider': fixture.provider,
                    'model': fixture.model, 'actual_micro_usd': fixture.actual_micro_usd,
                    'external_calls': 0, 'simulated': True}
        except Exception:
            # Do not release reserved worst-case cost on response / accounting uncertainty.
            try:
                self.ledger.hold(request_id)
            except BudgetDenied:
                pass  # settle() may already have held an over-limit charge
            raise