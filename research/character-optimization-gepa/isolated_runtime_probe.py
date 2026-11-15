"""Synthetic-only Docker OS boundary proof. Never reads user messages or invokes models."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import socket


def probe(mode: str, host_sealed_path: str) -> dict[str, object]:
    if mode not in {'optimizer', 'holdout'}:
        raise ValueError('unknown_isolation_mode')
    if not os.path.isabs(host_sealed_path):
        raise ValueError('host_sealed_path_requires_absolute_path')
    # Neither test image nor the code mount may include network-enabled credentials.
    if any(os.getenv(x) for x in ('OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY')):
        raise RuntimeError('model_credentials_present')
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(1.0)
        if sock.connect_ex(('1.1.1.1', 443)) == 0:
            raise RuntimeError('network_egress_reachable')
    code_mount = Path('/opt/myeongha')
    if not code_mount.is_dir():
        raise RuntimeError('missing_source_mount')
    try:
        (code_mount / 'unexpected-write.txt').write_text('bad', encoding='utf-8')
    except OSError:
        pass
    else:
        raise RuntimeError('read_only_source_bypass')
    private_mount = Path('/private/sealed/synthetic.json')
    if mode == 'optimizer':
        if Path(host_sealed_path).exists() or private_mount.exists():
            raise RuntimeError('optimizer_has_sealed_file_access')
        return {'mode': 'optimizer', 'network_denied': True, 'holdout_access': False,
                'source_read_only': True, 'external_calls': 0}
    if not private_mount.is_file():
        raise RuntimeError('final_evaluator_missing_private_mount')
    content = json.loads(private_mount.read_text(encoding='utf-8'))
    if content != {'synthetic_holdout': True, 'cases': 2}:
        raise RuntimeError('unexpected_private_holdout_content')
    return {'mode': 'holdout', 'network_denied': True, 'holdout_access': True,
            'source_read_only': True, 'external_calls': 0}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['optimizer', 'holdout'], required=True)
    parser.add_argument('--host-sealed-path', required=True)
    args = parser.parse_args()
    print(json.dumps(probe(args.mode, args.host_sealed_path), sort_keys=True))


if __name__ == '__main__':
    main()