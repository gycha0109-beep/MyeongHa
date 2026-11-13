"""Run the *real pinned GEPA* with synthetic data and freeze an unapproved packet.

Intended only for the OS-denied-network GEPA container in character GEPA CI.
The CLI cannot admit production or paid model traffic; it has no provider clients.
"""
from __future__ import annotations

import importlib
import json
import os
from pathlib import Path
import socket
import sys
from unittest.mock import patch

from gepa_api_contract import build_offline_gepa_kwargs
from gepa_result_proposal import freeze_offline_gepa_result
from runner import preflight, probe_installed_gepa
from test_pinned_gepa_offline import NoNetworkReflector

SEED = "Respond clearly in natural Korean."
CHARACTERS = {"yeoul", "seyeon"}


def offline_only(*args, **kwargs):
    raise AssertionError("network and model calls forbidden in synthetic cross-language proof")


def run(proof_dir: Path):
    root = proof_dir.resolve(strict=True)
    if proof_dir.is_symlink() or not root.is_dir():
        raise ValueError("synthetic proof directory required")
    envelope = json.loads((root / "envelope.json").read_text(encoding="utf-8"))
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    seed = (root / "seed.txt").read_text(encoding="utf-8")
    if seed != SEED:
        raise ValueError("only the static synthetic seed is permitted")
    preflight(envelope)
    if envelope.get("mutableSlot") != "shared_expression":
        raise ValueError("shared synthetic slot required")
    if {x["characterId"] for x in envelope["dataset"]} != CHARACTERS:
        raise ValueError("only static synthetic character cohort is permitted")
    if envelope["runManifestSha256"] != manifest.get("manifestSha256"):
        raise ValueError("synthetic run manifest mismatch")
    if manifest.get("externalCallsAuthorized") is not False:
        raise ValueError("external calls remain blocked")
    probe = probe_installed_gepa()
    if not probe["api_compatible"]:
        raise RuntimeError("pinned GEPA API not compatible")

    module = importlib.import_module("gepa.optimize_anything")
    refl = importlib.import_module("gepa.proposer.reflective_mutation.reflection_lm")
    strategy = NoNetworkReflector(refl.ReflectionProposal)
    out = root / "optimizer-output"
    out.mkdir(mode=0o700, exist_ok=False)

    def judge(candidate, example):
        # No text lookup, LM evaluation or user data. This is not a quality score.
        character = example["characterId"]
        if character not in CHARACTERS:
            raise ValueError("foreign character in synthetic evaluation")
        improved = "concise answers" in candidate["shared_expression"]
        baseline = {"yeoul": 0.2, "seyeon": 0.4}[character]
        # A higher shared average masks a SeYeon regression. The Node
        # verification must flag it using this very same selected candidate.
        return ({"yeoul": 0.95, "seyeon": 0.3}[character] if improved else baseline), {
            "failure_codes": [],
            "character_id": character,
            "raw_dialogue_excluded": True,
            "uncertain": False,
        }

    def config_factory(**kwargs):
        kwargs["max_token_cost"] = None
        kwargs["engine_config"]["reflection"]["reflection_strategy"] = strategy
        kwargs["engine_config"].update({
            "merge": None, "refiner": None,
            "tracking": {"use_wandb": False, "use_mlflow": False},
        })
        return module.OptimizeAnythingConfig(**kwargs)

    kwargs = build_offline_gepa_kwargs(
        envelope, seed_text=seed, evaluator=judge,
        reflection_lm=offline_only, output_dir=str(out),
        repository_root="/opt/myeongha", config_factory=config_factory,
        max_evals=10,
    )
    with patch.object(socket.socket, "connect", side_effect=offline_only), \
            patch.object(socket.socket, "connect_ex", side_effect=offline_only), \
            patch("socket.create_connection", side_effect=offline_only):
        result = module.optimize_anything(**kwargs)

    if strategy.calls < 1:
        raise AssertionError("pinned GEPA did not propose an offline candidate")
    packet = freeze_offline_gepa_result(
        result, envelope,
        immutable_sources_sha256=manifest["immutableSourcesSha256"],
        max_evals=10,
    )
    if packet["externalCalls"] != 0 or packet["productionEligible"] is not False:
        raise AssertionError("GEPA frozen packet violated research-only gate")

    def restricted_write(name, value):
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        fd = os.open(root / name, flags, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as sink:
            json.dump(value, sink, ensure_ascii=False, sort_keys=True)

    # Unlike the old independent 0.5/0.5 fixture, this evidence is derived
    # from the real returned GEPA candidate and the actual bounded evaluator.
    # The same synthetic evaluator/data were used by GEPA: NOT independent.
    candidate = result.best_candidate
    if "concise answers" not in candidate["shared_expression"]:
        raise AssertionError("synthetic GEPA did not select its improved-average candidate")
    family_scores = []
    with patch.object(socket.socket, "connect", side_effect=offline_only), \\
            patch.object(socket.socket, "connect_ex", side_effect=offline_only), \\
            patch("socket.create_connection", side_effect=offline_only):
        for example in envelope["dataset"]:
            base_score, base_feedback = kwargs["evaluator"](
                kwargs["seed_candidate"], example)
            candidate_score, new_feedback = kwargs["evaluator"](
                candidate, example)
            if (base_feedback["uncertain"] or new_feedback["uncertain"]
                    or base_feedback["failure_codes"]
                    or new_feedback["failure_codes"]):
                raise AssertionError("synthetic candidate violated eval guard")
            family_scores.append({
                "characterId": example["characterId"],
                "split": example["split"],
                "familyId": example["familyId"],
                "baselineScore": base_score,
                "candidateScore": candidate_score,
                "failureCodes": [],
                "uncertain": False,
            })
    if not (all(x["candidateScore"] > x["baselineScore"]
                for x in family_scores if x["characterId"] == "yeoul")
            and all(x["candidateScore"] < x["baselineScore"]
                    for x in family_scores if x["characterId"] == "seyeon")):
        raise AssertionError("synthetic regression fixture was not exercised")
    report = {
        "schemaVersion": "character-gepa-synthetic-family-evidence-v1",
        "runManifestSha256": manifest["manifestSha256"],
        "sourceSeedSha256": envelope["candidateSha256"],
        "candidateTextSha256": packet["proposal"]["textSha256"],
        "sourceType": "actual_bounded_gepa_evaluator_synthetic_only",
        "scalarRepeatedAcrossDimensions": True,
        "independentEvaluation": False,
        "familyScores": family_scores,
        "externalCalls": 0,
        "productionEligible": False,
    }
    restricted_write("frozen-result.json", packet)
    restricted_write("synthetic-family-scores.json", report)
    print("Pinned GEPA result and actual synthetic family comparisons frozen; external calls 0.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: gepa_crosslang_synthetic_handoff.py ABSOLUTE_PROOF_DIR")
    run(Path(sys.argv[1]))
