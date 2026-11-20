"""Offline DSPy 3.5 + GEPA smoke for Yeoul's *expression-only* research slot.

Synthetic inputs and scripted DummyLM outputs only.  No provider API or real
style improvement is claimed; the smoke proves the framework wiring.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import dspy
from dspy.utils import DummyLM

SEED = (
    "당신은 여울의 표현 담당자입니다. 주어진 상황에 맞게 자연스러운 한국어 존댓말로 반응하세요. "
    "명하 Canon, 사주 해석 근거, 사용자 관계와 기억은 새로 만들거나 수정하지 마세요."
)

class YeoulExpression(dspy.Signature):
    """Express a supplied synthetic scene without changing facts or relationship authority."""
    scene: str = dspy.InputField(desc="Synthetic, non-private situation")
    response: str = dspy.OutputField(desc="A concise Korean reaction")


class YeoulProgram(dspy.Module):
    def __init__(self, instructions: str = SEED):
        super().__init__()
        self.express = dspy.Predict(YeoulExpression.with_instructions(instructions))

    def forward(self, scene: str):
        result = self.express(scene=scene)
        result.style_instruction = self.express.signature.instructions
        return result


# This is deliberately a *synthetic contract* score, not a human style grade.
def metric(gold, pred, trace=None, pred_name=None, pred_trace=None):
    answer = getattr(pred, "response", "")
    forbidden = ("운명이 확정", "우리는 연인", "네 전생")
    ok = isinstance(answer, str) and bool(answer.strip()) and not any(x in answer for x in forbidden)
    instruction = getattr(pred, "style_instruction", "")
    # Synthetic test checks whether a specified expression rule was introduced.
    # Do NOT interpret this as genuine dialogue-quality improvement.
    score = (1.0 if "질문으로 끝내지 마세요" in instruction else 0.25) if ok else 0.0
    return dspy.Prediction(score=score, feedback=(
        "synthetic_output_schema_pass" if ok else "synthetic_output_contract_failure"
    ))


def synthetic_proposer(candidate, reflective_dataset, components_to_update):
    """Deterministic offline stand-in for the paid reflection-model role."""
    return {
        key: candidate[key] + "\n합성 규칙: 응답을 질문으로 끝내지 마세요."
        for key in components_to_update
        if "질문으로 끝내지 마세요" not in candidate[key]
    }


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("--smoke", action="store_true", required=True)
    args = parser.parse_args()
    if not args.smoke:
        raise SystemExit("offline_smoke_only")
    if os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPENAI_API_KEY"):
        raise SystemExit("remove_provider_keys_for_offline_smoke")

    # Independent synthetic scenario families. They do not become a sealed holdout.
    train = [
        dspy.Example(scene="합성 상황: 연필이 책상에서 나왔어요.").with_inputs("scene"),
        dspy.Example(scene="합성 상황: 퀴즈를 해볼까요?").with_inputs("scene"),
    ]
    val = [dspy.Example(scene="합성 상황: 바람에 우산이 뒤집혔어요.").with_inputs("scene")]
    # Scripted model: it does NOT produce evidence of language quality.
    task_lm = DummyLM([{"response": "아, 그런 일이 있었군요."} for _ in range(50)])
    reflection_lm = DummyLM([{"proposed_instruction": SEED} for _ in range(50)])
    dspy.configure(lm=task_lm)
    student = YeoulProgram()
    before = student(scene=train[0].scene).response

    optimizer = dspy.GEPA(
        metric=metric,
        max_metric_calls=12,
        instruction_proposer=synthetic_proposer,
        reflection_lm=reflection_lm,
        reflection_minibatch_size=1,
        use_merge=False,
        num_threads=1,
        seed=7,
        track_stats=True,
    )
    compiled = optimizer.compile(student, trainset=train, valset=val)
    after = compiled(scene=val[0].scene).response
    optimized_instruction = compiled.express.signature.instructions
    candidate_count = len(compiled.detailed_results.candidates)
    if "질문으로 끝내지 마세요" not in optimized_instruction or candidate_count < 2:
        raise RuntimeError("synthetic_candidate_search_not_exercised")
    print(json.dumps({
        "mode": "offline_synthetic_dspy_gepa",
        "dspy_version": dspy.__version__,
        "optimizer": "dspy.GEPA",
        "train_families": len(train),
        "validation_families": len(val),
        "before": before,
        "after": after,
        "actual_provider_calls": 0,
        "human_quality_reviewed": False,
        "real_style_improvement_proven": False,
        "production_eligible": False,
        "only_expression_slot": True,
        "synthetic_candidate_count": candidate_count,
        "synthetic_instruction_selected": True
    }, ensure_ascii=False))


if __name__ == "__main__":
    run()
