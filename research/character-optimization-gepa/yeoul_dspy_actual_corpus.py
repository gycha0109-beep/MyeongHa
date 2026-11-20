"""Import verified v5/v6 Luna pairs into a *review-pending* DSPy corpus.

Usage: python yeoul_dspy_actual_corpus.py --input ...json --summary ...json
This does not assign human preferences or run an optimizer.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

EXPECTED_IDS = (
    "snack", "umbrella", "socks", "desk", "praise", "rivalry",
    "interest_unknown", "interest_confirmed", "hurt"
)

def load_pairs(path: Path):
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    if data.get("model") != "openai/gpt-6-luna":
        raise ValueError("model_mismatch")
    if data.get("completedCalls") != 18 or data.get("plannedCalls") != 18:
        raise ValueError("incomplete_18_calls")
    rows = data.get("rows")
    if not isinstance(rows, list) or len(rows) != len(EXPECTED_IDS):
        raise ValueError("wrong_pair_count")
    if set(r.get("id") for r in rows) != set(EXPECTED_IDS):
        raise ValueError("wrong_scenario_ids")
    checked = []
    for row in rows:
        if not isinstance(row.get("message"), str) or not row["message"].strip():
            raise ValueError("missing_prompt")
        if row.get("relationship") not in {"unknown", "acquaintance", "close"}:
            raise ValueError("unknown_relationship")
        if not isinstance(row.get("verifiedEventCount"), int) or row["verifiedEventCount"] < 0:
            raise ValueError("invalid_event_count")
        texts = {}
        for version in ("v5", "v6"):
            result = row.get(version)
            if not isinstance(result, dict):
                raise ValueError("missing_version")
            answer = result.get("text")
            if not isinstance(answer, str) or not answer.strip():
                raise ValueError("missing_answer")
            texts[version] = answer.strip()
        checked.append({
            "id": row["id"], "message": row["message"],
            "relationship": row["relationship"],
            "verifiedEventCount": row["verifiedEventCount"],
            **texts
        })
    return sorted(checked, key=lambda row: EXPECTED_IDS.index(row["id"]))

def summarize(pairs, input_path: Path):
    return {
        "status": "LIVE_RESPONSES_IMPORTED_HUMAN_UNREVIEWED",
        "source_sha256": hashlib.sha256(input_path.read_bytes()).hexdigest(),
        "source_model": "openai/gpt-6-luna",
        "pairs": len(pairs),
        "responses": len(pairs) * 2,
        "identifiers": [p["id"] for p in pairs],
        "relationship_counts": dict(Counter(p["relationship"] for p in pairs)),
        "human_ratings": 0,
        "automated_quality_claims": 0,
        "gepa_learning_ready": False,
        "can_optimize_style": False,
        "comparison": "same recorded inputs; no inferred win/loss labels",
        "actual_provider_calls": 0,
    }

def export_dspy_examples(pairs):
    import dspy
    # Version comparison is two separate outputs for one example, without gold/labels.
    return [
        dspy.Example(
            scene=p["message"],
            relationship=p["relationship"],
            verifiedEventCount=p["verifiedEventCount"],
            v5_response=p["v5"],
            v6_response=p["v6"],
            case_id=p["id"],
        ).with_inputs("scene", "relationship", "verifiedEventCount")
        for p in pairs
    ]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, type=Path)
    ap.add_argument("--summary", type=Path)
    ap.add_argument("--review-template", type=Path)
    args = ap.parse_args()
    pairs = load_pairs(args.input)
    examples = export_dspy_examples(pairs)
    if len(examples) != 9:
        raise ValueError("dspy_corpus_mismatch")
    summary = summarize(pairs, args.input)
    if args.review_template:
        template = {
            "source_sha256": summary["source_sha256"],
            "status": "UNREVIEWED",
            "cases": [
                {
                    "id": p["id"],
                    "preferred": None,
                    "natural_korean_v5": None,
                    "natural_korean_v6": None,
                    "yeoul_character_v5": None,
                    "yeoul_character_v6": None,
                    "reason": "",
                }
                for p in pairs
            ],
        }
        args.review_template.parent.mkdir(parents=True, exist_ok=True)
        args.review_template.write_text(
            json.dumps(template, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    if args.summary:
        args.summary.parent.mkdir(parents=True, exist_ok=True)
        args.summary.write_text(
            json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    print(json.dumps(summary, ensure_ascii=False))

if __name__ == "__main__":
    main()
