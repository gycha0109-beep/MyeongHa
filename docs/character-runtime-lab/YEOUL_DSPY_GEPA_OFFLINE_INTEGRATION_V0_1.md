# 여울 DSPy·GEPA 오프라인 통합 v0.1

> 트랙 character-runtime-lab · 연구용 · 운영 미반영 · 실제 유료 호출 0회

## 목적과 범위

DSPy의 Signature 및 Predict로 여울 문체 표현용 슬롯을 분리하고, 실제 dspy.GEPA.compile이 합성 자료와 DummyLM으로 완료되는지 검증한다. 기존 GEPA optimize_anything 브리지와 Character Bible/Runtime/사주 해석 엔진을 교체하거나 수정하지 않는다.

환경: Python 3.12, dspy==3.5.0, gepa==0.1.4. 실행 파일: research/character-optimization-gepa/yeoul_dspy_gepa_smoke.py. 테스트: test_yeoul_dspy_gepa_smoke.py.

## 재현

1. python -m venv .venv-dspy
2. .venv-dspy/Scripts/python -m pip install -r research/character-optimization-gepa/requirements-dspy-smoke.txt
3. .venv-dspy/Scripts/python research/character-optimization-gepa/yeoul_dspy_gepa_smoke.py --smoke
4. .venv-dspy/Scripts/python -m unittest discover -s research/character-optimization-gepa -p test_yeoul_dspy_gepa_smoke.py

PowerShell은 Scripts/python.exe를 사용하고 Unix는 bin/python을 사용한다. 실행 시 OPENROUTER_API_KEY 및 OPENAI_API_KEY 변수를 비운다.

## 사실과 한계

- 실제 DSPy 3.5.0 프로그램과 GEPA 최적화 API가 오프라인 실행된다.
- 학습은 서로 다른 합성 상황 2개, 검증은 합성 상황 1개를 사용한다. 외부 제공업체 모델 대신 DummyLM을 사용한다.
- 평가지표는 응답 구조와 금지 문구만 검사하는 합성 점수다. 이 점수는 자연스러움이나 여울 고유성 향상을 증명하지 않으며, 합성 최고 점수 자체를 제품 품질로 주장하지 않는다.
- 모의 개선 제안자가 표현 지시문을 한 번 수정하고, 실제 GEPA가 합성 기준 점수로 후보 2개 중 새로운 지시문을 선택하는 것까지 검증했다. 모델 대사 자체는 전후 동일하다. 이는 실제 대사 개선, 사주 보고서 품질, 사람 평가, 독립 holdout, 운영 배포와 전혀 다르다.
- 이 파일럿은 캐릭터 표현 슬롯만 다루며 Canon, 사용자 관계, 사주 사실, 기억을 변경하지 않는다.

## 다음 실제 구현

1. 기존 v5·v6 응답과 사람이 평가한 데이터 연결. 기공개 9쌍은 개발 자료로 사용하고 봉인된 독립 검증으로 승격하지 않는다.
2. 평가 피드백을 자연성·인물성·설명 적합성·근거 충실성으로 분리해 GEPA 최적화기에 입력.
3. 이후 사람 승인된 별도 실험에서만 실제 모델로 후보 문장을 생성·비교.
4. 사주 권위 엔진에서 제공하는 해석 근거 fixture로 보고서 문체를 A/B 시험.

참고: https://dspy.ai/current/api/optimizers/GEPA/ 및 https://gepa-ai.github.io/gepa/api/
