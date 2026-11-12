"""Unix-socket dry-run gate. No external network or API provider transport.

The host owns the SQLite budget ledger. Clients may only send synthetic metadata.
A real provider gateway is a separate unimplemented deployment and requires owner approval.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
import socket
import socketserver
import stat
import threading
from offline_egress_gate import OfflineEgressGate, SyntheticResponse
from governed_dry_run import GovernedDryRunGate
from krw500_synthetic_ledger import YeoulKrw500SyntheticLedger

REQUEST_KEYS = {'request_id', 'role', 'model_id', 'max_charge_micro_usd', 'fixture'}
FIXTURE_KEYS = {'provider', 'model', 'actual_micro_usd', 'successful'}
MAX_BYTES = 4096


class SocketGatewayError(ValueError):
    pass


def handle_request(gate: OfflineEgressGate | None, request: object, governed_gate=None,
                   *, krw500_only: bool = False) -> dict:
    # Strict 500 KRW synthetic mode cannot delegate to an unprotected legacy
    # USD-only gate, even when the caller supplies a valid-looking old request.
    if krw500_only and (
        gate is not None or not isinstance(governed_gate, GovernedDryRunGate)
        or not isinstance(governed_gate.ledger, YeoulKrw500SyntheticLedger)
    ):
        raise SocketGatewayError('krw500_protected_route_required')
    # No client may supply an approval claim to this synthetic-only route.
    if isinstance(request, dict) and set(request) == {'kind', 'request', 'fixture'}:
        if request['kind'] != 'governed_dry_run' or governed_gate is None:
            raise SocketGatewayError('governed_dry_run_only')
        return governed_gate.simulate(request['request'], request['fixture'])
    if krw500_only:
        raise SocketGatewayError('legacy_unprotected_route_disabled')
    if not isinstance(request, dict) or set(request) != REQUEST_KEYS:
        raise SocketGatewayError('request_shape')
    fixture = request['fixture']
    if not isinstance(fixture, dict) or set(fixture) != FIXTURE_KEYS:
        raise SocketGatewayError('synthetic_fixture_required')
    if not isinstance(fixture['successful'], bool):
        raise SocketGatewayError('invalid_fixture')
    synthetic = SyntheticResponse(**fixture)
    return gate.simulate(request_id=request['request_id'], role=request['role'],
                         model_id=request['model_id'], max_charge_micro_usd=request['max_charge_micro_usd'],
                         fixture=synthetic)


class _Handler(socketserver.StreamRequestHandler):
    def handle(self):
        raw = self.rfile.readline(MAX_BYTES + 1)
        if not raw or len(raw) > MAX_BYTES or not raw.endswith(b'\n'):
            self._respond({'ok': False, 'error': 'invalid_request_size'})
            return
        try:
            req = json.loads(raw.decode('utf-8'))
            outcome = handle_request(self.server.gate, req, self.server.governed_gate,
                                     krw500_only=self.server.krw500_only)
            self._respond({'ok': True, 'result': outcome})
        except (UnicodeError, json.JSONDecodeError, ValueError, TypeError) as exc:
            # Internal path/token errors must not be copied to the caller or CI logs.
            self._respond({'ok': False, 'error': type(exc).__name__})

    def _respond(self, data):
        self.wfile.write((json.dumps(data, separators=(',', ':'), sort_keys=True) + '\n').encode('utf-8'))


class LocalSocketGateway(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(self, path: str | Path, gate: OfflineEgressGate | None,
                 governed_gate=None, *, krw500_only: bool = False):
        if type(krw500_only) is not bool:
            raise SocketGatewayError('invalid_krw_mode')
        if krw500_only:
            if (gate is not None or not isinstance(governed_gate, GovernedDryRunGate)
                    or not isinstance(governed_gate.ledger, YeoulKrw500SyntheticLedger)):
                raise SocketGatewayError('krw500_protected_route_required')
        elif not isinstance(gate, OfflineEgressGate):
            raise SocketGatewayError('legacy_synthetic_gate_required')
        target = Path(path)
        if target.is_symlink() or target.exists() or not target.parent.is_dir():
            raise SocketGatewayError('socket_path_not_private_or_available')
        if stat.S_IMODE(target.parent.stat().st_mode) & 0o077:
            raise SocketGatewayError('socket_parent_not_private')
        super().__init__(str(target), _Handler)
        self.gate = gate
        self.governed_gate = governed_gate
        self.krw500_only = krw500_only
        os.chmod(target, 0o600)

    def server_close(self):
        path = self.server_address
        super().server_close()
        if os.path.exists(path):
            os.unlink(path)


def submit(socket_path: str, request: dict, timeout=3) -> dict:
    serialized = (json.dumps(request, separators=(',', ':')) + '\n').encode('utf-8')
    if len(serialized) > MAX_BYTES:
        raise SocketGatewayError('request_too_large')
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
        sock.settimeout(timeout)
        sock.connect(socket_path)
        sock.sendall(serialized)
        response = b''
        while not response.endswith(b'\n'):
            part = sock.recv(4096)
            if not part or len(response) + len(part) > MAX_BYTES:
                raise SocketGatewayError('invalid_gateway_response')
            response += part
    return json.loads(response.decode('utf-8'))