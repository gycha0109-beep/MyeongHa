# Commerce Payment Track — Worklog

**작성 시작:** 2026-10-31 (KST)
**관리 범위:** 명하 결제 트랙 P1–P5 실제 구현과 검증, 배포 경계
**기록 원칙:** 확인한 사실만 적습니다. PR 병합·CI·테스트·운영 적용을 구분하고, 완료하지 않은 것은 완료로 표시하지 않습니다. 작업 때마다 이 파일 끝에 날짜·수행·증거·남은 과제를 추가합니다.

## 확정된 이전 진행 현황 (작업 재수행 대상 아님)

| 단계 | 현재 확인된 구현 상태 | 증거 / 제한 |
| --- | --- | --- |
| P1 샌드박스 결제 | Owner 전용 PortOne KCP TEST prepare/checkout/verify 및 Receipt 검증 완료 | 2026-10-29 실제 샌드박스 수락 증거, Production 크레딧 0 |
| P2 상품 | Reading 상품/Reader 단위/가격 정책·비활성 카탈로그 정리 | 운영 판매 Offer/실행 가능한 Charge Terms 0 |
| P3 유료 권한 | 내부 Grant·Entitlement Effect 후보 마련 | 유료 판매/실제 권한 지급 공개 경로 미연결 |
| P4 환불·권한 회수 | 정확한 Receipt/Provider Event/Reader Grant 검증, 취소 읽기·저장 후보 및 금액 분리 | 안전한 처리 순서·Legal/제공 증거·Reader T2/회수 실행 미완료 |
| P5 LIVE | 운영 활성화 보류 | PG 실제 상품 판매, 소비자 환불·운영 webhook 미활성화 |

### 2026-10-31 — 과거 통합 이력 확인

