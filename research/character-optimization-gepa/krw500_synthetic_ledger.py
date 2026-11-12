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
                 role_caps, upper_fx_milli_krw_per_usd, fixed_fees_krw,
                 single_flight=False):
        upper = _nonnegative_int(upper_fx_milli_krw_per_usd,
                                 'fx_upper_required', positive=True)
        fees = _nonnegative_int(fixed_fees_krw, 'fee_ceiling_required')
        if fees > CAP_KRW:
            raise BudgetDenied('fixed_fees_already_exceed_krw_cap')
        if type(single_flight) is not bool:
            raise BudgetDenied('single_flight_mode_shape')
        self.fx_upper = upper
        self.fixed_fees_krw = fees
        self.single_flight = single_flight
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
            con.execute(
                'CREATE TABLE IF NOT EXISTS pilot_dispatch_scope ('
                'pilot_id TEXT PRIMARY KEY,dispatch_mode TEXT NOT NULL)'
            )
            dispatch = (PILOT_ID, self._dispatch_mode)
            con.execute('INSERT OR IGNORE INTO pilot_dispatch_scope VALUES (?,?)',
                        dispatch)
            if con.execute('SELECT * FROM pilot_dispatch_scope WHERE pilot_id=?',
                           (PILOT_ID,)).fetchone() != dispatch:
                raise BudgetDenied('pilot_dispatch_mode_changed_after_start')
            scope = (PILOT_ID, CAP_KRW, upper, fees)
            con.execute('INSERT OR IGNORE INTO pilot_krw_scope VALUES (?,?,?,?)',
                        scope)
            if con.execute('SELECT * FROM pilot_krw_scope WHERE pilot_id=?',
                           (PILOT_ID,)).fetchone() != scope:
                raise BudgetDenied('pilot_krw_scope_changed_after_start')

    @property
    def _dispatch_mode(self):
        return 'strict-single-flight-v1' if self.single_flight else 'synthetic-parallel-v1'

    def _check_dispatch_mode(self, con):
        if con.execute('SELECT * FROM pilot_dispatch_scope WHERE pilot_id=?',
                       (PILOT_ID,)).fetchone() != (PILOT_ID, self._dispatch_mode):
            raise BudgetDenied('pilot_dispatch_mode_changed_after_start')

    def _additional_budget_preflight(self, con, request, worst):
        """Called INSIDE the parent transaction, before any request is reserved."""
        self._check_dispatch_mode(con)
        scope = con.execute(
            'SELECT * FROM pilot_krw_scope WHERE pilot_id=?',
            (PILOT_ID,)
        ).fetchone()
        if scope != (PILOT_ID, CAP_KRW, self.fx_upper, self.fixed_fees_krw):
            raise BudgetDenied('pilot_krw_scope_changed_after_start')

        # This is one pilot-wide file, NOT an independent 500-KRW allowance
        # for every run. A dollar-only reservation under *any* run here is
        # untracked by KRW and makes the entire synthetic pilot unsafe.
        total = con.execute(
            'SELECT COUNT(*) FROM attempts'
        ).fetchone()[0]
        guarded = con.execute(
            'SELECT COUNT(*) FROM pilot_krw_attempts WHERE pilot_id=?',
            (PILOT_ID,)
        ).fetchone()[0]
        if total != guarded:
            raise BudgetDenied('unguarded_usd_reservations_present')

        # Strict admission is pilot-wide, not run-wide. A process can crash
        # after reserving but before/after sending; both are indistinguishable.
        # Preserve the reservation and reject the next paid-dispatch candidate.
        if self.single_flight and con.execute(
            "SELECT 1 FROM attempts WHERE state='reserved' LIMIT 1"
        ).fetchone():
            raise BudgetDenied('pilot_inflight_requires_reconciliation')

        # Parent checks held charges for this run; stop the complete pilot
        # if a different run left any unknown charge. Never release its quote.
        if con.execute(
            'SELECT 1 FROM attempts a JOIN pilot_krw_attempts p '
            'ON p.request_id=a.request_id '
            'WHERE p.pilot_id=? AND a.state=\'held\' LIMIT 1',
            (PILOT_ID,)
        ).fetchone():
            raise BudgetDenied('pilot_unreconciled_charge_halts_all_runs')

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
            self._check_dispatch_mode(con)
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
            pilot_inflight = con.execute(
                "SELECT COUNT(*) FROM attempts WHERE state='reserved'"
            ).fetchone()[0]
            all_usd_attempts = con.execute(
                'SELECT COUNT(*) FROM attempts'
            ).fetchone()[0]
            pilot_held = con.execute(
                'SELECT COUNT(*) FROM attempts a JOIN pilot_krw_attempts p '
                'ON p.request_id=a.request_id '
                'WHERE p.pilot_id=? AND a.state=\'held\'',
                (PILOT_ID,)
            ).fetchone()[0]
            return {
                'pilot_id': PILOT_ID,
                'owner_declared_total_cap_krw': CAP_KRW,
                'reserved_requests_krw': charged,
                'fixed_fees_ceiling_krw': self.fixed_fees_krw,
                'remaining_unverified_krw': remaining,
                'all_roles_and_runs_attempts': attempts,
                'pilot_unreconciled_charges': pilot_held,
                'pilot_pending_charge_reservations': pilot_inflight,
                'strict_single_flight': self.single_flight,
                'unguarded_usd_attempts_detected': all_usd_attempts != attempts,
                'pilot_ledger_global_hold_clear': (
                    pilot_held == 0 and all_usd_attempts == attempts
                    and (not self.single_flight or pilot_inflight == 0)
                ),
                'provider_fx_and_fee_authenticated': False,
                'owner_authority_authenticated': False,
                'new_credit_purchase_allowed': False,
                'external_calls_authorized': False,
                'external_calls': 0,
            }


class YeoulKrw500SingleFlightLedger(YeoulKrw500SyntheticLedger):
    """Strict synthetic rehearsal for a future live gateway, never a live grant.

    One unresolved in-flight reservation across *any* role/run blocks all later
    reservations, including after restart. Mode is immutable per ledger file.
    Actual owner authority, reliable tariffs and network send remain absent.
    """

    def __init__(self, *args, **kwargs):
        if 'single_flight' in kwargs:
            raise BudgetDenied('single_flight_mode_is_fixed')
        super().__init__(*args, single_flight=True, **kwargs)
