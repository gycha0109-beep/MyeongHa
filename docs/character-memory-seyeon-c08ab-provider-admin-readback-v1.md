# 공급자 프로젝트 비용·권한 직접 조회 — 읽기 전용 (C08-AB)

Watchtower-Track: character-memory

## 실제 구현

기존 C08-AA는 운영자 제출 증빙의 형식만 검사했습니다. 이번 도구는 공급자 Admin API에서 다음 실제 값을 직접 읽습니다. 프로그램은 로컬 운영자 환경에서만 실행합니다.

- 평가 전용 프로젝트의 실제 ID·정확한 MyeongHa-Evaluation 이름·active 상태
- 등록된 평가 API Key ID의 동일 프로젝트 소속 및 active 상태·만료
- 월간 Spend hard limit의 USD / month / threshold_amount 100 cents / enforcement.status enforcing 전체 동시 확인
- UTC 이번 달 /organization/costs의 project_ids[] 필터와 project_id별 그룹 비용 전체 페이지 합산
- 조회 실패, 불일치, 지연/누락, 귀속되지 않은 비용, 알림만 있는 한도는 0원·승인으로 둔갑하지 않고 HOLD

## 로컬 실행 (Admin key를 GitHub에 등록하지 않습니다)

필수 비공개 로컬 환경변수: OPENAI_ADMIN_KEY, SEYEON_EVAL_PROJECT_ID, SEYEON_EVAL_API_KEY_ID. 마지막 값은 비밀 문자열이 아닌 API Key의 식별자입니다. 신뢰된 사용자 운영 환경에서만 아래 명령을 실행합니다.

    node scripts/seyeon-cost-c08ab-provider-admin-readback-v1.mjs

Admin API 비밀 값, 프로젝트 ID, 키 ID, 오류 원문, 원본 응답은 출력하지 않습니다. GitHub Actions와 배포/서비스 환경에 Admin key를 추가하면 안 됩니다. GET만 사용하고 POST /v1/responses 또는 유료 호출 경로는 없습니다.

## 계속 차단되는 것

1. 평가 키 ID가 프로젝트에 속해 있어도 GitHub Secret OPENAI_EVAL_API_KEY의 실제 비밀 값이 동일하다는 것은 별도 증거가 필요합니다.
2. 이번 달 프로젝트 비용은 공급자 집계 지연 가능성이 있으며 과거 11회 개별 청구·송장 대조가 아닙니다.
3. C08-Z의 PostgreSQL 예약 원장은 폐기형 테스트로, 독립 관리자 소유 및 수정·삭제 차단되는 운영 공유 원장이 아닙니다.
4. 공급자 하드캡은 집계 지연으로 초과 청구 가능하므로 5,000원 승인 상한을 단독으로 보장하지 않습니다.
5. 현재 연결된 OpenAI Platform 대상 프로젝트 조회에서 평가 전용 MyeongHa-Evaluation 프로젝트는 표시되지 않았습니다. 다른 계정·조직 소속일 가능성도 있으므로 현재 연결로는 소속을 확정하지 않습니다.

따라서 성공적인 readback도 paidDispatchEnabled=false, githubSecretKeyBindingVerified=false, prior11InvoiceReconciled=false, globalImmutableReservationVerified=false를 유지합니다. 실모델 추가 호출 0회, Production/G0~G6 HOLD. 새로운 승인 PR 없이 기존 retired workflow를 되살리지 않습니다.

참고: https://developers.openai.com/api/docs/guides/spend-limits
프로젝트 하드캡: https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/projects/subresources/spend_limit/methods/retrieve
프로젝트 키: https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/projects/subresources/api_keys/methods/retrieve
비용 조회: https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs

검증: npx vitest run test/seyeon-cost-c08ab-provider-admin-readback-v1.test.mjs