- [병합 #2785](https://github.com/gycha0109-beep/MyeongHa/pull/2785): 결제 트랙 목적·엔드포인트 보고 및 P4 내부 구현.
- [병합 #2791](https://github.com/gycha0109-beep/MyeongHa/pull/2791): 서명된 취소 검증 → 기존 이벤트/Grant 읽기 연결, 비배포 개인정보 삭제 후보.
- [병합 #2793](https://github.com/gycha0109-beep/MyeongHa/pull/2793): PortOne 취소 Provider Event 멱등 저장 **비배포 후보** 및 격리 DB SQL 스모크.
- [병합 #2795](https://github.com/gycha0109-beep/MyeongHa/pull/2795): 전체 누적 취소 금액과 개별 성공 취소 금액 구분.
- 전제: 위 PR들의 병합은 **후보 코드의 운영 배포·LIVE 환불·권한 회수 완료를 의미하지 않습니다.**

### 2026-10-31 — 현재 구현 시작: 정확한 Reader 회수 대상과 순서 판단

- **기준 커밋:** `e9529ba2` (`main`, #2795 병합).
- **브랜치:** `feat/commerce-payment/exact-reader-revoke-preflight-20261031`.
- **확인한 사실:** Reader T2의 최종 공개/원자적 잠금 경계는 기존 공식 Reader 구현에서 HOLD 상태입니다. P4 취소 이벤트 후보는 provider ordering key를 임의로 생성하지 않으며 `NULL`입니다. 안전한 NEWER/STALE 검증과 금액·법적 처리 결론 없이는 자동 회수할 수 없습니다.
- **이번 작업 목표:** 기존 Purchase Receipt → 정확한 Reader Access Grant → 해당 Provider Event → 기존 Entitlement Effect를 읽기 전용으로 결합하고, 비어 있거나 비교 불가능한 처리 순서/이미 회수된 이력을 명확히 구분하는 비배포 내부 사전검사.
- **진행:** 파일 생성 및 설계/기존 DB 계약 확인. 구현·테스트·PR 결과는 아래에 이어 기록합니다.

## 미완료 경계

- **순서:** PortOne 인증된 응답에서 신뢰 가능한 비교 기준 확보/검증, NEWER/SAME/STALE/INCOMPARABLE 실제 비교 계약.
- **회수:** 환불 금액·개별 취소 성공 상태·법정 청약철회 판단·제공/전달 증거, Reader T2와 Grant lock/CAS 결합.
- **DB:** 후보 SQL의 실제 Commerce migration/trigger를 포함한 PostgreSQL 17 검증 및 운영 권한 부여 검토.
- **개인정보:** 신규 환불 접수 테이블의 계정 삭제 Subject 그래프·복원 재검증 편입.
- **운영:** 실제 PG 취소·환불, LIVE 판매, 공개 consumer 엔드포인트는 비활성화 유지.

### 2026-10-31 — 정확한 Reader 취소 순서/회수 사전검사 구현

- **구현:** `scripts/operations/commerce-exact-reader-revocation-order-preflight-v1.mjs`의 읽기 전용 PostgreSQL 질의로 정확한 Provider Event + 원본 결제 Receipt + Subject + 구매 Grant + Reading/Reader Access + 같은 이벤트의 Entitlement Effect + 다른 Reader의 활성 Grant 수를 한 번에 검증합니다.
- **판단:** 동일 이벤트의 기존 revoked Effect가 있고 Grant도 revoked이면 `SAME` 재전송 관측으로 분류합니다. 이미 회수·만료된 Grant, 부분 취소·취소 대기, 기록이 없는/비교 불가능한 provider 순서는 회수를 차단합니다. 단순 ordering key 문자열로 NEWER/STALE를 만들지 않습니다.
- **안전 경계:** `begin isolation level repeatable read read only`, 완전한 RLS 가시성 확인, 원본 Reading/Reader ID 비노출, `grantRevocationAuthorized=false`, `readerT2LockHeld=false`, `entitlementEffectInvoked=false`. 기존 `internal_apply_entitlement_effect_v1`을 호출하지 않으며 새 운영 엔드포인트도 없습니다.
- **로컬 테스트:** Vitest 31개 PASS. 격리 PGlite 0.5.13/PostgreSQL 18.6 WASM의 기존 Reader A/B fixture + 새 SQL 검사기 출력 실행 `COMMERCE_READER_ORDER_SCOPE_SQL_SMOKE_PASS`. 대상 Reader A와 무관한 Reader B Grant 활성 유지 확인. **PostgreSQL 17 전체 migration/트리거 실증으로 해석하지 않음.**
- **테스트/기록 파일:** `test/commerce-exact-reader-revocation-order-preflight-v1.test.mjs`, `test/db/commerce_exact_reader_revocation_order_preflight_v1_smoke_runner.mjs`. 작업한 파일은 모두 PR에서 통합 검증 후 병합 예정입니다.

**다음 구현:** 신뢰 가능한 Provider 시퀀싱 또는 동등한 최신 상태 조정 증거를 제공자 어댑터에서 확인하고, 금액/환불 Legal/Reader T2 확정 조건이 충족된 경우에만 기존 Grant 잠금·revision CAS 및 Entitlement Effect 실경로를 열 수 있습니다. 현 시점에서 자동 회수로 우회할 수 없습니다.
- **PR / 전체 검증:** [PR #2798](https://github.com/gycha0109-beep/MyeongHa/pull/2798), 구현 커밋 `b605f08e`. 관련 회귀 테스트 13개 파일 **272건 PASS**, TypeScript 타입 검사 및 빌드 PASS. GitHub 필수 통합 CI와 병합은 PR 체크에서 별도 확인합니다.

### 2026-10-31 — 정확한 개별 취소 금액 증거와 Reader 회수 검토 연결

- **기준:** [PR #2798](https://github.com/gycha0109-beep/MyeongHa/pull/2798) 통합 CI 전부 통과 후 `main` 병합 확인, 기준 커밋 `6e0561ee`.
- **이번 브랜치:** `feat/commerce-payment/cancellation-exact-amount-provenance-20261031`.
- **실제 구현:** 기존 비배포 PortOne 취소 Provider Event 저장 후보에 개별 취소 ID HMAC·해당 취소 건의 SUCCEEDED 금액·첫 GET에서 관측된 누적 취소액·원본 Receipt 금액/통화를 결속하는 최소화된 `source-v2` 증거 추가. 원본 결제액 초과, 부분/전액 불일치, 취소 ID 누락을 차단합니다.
- **멱등·지연 재전송:** 첫 부분 취소(예: 3,000원) 후 다른 취소로 누적 8,900원이 됐을 때도 동일 웹훅의 **개별 3,000원**과 원본 Signed Payload/GET HMAC는 변하지 않도록 연결합니다. 같은 이벤트 ID의 취소 금액·구매자·영수증·서명 원문이 바뀌면 충돌, 누적액이 감소하거나 첫 관측이 사라지면 충돌합니다. 저장된 첫 증거는 UPDATE하지 않습니다.
- **정확한 Reader Grant 사전검사:** 기존 Provider Event → 원본 Receipt → 대상 Reader 구매 Grant 검사에서 `source-v2` 취소 금액을 읽고, 누적 전액 취소만으로는 해당 개별 이벤트의 전액 회수 근거를 세우지 않도록 차단합니다.
- **검증 (단위/격리 SQL):** 취소 저장/Reader 사전검사 Vitest 62건 PASS, 격리 PGlite 0.5.13/PostgreSQL 18.6 WASM에서 해당 저장 SQL 및 Reader A/B SQL 스모크 PASS. **운영 배포, PostgreSQL 17 전체 스키마/트리거 실증, T2/환불/Grant 쓰기 증거는 아닙니다.**
- **현재 남은 의존성:** 신뢰 가능한 Provider 순서 또는 동등한 최신 상태 조정 계약, Reader R2/T2 원자적 범위 잠금, 법적 청약철회/제공 증거, 실제 PostgreSQL 17 전체 migrations 검증. 후보 SQL은 `supabase/migrations/` 밖에 유지하며 운영 환불·권한 회수 모두 미활성화.
- **추가 검증:** 관련 Vitest **13개 파일·283건 PASS**, 타입 검사 PASS, 빌드 PASS. 격리 SQL 2종 모두 PASS: `COMMERCE_EXACT_CANCELLED_AMOUNT_SQL_SMOKE_PASS`, `COMMERCE_EXACT_READER_CANCEL_AMOUNT_SQL_SMOKE_PASS`. 기존 실제 Commerce 마이그레이션/트리거가 포함된 PostgreSQL 17 증거는 여전히 미완료입니다.
- **PR·CI:** [PR #2801](https://github.com/gycha0109-beep/MyeongHa/pull/2801), 구현 커밋 `4b01970d`. GitHub 필수 통합 CI와 병합은 **검증 결과 확인 전까지 대기**이며 로컬 검증 성공과 별개로 관리합니다.
