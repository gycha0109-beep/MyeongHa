import concurrent.futures
import importlib.util
import tempfile
import unittest
from pathlib import Path

SRC=Path(__file__).resolve().parents[1]/'budget_ledger.py'
spec=importlib.util.spec_from_file_location('budget_ledger',SRC)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
AdmissionDenied=mod.AdmissionDenied
BudgetLedger=mod.BudgetLedger

class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='myeongha-optimizer-ledger-')
        self.db=Path(self.tmp.name)/'ledger.sqlite3'
    def tearDown(self):
        self.tmp.cleanup()
    def ledger(self,**overrides):
        defaults=dict(run_id='synthetic-run',max_total_usd_micros=10000,max_attempts=4,
                      max_calls_by_role={'student':2,'reflection':1,'judge':1,'holdout':0})
        defaults.update(overrides)
        return BudgetLedger(self.db,**defaults)

    def test_offline_zero_budget_never_reserves(self):
        x=self.ledger(max_total_usd_micros=0,max_attempts=0,
                      max_calls_by_role={k:0 for k in mod.ROLES})
        with self.assertRaisesRegex(AdmissionDenied,'CALL_BUDGET_EXHAUSTED'):
            x.reserve('call1','student',10)
        self.assertEqual(x.summary()['network_calls_sent_by_this_module'],0)
    def test_plan_cannot_be_rewritten_on_restart(self):
        self.ledger()
        with self.assertRaisesRegex(AdmissionDenied,'PLAN_CHANGED'):
            self.ledger(max_total_usd_micros=99999)
    def test_concurrent_reservations_respect_exact_budget(self):
        ledger=self.ledger(max_total_usd_micros=250,max_attempts=10,
                           max_calls_by_role={'student':10,'reflection':0,'judge':0,'holdout':0})
        def attempt(i):
            try:
                ledger.reserve(f'call-{i}','student',100)
                return True
            except AdmissionDenied:
                return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
            accepted=list(ex.map(attempt,range(10)))
        self.assertEqual(sum(accepted),2)
        self.assertEqual(ledger.summary()['committed_or_reserved_micros'],200)
    def test_settled_cost_releases_only_proven_unused_reserve(self):
        ledger=self.ledger()
        ledger.reserve('call1','student',2000)
        ledger.transition('call1',from_state='RESERVED',to_state='DISPATCHED')
        ledger.transition('call1',from_state='DISPATCHED',to_state='SETTLED',actual_micros=1200)
        self.assertEqual(ledger.summary()['committed_or_reserved_micros'],1200)
        with self.assertRaisesRegex(AdmissionDenied,'REPLAY_REQUEST_ID'):
            ledger.reserve('call1','student',1)
    def test_unknown_cost_fails_closed_after_restart(self):
        ledger=self.ledger()
        ledger.reserve('call1','student',500)
        ledger.transition('call1',from_state='RESERVED',to_state='DISPATCHED')
        ledger.transition('call1',from_state='DISPATCHED',to_state='UNKNOWN')
        reopened=self.ledger()
        self.assertEqual(reopened.summary()['committed_or_reserved_micros'],500)
        with self.assertRaisesRegex(AdmissionDenied,'UNRECONCILED'):
            reopened.reserve('call2','student',100)
    def test_overrun_blocks_new_attempts(self):
        ledger=self.ledger()
        ledger.reserve('call1','student',500)
        ledger.transition('call1',from_state='RESERVED',to_state='DISPATCHED')
        with self.assertRaisesRegex(AdmissionDenied,'OVER_QUOTE'):
            ledger.transition('call1',from_state='DISPATCHED',to_state='SETTLED',actual_micros=600)
        ledger.transition('call1',from_state='DISPATCHED',to_state='OVERRUN',actual_micros=600)
        with self.assertRaisesRegex(AdmissionDenied,'UNRECONCILED'):
            ledger.reserve('call2','student',100)
    def test_reservation_only_cancelled_before_dispatch(self):
        ledger=self.ledger()
        ledger.reserve('call1','student',500)
        ledger.transition('call1',from_state='RESERVED',to_state='CANCELLED')
        self.assertEqual(ledger.summary()['committed_or_reserved_micros'],0)
        with self.assertRaisesRegex(AdmissionDenied,'STATE_OR_REQUEST_MISMATCH'):
            ledger.transition('call1',from_state='RESERVED',to_state='CANCELLED')
    def test_private_storage_is_mandatory(self):
        with self.assertRaises(AdmissionDenied):
            BudgetLedger(Path('/tmp')/'public-ledger.sqlite3',run_id='test',max_total_usd_micros=0,
                         max_attempts=0,max_calls_by_role={k:0 for k in mod.ROLES})

if __name__ == '__main__': unittest.main()
