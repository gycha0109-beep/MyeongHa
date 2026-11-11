"""Private offline-only atomic ledger for simulated model-call reservations.

No HTTP client, model integration, environment credential access, or approvals.
Real dispatch requires a separately approved and implemented egress gateway.
"""
from __future__ import annotations

import json
import os
import sqlite3
import stat
from contextlib import contextmanager
from pathlib import Path

ROLES = ("student", "reflection", "judge", "holdout")
STATES = ("RESERVED", "DISPATCHED", "SETTLED", "UNKNOWN", "OVERRUN", "CANCELLED")


class AdmissionDenied(RuntimeError):
    pass


class BudgetLedger:
    def __init__(self, private_db_path: str | Path, *, run_id: str, max_total_usd_micros: int,
                 max_attempts: int, max_calls_by_role: dict[str, int]):
        self.path = Path(private_db_path).expanduser().resolve()
        if not self.path.is_absolute() or self.path.suffix != ".sqlite3":
            raise AdmissionDenied("PRIVATE_ABSOLUTE_SQLITE_PATH_REQUIRED")
        parent = self.path.parent
        if not parent.is_dir() or stat.S_IMODE(parent.stat().st_mode) & 0o077:
            raise AdmissionDenied("PRIVATE_DIRECTORY_PERMISSIONS_REQUIRED")
        if self.path.exists() and (not self.path.is_file() or stat.S_IMODE(self.path.stat().st_mode) & 0o077):
            raise AdmissionDenied("PRIVATE_LEDGER_PERMISSIONS_REQUIRED")
        if not isinstance(run_id, str) or not run_id or len(run_id) > 128:
            raise AdmissionDenied("INVALID_RUN_ID")
        if not isinstance(max_total_usd_micros, int) or max_total_usd_micros < 0 or max_total_usd_micros > 10**12:
            raise AdmissionDenied("INVALID_TOTAL_BUDGET")
        if not isinstance(max_attempts, int) or max_attempts < 0 or max_attempts > 10**8:
            raise AdmissionDenied("INVALID_ATTEMPT_LIMIT")
        if set(max_calls_by_role) != set(ROLES) or any(type(v) is not int or v < 0 or v > max_attempts for v in max_calls_by_role.values()):
            raise AdmissionDenied("INVALID_ROLE_LIMITS")
        self.run_id = run_id
        self.max_total = max_total_usd_micros
        self.max_attempts = max_attempts
        self.max_calls_by_role = dict(max_calls_by_role)
        self._prepare_db()

    @contextmanager
    def _db(self):
        connection = sqlite3.connect(self.path, timeout=20, isolation_level=None)
        try:
            connection.execute("PRAGMA busy_timeout=20000")
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("PRAGMA synchronous=FULL")
            yield connection
        finally:
            connection.close()

    def _prepare_db(self):
        if not self.path.exists():
            handle = os.open(str(self.path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.close(handle)
        with self._db() as db:
            db.execute("CREATE TABLE IF NOT EXISTS plan (run_id TEXT PRIMARY KEY, policy_json TEXT NOT NULL)")
            db.execute("""CREATE TABLE IF NOT EXISTS attempts (
                request_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, role TEXT NOT NULL,
                quoted_micros INTEGER NOT NULL, state TEXT NOT NULL,
                actual_micros INTEGER, FOREIGN KEY(run_id) REFERENCES plan(run_id))""")
            policy = json.dumps({"run_id": self.run_id,"max_total": self.max_total,
                                 "max_attempts": self.max_attempts,"roles": self.max_calls_by_role},
                                sort_keys=True, separators=(",", ":"))
            db.execute("BEGIN IMMEDIATE")
            try:
                prior = db.execute("SELECT policy_json FROM plan WHERE run_id=?", (self.run_id,)).fetchone()
                if prior and prior[0] != policy:
                    raise AdmissionDenied("PLAN_CHANGED_AFTER_INITIALIZATION")
                if not prior:
                    db.execute("INSERT INTO plan (run_id, policy_json) VALUES (?,?)",(self.run_id,policy))
                db.execute("COMMIT")
            except Exception:
                db.execute("ROLLBACK")
                raise

    def _reserved_spend(self, db):
        result = db.execute("""SELECT COALESCE(SUM(CASE WHEN state='SETTLED' THEN actual_micros
          ELSE quoted_micros END),0) FROM attempts WHERE run_id=? AND state IN
          ('RESERVED','DISPATCHED','SETTLED','UNKNOWN','OVERRUN')""", (self.run_id,)).fetchone()
        return result[0]

    def reserve(self, request_id: str, role: str, quoted_micros: int):
        if not isinstance(request_id, str) or not 1 <= len(request_id) <= 128 or not request_id.isascii():
            raise AdmissionDenied("INVALID_REQUEST_ID")
        if role not in ROLES or type(quoted_micros) is not int or quoted_micros <= 0:
            raise AdmissionDenied("INVALID_RESERVATION")
        with self._db() as db:
            db.execute("BEGIN IMMEDIATE")
            try:
                if db.execute("SELECT 1 FROM attempts WHERE request_id=?",(request_id,)).fetchone():
                    raise AdmissionDenied("REPLAY_REQUEST_ID")
                if db.execute("SELECT 1 FROM attempts WHERE run_id=? AND state IN ('UNKNOWN','OVERRUN') LIMIT 1",(self.run_id,)).fetchone():
                    raise AdmissionDenied("UNRECONCILED_OR_OVERRUN_REQUEST")
                attempts = db.execute("SELECT COUNT(*) FROM attempts WHERE run_id=?",(self.run_id,)).fetchone()[0]
                count = db.execute("SELECT COUNT(*) FROM attempts WHERE run_id=? AND role=?",(self.run_id,role)).fetchone()[0]
                if attempts >= self.max_attempts or count >= self.max_calls_by_role[role]:
                    raise AdmissionDenied("CALL_BUDGET_EXHAUSTED")
                if self._reserved_spend(db) + quoted_micros > self.max_total:
                    raise AdmissionDenied("USD_BUDGET_EXHAUSTED")
                db.execute("INSERT INTO attempts (request_id,run_id,role,quoted_micros,state) VALUES (?,?,?,?,?)",
                           (request_id,self.run_id,role,quoted_micros,"RESERVED"))
                db.execute("COMMIT")
            except Exception:
                db.execute("ROLLBACK")
                raise
        return {"request_id":request_id,"role":role,"reserved_micros":quoted_micros,"state":"RESERVED"}

    def transition(self, request_id: str, *, from_state: str, to_state: str, actual_micros=None):
        allowed = {("RESERVED","DISPATCHED"),("RESERVED","CANCELLED"),
                   ("DISPATCHED","SETTLED"),("DISPATCHED","UNKNOWN"),("DISPATCHED","OVERRUN")}
        if (from_state,to_state) not in allowed:
            raise AdmissionDenied("INVALID_STATE_TRANSITION")
        if to_state in ("SETTLED","OVERRUN"):
            if type(actual_micros) is not int or actual_micros < 0:
                raise AdmissionDenied("ACTUAL_COST_REQUIRED")
        elif actual_micros is not None:
            raise AdmissionDenied("UNEXPECTED_COST")
        with self._db() as db:
            db.execute("BEGIN IMMEDIATE")
            try:
                rec = db.execute("SELECT quoted_micros,state FROM attempts WHERE request_id=? AND run_id=?",(request_id,self.run_id)).fetchone()
                if not rec or rec[1]!=from_state:
                    raise AdmissionDenied("STATE_OR_REQUEST_MISMATCH")
                if to_state=="SETTLED" and actual_micros>rec[0]:
                    raise AdmissionDenied("SETTLE_OVER_QUOTE_REQUIRES_OVERRUN")
                if to_state=="OVERRUN" and actual_micros<=rec[0]:
                    raise AdmissionDenied("OVERRUN_REQUIRES_OVER_QUOTE")
                db.execute("UPDATE attempts SET state=?,actual_micros=? WHERE request_id=? AND run_id=?",
                           (to_state,actual_micros,request_id,self.run_id))
                db.execute("COMMIT")
            except Exception:
                db.execute("ROLLBACK")
                raise
        return {"request_id":request_id,"state":to_state}

    def summary(self):
        with self._db() as db:
            counts = dict(db.execute("SELECT state, COUNT(*) FROM attempts WHERE run_id=? GROUP BY state",(self.run_id,)).fetchall())
            return {"run_id":self.run_id,"counts":counts,"budget_micros":self.max_total,
                    "committed_or_reserved_micros":self._reserved_spend(db),
                    "network_calls_sent_by_this_module":0,
                    "live_dispatch_implemented":False}
