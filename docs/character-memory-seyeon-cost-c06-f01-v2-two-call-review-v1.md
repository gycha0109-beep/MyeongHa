# COST-06 F01 V2 — 두 호출 단발성 유료 재검증 (검토 PR)

Watchtower-Track: character-memory

## 목적과 범위
- 기존 8회 비교 중 실제 3회(원본 실행 #38845185681)를 이미 사용했다.
- F01 기존 프롬프트의 가족 질문을 세연의 사실 주장으로 과잉 분류했던 문제를 평가전용 Original/Compact 프롬프트 모두 수정했다.
- V2에서는 같은 F01 합성 질문을 **수정 Original 1회 + 수정 Compact 1회 = 최대 2회**만 검사한다. Original 실패 시 추가 Compact 호출 중지.
- v1 N14 결과를 v2 품질 지표로 재사용하지 않는다. F01 한 건 PASS는 300개 분류 Recall이나 전체 5→3 대화 경로 안전성 증명이 아니다.

## 누적 과금 추정/100원 제한
- 과거 3회 실제 Provider usage 기반 추정 **$0.001036**, Provider 청구 확인 **미완료**.
- 비용 정책은 이를 이전 3회 선예약 $0.009831로 보수적으로 이월한다.
- 새 2회 선예약 최대 **$0.006554**, 누적 선예약 **$0.016385**.
- 1USD = **2500 KRW**의 보수적 환산 가정 시 **40.9625원**, 사용자 승인 **총 100원 이내 예상**.
- 이 수치는 Provider 요금/환율/청구 잔여금·비용 정책의 가정이다. **공급자측 실제 하드캡이 아니며 100원 청구를 보증하지 않는다**. Provider 인보이스나 실제 프로젝트 cap 검증 필요.
- 요청 직렬화 최대 6144 B, Provider 출력 token 1024 제한, 입력 8192 token 계산 가정; 미확인 usage 또는 오류면 후속 호출 HOLD.

## 중복 과금 방지
- 독립 workflow seyeon-c06-f01-v2-manual-eval.yml은 main에서만 수동으로 1회 허용.
- GitHub Actions API를 조회해 같은 workflow의 수동 실행이 **현재 run ID 하나뿐이며 GITHUB_RUN_ATTEMPT=1일 때만** 사용. 이후 Re-run 및 새 Run workflow는 거부. 동시 실행 방지는 concurrency.
- GitHub 과거 Run 보존과 API 정상 조회에 의존하므로 외부 공급자 지출 하드캡과 동등하진 않다.
- 원래 8회 워크플로와 러너는 여전히 잠겨 있다. Secret OPENAI_API_KEY2 이외 사용하지 않는다.
- 실행 Artifact는 case/topic/claimKinds, 토큰/지연/추정비용만 포함; 실제 응답 원문/개인정보 저장 금지.

## 실행 승인 경계
- 새 PR은 리뷰 전 단계이며 merge하지 않았고 유료 API 요청 **0건**.
- 주인이 GitHub Actions의 새 Workflow에서 전체 100원 예산·공급자 과금 상한 미확인 설명을 확인해야 시작한다.
- CI 통과=오프라인 통제 검증일 뿐 실제 Luna 응답/요금 실측이 아니다. 비공개 사용자데이터/Production 라우팅/DB/Canon/5→3 경로는 변경하지 않는다.
