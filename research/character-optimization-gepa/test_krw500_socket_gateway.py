"""Synthetic guarded Unix socket tests: no model provider and no paid authority."""
from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
import tempfile
import threading
import unittest

from budget_ledger import BudgetDenied
from governed_dry_run import GovernedDryRunGate
from krw500_synthetic_ledger import YeoulKrw500SyntheticLedger
from local_socket_gateway import LocalSocketGateway, SocketGatewayError, handle_request, submit
from test_krw500_synthetic_ledger import policy, request
from yeoul_krw500_socket_daemon import build_synthetic_krw500_gateway

ROLE_CAPS = {'student': 8, 'reflection': 8, 'judge': 8, 'holdout': 8}


def fake_response(*, model='synthetic/deepseek', provider='fake-provider', success=True):
    return {
        'provider': provider, 'model': model,
        'input_tokens': 500, 'output_tokens': 100, 'reasoning_tokens': 20,
        'actual_micro_usd': 760 if success else None,
        'successful': success,
    }


def guarded_request(pol, name='first', role='student', *, fixture=None):
    return {
        'kind': 'governed_dry_run',
        'request': request(pol, name, role),
        'fixture': fake_response() if fixture is None else fixture,
    }


def legacy_request(name='legacy'):
    return {
        'request_id': name, 'role': 'student',
        'model_id': 'synthetic/deepseek', 'max_charge_micro_usd': 100,
        'fixture': {
            'provider': 'fake-provider', 'model': 'synthetic/deepseek',
            'actual_micro_usd': 50, 'successful': True,
        },
    }


