"""KRW-500 guarded local socket demonstration, SYNTHETIC ONLY.

Every response is caller-provided fake usage; there is no provider client,
payment code, API key, live price quote, authenticated approval, or outbound HTTP.
The simulated 498-KRW fees and FX bound are fixtures, NOT current charges.
"""
from __future__ import annotations

import argparse

from governed_dry_run import DryRunPolicy, GovernedDryRunGate
from krw500_synthetic_ledger import YeoulKrw500SyntheticLedger
from local_socket_gateway import LocalSocketGateway

RUN_ID = 'yeoul-krw500-synthetic-socket'
ROLES = {'student':8,'reflection':8,'judge':8,'holdout':8}


def build_synthetic_krw500_gateway(ledger_path):
    ledger = YeoulKrw500SyntheticLedger(
        ledger_path, run_id=RUN_ID, max_spend_micro_usd=200000,
        max_attempts=30, role_caps=dict(ROLES),
        upper_fx_milli_krw_per_usd=1400000, fixed_fees_krw=498,
    )
    policy = DryRunPolicy(
        run_id=RUN_ID, target_id='yeoul',
        model_id='synthetic/deepseek', settings_hash='sha256:synthetic-krw500-fixture',
        provider='fake-provider',
        pricing={
            'source':'synthetic-fixture:krw500-local-socket',
            'version':'v1', 'effective_epoch':1, 'expires_epoch':4102444800,
            'input_rate':1000000, 'output_rate':2000000,
            'reasoning_rate':3000000, 'fixed_max_micro_usd':10,
        },
        routing={
            'only':['fake-provider'], 'allow_fallbacks':False,
            'require_parameters':True, 'zdr':True, 'data_collection':'deny',
        },
        limits={
            'input_tokens':1000, 'output_tokens':200, 'reasoning_tokens':100,
            'max_parallel':12, 'max_attempts_per_operation':2,
        },
        allowed_roles=frozenset(ROLES),
    )
    return ledger, policy, GovernedDryRunGate(ledger, policy)


def main():
    parser = argparse.ArgumentParser(description='Synthetic-only GEPA KRW 500 guarded socket')
    parser.add_argument('--socket', required=True)
    parser.add_argument('--ledger', required=True)
    args = parser.parse_args()
    ledger, policy, governed = build_synthetic_krw500_gateway(args.ledger)
    # The old dollar-only local_socket_gateway fixture route MUST stay disabled
    # in this daemon; it can never reserve against this pilot.
    with LocalSocketGateway(args.socket, None, governed_gate=governed,
                            krw500_only=True) as server:
        server.serve_forever(poll_interval=0.1)


if __name__ == '__main__':
    main()
