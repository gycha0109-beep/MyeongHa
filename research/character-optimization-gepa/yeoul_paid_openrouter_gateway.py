"""Closed-by-default OpenRouter paid sender for the Yeoul KRW 500 research pilot.

The sole public dispatch path requires the project's verified approval issuer.
That issuer is NOT wired yet; require_authenticated_paid_approval always HOLDs.
The network implementation below is intentionally unreachable in production
until trusted approval + live tariff + token accounting are actually integrated.
No method in this module purchases or auto-tops-up credits.
"""
from __future__ import annotations

import json
import os
from urllib import error, parse, request as http
from budget_ledger import BudgetDenied
from governed_dry_run import DryRunPolicy, PolicyDenied
from krw500_synthetic_ledger import YeoulKrw500SingleFlightLedger
from approval_scope import require_authenticated_paid_approval

MODEL = 'deepseek/deepseek-v4.1-flash-1017'
HOST = 'https://openrouter.ai'
MAX_BYTES = 256 * 1024
MAX_INPUT_CHARS = 16_000
PROVIDER_KEYS = {'only', 'allow_fallbacks', 'require_parameters',
                 'zdr', 'data_collection'}


class YeoulPaidDispatchHold(ValueError):
    pass


def _deny(reason: str):
    raise YeoulPaidDispatchHold(reason)


