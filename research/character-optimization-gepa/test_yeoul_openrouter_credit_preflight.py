"""Offline-only key ownership and existing-credit checks for the Yeoul pilot."""
from __future__ import annotations

from copy import deepcopy
from unittest import TestCase

from yeoul_openrouter_credit_preflight import (
    CreditPreflightHold, inspect_existing_prepaid_credit,
)


def snapshots():
    return {
        'inference_key_snapshot': {
            'data': {'creator_user_id': 'user_private', 'is_management_key': False,
                     'is_free_tier': False, 'limit_remaining': 0.05}
        },
        'management_key_snapshot': {
            'data': {'creator_user_id': 'user_private', 'is_management_key': True}
        },
        'credits_snapshot': {'data': {'total_credits': 0.4, 'total_usage': 0.2}},
        'worst_case_micro_usd': 1000,
    }


class ExistingPrepaidCreditTests(TestCase):
    def test_matching_paid_keys_observe_prepaid_credit_without_authorizing_spend(self):
        result = inspect_existing_prepaid_credit(**snapshots())
        self.assertTrue(result['same_account_for_inference_and_management'])
        self.assertTrue(result['sufficient_prepaid_credit_observed'])
        self.assertFalse(result['credit_purchase_performed'])
        self.assertFalse(result['paid_execution_ready'])
        self.assertFalse(result['owner_approval_authenticated'])
        self.assertFalse(result['tariff_or_fx_authenticated'])
        self.assertFalse(result['account_spend_exclusivity_proven'])
        self.assertNotIn('user_private', str(result))
        self.assertNotIn('total_credits', str(result))

    def test_mismatched_key_owners_or_management_key_not_verified(self):
        for alter in (
            lambda d: d['management_key_snapshot']['data'].update(
                creator_user_id='user_other'),
            lambda d: d['management_key_snapshot']['data'].update(
                is_management_key=False),
            lambda d: d['inference_key_snapshot']['data'].update(
                is_management_key=True),
            lambda d: d['inference_key_snapshot']['data'].pop('creator_user_id'),
            lambda d: d['management_key_snapshot']['data'].update(
                creator_user_id='\nprivate'),
            lambda d: d['inference_key_snapshot']['data'].update(
                is_provisioning_key=True),
            lambda d: d['inference_key_snapshot']['data'].update(
                is_free_tier=True),
        ):
            args = deepcopy(snapshots())
            alter(args)
            with self.assertRaises(CreditPreflightHold):
                inspect_existing_prepaid_credit(**args)

    def test_zero_or_insufficient_credit_cannot_authorize_a_request(self):
        for remaining, usage in ((0.0, 0.4), (0.000999, 0.1),
                                 (0.001, 0.4), (-1.0, 0.1)):
            args = deepcopy(snapshots())
            args['credits_snapshot']['data']['total_usage'] = usage
            args['inference_key_snapshot']['data']['limit_remaining'] = remaining
            with self.assertRaises(CreditPreflightHold):
                inspect_existing_prepaid_credit(**args)

    def test_invalid_numeric_shapes_and_bool_values_are_rejected(self):
        for field, value in (
            ('total_credits', '100'), ('total_credits', True),
            ('total_credits', float('inf')),
            ('total_usage', float('nan')), ('total_usage', -1),
        ):
            args = deepcopy(snapshots())
            args['credits_snapshot']['data'][field] = value
            with self.assertRaises(CreditPreflightHold):
                inspect_existing_prepaid_credit(**args)
        for v in ('0.2', None, True, float('nan')):
            args = deepcopy(snapshots())
            args['inference_key_snapshot']['data']['limit_remaining'] = v
            with self.assertRaises(CreditPreflightHold):
                inspect_existing_prepaid_credit(**args)

    def test_request_quote_must_be_positive_bounded_integer(self):
        for value in (0, -1, 1_000_001, True, 0.5, None):
            args = deepcopy(snapshots())
            args['worst_case_micro_usd'] = value
            with self.assertRaises(CreditPreflightHold):
                inspect_existing_prepaid_credit(**args)

    def test_exact_boundary_sufficient_and_total_overdrawn_rejected(self):
        args = deepcopy(snapshots())
        args['worst_case_micro_usd'] = 50000
        args['credits_snapshot']['data'] = {
            'total_credits': 0.75, 'total_usage': 0.70,
        }
        self.assertTrue(inspect_existing_prepaid_credit(**args)[
            'sufficient_prepaid_credit_observed'])
        args['credits_snapshot']['data']['total_usage'] = 0.76
        with self.assertRaises(CreditPreflightHold):
            inspect_existing_prepaid_credit(**args)
