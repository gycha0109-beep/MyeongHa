# COST-06: 독립적인 main 대상 8회 유료 사전 분류 검토

Watchtower-Track: character-memory

**현재 상태:** Review-only PR, 병합/모델 호출 미실행. 실결제 원장·모델 품질 측정 없음.

## 왜 별도 PR인가
기존 PR #2135는 병합되지 않은 P1/G0 작업 PR #1985를 기반으로 만들어졌고,
#1985의 main 병합은 Production Authority / DB 이슈로 차단되어 있었다.
따라서 **main HEAD에서 별도로 생성한 최소 범위 PR**에 8회 사전 분류 테스트만 옮긴다.

## 실행 범위
- 동일 4개 공개 합성 Gold에 대해 Original unified preflight / Compact 후보 각각 1회, 합계 8회.
- 모델 gpt-5.6-luna, OPENAI_API_KEY2만 사용, 재시도 없음.
- 서버 소유 응답 Schema/Integrity/Disclosure Guards를 사용. 원문 출력/키/실제 사용자 데이터 미보존.
- Provider가 강제하는 max_output_tokens=1024, 요청 직렬화 6144 bytes 제한.
- 호출당 가격계산 가정: input 8192 token(검증된 토큰 ceiling 아님) × $0.25/M(캐시 쓰기 최대) + output 1024 token × $1.20/M.
- 8회 예약 합계 $0.026216, 목표 예산 $0.03. 달러 단위 가정/환율 미반영, **실청구 최대 지출 보장 아님**.
- 요금은 공식 게시 정보에 대한 기초 가정이며 프로젝트 적용단가, 캐시 tier, Provider 영수증 확인 전 실제 정확한 비용은 UNKNOWN.
- 결과는 ID, topic/claimKind, latency, token counts, 비용 **추정** 및 실패 구분만 보존.
- 케이스별 위험 분류 품질 초기 선별이며 전구간 5→3 대화 경로/60턴 캐릭터 자연스러움 비열등성 검증이 아님.

## 잠금/승인
- 이전 5회 vs 3회 전체 경로 평가와 기타 운영 모델 배포/DB 권한은 모두 잠긴 상태로 유지.
- 기존 seyeon-model-eval-v1.yml만 'main branch에서 직접 수동 workflow_dispatch' 8회 전용으로 교체 제안.
- 실험은 main으로 별도 PR 승인·병합된 뒤, GitHub Actions '세연 C06 8회 유료 분류 선별' 워크플로를 **수동 실행**해야만 시작됨. 병합 자체는 API 실행 아님.
- 전에 사고가 있던 #1816의 미정산/지출 cap/공급자 영수증 및 독립 kill switch, Github repo/environment의 OPENAI_API_KEY2 Secret 존재/승인 필요.
- 이 PR과 테스트 통과는 기존 비용 사고 통제/Owner 승인, 실제 Live 모델 적합성, Production Routing/Canon/DR Gate (#1887) 통과를 뜻하지 않는다.
- 모델 유료 실행 전 프로젝트 수준의 강제 spending limit을 별도 확인하고 실행하는 사용자가 책임 있는 지출 상한을 승인해야 한다.

## 실행 결과 해석
- 증거 파일에는 실제 billed 비용이 아니라 'estimatedCostMicroUsd'만 표시.
- 실패/사용량 미확인은 0달러로 간주하지 않고 후속 호출 중지.
- 8회 중 하나라도 잘못 분류하거나 불분명한 추가 claim이 있으면 즉시 중지.
- 통과하더라도 민감 질문 recall 및 관계/권한 보안 비열등성이 입증되지는 않는다.
