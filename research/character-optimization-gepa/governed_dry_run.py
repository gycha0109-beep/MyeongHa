"""Synthetic-only governed request preflight and durable retry/budget gate.

No provider SDK, no network sender, and no owner approval authority is present.
Client-supplied approvalRef never authorizes spending. Published tariff discovery
and trusted approval resolution remain separate, unimplemented boundaries.
"""
from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from budget_ledger import BudgetLedger, BudgetDenied, ROLES


class PolicyDenied(ValueError):
    pass


def _integer(value, label, *, zero=False):
    if type(value) is not int or value < (0 if zero else 1):
        raise PolicyDenied(label)
    return value


def _text(value, label):
    if not isinstance(value, str) or not value or len(value) > 160:
        raise PolicyDenied(label)
    return value


def digest(value):
    return 'sha256:' + hashlib.sha256(json.dumps(
        value, sort_keys=True, separators=(',', ':'), ensure_ascii=False
    ).encode('utf-8')).hexdigest()


@dataclass(frozen=True)
class DryRunPolicy:
    """Host-owned test fixture, never a caller-provided authority or paid policy."""
    run_id: str
    target_id: str
    model_id: str
    settings_hash: str
    provider: str
    pricing: dict
    routing: dict
    limits: dict
    allowed_roles: frozenset

    def __post_init__(self):
        for field in ('run_id', 'target_id', 'model_id', 'settings_hash', 'provider'):
            _text(getattr(self, field), field)
        if (not isinstance(self.allowed_roles, frozenset) or not self.allowed_roles
                or not self.allowed_roles <= ROLES):
            raise PolicyDenied('allowed_roles')
        if not isinstance(self.pricing, dict) or set(self.pricing) != {
            'source', 'version', 'effective_epoch', 'expires_epoch',
            'input_rate', 'output_rate', 'reasoning_rate', 'fixed_max_micro_usd'
        }:
            raise PolicyDenied('pricing_shape')
        if (not isinstance(self.pricing['source'], str)
                or not self.pricing['source'].startswith('synthetic-fixture:')):
            raise PolicyDenied('not_synthetic_tariff')
        _text(self.pricing['version'], 'pricing_version')
        _integer(self.pricing['effective_epoch'], 'effective_epoch', zero=True)
        _integer(self.pricing['expires_epoch'], 'expires_epoch')
        if self.pricing['expires_epoch'] <= self.pricing['effective_epoch']:
            raise PolicyDenied('pricing_time')
        for k in ('input_rate', 'output_rate', 'reasoning_rate', 'fixed_max_micro_usd'):
            _integer(self.pricing[k], k, zero=True)
        if self.pricing['input_rate'] <= 0 or self.pricing['output_rate'] <= 0:
            raise PolicyDenied('unpriced_tokens')
        if self.routing != {'only': [self.provider], 'allow_fallbacks': False,
                            'require_parameters': True, 'zdr': True,
                            'data_collection': 'deny'}:
            raise PolicyDenied('unbounded_provider_route')
        if not isinstance(self.limits, dict) or set(self.limits) != {
            'input_tokens', 'output_tokens', 'reasoning_tokens',
            'max_parallel', 'max_attempts_per_operation'
        }:
            raise PolicyDenied('limits_shape')
        for k, v in self.limits.items():
            _integer(v, k, zero=k == 'reasoning_tokens')

    @property
    def policy_hash(self):
        return digest({'run_id': self.run_id, 'target_id': self.target_id,
                       'model': self.model_id, 'settings_hash': self.settings_hash,
                       'provider': self.provider, 'pricing': self.pricing,
                       'routing': self.routing, 'limits': self.limits,
                       'roles': sorted(self.allowed_roles)})

    @property
    def pricing_hash(self):
        return digest(self.pricing)

    @property
    def routing_hash(self):
        return digest(self.routing)

    @staticmethod
    def price(tokens, rate):
        return (tokens * rate + 999999) // 1000000

    def quote(self, input_tokens, output_tokens, reasoning_tokens, *, fixed=True):
        # Conservatively count output and reasoning separately, even if nested.
        return (self.price(input_tokens, self.pricing['input_rate'])
                + self.price(output_tokens, self.pricing['output_rate'])
                + self.price(reasoning_tokens, self.pricing['reasoning_rate'])
                + (self.pricing['fixed_max_micro_usd'] if fixed else 0))

    def preflight(self, request, *, now=None):
        fields = {'run_id', 'request_id', 'operation_id', 'attempt_number', 'role',
                  'target_id', 'model_id', 'settings_hash', 'pricing_hash',
                  'routing_hash', 'max_input_tokens', 'max_output_tokens',
                  'max_reasoning_tokens'}
        if not isinstance(request, dict) or set(request) != fields:
            raise PolicyDenied('request_shape_or_untrusted_approval')
        if (request['run_id'] != self.run_id
                or request['target_id'] != self.target_id
                or request['model_id'] != self.model_id
                or request['settings_hash'] != self.settings_hash
                or request['pricing_hash'] != self.pricing_hash
                or request['routing_hash'] != self.routing_hash
                or not isinstance(request['role'], str)
                or request['role'] not in self.allowed_roles):
            raise PolicyDenied('immutable_scope_mismatch')
        for k in ('request_id', 'operation_id'):
            _text(request[k], k)
        _integer(request['attempt_number'], 'attempt_number')
        if request['attempt_number'] > self.limits['max_attempts_per_operation']:
            raise PolicyDenied('attempt_ceiling')
        for k, max_k in (('max_input_tokens', 'input_tokens'),
                         ('max_output_tokens', 'output_tokens'),
                         ('max_reasoning_tokens', 'reasoning_tokens')):
            _integer(request[k], k, zero=k == 'max_reasoning_tokens')
            if request[k] > self.limits[max_k]:
                raise PolicyDenied('token_ceiling')
        current = int(time.time()) if now is None else _integer(now, 'now', zero=True)
        if not self.pricing['effective_epoch'] <= current < self.pricing['expires_epoch']:
            raise PolicyDenied('stale_or_future_pricing')
        worst = self.quote(request['max_input_tokens'],
                           request['max_output_tokens'], request['max_reasoning_tokens'])
        if worst <= 0:
            raise PolicyDenied('unpriced_request')
        return worst