def _check_body(body, *, expected_provider, max_output_tokens):
    """Review the complete body before any reservation; no caller-added routes."""
    if not isinstance(body, dict) or set(body) != {
        'model', 'messages', 'max_tokens', 'stream', 'provider',
    }:
        _deny('unrecognized_live_body_field')
    if body['model'] != MODEL or body['stream'] is not False:
        _deny('model_or_stream_mismatch')
    if type(max_output_tokens) is not int or not 1 <= max_output_tokens <= 256:
        _deny('invalid_output_cap')
    if type(body['max_tokens']) is not int or body['max_tokens'] != max_output_tokens:
        _deny('output_cap_mismatch')
    provider = body['provider']
    if (not isinstance(expected_provider, str) or not expected_provider
            or not isinstance(provider, dict) or set(provider) != PROVIDER_KEYS
            or provider != {
                'only': [expected_provider],
                'allow_fallbacks': False, 'require_parameters': True,
                'zdr': True, 'data_collection': 'deny',
            }):
        _deny('provider_not_strictly_pinned')
    messages = body['messages']
    if not isinstance(messages, list) or not 2 <= len(messages) <= 12:
        _deny('invalid_messages')
    total = 0
    for item in messages:
        if (not isinstance(item, dict) or set(item) != {'role', 'content'}
                or item['role'] not in {'system', 'assistant', 'user'}
                or not isinstance(item['content'], str)
                or not item['content'].strip()):
            _deny('unsupported_message_content')
        total += len(item['content'])
        if len(item['content']) > 8000 or total > MAX_INPUT_CHARS:
            _deny('input_size_limit')
    if (messages[0]['role'] != 'system' or messages[1]['role'] != 'user'
            or messages[-1]['role'] != 'user'):
        _deny('message_order')
    return json.dumps(body, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


class _NoRedirect(http.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _deny('provider_redirect_not_allowed')


def _fixed_host_json(*, method, path, api_key, body=None):
    """Single fixed-origin sender. No generic URL, redirects or automatic retry."""
    if method not in ('GET', 'POST') or path not in (
        '/api/v1/chat/completions', '/api/v1/generation',
    ):
        _deny('unapproved_http_operation')
    if ((method == 'POST') != (path == '/api/v1/chat/completions')):
        _deny('unapproved_http_method')
    if not isinstance(api_key, str) or not api_key.startswith('sk-or-') or len(api_key) > 512:
        _deny('inference_key_unavailable')
    if method == 'POST' and (not isinstance(body, bytes) or not 1 <= len(body) <= MAX_BYTES):
        _deny('invalid_body_size')
    if method == 'GET' and body is not None:
        _deny('get_body_forbidden')
    req = http.Request(HOST + path, data=body, method=method, headers={
        'Authorization': 'Bearer ' + api_key,
        'Accept': 'application/json',
        **({'Content-Type': 'application/json'} if method == 'POST' else {}),
    })
    try:
        with http.build_opener(_NoRedirect).open(req, timeout=15) as res:
            if res.status != 200 or not res.headers.get('content-type', '').lower().startswith('application/json'):
                _deny('unverified_provider_http_response')
            raw = res.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                _deny('provider_response_too_large')
            parsed = json.loads(raw.decode('utf-8', 'strict'))
            if not isinstance(parsed, dict):
                _deny('provider_response_not_object')
            return parsed
    except (error.HTTPError, error.URLError, ValueError, UnicodeError, OSError):
        _deny('provider_network_or_receipt_unverifiable')


def _generation_metadata(generation_id, *, api_key):
    if not isinstance(generation_id, str) or not 1 <= len(generation_id) <= 120:
        _deny('generation_id_unverified')
    if not all(ch.isascii() and (ch.isalnum() or ch in '-_') for ch in generation_id):
        _deny('generation_id_unverified')
    # The only permitted query string is a validated generation ID.
    return _fixed_host_generation_get(generation_id, api_key)


def _fixed_host_generation_get(generation_id, api_key):
    # No caller-controlled origin: query is URL-encoded after ID validation.
    url = HOST + '/api/v1/generation?' + parse.urlencode({'id': generation_id})
    req = http.Request(url, method='GET', headers={
        'Authorization': 'Bearer ' + api_key, 'Accept': 'application/json',
    })
    try:
        with http.build_opener(_NoRedirect).open(req, timeout=15) as res:
            if res.status != 200 or not res.headers.get('content-type', '').lower().startswith('application/json'):
                _deny('generation_receipt_unavailable')
            raw = res.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                _deny('generation_receipt_oversize')
            result = json.loads(raw.decode('utf-8', 'strict'))
            if not isinstance(result, dict) or not isinstance(result.get('data'), dict):
                _deny('generation_receipt_shape')
            return result
    except (error.HTTPError, error.URLError, ValueError, UnicodeError, OSError):
        _deny('generation_receipt_network_failure')


def _check_generation(completion, metadata, *, request_id, expected_provider,
                      expected_provider_name, reserved_micro_usd,
                      max_input_tokens, max_output_tokens, max_reasoning_tokens):
    """Evidence check only; never authorizes settlement of real charges."""
    if not isinstance(completion, dict) or not isinstance(metadata, dict):
        _deny('missing_generation_evidence')
    doc = metadata.get('data')
    if not isinstance(doc, dict):
        _deny('missing_generation_evidence')
    if (completion.get('id') != doc.get('id')
            or completion.get('model') != MODEL or doc.get('model') != MODEL
            or doc.get('provider_name') != expected_provider_name
            or doc.get('is_byok') is not False or doc.get('cancelled') is not False):
        _deny('generation_identity_or_provider_drift')
    if not isinstance(request_id, str) or not request_id:
        _deny('request_identity')
    for name, cap in (
        ('native_tokens_prompt', max_input_tokens),
        ('native_tokens_completion', max_output_tokens),
        ('native_tokens_reasoning', max_reasoning_tokens),
    ):
        n = doc.get(name)
        if type(n) is not int or n < 0 or n > cap:
            _deny('unverified_native_tokens')
    for name in ('num_fetches', 'num_search_results', 'num_media_prompt',
                 'num_media_completion', 'num_input_audio_prompt',
                 'native_tokens_completion_images'):
        if doc.get(name) != 0 or type(doc.get(name)) is not int:
            _deny('unpriced_usage_component')
    cost = doc.get('total_cost')
    if type(cost) not in (float, int) or not 0 <= cost <= reserved_micro_usd / 1_000_000:
        _deny('unverified_or_over_budget_charge')
    return {'metadata_consistent': True, 'settlement_authorized': False}


class YeoulPaidOpenRouterGateway:
    """The only public gateway dispatch path: verify, reserve, send, then HOLD.

    Important: No live authority/tariff is currently configured. The approval
    guard executes BEFORE the ledger write and BEFORE the HTTP network call.
    """

    def __init__(self, ledger, policy, *, approved_provider, provider_name):
        if (not isinstance(ledger, YeoulKrw500SingleFlightLedger)
                or not isinstance(policy, DryRunPolicy)
                or ledger.run_id != policy.run_id):
            _deny('strict_krw500_ledger_required')
        if (approved_provider != policy.provider or not isinstance(provider_name, str)
                or not provider_name):
            _deny('provider_evidence_not_verified')
        self.ledger, self.policy = ledger, policy
        self.provider, self.provider_name = approved_provider, provider_name

    def dispatch(self, *, policy_request, body):
        # This function intentionally cannot pass with the current authority
        # source. Never infer a grant from the user's 500-KRW ceiling alone.
        require_authenticated_paid_approval(claim_ref=None)
        if self.policy.model_id != MODEL or self.policy.pricing['source'].startswith('synthetic-fixture:'):
            _deny('authenticated_live_tariff_missing')
        expected = self.policy.preflight(policy_request)
        payload = _check_body(body, expected_provider=self.provider,
                              max_output_tokens=policy_request['max_output_tokens'])
        # Current tokenizer is not attested; a character count is not a
        # certified input-token bound and must never be treated as one.
        _deny('trusted_input_token_ceiling_unavailable')
        # Future network step (unreachable until the authority + tokenizer
        # verifier are implemented) must reserve before sending, never retry,
        # and HOLD all unknown charges. No raw completion is logged.
        self.ledger.reserve_controlled(self.policy, policy_request, expected)
        key = os.environ.get('OPENROUTER_API_KEY')
        try:
            completion = _fixed_host_json(method='POST', path='/api/v1/chat/completions',
                                          api_key=key, body=payload)
            metadata = _generation_metadata(completion.get('id'), api_key=key)
            _check_generation(
                completion, metadata, request_id=policy_request['request_id'],
                expected_provider=self.provider, expected_provider_name=self.provider_name,
                reserved_micro_usd=expected,
                max_input_tokens=policy_request['max_input_tokens'],
                max_output_tokens=policy_request['max_output_tokens'],
                max_reasoning_tokens=policy_request['max_reasoning_tokens'],
            )
            # Even a matching metadata response does not verify all KRW charges.
            self.ledger.hold(policy_request['request_id'])
            return {'status': 'held', 'billable_dispatch_unreconciled': True,
                    'external_call_result_confirmed': True}
        except Exception:
            try:
                self.ledger.hold(policy_request['request_id'])
            except BudgetDenied:
                pass
            raise
