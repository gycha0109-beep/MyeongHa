"""Single-host, transaction-based offline API budget governor. No network clients here."""
import os
import sqlite3
from pathlib import Path

ROLES = {'student', 'reflection', 'judge', 'holdout'}


class BudgetDenied(ValueError):
    pass


def _positive(value, name, allow_zero=False):
    if not isinstance(value, int) or isinstance(value, bool) or (value < 0 if allow_zero else value <= 0):
        raise BudgetDenied(name)
    return value


class BudgetLedger:
    def __init__(self, path, *, run_id, max_spend_micro_usd, max_attempts, role_caps):
        self.path = Path(path).resolve(strict=False)
        self.run_id = run_id
        if not isinstance(run_id, str) or not run_id or len(run_id) > 120:
            raise BudgetDenied('run_id')
        _positive(max_spend_micro_usd, 'max_spend_micro_usd', allow_zero=True)
        _positive(max_attempts, 'max_attempts', allow_zero=True)
        if not isinstance(role_caps, dict) or set(role_caps) != ROLES:
            raise BudgetDenied('role_caps')
        for value in role_caps.values():
            _positive(value, 'role_cap', allow_zero=True)
        self.limits = (max_spend_micro_usd, max_attempts, role_caps)
        if self.path.is_symlink():
            raise BudgetDenied('symlink_ledger')
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with self._connect() as con:
            con.execute('CREATE TABLE IF NOT EXISTS config (run_id TEXT PRIMARY KEY, max_spend INTEGER NOT NULL, max_attempts INTEGER NOT NULL, role_caps TEXT NOT NULL)')
            con.execute('CREATE TABLE IF NOT EXISTS attempts (request_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, role TEXT NOT NULL, reserved INTEGER NOT NULL, settled INTEGER, state TEXT NOT NULL CHECK(state IN (\'reserved\',\'settled\',\'held\')))')
            import json
            config = (run_id, max_spend_micro_usd, max_attempts, json.dumps(role_caps, sort_keys=True))
            con.execute('INSERT OR IGNORE INTO config VALUES (?,?,?,?)', config)
            if con.execute('SELECT * FROM config WHERE run_id=?', (run_id,)).fetchone() != config:
                raise BudgetDenied('config_changed_after_start')

    def _connect(self):
        con = sqlite3.connect(str(self.path), isolation_level=None, timeout=4)
        con.execute('PRAGMA journal_mode=WAL')
        con.execute('PRAGMA busy_timeout=4000')
        return con

    def reserve(self, request_id, role, worst_case_micro_usd):
        """Fail closed. A reservation must be persisted before the caller sends a request."""
        if not isinstance(request_id, str) or not request_id or len(request_id)>160 or role not in ROLES:
            raise BudgetDenied('request_identity')
        _positive(worst_case_micro_usd,'cost_reservation')
        with self._connect() as con:
            con.execute('BEGIN IMMEDIATE')
            previous = con.execute('SELECT role,reserved,state FROM attempts WHERE request_id=?',(request_id,)).fetchone()
            if previous:
                if previous[0] == role and previous[1] == worst_case_micro_usd:
                    con.execute('COMMIT')
                    return {'request_id':request_id,'state':previous[2],'reused':True,'send_permitted':False}
                raise BudgetDenied('request_id_reuse_conflict')
            spent = con.execute('SELECT COALESCE(SUM(reserved),0),COUNT(*) FROM attempts WHERE run_id=?',(self.run_id,)).fetchone()
            role_count = con.execute('SELECT COUNT(*) FROM attempts WHERE run_id=? AND role=?',(self.run_id,role)).fetchone()[0]
            total, attempts = spent
            max_spend, max_attempts, role_caps = self.limits
            if total + worst_case_micro_usd > max_spend or attempts >= max_attempts or role_count >= role_caps[role]:
                raise BudgetDenied('budget_or_attempt_limit')
            con.execute('INSERT INTO attempts VALUES(?,?,?,?,?,?)',(request_id,self.run_id,role,worst_case_micro_usd,None,'reserved'))
            con.execute('COMMIT')
            return {'request_id':request_id,'state':'reserved','reused':False,'send_permitted':True}

    def settle(self, request_id, actual_micro_usd):
        _positive(actual_micro_usd,'actual_cost',allow_zero=True)
        with self._connect() as con:
            con.execute('BEGIN IMMEDIATE')
            entry=con.execute('SELECT reserved,settled,state FROM attempts WHERE request_id=? AND run_id=?',(request_id,self.run_id)).fetchone()
            if not entry:
                raise BudgetDenied('unknown_request')
            reserved,settled,state=entry
            if state=='settled':
                if settled != actual_micro_usd:
                    raise BudgetDenied('conflicting_settlement')
                con.execute('COMMIT')
                return 'settled'
            if state=='held' or actual_micro_usd>reserved:
                con.execute('UPDATE attempts SET state=\'held\' WHERE request_id=?',(request_id,))
                con.execute('COMMIT')
                raise BudgetDenied('uncertain_or_over_reserved')
            # Reservation is never released below the worst-case amount, as concurrent
            # attempts might already exist and provider pricing/usage might be delayed.
            con.execute('UPDATE attempts SET state=\'settled\',settled=? WHERE request_id=?',(actual_micro_usd,request_id))
            con.execute('COMMIT')
            return 'settled'

    def hold(self, request_id):
        with self._connect() as con:
            con.execute('BEGIN IMMEDIATE')
            row=con.execute('SELECT state FROM attempts WHERE request_id=? AND run_id=?',(request_id,self.run_id)).fetchone()
            if not row or row[0]!='reserved':
                raise BudgetDenied('hold_requires_reservation')
            con.execute('UPDATE attempts SET state=\'held\' WHERE request_id=?',(request_id,))
            con.execute('COMMIT')

    def status(self):
        with self._connect() as con:
            total,count=con.execute('SELECT COALESCE(SUM(reserved),0),COUNT(*) FROM attempts WHERE run_id=?',(self.run_id,)).fetchone()
            held=con.execute('SELECT COUNT(*) FROM attempts WHERE run_id=? AND state=\'held\'',(self.run_id,)).fetchone()[0]
            return {'reserved_micro_usd':total,'attempts':count,'held':held,'max_spend_micro_usd':self.limits[0],
                    'real_api_requests_sent_by_this_module':0}