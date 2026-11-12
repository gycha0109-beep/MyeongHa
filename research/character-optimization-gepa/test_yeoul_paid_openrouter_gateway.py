"""All provider traffic is mocked; verifies a live sender cannot be activated by fixtures."""
from __future__ import annotations

from pathlib import Path
from unittest import TestCase, mock
from tempfile import TemporaryDirectory

from approval_scope import ApprovalHold
from yeoul_openrouter_credit_preflight import CreditPreflightHold
from test_yeoul_openrouter_credit_preflight import snapshots
from governed_dry_run import DryRunPolicy, PolicyDenied
from budget_ledger import BudgetDenied
from krw500_synthetic_ledger import YeoulKrw500SingleFlightLedger
from test_krw500_synthetic_ledger import policy, request
from yeoul_paid_openrouter_gateway import (
    MODEL, YeoulPaidDispatchHold, YeoulPaidOpenRouterGateway,
    _check_body, _check_generation, _fixed_host_json, _generation_metadata,
)

ROLES = {'student': 4, 'reflection': 4, 'judge': 4, 'holdout': 4}


def body():
    return {
        'model': MODEL, 'messages': [
            {'role': 'system', 'content': '합성 시스템'},
            {'role': 'user', 'content': '합성 질문'},
        ], 'max_tokens': 48, 'stream': False,
        'provider': {
            'only': ['deepseek'], 'allow_fallbacks': False,
            'require_parameters': True, 'zdr': True, 'data_collection': 'deny',
        },
    }


def receipt():
    return {
        'data': {'id': 'gen-test-123', 'model': MODEL, 'provider_name': 'DeepSeek',
                 'is_byok': False, 'cancelled': False,
                 'native_tokens_prompt': 5, 'native_tokens_completion': 10,
                 'native_tokens_reasoning': 0, 'native_tokens_completion_images': 0,
                 'num_fetches': 0, 'num_search_results': 0,
                 'num_media_prompt': 0, 'num_media_completion': 0,
                 'num_input_audio_prompt': 0, 'total_cost': 0.0001},
    }


def live_policy(run_id):
    p = policy(run_id)
    return DryRunPolicy(
        run_id=run_id, target_id='yeoul', model_id=MODEL,
        settings_hash=p.settings_hash, provider='deepseek',
        pricing=dict(p.pricing),
        routing={'only': ['deepseek'], 'allow_fallbacks': False,
                 'require_parameters': True, 'zdr': True,
                 'data_collection': 'deny'},
        limits=dict(p.limits), allowed_roles=p.allowed_roles,
    )


def live_request(p, name):
    value = request(p, name)
    value['max_output_tokens'] = 48
    return value


class _FakeResponse:
    status = 200
    headers = {'content-type': 'application/json'}

    def __init__(self, value):
        self.raw = value

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return None

    def read(self, length):
        return self.raw[:length]


class _FakeOpener:
    def __init__(self, target):
        self.calls = []
        self.target = target

    def open(self, req, timeout=15):
        self.calls.append((req.full_url, req.get_method(), timeout))
        return _FakeResponse(self.target)


