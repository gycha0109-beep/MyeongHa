import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from egress_gateway import ClosedEgressGateway
from budget_ledger import AdmissionDenied

class ClosedGatewayTests(unittest.TestCase):
    def test_every_role_is_closed_even_with_payload(self):
        gate=ClosedEgressGateway()
        for role in gate.supported_roles:
            with self.subTest(role=role):
                with self.assertRaisesRegex(AdmissionDenied,'LIVE_NETWORK_EGRESS_NOT_IMPLEMENTED'):
                    gate.dispatch(role=role,request_id='synthetic',payload={'user_private_text':'DO_NOT_LOG'})
    def test_unknown_role_is_closed(self):
        with self.assertRaisesRegex(AdmissionDenied,'UNKNOWN_MODEL_ROLE'):
            ClosedEgressGateway().dispatch(role='unapproved',request_id='synthetic',payload='secret')
