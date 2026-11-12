"""Provider account/credit inspection for Yeoul's capped paid pilot.

This is a synchronous read-only preflight. Raw provider JSON is input data,
NOT an approval, signed receipt, exclusive-key proof, tariff, or price quote.
The live gateway must obtain these documents itself using fixed-host GET;
never accept client-supplied documents as payment authorization.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation


class CreditPreflightHold(ValueError):
    pass


def _deny(code):
    raise CreditPreflightHold(code)


def _nonnegative_money(value, name):
    if type(value) not in (int, float):
        _deny(name)
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError):
        _deny(name)
    if not result.is_finite() or result < 0 or result > 1_000_000_000:
        _deny(name)
    return result


def _key_details(payload, management):
    if not isinstance(payload, dict) or set(payload) != {'data'}:
        _deny('key_response_shape')
    data = payload['data']
    if not isinstance(data, dict):
        _deny('key_data_missing')
    if data.get('is_management_key') is not management:
        _deny('key_role_not_verified')
    account = data.get('creator_user_id')
    if (not isinstance(account, str) or not account.startswith('user_')
            or len(account) > 160 or not account.isascii()):
        _deny('key_account_not_verified')
    if data.get('is_provisioning_key') is True:
        _deny('provisioning_key_unexpected')
    return data, account


def inspect_existing_prepaid_credit(*, inference_key_snapshot,
                                    management_key_snapshot, credits_snapshot,
                                    worst_case_micro_usd):
    """Offline structural inspection; returns NO raw balances or account IDs.

    The caller must fetch fresh data with an authenticated fixed-host GET.
    A matching account and enough observed credit do not prove exclusive key
    use, trusted price, owner approval or final settlement.
    """
    if (type(worst_case_micro_usd) is not int or
            not 1 <= worst_case_micro_usd <= 1_000_000):
        _deny('invalid_worst_cost_quote')
    inference, inference_account = _key_details(
        inference_key_snapshot, management=False,
    )
    _, manager_account = _key_details(management_key_snapshot, management=True)
    if inference_account != manager_account:
        _deny('inference_management_account_mismatch')
    if inference.get('is_free_tier') is not False:
        _deny('paid_key_tier_unverified')
    remaining_key_allowance = _nonnegative_money(
        inference.get('limit_remaining'), 'key_spend_allowance_unverified',
    )
    credits = credits_snapshot.get('data') if isinstance(credits_snapshot, dict) else None
    if not isinstance(credits, dict):
        _deny('account_credit_response_shape')
    bought = _nonnegative_money(credits.get('total_credits'),
                                'account_total_credit_invalid')
    spent = _nonnegative_money(credits.get('total_usage'),
                               'account_total_usage_invalid')
    if spent > bought:
        _deny('account_overdrawn_or_inconsistent')
    quote = Decimal(worst_case_micro_usd) / Decimal(1_000_000)
    if remaining_key_allowance < quote:
        _deny('key_limit_cannot_cover_quoted_request')
    if bought - spent < quote:
        _deny('existing_prepaid_credit_insufficient')
    return {
        'schema_version': 'yeoul-existing-credit-observation-v1',
        'same_account_for_inference_and_management': True,
        'sufficient_prepaid_credit_observed': True,
        'key_allowance_observed_sufficient': True,
        'credit_purchase_performed': False,
        'account_spend_exclusivity_proven': False,
        'tariff_or_fx_authenticated': False,
        'owner_approval_authenticated': False,
        'paid_execution_ready': False,
    }