class YeoulPaidGatewayBoundaryTests(TestCase):
    def setUp(self):
        root = TemporaryDirectory()
        self.addCleanup(root.cleanup)
        self.ledger = YeoulKrw500SingleFlightLedger(
            Path(root.name) / 'pilot.sqlite', run_id='run-private-gateway',
            max_spend_micro_usd=200000, max_attempts=8,
            role_caps=ROLES, upper_fx_milli_krw_per_usd=1400000,
            fixed_fees_krw=0,
        )
        self.pol = live_policy('run-private-gateway')
        self.gateway = YeoulPaidOpenRouterGateway(
            self.ledger, self.pol, approved_provider='deepseek',
            provider_name='DeepSeek',
        )

    def test_public_dispatch_fails_before_reservation_and_http(self):
        with mock.patch('yeoul_paid_openrouter_gateway._fixed_host_json',
                        side_effect=AssertionError('network must not open')) as sender:
            with self.assertRaisesRegex(ApprovalHold,
                                        'owner_approval_authority_not_configured'):
                self.gateway.dispatch(
                    policy_request=live_request(self.pol, 'blocked'),
                    body=body(),
                )
            sender.assert_not_called()
        self.assertEqual(self.ledger.krw_status()['all_roles_and_runs_attempts'], 0)

    def test_repeated_fake_grants_cannot_open_sender(self):
        with mock.patch.dict('os.environ', {'OPENROUTER_API_KEY': 'sk-or-test-fixture'}):
            for name in ('one', 'two', 'three'):
                with self.assertRaisesRegex(PolicyDenied, 'request_shape_or_untrusted_approval'):
                    self.gateway.dispatch(
                        policy_request={**live_request(self.pol, name),
                                        'approvalRef': 'owner-says-yes'},
                        body=body(),
                    )
        self.assertEqual(self.ledger.krw_status()['reserved_requests_krw'], 0)

    def test_missing_key_never_creates_pending_reservation(self):
        with mock.patch('yeoul_paid_openrouter_gateway._verify_trusted_live_scope',
                        return_value=None), mock.patch.dict('os.environ', {},
                        clear=True):
            with self.assertRaisesRegex(YeoulPaidDispatchHold,
                                        'inference_key_unavailable'):
                self.gateway.dispatch(
                    policy_request=live_request(self.pol, 'no-key'), body=body())
        self.assertEqual(self.ledger.krw_status()['all_roles_and_runs_attempts'], 0)

    def test_mocked_post_failure_holds_entire_pilot_without_retry(self):
        with (mock.patch('yeoul_paid_openrouter_gateway._verify_trusted_live_scope',
                         return_value=None),
              mock.patch('yeoul_paid_openrouter_gateway._read_existing_credit_for_dispatch',
                         return_value={'sufficient_prepaid_credit_observed': True}),
              mock.patch.dict('os.environ', {'OPENROUTER_API_KEY': 'sk-or-fixture'}),
              mock.patch('yeoul_paid_openrouter_gateway._fixed_host_json',
                         side_effect=YeoulPaidDispatchHold('socket_dropped')) as post):
            with self.assertRaisesRegex(YeoulPaidDispatchHold, 'socket_dropped'):
                self.gateway.dispatch(
                    policy_request=live_request(self.pol, 'failed-post'), body=body())
            post.assert_called_once()
        self.assertEqual(self.ledger.krw_status()['pilot_unreconciled_charges'], 1)
        self.assertEqual(self.ledger.krw_status()['all_roles_and_runs_attempts'], 1)
        again = YeoulKrw500SingleFlightLedger(
            self.ledger.path, run_id='run-another-role',
            max_spend_micro_usd=200000, max_attempts=8,
            role_caps=ROLES, upper_fx_milli_krw_per_usd=1400000,
            fixed_fees_krw=0,
        )
        p2 = live_policy('run-another-role')
        # A different role/run cannot authorize another POST with the same
        # KRW 500 pilot ledger after a network failure.
        with (mock.patch('yeoul_paid_openrouter_gateway._verify_trusted_live_scope',
                         return_value=None),
              mock.patch('yeoul_paid_openrouter_gateway._read_existing_credit_for_dispatch',
                         return_value={'sufficient_prepaid_credit_observed': True}),
              mock.patch.dict('os.environ', {'OPENROUTER_API_KEY': 'sk-or-fixture'}),
              mock.patch('yeoul_paid_openrouter_gateway._fixed_host_json',
                         side_effect=AssertionError('must not send')) as post):
            with self.assertRaisesRegex(BudgetDenied,
                                        'pilot_unreconciled_charge_halts_all_runs'):
                YeoulPaidOpenRouterGateway(
                    again, p2, approved_provider='deepseek',
                    provider_name='DeepSeek',
                ).dispatch(policy_request=live_request(p2, 'second-run'), body=body())
            post.assert_not_called()

    def test_verified_mock_receipt_still_holds_until_payer_reconciliation(self):
        with (mock.patch('yeoul_paid_openrouter_gateway._verify_trusted_live_scope',
                         return_value=None),
              mock.patch('yeoul_paid_openrouter_gateway._read_existing_credit_for_dispatch',
                         return_value={'sufficient_prepaid_credit_observed': True}),
              mock.patch.dict('os.environ', {'OPENROUTER_API_KEY': 'sk-or-fixture'}),
              mock.patch('yeoul_paid_openrouter_gateway._fixed_host_json',
                         return_value={'id': 'gen-test-123', 'model': MODEL}) as post,
              mock.patch('yeoul_paid_openrouter_gateway._generation_metadata',
                         return_value=receipt()) as metadata):
            result = self.gateway.dispatch(
                policy_request=live_request(self.pol, 'unsettled'), body=body())
            post.assert_called_once()
            metadata.assert_called_once_with('gen-test-123', api_key='sk-or-fixture')
        self.assertEqual(result['status'], 'held')
        self.assertTrue(result['billable_dispatch_unreconciled'])
        self.assertEqual(self.ledger.krw_status()['pilot_unreconciled_charges'], 1)
        self.assertEqual(self.ledger.krw_status()['remaining_unverified_krw'], 499)



    def test_management_key_required_before_ledger_and_http(self):
        with (mock.patch('yeoul_paid_openrouter_gateway._verify_trusted_live_scope',
                         return_value=None),
              mock.patch.dict('os.environ', {'OPENROUTER_API_KEY': 'sk-or-inference'},
                              clear=True),
              mock.patch('yeoul_paid_openrouter_gateway._fixed_host_json',
                         side_effect=AssertionError('no provider call')) as network):
            with self.assertRaisesRegex(YeoulPaidDispatchHold,
                                        'management_key_unavailable'):
                self.gateway.dispatch(
                    policy_request=live_request(self.pol, 'without-management'),
                    body=body(),
                )
            network.assert_not_called()
        self.assertEqual(self.ledger.krw_status()['all_roles_and_runs_attempts'], 0)

    def test_same_management_key_cannot_be_spend_and_control_key(self):
        with (mock.patch('yeoul_paid_openrouter_gateway._verify_trusted_live_scope',
                         return_value=None),
              mock.patch.dict('os.environ', {'OPENROUTER_API_KEY': 'sk-or-both',
                                              'OPENROUTER_MANAGEMENT_KEY': 'sk-or-both'},
                              clear=True),
              mock.patch('yeoul_paid_openrouter_gateway._fixed_host_json',
                         side_effect=AssertionError('no provider call')) as network):
            with self.assertRaisesRegex(YeoulPaidDispatchHold,
                                        'same_key_cannot_be_inference_and_management'):
                self.gateway.dispatch(
                    policy_request=live_request(self.pol, 'same-key'), body=body(),
                )
            network.assert_not_called()
        self.assertEqual(self.ledger.krw_status()['all_roles_and_runs_attempts'], 0)

    def test_host_reads_same_account_credit_before_reserving_or_posting(self):
        snapshots_value = snapshots()
        queried = []

        def pretend_get(*, method, path, api_key, body=None):
            queried.append((method, path, api_key))
            self.assertEqual(method, 'GET')
            self.assertIsNone(body)
            if path == '/api/v1/key' and api_key == 'sk-or-inference':
                return snapshots_value['inference_key_snapshot']
            if path == '/api/v1/key' and api_key == 'sk-or-manager':
                return snapshots_value['management_key_snapshot']
            if path == '/api/v1/credits' and api_key == 'sk-or-manager':
                return snapshots_value['credits_snapshot']
            raise AssertionError('unexpected outbound request')

        with (mock.patch('yeoul_paid_openrouter_gateway._verify_trusted_live_scope',
                         return_value=None),
              mock.patch.dict('os.environ', {'OPENROUTER_API_KEY': 'sk-or-inference',
                                             'OPENROUTER_MANAGEMENT_KEY': 'sk-or-manager'},
                              clear=True),
              mock.patch('yeoul_paid_openrouter_gateway._fixed_host_json',
                         side_effect=pretend_get)):
            # Break only AFTER the authenticated GETs; a mock transport
            # failure must stay HELD and block every later paid call.
            with self.assertRaises(AssertionError):
                # Add a deliberately failing metadata step by making GET-only
                # fake reject the subsequent POST.
                self.gateway.dispatch(
                    policy_request=live_request(self.pol, 'credit-verified'),
                    body=body(),
                )
        self.assertEqual(queried, [
            ('GET', '/api/v1/key', 'sk-or-inference'),
            ('GET', '/api/v1/key', 'sk-or-manager'),
            ('GET', '/api/v1/credits', 'sk-or-manager'),
            ('POST', '/api/v1/chat/completions', 'sk-or-inference'),
        ])
        self.assertEqual(self.ledger.krw_status()['pilot_unreconciled_charges'], 1)

    def test_insufficient_credit_denies_before_reservation_or_post(self):
        source = snapshots()
        source['credits_snapshot']['data']['total_usage'] = 0.4
        seen = []

        def pretend_get(*, method, path, api_key, body=None):
            seen.append((method, path))
            if path == '/api/v1/key' and api_key == 'sk-or-inference':
                return source['inference_key_snapshot']
            if path == '/api/v1/key' and api_key == 'sk-or-manager':
                return source['management_key_snapshot']
            if path == '/api/v1/credits' and api_key == 'sk-or-manager':
                return source['credits_snapshot']
            raise AssertionError('paid request not allowed')

        with (mock.patch('yeoul_paid_openrouter_gateway._verify_trusted_live_scope',
                         return_value=None),
              mock.patch.dict('os.environ', {'OPENROUTER_API_KEY': 'sk-or-inference',
                                             'OPENROUTER_MANAGEMENT_KEY': 'sk-or-manager'},
                              clear=True),
              mock.patch('yeoul_paid_openrouter_gateway._fixed_host_json',
                         side_effect=pretend_get)):
            with self.assertRaisesRegex(CreditPreflightHold,
                                        'existing_prepaid_credit_insufficient'):
                self.gateway.dispatch(
                    policy_request=live_request(self.pol, 'no-credit'), body=body(),
                )
        self.assertNotIn(('POST', '/api/v1/chat/completions'), seen)
        self.assertEqual(self.ledger.krw_status()['all_roles_and_runs_attempts'], 0)

    def test_non_strict_ledger_and_mismatched_provider_rejected(self):
        with self.assertRaisesRegex(YeoulPaidDispatchHold, 'strict_krw500_ledger_required'):
            YeoulPaidOpenRouterGateway(object(), self.pol,
                                       approved_provider='fake-provider',
                                       provider_name='DeepSeek')
        with self.assertRaisesRegex(YeoulPaidDispatchHold, 'provider_evidence_not_verified'):
            YeoulPaidOpenRouterGateway(self.ledger, self.pol,
                                       approved_provider='other',
                                       provider_name='DeepSeek')

    def test_request_body_is_exactly_pinned_and_bounded(self):
        self.assertIn(MODEL.encode(), _check_body(
            body(), expected_provider='deepseek', max_output_tokens=48))
        for mutator in (
            lambda p: p.update(model='other/model'),
            lambda p: p.update(stream=True),
            lambda p: p.update(tools=[]),
            lambda p: p.update(max_tokens=300),
            lambda p: p['provider'].update(allow_fallbacks=True),
            lambda p: p['provider'].update(only=['deepseek', 'other']),
            lambda p: p['messages'][0].update(image_url='example'),
        ):
            value = body()
            mutator(value)
            with self.assertRaises(YeoulPaidDispatchHold):
                _check_body(value, expected_provider='deepseek',
                            max_output_tokens=48)

    def test_mocked_http_stays_on_openrouter_with_no_redirect_or_retry(self):
        opener = _FakeOpener(b'{"id":"gen-test-123"}')
        with mock.patch('yeoul_paid_openrouter_gateway.http.build_opener',
                        return_value=opener):
            value = _fixed_host_json(
                method='POST', path='/api/v1/chat/completions',
                api_key='sk-or-test', body=b'{"model":"synthetic"}',
            )
        self.assertEqual(value['id'], 'gen-test-123')
        self.assertEqual(opener.calls, [
            ('https://openrouter.ai/api/v1/chat/completions', 'POST', 15),
        ])
        with self.assertRaisesRegex(YeoulPaidDispatchHold, 'unapproved_http_operation'):
            _fixed_host_json(
                method='POST', path='https://evil.example/', api_key='sk-or-test',
                body=b'{}',
            )

    def test_generation_metadata_requires_safe_id_and_fixed_get_path(self):
        for bad in ('../secret', 'id&role=owner', '', '🤖', ' '):
            with self.assertRaisesRegex(YeoulPaidDispatchHold, 'generation_id_unverified'):
                _generation_metadata(bad, api_key='sk-or-test')
        opener = _FakeOpener(b'{"data":{"id":"gen-123"}}')
        with mock.patch('yeoul_paid_openrouter_gateway.http.build_opener',
                        return_value=opener):
            self.assertEqual(
                _generation_metadata('gen-123', api_key='sk-or-test')['data']['id'],
                'gen-123')
        self.assertEqual(opener.calls[0][0],
                         'https://openrouter.ai/api/v1/generation?id=gen-123')

    def test_receipt_stays_held_even_when_provider_metadata_matches(self):
        result = _check_generation(
            {'id': 'gen-test-123', 'model': MODEL}, receipt(),
            request_id='r1', expected_provider='deepseek',
            expected_provider_name='DeepSeek', reserved_micro_usd=300,
            max_input_tokens=128, max_output_tokens=64, max_reasoning_tokens=0,
        )
        self.assertFalse(result['settlement_authorized'])
        for broken in (
            lambda p: p['data'].update(provider_name='Other'),
            lambda p: p['data'].update(native_tokens_completion=65),
            lambda p: p['data'].update(num_search_results=1),
            lambda p: p['data'].update(total_cost=0.001),
            lambda p: p['data'].update(is_byok=True),
            lambda p: p['data'].update(native_tokens_reasoning=None),
        ):
            value = receipt()
            broken(value)
            with self.assertRaises(YeoulPaidDispatchHold):
                _check_generation(
                    {'id': 'gen-test-123', 'model': MODEL}, value,
                    request_id='r1', expected_provider='deepseek',
                    expected_provider_name='DeepSeek', reserved_micro_usd=300,
                    max_input_tokens=128, max_output_tokens=64,
                    max_reasoning_tokens=0,
                )