class Krw500OnlyGatewayTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.path = self.root / 'ledger.sqlite'
        self.socket_path = self.root / 'krw500.sock'
        self.policy = policy('yeoul-krw500-socket-fixture')
        self.ledger = self._ledger()
        self.governed = GovernedDryRunGate(self.ledger, self.policy)

    def _ledger(self):
        return YeoulKrw500SyntheticLedger(
            self.path, run_id='yeoul-krw500-socket-fixture',
            max_spend_micro_usd=200000, max_attempts=30,
            role_caps=ROLE_CAPS,
            upper_fx_milli_krw_per_usd=1400000,
            fixed_fees_krw=498,
        )

    @contextmanager
    def server(self, gate=None, *, governed=None):
        with LocalSocketGateway(
            self.socket_path, gate, self.governed if governed is None else governed,
            krw500_only=True,
        ) as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                yield
            finally:
                server.shutdown()
                thread.join(timeout=5)

    def test_only_protected_governed_path_can_use_shared_500_krw_cap(self):
        with self.server():
            first = submit(str(self.socket_path), guarded_request(self.policy))
            self.assertTrue(first['ok'], first)
            self.assertEqual(first['result']['state'], 'settled')
            self.assertEqual(first['result']['external_calls'], 0)
            second = submit(str(self.socket_path), guarded_request(self.policy, 'second', 'reflection'))
            self.assertFalse(second['ok'])
            self.assertEqual(second['error'], 'BudgetDenied')
            bypass = submit(str(self.socket_path), legacy_request())
            self.assertFalse(bypass['ok'])
            self.assertEqual(bypass['error'], 'SocketGatewayError')
        status = self.ledger.krw_status()
        self.assertEqual(status['reserved_requests_krw'], 2)
        self.assertEqual(status['fixed_fees_ceiling_krw'], 498)
        self.assertEqual(status['remaining_unverified_krw'], 0)
        self.assertEqual(status['all_roles_and_runs_attempts'], 1)
        self.assertEqual(status['external_calls'], 0)

    def test_legacy_route_cannot_spend_even_if_fixture_looks_valid(self):
        with self.server():
            for payload in [
                legacy_request('legacy'),
                {'kind': 'legacy_request', 'request': legacy_request(), 'fixture': fake_response()},
                {'kind': 'governed_dry_run', 'request': legacy_request(), 'fixture': fake_response()},
            ]:
                output = submit(str(self.socket_path), payload)
                self.assertFalse(output['ok'])
        self.assertEqual(self.ledger.krw_status()['all_roles_and_runs_attempts'], 0)

    def test_claimed_owner_approval_and_raw_user_messages_never_enter_socket(self):
        with self.server():
            for mutated in [
                {**request(self.policy, 'claim'), 'approvalRef': 'forged-owner-signature'},
                {**request(self.policy, 'raw'), 'user_message': 'PRIVATE HUMAN TEXT'},
            ]:
                item = {'kind': 'governed_dry_run', 'request': mutated, 'fixture': fake_response()}
                reply = submit(str(self.socket_path), item)
                self.assertFalse(reply['ok'])
                self.assertNotIn('PRIVATE HUMAN TEXT', str(reply))
                self.assertNotIn('forged-owner-signature', str(reply))
        self.assertEqual(self.ledger.krw_status()['all_roles_and_runs_attempts'], 0)

    def test_gateway_constructor_refuses_unguarded_or_missing_protected_ledger(self):
        with self.assertRaisesRegex(SocketGatewayError, 'krw500_protected_route_required'):
            LocalSocketGateway(self.socket_path, None, krw500_only=True)
        with self.assertRaisesRegex(SocketGatewayError, 'krw500_protected_route_required'):
            LocalSocketGateway(self.socket_path, object(), self.governed, krw500_only=True)
        with self.assertRaisesRegex(SocketGatewayError, 'legacy_synthetic_gate_required'):
            LocalSocketGateway(self.socket_path, None)
        with self.assertRaisesRegex(SocketGatewayError, 'krw500_protected_route_required'):
            handle_request(None, legacy_request(), governed_gate=None, krw500_only=True)
        self.assertFalse(self.socket_path.exists())

    def test_unknown_synthetic_charge_holds_ledger_and_stops_later_attempt(self):
        with self.server():
            first = submit(str(self.socket_path), guarded_request(
                self.policy, 'unknown-charge', fixture=fake_response(success=False)))
            self.assertFalse(first['ok'])
            again = submit(str(self.socket_path), guarded_request(self.policy, 'following', 'judge'))
            self.assertFalse(again['ok'])
        status = self.ledger.krw_status()
        self.assertEqual(status['all_roles_and_runs_attempts'], 1)
        self.assertEqual(status['reserved_requests_krw'], 2)
        self.assertEqual(self.ledger.status()['held'], 1)

    def test_restart_keeps_owner_declared_budget_without_resetting(self):
        with self.server():
            first = submit(str(self.socket_path), guarded_request(self.policy))
            self.assertTrue(first['ok'])
        reloaded = self._ledger()
        self.governed = GovernedDryRunGate(reloaded, self.policy)
        with self.server():
            second = submit(str(self.socket_path), guarded_request(self.policy, 'after-restart'))
            self.assertFalse(second['ok'])
        self.assertEqual(reloaded.krw_status()['remaining_unverified_krw'], 0)


    def test_dedicated_fixture_daemon_pins_500_krw_and_disables_legacy(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            ledger, pol, guarded = build_synthetic_krw500_gateway(directory / 'db.sqlite')
            self.assertEqual(ledger.krw_status()['owner_declared_total_cap_krw'], 500)
            self.assertFalse(ledger.krw_status()['external_calls_authorized'])
            path = directory / 'guarded.sock'
            with LocalSocketGateway(path, None, governed_gate=guarded,
                                    krw500_only=True) as server:
                worker = threading.Thread(target=server.serve_forever, daemon=True)
                worker.start()
                try:
                    self.assertFalse(submit(str(path), legacy_request())['ok'])
                    ok = submit(str(path), guarded_request(pol))
                    self.assertTrue(ok['ok'], ok)
                    self.assertEqual(ok['result']['external_calls'], 0)
                    self.assertFalse(submit(str(path), guarded_request(pol, 'again'))['ok'])
                finally:
                    server.shutdown()
                    worker.join(timeout=5)
            self.assertEqual(ledger.krw_status()['reserved_requests_krw'], 2)


if __name__ == '__main__':
    unittest.main()
