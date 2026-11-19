# 여울 — GPT Luna 단일 모델 판단/대사 분리 파일럿 (연구용)

상태: **오프라인 판단 단계 구현 / GPT Luna 호출 미연결 / 품질 미검증**. 운영 반영 금지.

## 근거와 문제
기존 117건 비교 스크립트는 `YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md`와 `YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md`를 전달하지 않고, 짧은 단일 PROMPT만 사용했다. 따라서 그 결과는 전체 여울 Runtime의 품질 판정이 아니다.

## 최소 설계
- Character Bible/Runtime 원본은 읽기 전용이며 Canon과 관계·기억을 자동 수정하지 않는다.
- 1단계: 사용자 메시지와 **외부에서 확인된 관계/사건**으로 반응 목적(intent), 태도(stance), 정서(affect)를 구조화한다.
- 2단계: GPT Luna 단일 모델이 그 판단을 대사로 표현한다. 실제 GPT Luna API 모델 ID/호출 수단/요금/권한이 확인될 때까지 2단계는 **연결하지 않는다**.
- 3단계: 사람 블라인드 평가로 기존 단일 프롬프트 방식과 비교한다. 동일한 모델, 동일한 캐릭터 정보, 동일한 입력을 사용한다.
- 사주 사실과 보호된 해석은 upstream authority만 결정한다. 이 실험에서는 사주 정보를 생성하거나 변경하지 않는다.

## 현재 실행
`node scripts/character-optimization/yeoul-luna-decision-pilot.mjs '{"message":"오늘 점심을 못 먹었어요.","relationship":"unknown","verifiedEvents":[]}'`

현재 분류는 작은 **규칙 기반 시제품**이다. 여울의 모든 상황을 이해하는 Planner가 아니다. Canon/Runtime에서 직접 근거를 확인한 대표 반응만 다루고, 애매한 경우에는 `ordinary`로 둔다. 감정/관계 상태를 영구 기록하지 않는다.

## 다음 작업과 차단 조건
1. 대상 모델 명칭은 사용자가 지정한 **GPT Luna**로 확정한다. 실제 API 모델 ID 및 호출 수단은 별도 확인이 필요하며, 다른 GPT 모델로 대체하지 않는다.
2. Runtime의 더 넓은 행동 규칙을 구조화하고, 실제 근거가 없는 관계/기억 판단을 차단한다.
3. 예산과 청구를 확인한 뒤 기존 500원 누적 상한을 초과하지 않는 범위에서만 별도 실측 실험을 검토한다. 새 유료 호출은 현재 **0회**.
4. 12~16개 대조 상황에서 원본 여울 캐릭터 식별성·자연스러움·비동조성·기억 정확성을 사람 평가로 확인한다.
5. 검증 전 GEPA 최적화·다른 모델 비교·운영 승격 없음.

기존 `docs/character-optimization/ROADMAP.md`의 GEPA 트랙 완료 상태를 변경하지 않는다. CI Integration을 재활성화하지 않는다.
