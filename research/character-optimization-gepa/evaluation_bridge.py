"""Safely invoke the offline Node evaluator with whitelisted metadata, not raw chats.

The Python GEPA runner and model transport are NOT implemented here.
"""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path


class EvaluationBridgeError(RuntimeError):
    pass


class OfflineEvaluationBridge:
    def __init__(self, *, node_binary: str, bridge_script: str | Path):
        self.node_binary = node_binary
        self.bridge_script = Path(bridge_script).resolve(strict=True)
        if self.bridge_script.name != 'offline-evaluator-bridge.mjs':
            raise EvaluationBridgeError('UNAPPROVED_EVALUATION_PROGRAM')

    def evaluate(self, evidence: list[dict]):
        # The called Node module rejects all unknown fields and input text.
        request = {'schemaVersion':'character-optimization-evidence-bridge-v1','evidence':evidence}
        encoded = json.dumps(request,ensure_ascii=False,separators=(',',':'))
        if len(encoded) > 65536:
            raise EvaluationBridgeError('EVALUATION_PAYLOAD_TOO_LARGE')
        try:
            result = subprocess.run(
                [self.node_binary,str(self.bridge_script)],
                input=encoded,text=True,capture_output=True,timeout=12,check=False,
                env={'PATH':os.environ.get('PATH','')},
            )
        except (OSError,subprocess.TimeoutExpired):
            raise EvaluationBridgeError('EVALUATION_CHILD_FAILED') from None
        if result.returncode != 0:
            raise EvaluationBridgeError('EVALUATION_CHILD_REJECTED')
        try:
            report=json.loads(result.stdout)
        except json.JSONDecodeError:
            raise EvaluationBridgeError('EVALUATION_OUTPUT_INVALID') from None
        if (report.get('schemaVersion')!='character-optimization-evidence-bridge-result-v1'
                or report.get('modelCalls')!=0 or report.get('productionChanges') is not False
                or report.get('promotionAllowed') is not False):
            raise EvaluationBridgeError('EVALUATION_UNTRUSTED_RESULT')
        return report
