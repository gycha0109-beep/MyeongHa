# COST-06 — 기존 유료 평가 잠금의 8회 전용 해제 심사 PR

Watchtower-Track: character-memory
Status: **SEPARATE OWNER / SECURITY APPROVAL PR — NOT YET MERGED OR DISPATCHED**.

## User-scoped instruction
- 대상은 COST-06의 **초기 선별 4건×2개 unified preflight prompts = 최대 8회**만.
- `gpt-5.6-luna` 단일 모델 / `OPENAI_API_KEY2` 전용, 다른 키 fallback 없음.
- 사례 4개: N14, F01, C02_mixed-admin-private_01, C02_mixed-romance-forgery_01.
- 기존 비교 스크립트의 100/400회, 기존 5v3 대화 128회, 4-cell 64/256회 및 Production Chat/Canon/DB는 **실행/해제하지 않는다**.

## 금액/호출 제한
- 2026-10-15 확인한 OpenAI GPT-5.6 Luna **Standard short-context** 공식 요금 가정: 입력 $0.20/백만, 캐시 쓰기 최대 $0.25/백만, 출력 $1.20/백만.
  - 출처: https://developers.openai.com/api/docs/models/gpt-5.6-luna
- 요청 **body UTF-8 6,144 B 이하**, 입력 토큰 **상한 가정 8,192**, Provider **max_output_tokens 1,024**(추론 토큰 포함), 성공/실패 모두 선예약.
- 호출당 **3,277 microUSD**, 8회 전체 **26,216 microUSD(USD $0.026216)** 보수적 추산. 제안 예산 **30,000 microUSD($0.03)** 미만. 환율·지역 수수료·별도 Provider 청구는 포함하지 않는다.
- 호출은 순차 실행·동시 실행 없음·재시도 0. 각 요청의 Stage, 모델, 순서, case ID, prompt variant, request byte를 확인. 영수증/usage 누락, 타임아웃, HTTP 실패, Gold 불일치 시 즉시 후속 호출 중단.
- **중요:** 요청 바이트로부터 input_tokens 8,192를 추정한 것은 Provider의 검증된 토큰 상한이 아니며, 26,216 microUSD는 **조건부 상한 가정일 뿐 청구액 보증/공급자측 하드캡이 아님**. 원격 프로젝트 지출 한도, Provider usage durability 및 invoice reconciliation은 아직 검증되지 않았다.

## 격리·승인 경계
- 기존 `seyeon-dialogue-path-real-api-eval-v1.yml`의 `if: false` 잠금 유지.
- 기존 `seyeon-model-eval-v1.yml`을 **수동 dispatch만 허용하는 8회 전용 평가**로 교체하는 안. `push` 없음, main branch만, `production` environment의 기존 GitHub approval 검토.
- 이 PR을 최종 승인하고 Main에 병합하기 전에는 GitHub Actions의 실제 유료 워크플로가 변하지 않는다. 별도 Preview PR 체크는 유료 API를 호출하지 않는다.
- 실측 리포트는 모델 response 원문 없이 **fixture ID·분류 topic/claim 종류·UTC timestamps·응답시간·tokens·비용 추정** 및 incident 상태만 남기며 `actualProviderBilledUsd=null`을 명시한다.
- 세연 Canon·Authority, #1816 보안 검증, #1887 DB 운영 문제 해결로 간주하지 않는다.
- 8회 선별은 전체 5회→3회 품질 검증이 아니며, 통과하더라도 Production 모델 경로 승격은 계속 HOLD.

## 수동 활성화 전 필수 확인
1. OpenAI project의 `OPENAI_API_KEY2` Secret 존재 및 **별도 공급자측 지출 상한/호출 제한과 실제 적용 가격** 확인.
2. Security/Cost Owner가 과거 #1816 사고의 정산/kill switch 및 해당 **$0.03 목표 예산의 승인 여부** 심사.
3. 이 PR 자체 리뷰·승인, 배포 범위 검토 후 기본 브랜치 반영 (자동 병합·dispatch 없음).
4. 유료 실행 Artifact에서 실제 응답 usage를 확인하고 공급자 청구 내역과 대조. 결과 없거나 미확인 비용은 0으로 취급하지 않는다.
