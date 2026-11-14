"""Synthetic-only local socket gateway server for cross-language/OS isolation CI."""
import argparse
from budget_ledger import BudgetLedger
from offline_egress_gate import OfflineEgressGate
from local_socket_gateway import LocalSocketGateway
from governed_dry_run import DryRunPolicy, GovernedBudgetLedger, GovernedDryRunGate


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--socket',required=True)
    parser.add_argument('--ledger',required=True)
    args=parser.parse_args()
    ledger=GovernedBudgetLedger(args.ledger,run_id='synthetic-gateway-integration',
        max_spend_micro_usd=90,max_attempts=3,
        role_caps={'student':3,'reflection':0,'judge':0,'holdout':0})
    gate=OfflineEgressGate(ledger,approved_models={'synthetic/deepseek':'fake-provider'})
    # Synthetic cost values are NOT published OpenRouter prices or spending approval.
    p=DryRunPolicy(run_id='synthetic-gateway-integration',target_id='yeoul',
        model_id='synthetic/deepseek',settings_hash='sha256:synthetic-settings',
        provider='fake-provider',
        pricing={'source':'synthetic-fixture:socket-gateway','version':'v1',
                 'effective_epoch':1,'expires_epoch':4102444800,
                 'input_rate':1000000,'output_rate':1000000,
                 'reasoning_rate':1000000,'fixed_max_micro_usd':0},
        routing={'only':['fake-provider'],'allow_fallbacks':False,
                 'require_parameters':True,'zdr':True,'data_collection':'deny'},
        limits={'input_tokens':10,'output_tokens':10,'reasoning_tokens':1,
                'max_parallel':2,'max_attempts_per_operation':2},
        allowed_roles=frozenset({'student'}))
    governed=GovernedDryRunGate(ledger,p)
    with LocalSocketGateway(args.socket,gate,governed_gate=governed) as server:
        server.serve_forever(poll_interval=0.1)

if __name__=='__main__':main()