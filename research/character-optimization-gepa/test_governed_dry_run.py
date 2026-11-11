"""Negative tests: fake tariff/receipt only; no paid API calls."""
import concurrent.futures
import pathlib
import threading
import tempfile
import unittest
from budget_ledger import BudgetDenied
from offline_egress_gate import OfflineEgressGate
from local_socket_gateway import LocalSocketGateway, submit
from governed_dry_run import (
    DryRunPolicy, GovernedBudgetLedger, GovernedDryRunGate, PolicyDenied
)


def policy(**overrides):
    base = dict(
        run_id='offline-test', target_id='yeoul',
        model_id='synthetic/deepseek', settings_hash='sha256:fixed-synthetic-settings',
        provider='fake-provider',
        pricing=dict(source='synthetic-fixture:non-authoritative', version='test-v1',
                     effective_epoch=1, expires_epoch=4102444800,
                     input_rate=1000000, output_rate=2000000,
                     reasoning_rate=3000000, fixed_max_micro_usd=10),
        routing=dict(only=['fake-provider'], allow_fallbacks=False,
                     require_parameters=True, zdr=True, data_collection='deny'),
        limits=dict(input_tokens=1000, output_tokens=200, reasoning_tokens=100,
                    max_parallel=2, max_attempts_per_operation=2),
        allowed_roles=frozenset({'student', 'reflection'})
    )
    base.update(overrides)
    return DryRunPolicy(**base)


def req(p, *, rid='id-1', operation='turn-1', attempt=1, **overrides):
    o = dict(run_id=p.run_id, request_id=rid, operation_id=operation,
             attempt_number=attempt, role='student', target_id=p.target_id,
             model_id=p.model_id, settings_hash=p.settings_hash,
             pricing_hash=p.pricing_hash, routing_hash=p.routing_hash,
             max_input_tokens=500, max_output_tokens=100, max_reasoning_tokens=20)
    o.update(overrides)
    return o


def receipt(p, **overrides):
    o = dict(provider=p.provider, model=p.model_id, input_tokens=100,
             output_tokens=50, reasoning_tokens=5,
             actual_micro_usd=300, successful=True)
    o.update(overrides)
    return o


