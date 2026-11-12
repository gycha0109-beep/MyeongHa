"""Synthetic gate rehearsals against the real SQLite ledger; no HTTP calls."""
import pathlib
import tempfile
import unittest
from budget_ledger import BudgetLedger, BudgetDenied
from offline_egress_gate import OfflineEgressGate, EgressDenied, SyntheticResponse


class EgressGateTests(unittest.TestCase):
    def create_gate(self, directory, *, cap=150):
        ledger = BudgetLedger(pathlib.Path(directory) / 'research-ledger.sqlite',
            run_id='synthetic-egress-01', max_spend_micro_usd=cap, max_attempts=5,
            role_caps={'student': 2, 'reflection': 2, 'judge': 1, 'holdout': 1})
        return OfflineEgressGate(ledger, approved_models={
            'synthetic/deepseek': 'fake-provider-01', 'synthetic/reflector': 'fake-provider-02'})

    @staticmethod
    def response(model='synthetic/deepseek', provider='fake-provider-01', cost=40):
        return SyntheticResponse(provider=provider, model=model, actual_micro_usd=cost)

    def test_all_roles_use_one_cost_ledger(self):
        with tempfile.TemporaryDirectory() as d:
            gate = self.create_gate(d, cap=100)
            a = gate.simulate(request_id='student-1', role='student',model_id='synthetic/deepseek',
                              max_charge_micro_usd=60,fixture=self.response())
            self.assertEqual(a['external_calls'], 0)
            with self.assertRaises(BudgetDenied):
                gate.simulate(request_id='reflection-1', role='reflection',model_id='synthetic/reflector',
                    max_charge_micro_usd=50,fixture=self.response('synthetic/reflector','fake-provider-02'))
            self.assertEqual(gate.ledger.status()['reserved_micro_usd'], 60)

    def test_duplicate_request_never_replays(self):
        with tempfile.TemporaryDirectory() as d:
            gate=self.create_gate(d)
            kw=dict(request_id='student-1',role='student',model_id='synthetic/deepseek',
                    max_charge_micro_usd=70,fixture=self.response())
            gate.simulate(**kw)
            with self.assertRaises(EgressDenied):gate.simulate(**kw)
            self.assertEqual(gate.ledger.status()['attempts'], 1)

    def test_provider_or_model_mismatch_holds_reservation(self):
        with tempfile.TemporaryDirectory() as d:
            gate=self.create_gate(d)
            with self.assertRaises(EgressDenied):gate.simulate(request_id='bad-provider',role='student',
                model_id='synthetic/deepseek',max_charge_micro_usd=80,
                fixture=self.response(provider='unexpected-provider'))
            self.assertEqual(gate.ledger.status()['held'],1)
            with self.assertRaises(BudgetDenied):gate.simulate(request_id='later',role='student',
                model_id='synthetic/deepseek',max_charge_micro_usd=80,fixture=self.response())

    def test_unknown_charge_and_failed_request_hold(self):
        with tempfile.TemporaryDirectory() as d:
            gate=self.create_gate(d)
            with self.assertRaises(EgressDenied):gate.simulate(request_id='uncertain',role='reflection',
                model_id='synthetic/reflector',max_charge_micro_usd=40,
                fixture=SyntheticResponse('fake-provider-02','synthetic/reflector',None))
            self.assertEqual(gate.ledger.status()['held'],1)

    def test_over_reserved_charge_holds(self):
        with tempfile.TemporaryDirectory() as d:
            gate=self.create_gate(d)
            with self.assertRaises(BudgetDenied):gate.simulate(request_id='over',role='student',
                model_id='synthetic/deepseek',max_charge_micro_usd=30,fixture=self.response(cost=31))
            self.assertEqual(gate.ledger.status()['held'],1)

    def test_reject_unapproved_model_and_non_synthetic_response_before_reserve(self):
        with tempfile.TemporaryDirectory() as d:
            gate=self.create_gate(d)
            with self.assertRaises(EgressDenied):gate.simulate(request_id='no',role='student',
                model_id='model/not-allowed',max_charge_micro_usd=30,fixture=self.response())
            with self.assertRaises(EgressDenied):gate.simulate(request_id='no',role='judge',
                model_id='synthetic/deepseek',max_charge_micro_usd=30,fixture={'cost':0})
            self.assertEqual(gate.ledger.status()['attempts'],0)

    def test_gate_has_no_provider_network_sender(self):
        with tempfile.TemporaryDirectory() as d:
            gate=self.create_gate(d)
            self.assertFalse(hasattr(gate,'send_http'))
            self.assertFalse(hasattr(gate,'send_openrouter'))


if __name__=='__main__': unittest.main()