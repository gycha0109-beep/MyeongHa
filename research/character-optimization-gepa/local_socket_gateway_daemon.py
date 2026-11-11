"""Synthetic-only local socket gateway server for cross-language/OS isolation CI."""
import argparse
from budget_ledger import BudgetLedger
from offline_egress_gate import OfflineEgressGate
from local_socket_gateway import LocalSocketGateway


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--socket',required=True)
    parser.add_argument('--ledger',required=True)
    args=parser.parse_args()
    ledger=BudgetLedger(args.ledger,run_id='synthetic-gateway-integration',
        max_spend_micro_usd=90,max_attempts=3,
        role_caps={'student':3,'reflection':0,'judge':0,'holdout':0})
    gate=OfflineEgressGate(ledger,approved_models={'synthetic/deepseek':'fake-provider'})
    with LocalSocketGateway(args.socket,gate) as server:
        server.serve_forever(poll_interval=0.1)

if __name__=='__main__':main()