class GovernedBudgetLedger(BudgetLedger):
    """Atomic shared SQLite reservations, retry numbering and concurrency caps."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        with self._connect() as con:
            con.execute('CREATE TABLE IF NOT EXISTS controlled_attempts ('
                        'request_id TEXT PRIMARY KEY,run_id TEXT NOT NULL,'
                        'operation_id TEXT NOT NULL,attempt_number INTEGER NOT NULL,'
                        'policy_hash TEXT NOT NULL,UNIQUE(run_id,operation_id,attempt_number))')
            con.execute('CREATE TABLE IF NOT EXISTS pinned_run_policy ('
                        'run_id TEXT PRIMARY KEY,policy_hash TEXT NOT NULL)')

    def reserve_controlled(self, policy, request, worst):
        if policy.run_id != self.run_id:
            raise BudgetDenied('run_identity')
        _integer(worst, 'reservation')
        with self._connect() as con:
            con.execute('BEGIN IMMEDIATE')
            existing = con.execute(
                'SELECT policy_hash FROM pinned_run_policy WHERE run_id=?',
                (self.run_id,)
            ).fetchone()
            if existing and existing[0] != policy.policy_hash:
                raise BudgetDenied('policy_changed_after_start')
            if not existing:
                con.execute('INSERT INTO pinned_run_policy VALUES (?,?)',
                            (self.run_id, policy.policy_hash))
            if con.execute('SELECT 1 FROM attempts WHERE request_id=?',
                           (request['request_id'],)).fetchone():
                raise BudgetDenied('duplicate_request_not_replayed')
            previous = con.execute(
                'SELECT COUNT(*),MAX(attempt_number) FROM controlled_attempts '
                'WHERE run_id=? AND operation_id=?',
                (self.run_id, request['operation_id'])
            ).fetchone()
            if request['attempt_number'] != previous[0] + 1:
                raise BudgetDenied('nonsequential_retry')
            if previous[0]:
                last = con.execute(
                    'SELECT a.state FROM controlled_attempts c JOIN attempts a '
                    'ON a.request_id=c.request_id WHERE c.run_id=? '
                    'AND c.operation_id=? AND c.attempt_number=?',
                    (self.run_id, request['operation_id'], previous[1])
                ).fetchone()
                if not last or last[0] == 'reserved':
                    raise BudgetDenied('previous_attempt_still_in_flight')
            reserved, count = con.execute(
                'SELECT COALESCE(SUM(reserved),0),COUNT(*) FROM attempts WHERE run_id=?',
                (self.run_id,)
            ).fetchone()
            active = con.execute(
                "SELECT COUNT(*) FROM attempts WHERE run_id=? AND state='reserved'",
                (self.run_id,)
            ).fetchone()[0]
            role_count = con.execute(
                'SELECT COUNT(*) FROM attempts WHERE run_id=? AND role=?',
                (self.run_id, request['role'])
            ).fetchone()[0]
            cap, max_attempts, role_caps = self.limits
            if (reserved + worst > cap or count >= max_attempts
                    or role_count >= role_caps[request['role']]
                    or active >= policy.limits['max_parallel']):
                raise BudgetDenied('budget_attempt_or_parallel_cap')
            con.execute('INSERT INTO attempts VALUES(?,?,?,?,?,?)',
                        (request['request_id'], self.run_id,
                         request['role'], worst, None, 'reserved'))
            con.execute('INSERT INTO controlled_attempts VALUES (?,?,?,?,?)',
                        (request['request_id'], self.run_id, request['operation_id'],
                         request['attempt_number'], policy.policy_hash))
            con.execute('COMMIT')
            return {'send_permitted': True, 'state': 'reserved'}


class GovernedDryRunGate:
    """No outbound transport. Rehearsed approval never means a paid-call grant."""
    def __init__(self, ledger: GovernedBudgetLedger, policy: DryRunPolicy):
        if not isinstance(ledger, GovernedBudgetLedger) or not isinstance(policy, DryRunPolicy):
            raise PolicyDenied('invalid_gateway_setup')
        self.ledger, self.policy = ledger, policy

    def simulate(self, request, fixture, *, now=None):
        worst = self.policy.preflight(request, now=now)
        if not isinstance(fixture, dict) or set(fixture) != {
            'provider', 'model', 'input_tokens', 'output_tokens',
            'reasoning_tokens', 'actual_micro_usd', 'successful'
        } or type(fixture['successful']) is not bool:
            raise PolicyDenied('synthetic_receipt_shape')
        self.ledger.reserve_controlled(self.policy, request, worst)
        try:
            if fixture['provider'] != self.policy.provider or fixture['model'] != self.policy.model_id:
                raise PolicyDenied('provider_or_model_drift')
            if not fixture['successful'] or fixture['actual_micro_usd'] is None:
                raise PolicyDenied('unknown_billing_or_timeout')
            for usage, ceiling in (('input_tokens', 'max_input_tokens'),
                                   ('output_tokens', 'max_output_tokens'),
                                   ('reasoning_tokens', 'max_reasoning_tokens')):
                _integer(fixture[usage], usage, zero=True)
                if fixture[usage] > request[ceiling]:
                    raise PolicyDenied('reported_token_overflow')
            _integer(fixture['actual_micro_usd'], 'provider_cost', zero=True)
            minimum = self.policy.quote(fixture['input_tokens'], fixture['output_tokens'],
                                        fixture['reasoning_tokens'], fixed=False)
            if fixture['actual_micro_usd'] < minimum:
                raise PolicyDenied('usage_cost_mismatch')
            self.ledger.settle(request['request_id'], fixture['actual_micro_usd'])
            return {'request_id': request['request_id'], 'reserved_micro_usd': worst,
                    'actual_micro_usd': fixture['actual_micro_usd'], 'state': 'settled',
                    'external_calls': 0, 'approval_state': 'synthetic_only'}
        except Exception:
            try:
                self.ledger.hold(request['request_id'])
            except BudgetDenied:
                pass
            raise
