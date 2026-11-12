"""Only synthetic price/routing/FX fixtures. No model traffic, payment or real approvals."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tempfile
import unittest

from budget_ledger import BudgetDenied
from governed_dry_run import DryRunPolicy, GovernedBudgetLedger, GovernedDryRunGate
from krw500_synthetic_ledger import YeoulKrw500SyntheticLedger, CAP_KRW

ROLES = {'student':10,'reflection':10,'judge':10,'holdout':10}


def policy(run_id='yeoul-synthetic-run'):
    return DryRunPolicy(
        run_id=run_id, target_id='yeoul', model_id='synthetic/deepseek',
        settings_hash='sha256:synthetic', provider='fake-provider',
        pricing=dict(
            source='synthetic-fixture:krw500-tests', version='synthetic-v1',
            effective_epoch=1, expires_epoch=4102444800,
            input_rate=1000000, output_rate=2000000,
            reasoning_rate=3000000, fixed_max_micro_usd=10,
        ),
        routing=dict(
            only=['fake-provider'], allow_fallbacks=False,
            require_parameters=True, zdr=True, data_collection='deny',
        ),
        limits=dict(
            input_tokens=1000, output_tokens=200,
            reasoning_tokens=100,max_parallel=12,
            max_attempts_per_operation=2,
        ),
        allowed_roles=frozenset(ROLES),
    )


def request(p, rid, role='student'):
    return dict(
        run_id=p.run_id, request_id=rid,
        operation_id='turn-'+rid, attempt_number=1,
        role=role, target_id='yeoul', model_id=p.model_id,
        settings_hash=p.settings_hash, pricing_hash=p.pricing_hash,
        routing_hash=p.routing_hash, max_input_tokens=500,
        max_output_tokens=100, max_reasoning_tokens=20,
    )


class YeoulKrw500SyntheticLedgerTests(unittest.TestCase):
    def setUp(self):
        d=tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        self.path=Path(d.name)/'fake-budget.sqlite'

    def ledger(self, run_id='yeoul-synthetic-run', *,
               rate=1400000, fees=0, max_usd=10000000):
        return YeoulKrw500SyntheticLedger(
            self.path, run_id=run_id,
            max_spend_micro_usd=max_usd,max_attempts=30,
            role_caps=ROLES,upper_fx_milli_krw_per_usd=rate,
            fixed_fees_krw=fees,
        )

    def test_exact_500_and_501_failure_include_all_roles(self):
        led=self.ledger(fees=80)
        p=policy()
        # 300000 microUSD * 1400 KRW/USD = 420 KRW, plus fees 80.
        self.assertTrue(led.reserve_controlled(p,request(p,'s1','student'),300000)['send_permitted'])
        self.assertEqual(led.krw_status()['reserved_requests_krw'],420)
        self.assertEqual(led.krw_status()['remaining_unverified_krw'],0)
        with self.assertRaisesRegex(BudgetDenied,'owner_declared_krw500_cap_exceeded'):
            led.reserve_controlled(p,request(p,'j1','judge'),1)
        self.assertEqual(led.krw_status()['all_roles_and_runs_attempts'],1)

    def test_one_krw_round_up_per_attempt_and_global_retry_count(self):
        led=self.ledger(fees=497)
        p=policy()
        for rid,role in [('student-1','student'),('reflection-1','reflection'),('holdout-1','holdout')]:
            led.reserve_controlled(p,request(p,rid,role),1)
        self.assertEqual(led.krw_status()['reserved_requests_krw'],3)
        self.assertEqual(led.krw_status()['remaining_unverified_krw'],0)
        with self.assertRaisesRegex(BudgetDenied,'owner_declared_krw500_cap_exceeded'):
            led.reserve_controlled(p,request(p,'judge-1','judge'),1)

    def test_multiple_runs_share_the_same_cumulative_krw_cap(self):
        one=self.ledger('run-a',fees=60)
        p1=policy('run-a')
        one.reserve_controlled(p1,request(p1,'a'),100000)
        two=self.ledger('run-b',fees=60)
        p2=policy('run-b')
        two.reserve_controlled(p2,request(p2,'b',role='reflection'),200000)
        self.assertEqual(one.krw_status()['reserved_requests_krw'],420)
        self.assertEqual(two.krw_status()['remaining_unverified_krw'],20)
        with self.assertRaisesRegex(BudgetDenied,'owner_declared_krw500_cap_exceeded'):
            two.reserve_controlled(p2,request(p2,'c',role='judge'),20000)

    def test_restart_does_not_release_budget_and_policy_repricing_fails(self):
        led=self.ledger(fees=10)
        p=policy()
        led.reserve_controlled(p,request(p,'first'),300000)
        again=self.ledger(fees=10)
        self.assertEqual(again.krw_status()['reserved_requests_krw'],420)
        with self.assertRaisesRegex(BudgetDenied,'pilot_krw_scope_changed_after_start'):
            self.ledger(rate=1500000,fees=10)
        with self.assertRaisesRegex(BudgetDenied,'pilot_krw_scope_changed_after_start'):
            self.ledger(fees=11)

    def test_parallel_attempts_cannot_overreserve_500_krw(self):
        led=self.ledger()
        p=policy()
        def reserve(i):
            try:
                return led.reserve_controlled(p,request(p,'parallel-'+str(i)),140000)['send_permitted']
            except BudgetDenied:
                return False
        with ThreadPoolExecutor(max_workers=6) as ex:
            results=list(ex.map(reserve,range(10)))
        # Each attempt costs ceil(140000 microUSD * 1400 KRW/USD) = 196 KRW.
        self.assertEqual(sum(results),2)
        self.assertEqual(led.krw_status()['reserved_requests_krw'],392)
        self.assertEqual(led.krw_status()['all_roles_and_runs_attempts'],2)

    def test_synthetic_gate_uses_the_same_atomic_krw_transaction(self):
        led=self.ledger(fees=498,max_usd=10000)
        p=policy()
        gate=GovernedDryRunGate(led,p)
        fixture=dict(
            provider='fake-provider',model='synthetic/deepseek',
            input_tokens=500,output_tokens=100,reasoning_tokens=20,
            actual_micro_usd=760,successful=True,
        )
        result=gate.simulate(request(p,'gate-1'),fixture,now=100)
        self.assertEqual(result['state'],'settled')
        self.assertEqual(result['external_calls'],0)
        self.assertEqual(led.krw_status()['reserved_requests_krw'],2)
        with self.assertRaisesRegex(BudgetDenied,'owner_declared_krw500_cap_exceeded'):
            gate.simulate(request(p,'gate-2',role='reflection'),fixture,now=100)

    def test_uncontrolled_usd_reservation_is_detected_before_next_guarded_send(self):
        unsecured=GovernedBudgetLedger(
            self.path,run_id='yeoul-synthetic-run',
            max_spend_micro_usd=10000000,max_attempts=30,role_caps=ROLES,
        )
        p=policy()
        unsecured.reserve_controlled(p,request(p,'unguarded'),1)
        led=self.ledger()
        with self.assertRaisesRegex(BudgetDenied,'unguarded_usd_reservations_present'):
            led.reserve_controlled(p,request(p,'secured'),1)
        self.assertEqual(led.krw_status()['all_roles_and_runs_attempts'],0)

    def test_uncertain_charge_blocks_all_roles_and_fee_cap_never_grants_authority(self):
        with self.assertRaisesRegex(BudgetDenied,'fixed_fees_already_exceed_krw_cap'):
            self.ledger(fees=501)
        led=self.ledger(fees=30)
        p=policy()
        led.reserve_controlled(p,request(p,'uncertain'),1)
        led.hold('uncertain')
        with self.assertRaisesRegex(BudgetDenied,'unreconciled_charge_halts_run'):
            led.reserve_controlled(p,request(p,'next',role='judge'),1)
        status=led.krw_status()
        self.assertEqual(status['owner_declared_total_cap_krw'],CAP_KRW)
        self.assertFalse(status['owner_authority_authenticated'])
        self.assertFalse(status['external_calls_authorized'])
        self.assertFalse(status['new_credit_purchase_allowed'])
        self.assertEqual(status['external_calls'],0)


if __name__ == '__main__':
    unittest.main()
