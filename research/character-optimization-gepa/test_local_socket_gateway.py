import pathlib
import tempfile
import threading
import unittest
from budget_ledger import BudgetLedger
from offline_egress_gate import OfflineEgressGate
from local_socket_gateway import LocalSocketGateway, submit


def payload(request_id='r-1', model='synthetic/deepseek', provider='fake-provider'):
    return {'request_id': request_id, 'role': 'student', 'model_id': model, 'max_charge_micro_usd': 40,
            'fixture': {'provider': provider, 'model': model, 'actual_micro_usd': 20, 'successful': True}}


class UnixSocketGateTests(unittest.TestCase):
    def test_cross_process_protocol_uses_single_ledger(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder)
            ledger=BudgetLedger(root/'ledger.sqlite',run_id='synthetic-unix',max_spend_micro_usd=50,
                max_attempts=3,role_caps={'student':3,'reflection':0,'judge':0,'holdout':0})
            gate=OfflineEgressGate(ledger,approved_models={'synthetic/deepseek':'fake-provider'})
            with LocalSocketGateway(root/'gate.sock',gate) as server:
                t=threading.Thread(target=server.serve_forever,daemon=True)
                t.start()
                try:
                    self.assertTrue(submit(str(root/'gate.sock'),payload())['ok'])
                    self.assertFalse(submit(str(root/'gate.sock'),payload())['ok'])
                    self.assertFalse(submit(str(root/'gate.sock'),payload('r-2'))['ok'])
                    self.assertEqual(ledger.status()['reserved_micro_usd'],40)
                    self.assertEqual(ledger.status()['attempts'],1)
                finally:
                    server.shutdown();t.join(timeout=5)
            self.assertFalse((root/'gate.sock').exists())

    def test_rejects_unapproved_and_raw_message_fields(self):
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder)
            ledger=BudgetLedger(root/'ledger.sqlite',run_id='synthetic-unix',max_spend_micro_usd=50,
                max_attempts=3,role_caps={'student':3,'reflection':0,'judge':0,'holdout':0})
            gate=OfflineEgressGate(ledger,approved_models={'synthetic/deepseek':'fake-provider'})
            with LocalSocketGateway(root/'gate.sock',gate) as server:
                t=threading.Thread(target=server.serve_forever,daemon=True);t.start()
                try:
                    req=payload();req['user_message']='PRIVATE';self.assertFalse(submit(str(root/'gate.sock'),req)['ok'])
                    self.assertFalse(submit(str(root/'gate.sock'),payload('r-2',provider='wrong'))['ok'])
                    self.assertEqual(ledger.status()['held'],1)
                finally:
                    server.shutdown();t.join(timeout=5)

if __name__=='__main__':unittest.main()