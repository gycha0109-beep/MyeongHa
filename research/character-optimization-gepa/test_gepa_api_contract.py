import hashlib
import pathlib
import tempfile
import unittest
from gepa_api_contract import build_offline_gepa_kwargs,PreflightDenied
from test_offline import PAYLOAD,H

SEED='Synthetic Korean response rule.'
class FakeGepaConfig:
    def __init__(self,**kwargs):self.__dict__.update(kwargs)

def offline_reflection(*args,**kwargs):return 'synthetic-only-no-network'
def dummy_evaluator(candidate,example):return 0.5,{'failure_codes':[],'character_id':'yeoul','raw_dialogue_excluded':True}

class ContractTests(unittest.TestCase):
    def setup_envelope(self):
        import copy
        p=copy.deepcopy(PAYLOAD)
        p['candidateSha256']=hashlib.sha256(SEED.encode('utf-8')).hexdigest()
        p['dataset'].append({'id':'synthetic-2','characterId':'yeoul','familyId':'f2','split':'optimizer_validation','contentSha256':H})
        return p
    def test_prepares_explicit_new_api_kwargs_without_running(self):
        with tempfile.TemporaryDirectory() as out,tempfile.TemporaryDirectory() as repo:
            kw=build_offline_gepa_kwargs(self.setup_envelope(),seed_text=SEED,evaluator=dummy_evaluator,
              reflection_lm=offline_reflection,output_dir=out,repository_root=repo,config_factory=FakeGepaConfig)
            self.assertEqual(kw['config'].engine,'gepa')
            self.assertEqual(kw['config'].engine_config['reflection']['reflection_lm'],offline_reflection)
            self.assertEqual(len(kw['dataset']),1);self.assertEqual(len(kw['valset']),1)
            self.assertIsNone(kw['test_set'])
            self.assertEqual(set(kw), {'seed_candidate','dataset','valset','test_set','evaluator','objective','background','config'})
            self.assertEqual(kw['evaluator'](kw['seed_candidate'],kw['dataset'][0])[0],0.5)
    def test_symlink_output_denied(self):
        with tempfile.TemporaryDirectory() as out,tempfile.TemporaryDirectory() as repo:
            link=pathlib.Path(out).parent / ('gepa-output-test-symlink-' + pathlib.Path(out).name)
            link.symlink_to(out, target_is_directory=True)
            try:
                with self.assertRaises(PreflightDenied):
                    build_offline_gepa_kwargs(self.setup_envelope(),seed_text=SEED,evaluator=dummy_evaluator,
                      reflection_lm=offline_reflection,output_dir=str(link),repository_root=repo,config_factory=FakeGepaConfig)
            finally:
                link.unlink()
    def test_no_default_reflection_model(self):
        with tempfile.TemporaryDirectory() as out,tempfile.TemporaryDirectory() as repo:
            with self.assertRaises(PreflightDenied):build_offline_gepa_kwargs(self.setup_envelope(),seed_text=SEED,evaluator=dummy_evaluator,
              reflection_lm=None,output_dir=out,repository_root=repo,config_factory=FakeGepaConfig)
    def test_cannot_put_output_in_repo(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(PreflightDenied):build_offline_gepa_kwargs(self.setup_envelope(),seed_text=SEED,evaluator=dummy_evaluator,
              reflection_lm=offline_reflection,output_dir=root,repository_root=root,config_factory=FakeGepaConfig)
    def test_wrong_seed_rejected_before_config(self):
        with tempfile.TemporaryDirectory() as out,tempfile.TemporaryDirectory() as repo:
            with self.assertRaises(PreflightDenied):build_offline_gepa_kwargs(self.setup_envelope(),seed_text='wrong',evaluator=dummy_evaluator,
              reflection_lm=offline_reflection,output_dir=out,repository_root=repo,config_factory=FakeGepaConfig)
    def test_private_extra_judge_fields_rejected(self):
        with tempfile.TemporaryDirectory() as out,tempfile.TemporaryDirectory() as repo:
            kw=build_offline_gepa_kwargs(self.setup_envelope(),seed_text=SEED,evaluator=lambda c,e:(0.8,{'raw_response':'SECRET'}),
              reflection_lm=offline_reflection,output_dir=out,repository_root=repo,config_factory=FakeGepaConfig)
            with self.assertRaises(PreflightDenied):kw['evaluator'](kw['seed_candidate'],kw['dataset'][0])
    def test_sealed_set_not_exposed(self):
        p=self.setup_envelope();p['dataset'][1]['split']='sealed_holdout'
        with tempfile.TemporaryDirectory() as out,tempfile.TemporaryDirectory() as repo:
            with self.assertRaises(PreflightDenied):build_offline_gepa_kwargs(p,seed_text=SEED,evaluator=dummy_evaluator,
              reflection_lm=offline_reflection,output_dir=out,repository_root=repo,config_factory=FakeGepaConfig)

if __name__=='__main__':unittest.main()