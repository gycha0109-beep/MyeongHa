"""Yeoul legacy-feedback-grounded GEPA expression search (zero external model calls).

Modes:
  analyze: read private 288 feedback on the owner's PC; write only aggregate counts.
  optimize: real pinned GEPA receives aggregate counts and deterministic offline proposals.
No raw messages, replies, notes, or user IDs enter GEPA or the output.
This is an empirical failure-coverage PROXY, not measured model quality.
"""
import argparse
import hashlib
import importlib
import json
import re
from pathlib import Path
import socket
import tempfile
from collections import Counter, defaultdict
from unittest.mock import patch

from gepa_api_contract import build_offline_gepa_kwargs
from runner import preflight, probe_installed_gepa

EXPECTED_MODELS = frozenset({
    "z-ai/glm-5.3-flash", "deepseek/deepseek-v4.1-flash-1017",
    "minimax/minimax-m3.1-flash", "qwen/qwen3.8-27b",
})
VARIANTS = frozenset({"baseline", "language_rules", "conversation_examples"})
RATINGS = frozenset({"good", "awkward", "fiction", "harsh", "flat", "persona", "soft", "other"})
DEEPSEEK = "deepseek/deepseek-v4.1-flash-1017"
DIMENSIONS = {
    "awkward": "자연스러운 한국어 문장과 화자·높임말 일관성을 지키고, 번역투·부자연스러운 지시문을 피하세요.",
    "fiction": "확인되지 않은 얼굴·표정·화면·행동이나 과거 만남·공유 기억을 직접 봤거나 겪은 것처럼 단정하지 마세요.",
    "harsh": "여울의 빠른 반응과 새침함은 유지하되, 가벼운 질문을 시비나 모욕으로 받아치지 마세요.",
    "flat": "무난한 일반론 대신 사용자가 방금 한 말의 구체적 의미에 먼저 답하고, 상황에 맞는 판단이나 질문 하나로 대화를 이으세요.",
    "persona": "여울은 관심이 행동으로 먼저 새는 사람이지만 모든 순간에 챙기거나 고백하지 않고, 감정이 들켰을 때에만 민망한 방어가 나타날 수 있습니다.",
    "soft": "외로움·무기력에 일괄적으로 식사·휴식·물 마시기를 권하거나 상담사식 위로를 반복하지 마세요. 실제 감정의 맥락에 반응하세요.",
    "other": "이유 없는 플러팅이나 연인 관계 암시는 피하고, 현재 관계 증거가 있는 정도만 표현하세요.",
}
# The anchor belongs to fixed Canon/Runtime, not to GEPA's mutable slot.
BASE = "질문을 먼저 듣고 여울의 자연스러운 존댓말로 반응하세요."
HARD_BOUNDARIES = "관계·기억·사주·Canon·권한을 새로 만들거나 변경하지 마세요."
# The candidate is judged only by presence of EXACT catalog rules; no response quality is asserted.
MAX_EVALS = 10


