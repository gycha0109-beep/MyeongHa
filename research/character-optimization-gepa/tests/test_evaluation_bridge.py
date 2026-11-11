import shutil
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from evaluation_bridge import OfflineEvaluationBridge, EvaluationBridgeError

ROOT=Path(__file__).resolve().parents[3]
SCRIPT=ROOT/'scripts/character-optimization/offline-evaluator-bridge.mjs'

@unittest.skipUnless(shutil.which('node'), 'requires Node runtime')
class NodeBridgeTests(unittest.TestCase):
    def setUp(self):
        self.bridge=OfflineEvaluationBridge(node_binary=shutil.which('node'),bridge_script=SCRIPT)
    def test_node_bridge_returns_safe_deterministic_summary(self):
        payload=[{'source':'automated_rule','characterId':'yeoul','scenarioFamilyId':'synthetic_F01','axisScores':{'korean_naturalness':4},'hardFailures':[]}]
        r=self.bridge.evaluate(payload)
        self.assertEqual(r['sourceCounts']['automated_rule'],1)
        self.assertEqual(r['modelCalls'],0)
        self.assertFalse(r['promotionAllowed'])
    def test_raw_message_is_rejected_without_logging_it(self):
        payload=[{'source':'ai_judge','characterId':'yeoul','scenarioFamilyId':'F01','axisScores':None,'hardFailures':[],'rawUserMessage':'PRIVATE_DO_NOT_ECHO'}]
        with self.assertRaisesRegex(EvaluationBridgeError,'EVALUATION_CHILD_REJECTED'):
            self.bridge.evaluate(payload)
    def test_fake_program_is_rejected(self):
        with self.assertRaisesRegex(EvaluationBridgeError,'UNAPPROVED_EVALUATION_PROGRAM'):
            OfflineEvaluationBridge(node_binary='node',bridge_script=Path(__file__))
