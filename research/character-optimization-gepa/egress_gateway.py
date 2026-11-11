"""No-network gateway placeholder for the unapproved GEPA experiment phase.

Intentionally refuses ALL student/teacher/judge/holdout network dispatches.
Attaching a transport must be a separately reviewed implementation, not a flag.
"""
from budget_ledger import AdmissionDenied


class ClosedEgressGateway:
    supported_roles = frozenset({"student", "reflection", "judge", "holdout"})

    def dispatch(self, *, role: str, request_id: str, payload: object):
        # Do not inspect, log, or serialize payload: it can contain private data.
        if role not in self.supported_roles:
            raise AdmissionDenied("UNKNOWN_MODEL_ROLE")
        raise AdmissionDenied("LIVE_NETWORK_EGRESS_NOT_IMPLEMENTED")