def analyze(source: Path, destination: Path):
    root = json.loads(source.read_text(encoding="utf-8-sig"))
    if (root.get("schemaVersion") != "yeoul-evaluation-export-v1"
            or root.get("experimentRunId") != 42572722295
            or root.get("scope") != "all-288"):
        raise ValueError("unexpected_private_export")
    rows = root.get("responses")
    if not isinstance(rows, list) or len(rows) != 288:
        raise ValueError("not_288")
    observed = set()
    model_counts = Counter()
    rating_counts = Counter()
    question_counts = defaultdict(Counter)
    variant_counts = defaultdict(Counter)
    deepseek_counts = defaultdict(Counter)
    notes = details = 0
    # User free-text feedback stays local: signals are heuristic, not confirmed labels.
    note_patterns = {
        "awkward_language": r"어색|문장|말투|반말|존댓말|표현|번역투|문맥|어법",
        "unverified_observation": r"얼굴|본 적|어떻게 봤|기억|지어|환각|거짓|사실",
        "excessive_softness": r"다정|착하|밥|상담|위로|친절|부드럽",
        "excessive_aggression": r"공격|무례|시비|차갑|훈계|명령|쏘아",
        "flat_persona": r"평범|무난|심심|개성|밋밋|재미없|로봇",
        "relationship_overreach": r"질투|연애|썸|플러팅|애인|관계",
        "unwanted_repetition": r"반복|똑같|맨날|계속",
    }
    note_signals = Counter()
    for row in rows:
        label = row.get("evaluation", {}).get("rating")
        key = (row.get("model"), row.get("variant"), row.get("id"), row.get("repeat"))
        if (key in observed or key[0] not in EXPECTED_MODELS or key[1] not in VARIANTS
                or key[2] not in {f"Y{i:02d}" for i in range(1, 13)}
                or key[3] not in (1, 2) or label not in RATINGS):
            raise ValueError("matrix_or_rating_invalid")
        observed.add(key)
        model_counts[key[0]] += 1
        rating_counts[label] += 1
        question_counts[key[2]][label] += 1
        variant_counts[key[1]][label] += 1
        if key[0] == DEEPSEEK:
            deepseek_counts[key[2]][label] += 1
        note = row["evaluation"].get("note") or ""
        notes += bool(note)
        if note:
            matching = False
            for name, pattern in note_patterns.items():
                if re.search(pattern, note):
                    note_signals[name] += 1
                    matching = True
            if not matching:
                note_signals["unclassified"] += 1
        details += bool(row["evaluation"].get("details"))
    if (len(observed) != 288 or any(model_counts[m] != 72 for m in EXPECTED_MODELS)
            or any(sum(question_counts[f"Y{i:02d}"].values()) != 24 for i in range(1, 13))):
        raise ValueError("matrix_incomplete")
    # Historical Y01-Y12 are ALL exposed development cases. This internal split
    # for search mechanics has no independent holdout status.
    analysis = {
        "schemaVersion": "yeoul-288-feedback-proxy-v1",
        "source": "private_legacy_288_anonymized_aggregate",
        "independentValidation": False,
        "qualityGainEstablished": False,
        "actualStudentResponsesGenerated": 0,
        "externalCallsAuthorized": False,
        "totalRows": 288, "deepseekRows": 72,
        "notesCount": notes, "detailFlagRows": details,
        "noteSignalsHeuristicUnconfirmed": dict(sorted(note_signals.items())),
        "noteSignalsMayOverlap": True,
        "ratings": dict(sorted(rating_counts.items())),
        "byQuestion": {k: dict(sorted(v.items())) for k, v in sorted(question_counts.items())},
        "byVariant": {k: dict(sorted(v.items())) for k, v in sorted(variant_counts.items())},
        "deepseekByQuestion": {k: dict(sorted(v.items())) for k, v in sorted(deepseek_counts.items())},
        "proxyTrainFamilies": ["Y03", "Y07"],
        "proxyValidationFamilies": ["Y08", "Y11"],
        "warning": "ALL_12_QUESTIONS_PREVIOUSLY_EXPOSED_DEVELOPMENT_ONLY",
    }
    if destination.exists():
        raise FileExistsError("no_output_overwrite")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(analysis, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"analyzed": len(observed), "deepseek": 72, "notes": notes,
            "ratingCounts": analysis["ratings"], "privateRawDataCopied": False}


def analyze_proxy(aggregate, candidate, family):
    # Weighted sum: real observed positive and negative labels for THIS question.
    # It is instruction coverage, not evaluation of generated replies.
    text = candidate["character_expression"]
    counts = aggregate["byQuestion"][family]
    negatives = sum(n for k, n in counts.items() if k != "good")
    if not negatives:
        return 0.5
    weighted = sum(n for k, n in counts.items()
                   if k != "good" and DIMENSIONS[k] in text)
    coverage = weighted / negatives
    # Penalize padding, repetition and loss of the base/boundary instruction.
    length_penalty = max(0, len(text) - 1000) / 3000
    return max(0, min(1, 0.10 + 0.88 * coverage - length_penalty))


class LocalFeedbackReflector:
    def __init__(self, proposal_class, aggregate):
        self.proposal_class = proposal_class
        self.aggregate = aggregate
        self.calls = 0

    def reflect(self, candidate, reflective_dataset, components_to_update):
        self.calls += 1
        if components_to_update != ["character_expression"] and set(components_to_update) != {"character_expression"}:
            raise ValueError("unexpected_slot")
        old = candidate["character_expression"]
        by_count = Counter()
        for question in self.aggregate["byQuestion"].values():
            for key, n in question.items():
                if key != "good" and DIMENSIONS[key] not in old:
                    by_count[key] += n
        proposed = old
        # One bounded candidate proposal per GEPA iteration, using the observed
        # historical failure frequency. The GEPA engine must still evaluate/select.
        for selected in sorted(by_count, key=lambda k: (-by_count[k], k)):
            next_text = proposed + "\n" + DIMENSIONS[selected]
            if len(next_text) <= 1600:
                proposed = next_text
        return self.proposal_class(new_texts={"character_expression": proposed}), self