class GovernedDryRunTests(unittest.TestCase):
    def setup_gate(self, directory, p=None, **kw):
        p = p or policy()
        ledger = GovernedBudgetLedger(pathlib.Path(directory) / 'ledger.sqlite',
            run_id=p.run_id, max_spend_micro_usd=kw.get('spend', 5000),
            max_attempts=kw.get('attempts', 6),
            role_caps={'student': 6, 'reflection': 2, 'judge': 0, 'holdout': 0})
        return GovernedDryRunGate(ledger, p)

    def test_conservative_token_quote_and_settlement(self):
        with tempfile.TemporaryDirectory() as d:
            g = self.setup_gate(d)
            out = g.simulate(req(g.policy), receipt(g.policy), now=100)
            self.assertEqual(out['reserved_micro_usd'], 770)
            self.assertEqual(out['actual_micro_usd'], 300)
            self.assertEqual(out['external_calls'], 0)
            self.assertEqual(out['approval_state'], 'synthetic_only')
            self.assertEqual(g.ledger.status()['reserved_micro_usd'], 770)

    def test_no_client_approval_ref_and_no_raw_messages(self):
        p = policy()
        for field in ('approvalRef', 'user_message', 'raw_response', 'provider'):
            with self.subTest(field=field), self.assertRaises(PolicyDenied):
                p.preflight(req(p, **{field: 'fake'}), now=100)

    def test_token_role_model_hash_price_and_expiry_rejection_before_reservation(self):
        with tempfile.TemporaryDirectory() as d:
            g = self.setup_gate(d)
            for field, value in [
                ('max_input_tokens', 1001), ('max_output_tokens', 201),
                ('max_reasoning_tokens', 101), ('max_input_tokens', True),
                ('role', 'judge'), ('model_id', 'unapproved'),
                ('settings_hash', 'changed'), ('pricing_hash', 'obsolete'),
                ('routing_hash', 'fallback-change'), ('target_id', 'seyeon')
            ]:
                with self.subTest(field=field, value=value), self.assertRaises(PolicyDenied):
                    g.simulate(req(g.policy, **{field: value}), receipt(g.policy), now=100)
            with self.assertRaises(PolicyDenied):
                g.simulate(req(g.policy), receipt(g.policy), now=4102444800)
            self.assertEqual(g.ledger.status()['attempts'], 0)

    def test_provider_drift_unknown_charge_and_token_overflow_are_held(self):
        for change in [
            {'provider': 'other'}, {'model': 'wrong'}, {'actual_micro_usd': None},
            {'successful': False}, {'input_tokens': 501}, {'actual_micro_usd': 1}
        ]:
            with self.subTest(change=change), tempfile.TemporaryDirectory() as d:
                g = self.setup_gate(d)
                with self.assertRaises(PolicyDenied):
                    g.simulate(req(g.policy), receipt(g.policy, **change), now=100)
                self.assertEqual(g.ledger.status()['held'], 1)

    def test_duplicate_retry_limit_and_held_charge_never_refunded(self):
        with tempfile.TemporaryDirectory() as d:
            g = self.setup_gate(d)
            with self.assertRaises(PolicyDenied):
                g.simulate(req(g.policy),
                           receipt(g.policy, actual_micro_usd=None), now=100)
            with self.assertRaises(BudgetDenied):
                g.simulate(req(g.policy), receipt(g.policy), now=100)
            r2 = req(g.policy, rid='id-2', attempt=2)
            with self.assertRaisesRegex(BudgetDenied, 'unreconciled_charge_halts_run'):
                g.simulate(r2, receipt(g.policy), now=100)
            with self.assertRaises(PolicyDenied):
                g.simulate(req(g.policy, rid='id-3', attempt=3),
                           receipt(g.policy), now=100)
            self.assertEqual(g.ledger.status()['attempts'], 1)
            self.assertEqual(g.ledger.status()['held'], 1)
            reopened = self.setup_gate(d)
            with self.assertRaisesRegex(BudgetDenied, 'unreconciled_charge_halts_run'):
                reopened.simulate(req(g.policy, rid='after-restart', operation='new-turn'),
                                  receipt(g.policy), now=100)

    def test_host_owned_policy_is_detached_and_deeply_read_only(self):
        source = policy()
        mutable_pricing = dict(source.pricing)
        mutable_routing = dict(source.routing)
        mutable_routing['only'] = list(source.routing['only'])
        mutable_limits = dict(source.limits)
        p = policy(pricing=mutable_pricing, routing=mutable_routing,
                   limits=mutable_limits)
        hashes = p.policy_hash, p.pricing_hash, p.routing_hash
        original_quote = p.quote(500, 100, 20)

        # Mutating the objects handed to the constructor must not change the
        # policy used for preflight, pricing, or a persisted ledger reservation.
        mutable_pricing['input_rate'] = 999999999
        mutable_routing['only'].append('unapproved-provider')
        mutable_routing['zdr'] = False
        mutable_limits['input_tokens'] = 1
        mutable_limits['max_parallel'] = 999
        self.assertEqual((p.policy_hash, p.pricing_hash, p.routing_hash), hashes)
        self.assertEqual(p.routing['only'], ('fake-provider',))
        self.assertEqual(p.limits['max_parallel'], 2)
        self.assertEqual(p.quote(500, 100, 20), original_quote)
        self.assertEqual(p.preflight(req(p), now=100), 770)
        with self.assertRaises(TypeError):
            p.pricing['input_rate'] = 1
        with self.assertRaises(TypeError):
            p.routing['only'][0] = 'unapproved-provider'
        with self.assertRaises(TypeError):
            p.routing['zdr'] = False
        with self.assertRaises(TypeError):
            p.limits['input_tokens'] = 99999
        with self.assertRaises(AttributeError):
            p.routing['only'].append('unapproved-provider')

        # Immutable in-memory representation must keep prior on-disk hash
        # semantics (lists in JSON, not tuple stringification).
        rebuilt = policy(pricing=dict(p.pricing),
                         routing={**p.routing, 'only': list(p.routing['only'])},
                         limits=dict(p.limits))
        self.assertEqual(rebuilt.policy_hash, hashes[0])
        with tempfile.TemporaryDirectory() as directory:
            g = self.setup_gate(directory, p)
            result = g.simulate(req(p), receipt(p), now=100)
            self.assertEqual(result['reserved_micro_usd'], 770)
            self.assertEqual(g.ledger.status()['attempts'], 1)

    def test_run_config_change_rejected_after_restart(self):
        with tempfile.TemporaryDirectory() as d:
            g = self.setup_gate(d)
            g.simulate(req(g.policy), receipt(g.policy), now=100)
            changed = policy(pricing=dict(g.policy.pricing, output_rate=2100000))
            other = self.setup_gate(d, changed)
            with self.assertRaises(BudgetDenied):
                other.simulate(req(changed, rid='id-2', operation='turn-2'),
                               receipt(changed), now=100)

    def test_atomic_parallel_limit_and_budget_cap(self):
        with tempfile.TemporaryDirectory() as d:
            p = policy()
            g = self.setup_gate(d, p, spend=2000)
            def reserve(i):
                r = req(p, rid=f'id-{i}', operation=f'turn-{i}')
                return g.ledger.reserve_controlled(p, r, p.preflight(r, now=100))
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                results = []
                for future in [pool.submit(reserve, i) for i in range(4)]:
                    try:
                        results.append(future.result())
                    except BudgetDenied:
                        pass
            self.assertEqual(len(results), 2)
            self.assertEqual(g.ledger.status()['reserved_micro_usd'], 1540)
            self.assertEqual(g.ledger.status()['attempts'], 2)
            reopened = self.setup_gate(d, p, spend=2000)
            self.assertEqual(reopened.ledger.status()['attempts'], 2)

    def test_reject_unauthorized_pricing_and_fallback(self):
        with self.assertRaises(PolicyDenied):
            policy(pricing=dict(policy().pricing, source='openrouter:unchecked'))
        with self.assertRaises(PolicyDenied):
            policy(routing=dict(policy().routing, allow_fallbacks=True))
        with self.assertRaises(PolicyDenied):
            policy(routing=dict(policy().routing, only=['fake-provider', 'another']))

    def test_shared_unix_socket_governed_path_and_rejected_approval_claim(self):
        with tempfile.TemporaryDirectory() as d:
            p = policy()
            g = self.setup_gate(d, p)
            legacy = OfflineEgressGate(g.ledger, approved_models={p.model_id: p.provider})
            path = pathlib.Path(d) / 'gate.sock'
            with LocalSocketGateway(path, legacy, governed_gate=g) as server:
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                try:
                    item = {'kind': 'governed_dry_run', 'request': req(p),
                            'fixture': receipt(p)}
                    outcome = submit(str(path), item)
                    self.assertTrue(outcome['ok'], outcome)
                    self.assertEqual(outcome['result']['external_calls'], 0)
                    self.assertEqual(outcome['result']['approval_state'], 'synthetic_only')
                    self.assertFalse(submit(str(path), item)['ok'])
                    item['request']['approvalRef'] = 'self-approved'
                    self.assertFalse(submit(str(path), item)['ok'])
                    self.assertEqual(g.ledger.status()['attempts'], 1)
                finally:
                    server.shutdown()
                    thread.join(timeout=5)


if __name__ == '__main__':
    unittest.main()
