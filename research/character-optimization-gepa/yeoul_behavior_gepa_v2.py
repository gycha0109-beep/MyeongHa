"""Yeoul behavior-first expression search using the real pinned GEPA engine.

Reads ONLY the old 288-row rating aggregate (never raw replies). The evaluator
measures behavioral-instruction coverage, not new model replies or quality.
A no-network, one-module-at-a-time reflector lets GEPA select among actual
candidate expressions rather than merely formatting a proposed prompt.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib
import json
from pathlib import Path
import socket
import tempfile
from unittest.mock import patch

from gepa_api_contract import build_offline_gepa_kwargs
from runner import preflight, probe_installed_gepa

# Fixed Bible/Runtime are outside this mutable expression slot.
SEED = (
    "여울은 감정이 말보다 행동에 먼저 드러나지만, 늘 챙기거나 부정하는 사람은 아닙니다. "
    "현재 관계 증거를 벗어나지 않는 자연스러운 존댓말로, 사용자의 말에 먼저 반응하세요."
)
# Actions are chosen from observed failure types, not copied answer examples.
# Every module specifies an observable turn-level behavior, not a personality adjective.
ACTIONS = {
    "signal": (
        "[첫 반응] 사용자의 말이 감정 표현이라면 그 감정의 구분을 먼저 받아주세요. "
        "자신의 마음이나 행동을 묻는 질문이라면 여울의 입장을 첫 문장에 답하세요. "
        "처방·훈계·되묻기는 자동 반응이 아닙니다. 새침함과 챙김은 답한 뒤 맥락이 있을 때만 드러내세요."
    ),
    "emotion": (
        "[감정 대화] 사용자가 허전함을 슬픔과 구분했다면 그 구분을 받아서 반응하세요. "
        "감정의 원인을 추측하거나 식사·물·휴식·활동 처방으로 바로 전환하지 마세요. "
        "한 문장으로 지금의 허전함에 반응한 뒤, 듣고 싶은지 혼자 있고 싶은지 맥락에 맞춰 물을 수 있습니다."
    ),
    "pressure": (
        "[지친 상대] '아무것도 하기 싫다'는 말에 '아무것도 하지 마세요'처럼 명령하지 마세요. "
        "무슨 일이 있었는지 짧게 듣겠다는 태도로 반응하고, 사용자가 요청할 때만 해결책을 제시하세요."
    ),
    "ownership": (
        "[여울의 입장] 여울 자신의 마음·연애 방식·질투를 묻는 질문에는 먼저 구체적인 자기 입장을 말하세요. "
        "질문에 '왜요?'로 되묻거나 시비를 거는 것으로 시작하지 말고, 민망함은 답한 뒤에 필요할 때만 새어나오게 하세요."
    ),
    "agency": (
        "[독립적인 선택] 사용자의 말에 무조건 맞추거나 연애 역할을 수행하지 마세요. "
        "좋으면 관심을 보이고 싫으면 이유와 경계를 짧게 밝히되, 독설·훈계·과잉 친절로 캐릭터를 대신하지 마세요."
    ),
    "grounding": (
        "[사실과 관계] 확인하지 못한 얼굴·표정·현장·기억을 봤다고 하지 마세요. "
        "이전 만남과 질투·호감·스킨십을 사실로 만들지 말고, 관계 단계에 따라 감정 인정의 정도를 바꾸세요."
    ),
    "continuity": (
        "[여울의 변화] 행동이 먼저 나오고 의미를 들킨 뒤 민망해질 수 있지만 매 턴 재생하지 마세요. "
        "신뢰가 깊어지면 중요한 때에는 떠보기보다 직접 묻고, 상대보다 자기 감정을 먼저 인정하는 선택도 하세요."
    ),
}
# Historical family/rating distribution is used to rank interventions. All four
# families are previously exposed development cases; none is a sealed holdout.
FAMILY_NEEDS = {
    "Y03": ("signal", "pressure", "emotion", "agency"),
    "Y07": ("signal", "emotion", "grounding", "agency"),
    "Y08": ("signal", "ownership", "continuity", "agency"),
    "Y11": ("signal", "ownership", "grounding", "continuity"),
}
MAX_EVALS = 10


def read_aggregate(path: Path):
    data = json.loads(path.read_text(encoding="utf-8"))
    if (data.get("schemaVersion") != "yeoul-288-feedback-proxy-v1"
            or data.get("totalRows") != 288
            or data.get("deepseekRows") != 72
            or data.get("independentValidation") is not False
            or data.get("qualityGainEstablished") is not False):
        raise ValueError("untrusted_legacy_aggregate")
    if any(key not in data.get("byQuestion", {}) for key in FAMILY_NEEDS):
        raise ValueError("missing_historic_failure_families")
    return data


def proxy_score(aggregate, text: str, family: str):
    # Strictly a development-only proxy: does the *instruction* cover the
    # historically observed trouble spots? No output text is generated/scored.
    categories = FAMILY_NEEDS[family]
    negative = sum(count for label, count in
                   aggregate["byQuestion"][family].items() if label != "good")
    importance = max(1, negative)
    covered = sum(ACTIONS[category] in text for category in categories)
    repetition_penalty = 0.06 * sum(text.count(ACTIONS[c]) > 1 for c in categories)
    padding_penalty = max(0, len(text) - 1400) / 3000
    return max(0.0, min(1.0, 0.10 + 0.80 * covered / len(categories)
                        + 0.05 * min(importance / 24, 1)
                        - repetition_penalty - padding_penalty))


class BehaviorReflector:
    def __init__(self, proposal_class, aggregate):
        self.proposal_class = proposal_class
        self.aggregate = aggregate
        self.calls = 0

    def reflect(self, candidate, reflective_dataset, components_to_update):
        if set(components_to_update) != {"character_expression"}:
            raise ValueError("unsafe_mutable_slot")
        self.calls += 1
        current = candidate["character_expression"]
        weighted = {}
        for family in ("Y03", "Y07"):
            needs = FAMILY_NEEDS[family]
            negative = sum(n for label, n in
                           self.aggregate["byQuestion"][family].items()
                           if label != "good")
            for position, action in enumerate(needs):
                if ACTIONS[action] not in current:
                    weighted[action] = weighted.get(action, 0) + negative / (position + 1)
        # Propose ONE consequential behavioral change per mutation. GEPA
        # evaluates and decides whether it survives rather than auto-adding all.
        next_text = current
        for action, _ in sorted(weighted.items(), key=lambda row: (-row[1], row[0])):
            proposal = current + "\n" + ACTIONS[action]
            if len(proposal) <= 1600:
                next_text = proposal
                break
        return self.proposal_class(new_texts={"character_expression": next_text}), self


def optimize(aggregate_path: Path, output_path: Path):
    if output_path.exists():
        raise FileExistsError("no_output_overwrite")
    agg = read_aggregate(aggregate_path)
    if not probe_installed_gepa()["api_compatible"]:
        raise ValueError("real_pinned_gepa_required")
    mod = importlib.import_module("gepa.optimize_anything")
    reflections = importlib.import_module("gepa.proposer.reflective_mutation.reflection_lm")
    strategy = BehaviorReflector(reflections.ReflectionProposal, agg)
    rows = []
    for split, families in (("development", ["Y03", "Y07"]),
                            ("optimizer_validation", ["Y08", "Y11"])):
        for family in families:
            rows.append({
                "id": "behavior-" + family, "characterId": "yeoul",
                "familyId": "historical-behavior-" + family, "split": split,
                "contentSha256": hashlib.sha256(
                    ("old-aggregate-only-" + family).encode()).hexdigest(),
            })
    envelope = {
        "schemaVersion": "character-gepa-offline-bridge-v1",
        "optimizer": "gepa", "runManifestSha256": "a" * 64,
        "candidateSha256": hashlib.sha256(SEED.encode()).hexdigest(),
        "mutableSlot": "character_expression", "dataset": rows,
        "test_set": None, "externalCallsAuthorized": False,
        "productionEligible": False, "requiresPrivateRuntime": False,
        "qualityGainEstablished": False,
    }
    preflight(envelope)
    def evaluator(candidate, example):
        family = example["id"].removeprefix("behavior-")
        return proxy_score(agg, candidate["character_expression"], family), {
            "failure_codes": [], "character_id": "yeoul",
            "raw_dialogue_excluded": True, "uncertain": False,
        }

    def block_network(*args, **kwargs):
        raise AssertionError("network_and_paid_model_calls_forbidden")

    def cfg(**kwargs):
        kwargs["max_token_cost"] = None
        kwargs["engine_config"]["reflection"]["reflection_strategy"] = strategy
        kwargs["engine_config"].update({
            "merge": None, "refiner": None,
            "tracking": {"use_wandb": False, "use_mlflow": False},
        })
        return mod.OptimizeAnythingConfig(**kwargs)

    with tempfile.TemporaryDirectory(prefix="yeoul-behavior-gepa-out-") as out, \
         tempfile.TemporaryDirectory(prefix="yeoul-behavior-gepa-root-") as root:
        args = build_offline_gepa_kwargs(
            envelope, seed_text=SEED, evaluator=evaluator,
            reflection_lm=block_network, output_dir=out,
            repository_root=root, config_factory=cfg,
            max_evals=MAX_EVALS,
        )
        with patch.object(socket.socket, "connect", side_effect=block_network), \
             patch.object(socket.socket, "connect_ex", side_effect=block_network), \
             patch("socket.create_connection", side_effect=block_network):
            result = mod.optimize_anything(**args)

    chosen = result.best_candidate["character_expression"]
    if not chosen.startswith(SEED) or len(chosen) > 1600:
        raise ValueError("unsafe_optimized_behavior")
    selected = [k for k, text in ACTIONS.items() if text in chosen]
    report = {
        "schemaVersion": "yeoul-gepa-behavior-expression-v2",
        "optimizer": "real_pinned_gepa_offline",
        "optimizerExecuted": True,
        "candidateOrigin": "gepa_in_process_behavior_reflector",
        "dataSource": "private_historical_288_ratings_aggregate",
        "mutableSlot": "character_expression",
        "coveredBehaviors": selected,
        "baselineProxy": {family: proxy_score(agg, SEED, family)
                          for family in FAMILY_NEEDS},
        "candidateProxy": {family: proxy_score(agg, chosen, family)
                           for family in FAMILY_NEEDS},
        "totalEvaluations": int(result.total_evals),
        "reflectionCalls": strategy.calls,
        "candidateText": chosen,
        "candidateSha256": hashlib.sha256(chosen.encode()).hexdigest(),
        "actualStudentRepliesGenerated": 0,
        "realResponseQualityMeasured": False,
        "independentHoldoutPassed": False,
        "qualityGainEstablished": False,
        "externalModelCalls": 0,
        "actualSpendKrw": 0,
        "productionEligible": False,
        "status": "research_candidate_not_released",
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")
    return {
        "realGepaExecuted": True, "evaluations": report["totalEvaluations"],
        "mutations": report["reflectionCalls"], "behaviors": selected,
        "newModelReplies": 0, "realQualityImprovementMeasured": False,
    }


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--aggregate", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    a = p.parse_args()
    print(json.dumps(optimize(a.aggregate, a.output), ensure_ascii=False))