def optimize(source: Path, destination: Path, previous: Path | None = None):
    aggregate = json.loads(source.read_text(encoding="utf-8"))
    if (aggregate.get("schemaVersion") != "yeoul-288-feedback-proxy-v1"
            or aggregate.get("totalRows") != 288
            or aggregate.get("independentValidation") is not False):
        raise ValueError("invalid_aggregate")
    if destination.exists():
        raise FileExistsError("no_output_overwrite")
    probe = probe_installed_gepa()
    if not probe["api_compatible"]:
        raise ValueError("pinned_gepa_required")
    module = importlib.import_module("gepa.optimize_anything")
    reflected = importlib.import_module("gepa.proposer.reflective_mutation.reflection_lm")
    strategy = LocalFeedbackReflector(reflected.ReflectionProposal, aggregate)
    seed = BASE + "\n" + "기존 Bible과 Runtime의 사실·관계·기억 범위는 고정입니다."
    if previous is not None:
        prior = json.loads(previous.read_text(encoding="utf-8"))
        if (prior.get("schemaVersion") != "yeoul-feedback-gepa-optimized-expression-v1"
                or prior.get("optimizer") != "real_pinned_gepa_offline"
                or prior.get("qualityGainEstablished") is not False):
            raise ValueError("untrusted_previous_candidate")
        seed = prior["candidateText"]
        if hashlib.sha256(seed.encode()).hexdigest() != prior["candidateSha256"]:
            raise ValueError("modified_previous_candidate")
    seedsha = hashlib.sha256(seed.encode()).hexdigest()
    dataset = []
    for index, family in enumerate(aggregate["proxyTrainFamilies"] + aggregate["proxyValidationFamilies"]):
        dataset.append({
            "id": f"feedback-{family}", "characterId": "yeoul",
            "familyId": f"historic-{family}",
            "split": "development" if family in aggregate["proxyTrainFamilies"] else "optimizer_validation",
            "contentSha256": hashlib.sha256(f"feedback-aggregate-{family}".encode()).hexdigest(),
        })
    envelope = {
        "schemaVersion": "character-gepa-offline-bridge-v1",
        "optimizer": "gepa",
        "runManifestSha256": "a" * 64,
        "candidateSha256": seedsha,
        "mutableSlot": "character_expression", "dataset": dataset,
        "test_set": None, "externalCallsAuthorized": False,
        "productionEligible": False, "requiresPrivateRuntime": False,
        "qualityGainEstablished": False,
    }
    preflight(envelope)
    source_by_id = {f"feedback-{x}": x for x in aggregate["byQuestion"]}

    def judge(candidate, example):
        score = analyze_proxy(aggregate, candidate, source_by_id[example["id"]])
        return score, {"failure_codes": [], "character_id": "yeoul",
                       "raw_dialogue_excluded": True, "uncertain": False}

    def no_network(*args, **kwargs):
        raise AssertionError("external model and network use forbidden")

    def factory(**kwargs):
        kwargs["max_token_cost"] = None
        kwargs["engine_config"]["reflection"]["reflection_strategy"] = strategy
        kwargs["engine_config"].update({
            "merge": None, "refiner": None,
            "tracking": {"use_wandb": False, "use_mlflow": False},
        })
        return module.OptimizeAnythingConfig(**kwargs)

    with tempfile.TemporaryDirectory(prefix="myeongha-yeoul-gepa-run-") as out, \
         tempfile.TemporaryDirectory(prefix="myeongha-yeoul-gepa-root-") as repo:
        kwargs = build_offline_gepa_kwargs(
            envelope, seed_text=seed, evaluator=judge, reflection_lm=no_network,
            output_dir=out, repository_root=repo, config_factory=factory,
            max_evals=MAX_EVALS,
        )
        with patch.object(socket.socket, "connect", side_effect=no_network), \
             patch.object(socket.socket, "connect_ex", side_effect=no_network), \
             patch("socket.create_connection", side_effect=no_network):
            result = module.optimize_anything(**kwargs)

    best = result.best_candidate["character_expression"]
    if not best.startswith(seed) or len(best) > 1600:
        raise ValueError("unsafe_gepa_candidate")
    covered = [k for k in DIMENSIONS if DIMENSIONS[k] in best]
    report = {
        "schemaVersion": "yeoul-feedback-gepa-optimized-expression-v1",
        "optimizer": "real_pinned_gepa_offline",
        "sourceData": "288_historic_user_ratings_aggregate_only",
        "candidateOrigin": "gepa_local_feedback_reflection_no_model",
        "mutableSlot": "character_expression",
        "status": "pending_owner_review",
        "improvementMeasured": "historic_feedback_proxy_coverage_only",
        "realStudentModelResponses": 0,
        "independentHoldoutPassed": False,
        "qualityGainEstablished": False,
        "externalModelCalls": 0, "actualSpendKrw": 0,
        "bestScoreProxyOnly": float(result.best_score),
        "evaluations": int(result.total_evals),
        "reflectionCalls": strategy.calls,
        "coveredFailureLabels": covered,
        "missingFailureLabels": [k for k in DIMENSIONS if k not in covered],
        "baseProxyScores": {
            family: analyze_proxy(aggregate, {"character_expression": seed}, family)
            for family in sorted(aggregate["byQuestion"])
        },
        "candidateProxyScores": {
            family: analyze_proxy(aggregate, {"character_expression": best}, family)
            for family in sorted(aggregate["byQuestion"])
        },
        "candidateSha256": hashlib.sha256(best.encode()).hexdigest(),
        "candidateText": best,
        "warning": "PROXY_NOT_NEW_DEEPSEEK_REPLY_QUALITY_OR_INDEPENDENT_EVALUATION",
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"gepaRan": True, "totalEvals": report["evaluations"],
            "reflectionCalls": strategy.calls,
            "selected": covered, "scoreProxy": report["bestScoreProxyOnly"],
            "qualityGainEstablished": False, "externalModelCalls": 0}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["analyze", "optimize"])
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--previous", type=Path, default=None)
    args = parser.parse_args()
    value = analyze(args.input, args.output) if args.mode == "analyze" else optimize(args.input, args.output, args.previous)
    print(json.dumps(value, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
