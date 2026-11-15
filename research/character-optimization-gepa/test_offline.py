import concurrent.futures
import json
import pathlib
import tempfile
import unittest
from budget_ledger import BudgetLedger,BudgetDenied
from runner import preflight,PreflightDenied,probe_installed_gepa

H='a'*64
CONFIG={'run_id':'synthetic-run','max_spend_micro_usd':100,'max_attempts':3,
        'role_caps':{'student':2,'reflection':1,'judge':0,'holdout':0}}
PAYLOAD={'schemaVersion':'character-gepa-offline-bridge-v1','optimizer':'gepa','runManifestSha256':H,
 'candidateSha256':H,'mutableSlot':'character_expression','dataset':[
   {'id':'synthetic-1','characterId':'yeoul','familyId':'f1','split':'development','contentSha256':H},
   {'id':'synthetic-2','characterId':'yeoul','familyId':'f2','split':'optimizer_validation','contentSha256':'b'*64}],
 'test_set':None,'externalCallsAuthorized':False,'productionEligible':False,
 'requiresPrivateRuntime':False,'qualityGainEstablished':False}

class OfflineTests(unittest.TestCase):
    def test_plan(self):
        self.assertEqual(preflight(PAYLOAD)['external_calls'],0)
    def test_python_checks_families_duplicates_and_cross_split_content(self):
        import copy
        cases=[
            ({'familyId':'f1'},'family_crosses_split'),
            ({'contentSha256':H},'identical_content_crosses_split'),
            ({'id':'synthetic-1','split':'development','contentSha256':H},'duplicate_corpus_id'),
            ({'characterId':'seyeon'},'missing_character_split'),
            ({'id':'PRIVATE Korean conversation 안녕하세요'},'dataset_row'),
        ]
        for changes,reason in cases:
            bad=copy.deepcopy(PAYLOAD)
            bad['dataset'][1].update(changes)
            with self.assertRaisesRegex(PreflightDenied,reason):preflight(bad)

    def test_python_requires_validation_and_metadata_only_keys(self):
        import copy
        bad=copy.deepcopy(PAYLOAD)
        bad['dataset'].pop()
        with self.assertRaisesRegex(PreflightDenied,'dataset_shape'):preflight(bad)
        bad=copy.deepcopy(PAYLOAD)
        bad['dataset'][1]['familyId']='../private/holdout'
        with self.assertRaisesRegex(PreflightDenied,'dataset_row'):preflight(bad)
        bad=copy.deepcopy(PAYLOAD)
        bad['dataset'][1]['split']='development'
        with self.assertRaisesRegex(PreflightDenied,'missing_character_split'):preflight(bad)

    def test_python_shared_profiles_require_each_character_two_splits(self):
        import copy
        data=copy.deepcopy(PAYLOAD)
        data['dataset'].extend([
            {'id':'s-dev','characterId':'seyeon','familyId':'s-dev','split':'development','contentSha256':'c'*64},
            {'id':'s-val','characterId':'seyeon','familyId':'s-val','split':'optimizer_validation','contentSha256':'d'*64},
        ])
        self.assertEqual(preflight(data)['cases'],4)
        data['dataset'].pop()
        with self.assertRaisesRegex(PreflightDenied,'missing_character_split'):preflight(data)

    def test_sealed_rejected(self):
        bad=json.loads(json.dumps(PAYLOAD));bad['dataset'][0]['split']='sealed_holdout'
        with self.assertRaises(PreflightDenied):preflight(bad)
    def test_raw_private_fields_rejected(self):
        with self.assertRaises(PreflightDenied):preflight(dict(PAYLOAD,raw_user_message='private'))
    def test_live_flag_rejected(self):
        with self.assertRaises(PreflightDenied):preflight(dict(PAYLOAD,externalCallsAuthorized=True))
    def test_gepa_probe_does_not_invoke(self):
        self.assertIn(probe_installed_gepa()['status'],['gepa_not_installed','unsupported_api','signature_mismatch','signature_compatible_unexecuted'])
    def test_reservation_and_duplicate_are_fail_closed(self):
        with tempfile.TemporaryDirectory() as d:
            led=BudgetLedger(pathlib.Path(d)/'ledger.sqlite',**CONFIG)
            self.assertTrue(led.reserve('req-1','student',70)['send_permitted'])
            self.assertFalse(led.reserve('req-1','student',70)['send_permitted'])
            with self.assertRaises(BudgetDenied):led.reserve('req-2','student',40)
            self.assertEqual(led.settle('req-1',30),'settled')
            with self.assertRaises(BudgetDenied):led.reserve('req-2','student',40)
    def test_restart_does_not_release_uncertain_cost(self):
        with tempfile.TemporaryDirectory() as d:
            path=pathlib.Path(d)/'ledger.sqlite'
            a=BudgetLedger(path,**CONFIG);a.reserve('req-1','student',90);a.hold('req-1')
            b=BudgetLedger(path,**CONFIG)
            self.assertEqual(b.status()['held'],1)
            with self.assertRaises(BudgetDenied):b.reserve('req-2','student',20)
    def test_unreconciled_charge_stops_new_requests_even_when_budget_remains(self):
        with tempfile.TemporaryDirectory() as d:
            path=pathlib.Path(d)/'ledger.sqlite'
            caps=dict(CONFIG,max_spend_micro_usd=300)
            a=BudgetLedger(path,**caps)
            a.reserve('unknown-1','student',30)
            a.hold('unknown-1')
            b=BudgetLedger(path,**caps)
            with self.assertRaisesRegex(BudgetDenied,'unreconciled_charge_halts_run'):
                b.reserve('new-request','student',20)
            self.assertEqual(b.status()['attempts'],1)

    def test_parallel_reservations_do_not_oversubscribe(self):
        with tempfile.TemporaryDirectory() as d:
            path=pathlib.Path(d)/'ledger.sqlite'
            caps=dict(CONFIG,max_attempts=20,max_spend_micro_usd=100,role_caps={'student':20,'reflection':0,'judge':0,'holdout':0})
            def take(i):
                try:return BudgetLedger(path,**caps).reserve(f'r-{i}','student',30)['send_permitted']
                except BudgetDenied:return False
            with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
                outcomes=list(ex.map(take,range(10)))
            self.assertEqual(sum(outcomes),3)
            self.assertEqual(BudgetLedger(path,**caps).status()['reserved_micro_usd'],90)
    def test_settlement_exceed_reservation_holds(self):
        with tempfile.TemporaryDirectory() as d:
            led=BudgetLedger(pathlib.Path(d)/'ledger.sqlite',**CONFIG)
            led.reserve('req','reflection',50)
            with self.assertRaises(BudgetDenied):led.settle('req',70)
            self.assertEqual(led.status()['held'],1)
    def test_forbid_config_change_after_first_write(self):
        with tempfile.TemporaryDirectory() as d:
            path=pathlib.Path(d)/'ledger.sqlite';BudgetLedger(path,**CONFIG)
            with self.assertRaises(BudgetDenied):BudgetLedger(path,**dict(CONFIG,max_attempts=9))

if __name__=='__main__':unittest.main()