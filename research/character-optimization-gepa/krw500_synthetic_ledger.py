"""Synthetic-only dual USD/KRW reservation guard for Yeoul GEPA.

This research class extends the existing BEGIN IMMEDIATE reservation transaction.
No actual payer FX verification, trusted owner authority or provider transport exists.
Its persisted cap is the owner's *declared* cumulative KRW 500 maximum, not a grant.
"""
from __future__ import annotations

from budget_ledger import BudgetDenied
from governed_dry_run import GovernedBudgetLedger

CAP_KRW = 500
PILOT_ID = 'yeoul-gepa-owner-cap-2026-11-12'
MICRO_USD_TO_MILLI_KRW_DENOMINATOR = 1_000_000_000


def _nonnegative_int(value, name, *, positive=False):
    if type(value) is not int or value < (1 if positive else 0):
        raise BudgetDenied(name)
    return value


class YeoulKrw500SyntheticLedger(GovernedBudgetLedger):
    """Single-file, all-roles-and-runs KRW cap for fake providers only.

    The host must keep one durable ledger file for the entire Yeoul pilot.
    Moving/deleting/copying the ledger is NOT prevented here, so this is not
    an operational purchase limit or approval system.
    """

    def __init__(self, path, *, run_id, max_spend_micro_usd, max_attempts,
                 role_caps, upper_fx_milli_krw_per_usd, fixed_fees_krw):
        upper = _nonnegative_int(upper_fx_milli_krw_per_usd,
                                 'fx_upper_required', positive=True)
        fees = _nonnegative_int(fixed_fees_krw, 'fee_ceiling_required')
        if fees > CAP_KRW:
            raise BudgetDenied('fixed_fees_already_exceed_krw_cap')
        self.fx_upper = upper
        self.fixed_fees_krw = fees
        super().__init__(
            path, run_id=run_id, max_spend_micro_usd=max_spend_micro_usd,
            max_attempts=max_attempts, role_caps=role_caps,
        )
        with self._connect() as con:
            con.execute(
                'CREATE TABLE IF NOT EXISTS pilot_krw_scope ('
                'pilot_id TEXT PRIMARY KEY,cap_krw INTEGER NOT NULL,'
                'fx_upper_milli INTEGER NOT NULL,fixed_fees_krw INTEGER NOT NULL)'
            )
            con.execute(
                'CREATE TABLE IF NOT EXISTS pilot_krw_attempts ('
                'request_id TEXT PRIMARY KEY,pilot_id TEXT NOT NULL,'
                'run_id TEXT NOT NULL,reserved_krw INTEGER NOT NULL)'
            )
            scope = (PILOT_ID, CAP_KRW, upper, fees)
            con.execute('INSERT OR IGNORE INTO pilot_krw_scope VALUES (?,?,?,?)',
                        scope)
            if con.execute('SELECT * FROM pilot_krw_scope WHERE pilot_id=?',
                           (PILOT_ID,)).fetchone() != scope:
                raise BudgetDenied('pilot_krw_scope_changed_after_start')

    def _additional_budget_preflight(self, con, request, worst):
        """Called INSIDE the parent transaction, before any request is reserved."""
        scope = con.execute(
            'SELECT * FROM pilot_krw_scope WHERE pilot_id=?',
            (PILOT_ID,)
        ).fetchone()
        if scope != (PILOT_ID, CAP_KRW, self.fx_upper, self.fixed_fees_krw):
            raise BudgetDenied('pilot_krw_scope_changed_after_start')

        # Stop if another ledger writer bypassed this KRW guard on this run.
        total = con.execute(
            'SELECT COUNT(*) FROM attempts WHERE run_id=?',
            (self.run_id,)
        ).fetchone()[0]
        guarded = con.execute(
            'SELECT COUNT(*) FROM pilot_krw_attempts WHERE run_id=?',
            (self.run_id,)
        ).fetchone()[0]
        if total != guarded:
            raise BudgetDenied('unguarded_usd_reservations_present')

        next_krw = (
            worst * self.fx_upper + MICRO_USD_TO_MILLI_KRW_DENOMINATOR - 1
        ) // MICRO_USD_TO_MILLI_KRW_DENOMINATOR
        used = con.execute(
            'SELECT COALESCE(SUM(reserved_krw),0) FROM pilot_krw_attempts '
            'WHERE pilot_id=?',
            (PILOT_ID,)
        ).fetchone()[0]
        if used + next_krw + self.fixed_fees_krw > CAP_KRW:
            raise BudgetDenied('owner_declared_krw500_cap_exceeded')
        return next_krw

    def _additional_budget_record(self, con, request, worst, reservation):
        if type(reservation) is not int or reservation <= 0:
            raise BudgetDenied('krw_reservation_missing')
        con.execute(
            'INSERT INTO pilot_krw_attempts VALUES (?,?,?,?)',
            (request['request_id'], PILOT_ID, self.run_id, reservation)
        )

    def krw_status(self):
        with self._connect() as con:
            scope = con.execute(
                'SELECT * FROM pilot_krw_scope WHERE pilot_id=?',
                (PILOT_ID,)
            ).fetchone()
            if scope != (PILOT_ID, CAP_KRW, self.fx_upper, self.fixed_fees_krw):
                raise BudgetDenied('pilot_krw_scope_changed_after_start')
            charged, attempts = con.execute(
                'SELECT COALESCE(SUM(reserved_krw),0),COUNT(*) '
                'FROM pilot_krw_attempts WHERE pilot_id=?',
                (PILOT_ID,)
            ).fetchone()
            remaining = CAP_KRW - self.fixed_fees_krw - charged
            return {
                'pilot_id': PILOT_ID,
                'owner_declared_total_cap_krw': CAP_KRW,
                'reserved_requests_krw': charged,
                'fixed_fees_ceiling_krw': self.fixed_fees_krw,
                'remaining_unverified_krw': remaining,
                'all_roles_and_runs_attempts': attempts,
                'provider_fx_and_fee_authenticated': False,
                'owner_authority_authenticated': False,
                'new_credit_purchase_allowed': False,
                'external_calls_authorized': False,
                'external_calls': 0,
            }
