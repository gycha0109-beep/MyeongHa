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

### 2026-10-31 — 정확한 Reader Grant 잠금·버전 검사 연결

- **기준:** [PR #2801](https://github.com/gycha0109-beep/MyeongHa/pull/2801) 필수 통합 CI 성공 후 병합 확인, `main` 기준 `71315540` (결제 #2801 병합 커밋 `30ddaf31` 포함).
- **브랜치:** `feat/commerce-payment/revoke-lock-cas-bridge-20261031`.
- **실제 구현:** 기존 PortOne 취소 Provider Event를 먼저 잠그고, 기존 Receipt에서 확정된 Subject/Purchase Intent에 정확히 결속된 **하나의 Reader 구매 Grant**를 잠급니다. 동일 트랜잭션 안에서 Grant revision·마지막 ordering key를 비교하고 기존 취소 금액·같은 이벤트의 회수 이력을 재검사합니다.
- **격리:** 익명/로그인/API/service/worker 계정은 거부합니다. 이벤트나 Grant가 없거나 충돌·변경된 경우 다른 Reader 구매권을 대신 사용하지 않습니다. 기존 Entitlement Effect는 호출하지 않으며 **항상 ROLLBACK**, 실제 권한 변경 0.
- **현재 제한:** 이 잠금은 Reader 최종 R2/T2 공유 범위 잠금이 아닙니다. Provider NEWER/STALE 비교자·법적 환불 결론·배송/제공 증거·T2 Lock Order 없이 실제 revoke를 허용하지 않습니다.
- **최초 검증:** Vitest 신규 23건 PASS; 격리 PGlite 0.5.13/PostgreSQL 18.6 WASM의 실제 Provider Event/Grant `FOR UPDATE`, Revision 변경 후 재검사, Reader B Grant 보존 SQL PASS (`COMMERCE_READER_REVOKE_LOCK_CAS_SQL_SMOKE_PASS`). PostgreSQL 17 전체 migration/trigger·동시 TCP 세션 검증은 **아님**.
- **설명:** `docs/operations/COMMERCE_READER_REVOKE_LOCK_CAS_BRIDGE_V1.md`.
- **PR 및 최종 로컬 검증:** [PR #2804](https://github.com/gycha0109-beep/MyeongHa/pull/2804), 구현 커밋 `fd9cbe6c`. 관련 Vitest 14개 파일 **306건 PASS**, 타입 검사·빌드 PASS, 격리 PostgreSQL SQL 잠금 스모크 PASS. **GitHub 필수 CI 및 병합은 별도 대기**, 운영/라이브 회수 불활성.
- **남은 것:** 기존 Provider/Reader 신뢰 가능한 최신 순서·권한 회수 조건을 연결하고 P4 운영 적용 전에 실제 PG17 동시성/분리 수준 테스트. 사용자 재승인은 요구하지 않으며 P5/LIVE 결제는 보류합니다.

### 2026-10-31 — 개인 환불 접수 기록의 계정 삭제 후보 구현 (독립 브랜치)

- **브랜치:** `feat/commerce-payment/private-claim-finalizer-candidate-20261031` — 앞선 PR #2804의 통합 CI와 독립 진행.
- **구현:** 마지막 계정 삭제 함수(1520)와 동일한 선행검사/기존 데이터 처리 로직에 **정확한 Subject 개인 Claim 삭제, 삭제 후 잔여 확인, 이미 삭제된 Subject 재실행 시 잔여 Claim 거부** 세 지점을 추가한 비배포 SQL 후보 작성.
- **증거:** 기존 1520 본문과 세 삽입 지점을 제외한 완전 동일성 테스트 8건 PASS. 격리 PGlite/PostgreSQL 18.6 WASM에서 일반 DELETE 차단, 지정 Subject DELETE, 다른 Subject Claim 보존, 구매 Intent 2건 보존 SQL PASS. 아직 **전체 계정 삭제 함수 실행/PG17 전체 마이그레이션/복원 검증은 수행하지 않았습니다.**
- **안전:** 기존 결정된 P0-PR-01 기본 DELETE와 Commerce P5Y 보존 분리. `claimDispositionGraphIntegrated=false`, 새 Claim 및 finalizer SQL은 `docs/operations/candidates/` 외부 비배포 후보 유지. 운영 환불·권한 회수·실제 고객 접수 모두 OFF.
- **다음:** 실제 PostgreSQL 17 전체 삭제 그래프와 FK/Reader 권한/계정 복원 동작을 검증한 뒤에만 forward-only 마이그레이션으로 옮길 수 있습니다.
- **통합 PR:** [PR #2805](https://github.com/gycha0109-beep/MyeongHa/pull/2805). #2804 병합 커밋 `d9e25eee` 기준 최신 `main`으로 갱신한 뒤 기존 Worklog를 보존하여 제출했습니다. 관련 테스트 **34개**, 타입 검사·빌드, 격리 SQL PASS. 공식 CI·병합 상태는 별도 확인합니다.

### 2026-10-31 — PortOne V2 개별 취소와 기존 Entitlement Effect의 합성 DB 연결

- **기준:** PR #2804 공식 CI 통과 후 병합 확인, `main` 커밋 `d9e25eee`. 개인정보 삭제 후보는 독립 PR #2805에서 통합 검증 진행 중.
- **브랜치:** `feat/commerce-payment/portone-reader-effect-synthetic-proof-20261031`.
- **실제 구현:** 별도 `myeongha_*` 격리 DB에서 공식 Reader B2/B3 구매 Fixture와 PortOne V2 `source-v2` 개별 SUCCEEDED 취소 증거를 사용하여, 취소 이벤트 → 원본 Receipt → 대상 B2 Grant 잠금/버전 비교 후 기존 `internal_apply_entitlement_effect_v1`을 실제 호출하는 검증 경로 작성. B2 회수 1건·동일 이벤트 멱등 재전송·다른 B3 구매권 보존/잘못된 Grant 거부 검사, 최종 `ROLLBACK`으로 작업 자체는 비영속.
- **CI 연결:** `test/db/run_authority_core.sh`에서 마이그레이션이 적용된 별도 PostgreSQL 17 테스트 DB를 복제하여 검증하도록 포함. 이전 단순 Provider 중립 회수 테스트와 달리 PortOne V2 취소 개별 금액 계보를 직접 사용합니다.
- **로컬 확인:** Vitest 계약 검증 6건 PASS, Bash 구문 검사 PASS. **전체 PostgreSQL 17 SQL 실행 및 원자적 변경 결과는 공식 CI 완료 전까지 미확인**입니다.
- **안전/구현 경계:** 웹훅·사용자 접수·환불 POST·운영 Grant 회수 경로는 모두 비활성. 이 합성 DB 시나리오는 Provider의 신뢰 가능한 순서·법적 환불 판정·제공 증거·Reader R2/T2 최종 제공 잠금을 증명하지 않으며 실제 운영 회수 권한이 아닙니다.
- **문서:** `docs/operations/COMMERCE_P4_PORTONE_READER_ENTITLEMENT_SYNTHETIC_PROOF_V1.md`.
- **PR / 최종 로컬 증거:** [PR #2807](https://github.com/gycha0109-beep/MyeongHa/pull/2807), 구현 커밋 `1e4421aa`. 관련 Vitest 15개 파일 **312건 PASS**; #2805 병합 최신 기준 핵심 42건 PASS, 타입 검사·빌드·Bash 구문 PASS. **PostgreSQL 17 실제 SQL 결과는 통합 CI가 완료되기 전까지 미확인**입니다.

### 2026-10-31 — 개인 환불 접수 기록의 전체 PostgreSQL 17 계정 삭제 경로 연결

- **기준:** [PR #2807](https://github.com/gycha0109-beep/MyeongHa/pull/2807) 및 그 하위 실제 PostgreSQL 17 `db-authority-core`·`postgres17` 통합 검증 모두 성공 후 `main` 병합 `df0194a1`.
- **브랜치:** `feat/commerce-payment/claim-finalizer-real-pg17-20261031`.
- **실제 구현:** 기존 account deletion DB finalizer 전체 실행 테스트에만 활성화되는 Claim 증거 체크를 추가하고, 동일하게 마이그레이션이 적용된 독립 PostgreSQL 17 DB에서 보류 중인 개인 Claim/최종 삭제 SQL 후보를 설치하도록 연결했습니다. 정상/실패·롤백·중복 재실행·삭제 후 복원 잔여 기록·다른 계정/Commerce 보존 구매 증거를 검사합니다.
- **안전:** 격리 `myeongha_*`·PostgreSQL 17 버전 검사 필수. 기존 일반 계정 삭제 테스트·운영 SQL의 기본 동작은 변경하지 않으며 두 후보 SQL 모두 `docs/operations/candidates`에 잔류합니다. 실제 개인 Claim을 DB에 배포하거나 소비자 청약철회/Provider 환불/권한 회수를 활성화하지 않습니다.
- **로컬 검증:** Vitest 구조·개인정보 경계 검사 21건 PASS, Bash 스크립트 문법 PASS. **전체 PostgreSQL 17 원자적 삭제 시나리오는 GitHub 통합 CI에서 실행되기 전까지 결과 미확인**.
- **다음:** 통합 CI의 실제 PostgreSQL 17 실행 성공 및 개인정보 복원 재조정 후에만 forward-only 마이그레이션 편입과 private intake 활성화를 검토합니다.
- **상세:** `docs/operations/COMMERCE_P4_PRIVATE_CLAIM_FULL_PG17_FINALIZER_PROOF_V1.md`.
- **PR:** [PR #2811](https://github.com/gycha0109-beep/MyeongHa/pull/2811), 최초 구현 커밋 `651b5560`. 실제 PostgreSQL 17 전체 finalizer 실행·최신 CI·병합은 검증이 끝나기 전까지 성공으로 표시하지 않습니다. 로컬 관련 42건/타입 검사·빌드/Bash 문법 PASS.

### 2026-10-31 — PR #2811 통합 CI 환경 오류 수정

- **실패 원인:** [PR #2811 초기 일반 CI](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41212139498)의 `db-authority-core`는 PostgreSQL **15.19**에서 실행되었지만 새 후보는 PostgreSQL **17 전용**으로 제한돼 있었습니다. `DENY: ... got 150019`에서 실패. 이전 코드의 실제 PG17 실행 실패가 아니라 테스트 연결 대상 오류입니다.
- **조치:** PostgreSQL 15 `run_authority_core.sh`에 추가했던 검사를 제거하고, `scripts/ci/db-suites.json`의 `postgres17` 그룹 및 `test/db/run_ci_case.sh`의 전용 실행 항목에 등록했습니다. CI PostgreSQL 17·격리 DB 검사와 기존 마이그레이션 적용을 유지합니다.
- **검증:** 기존 일반 DB finalizer 기본 실행 절차는 변경하지 않고, 새 테스트는 PG17 전용 그룹에서만 실행하도록 계약 검사·Bash 구문 검사를 수정했습니다. **수정한 실제 PG17 통합 CI 결과는 아직 미확인**입니다.

### 2026-10-31 — PortOne 취소 ID HMAC 기반 최신 GET 재확인

- **기준 브랜치:** `feat/commerce-payment/portone-cancel-hmac-recheck-20261031`. 개인정보 삭제 전체 PG17 증거는 별도 PR #2811에서 필수 CI 진행 중이며 자동 병합 조건에 따릅니다.
- **실제 구현:** 최소화된 기존 취소 Provider Event의 `cancellationIdHmac`로 인증된 PortOne GET에 있는 정확한 취소 ID를 일시적으로 재식별하고, 기존 개별 SUCCEEDED 금액/누적 금액 분류기에 연결하는 read-only 서버 후보. 원본 취소 ID나 API/HMAC secret을 보관하거나 결과에 반환하지 않습니다.
- **검증:** 관련 Vitest 8개 파일 **172건 PASS**, 타입 검사·빌드 PASS. 지문 불일치/다른 Payment ID/부분 취소 누적/REQUESTED·FAILED/중복 취소 ID를 안전하게 처리함을 검증했습니다.
- **배포 경계:** 환불 POST/권한 회수/LIVE 결제/공개 웹훅 미활성. HMAC 일치는 최신 상태 확인 수단일 뿐 Provider 순서나 법적 환불·Reader R2/T2 권한 회수 승인이 아닙니다.
- **상세:** `docs/operations/COMMERCE_P4_PORTONE_CANCELLATION_HMAC_RECHECK_V1.md`.

### 2026-11-01 — 저장된 PortOne 취소 이벤트의 최신 HMAC 재조회와 Reader 권한 계보 연결

- **기준:** HMAC GET 재조회 구현 커밋 5c0979b9, 브랜치 feat/commerce-payment/portone-cancel-hmac-recheck-20261031. #2811 개인정보 최종 삭제 통합 검증은 별도 CI 진행 중.
- **실제 구현:** 기존 영속화된 최소화 source-v2 취소 Provider Event를 완전 가시성 읽기 전용 DB에서 확인하고, 원본 결제 Receipt/금액/통화 및 정확한 Reader Grant/Purchase Intent 계보를 확인한 뒤 트랜잭션을 종료합니다. 이후 인증된 PortOne GET에서 같은 cancellationIdHmac의 개별 취소 성공 상태와 금액을 재확인합니다.
- **음성·예외 처리:** 원본 이벤트 서명·최초 GET의 HMAC 지문·비활성 Authority 검사, 불명확한 중복 매핑·다른 Grant·금액 변화·취소 상태 REQUESTED/FAILED·누적 취소액 후퇴·Provider GET 실패·원본 결제 불일치를 모두 HOLD 처리합니다. readerT2LockHeld=false, providerOrderingProven=false, grantRevocationAuthorized=false, writesPerformed=false 유지.
- **테스트:** 신규 test/commerce-stored-portone-cancellation-hmac-recheck-v1.test.mjs 23건 PASS, 기존 HMAC GET 관련 12건 PASS. 확장 회귀와 PR·CI 결과 별도 기록.
- **남은 작업:** 제공·법적 승인·Provider 순서 판정·Reader T2 잠금 결합 전에는 실제 환불·Grant 회수 호출을 연결하지 않습니다.
- **통합 PR:** [PR #2816](https://github.com/gycha0109-beep/MyeongHa/pull/2816), 최초 구현 커밋 5c0979b9, 후속 DB 계보 연결 커밋 e54edff9. 관련 Vitest 9개 파일 **195건 PASS**, 타입 검사·빌드 PASS. 선행 #2811 병합 후 최신 main 기준으로 Worklog 충돌 없이 갱신하고 필수 CI·자동 병합을 설정합니다.

### 2026-11-01 — 저장된 PortOne 취소 HMAC 및 Reader 구매권 실제 PostgreSQL 17 계보 검사

- **선행 작업:** PR #2816 내부 비배포 HMAC 재확인 구현을 기반으로 독립 브랜치 `feat/commerce-payment/hmac-lineage-real-pg17-20261101`에서 추가했습니다.
- **실제 구현:** 기존 저장 Provider Event → 원본 Receipt → Purchase Intent → 결제 Attempt → B2 Reader Grant를 결합하는 **원본 SQL 자체**를 격리 PG17에서 실행하는 테스트를 추가했습니다. 다른 B3 Reader의 별도 Grant와 존재하지 않는 이벤트는 일치하지 않아야 합니다.
- **안전:** 전체 공식 Reader fixture 이후 B2/B3 합성 Attempt·취소 이벤트만 트랜잭션에서 만들고 항상 ROLLBACK. PG15 일반 DB 트랙·운영 마이그레이션·공개 endpoint·Provider refund POST·자동 Entitlement Effect는 변경하지 않습니다.
- **로컬 증거:** SQL 생성·Bash 구문·관련 Vitest 40건/타입 검사·빌드 PASS. **실제 PG17 데이터베이스 성공은 GitHub CI 검증 전까지 미확인**입니다.
- **남은 작업:** 선행 #2816 병합 시 최신 `main`으로 갱신하고 이 PG17 실행 항목의 CI 결과 확인, 이후 별도의 Provider ordering/법적 근거/Reader T2 조건을 충족하기 전 권한 회수 OFF 유지.
- **상세:** `docs/operations/COMMERCE_P4_STORED_PORTONE_HMAC_REAL_PG17_LINEAGE_PROOF_V1.md`.
- **통합 PR:** [PR #2819](https://github.com/gycha0109-beep/MyeongHa/pull/2819), 구현 커밋 `69606421`. 선행 #2816 미병합 시에는 Draft 스택 PR로 유지하며, #2816 병합 후 최신 `main`으로 변경해 공식 PostgreSQL 17 통합 CI·자동 병합을 활성화합니다.
- **진행 상태 갱신(2026-11-01):** #2816 필수 통합 CI 성공 및 `main` 병합 `6285fe66` 확인. 후속 [PR #2819](https://github.com/gycha0109-beep/MyeongHa/pull/2819)는 `main` 기준 재정렬·Draft 해제·`ci-integration-ready` 지정·자동 병합 설정까지 완료했습니다. 실제 PostgreSQL 17 전체 SQL 증거는 #2819 CI 결과 확인 전까지 미확정입니다.

### 2026-11-01 — PR #2819 PostgreSQL 17 RED 원인 수정 및 재시도

- **실패 원인:** [CI #41217837268](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41217837268)에서 공식 B2/B3 구매 Intent가 `verified`가 된 후 합성 Payment Attempt를 신규 등록해 `new payment attempts require a non-terminal Purchase Intent` 제약에 걸렸습니다. [Integration #41217873363](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41217873363)는 이 CI 실패 때문에 필수 선행 검사에서 중단됐습니다.
- **수정:** 공식 Reader fixture 원본을 변경하지 않고, 실행 시 생성하는 테스트 사본에만 B2/B3 Intent가 `created` 상태일 때 Payment Attempt를 먼저 삽입하도록 수정했습니다. 기존 verified Receipt·Reader 구매권 증명 절차는 그대로 유지합니다.
- **검증:** 합성 Attempt 삽입 → Intent verified → Receipt 생성 순서 검사 추가, 관련 Vitest **41개 PASS**, 타입 검사·빌드·Bash·SQL 생성기 검사 PASS. 운영 마이그레이션·결제/환불/자동 Grant 회수 기능 변경 없음.
- **남은 것:** 새 PR 커밋의 실제 PostgreSQL 17 실행 및 필수 Integration 결과. 완료 전까지 전체 DB 검사 통과를 추정하지 않습니다.

### 2026-11-01 — PortOne 인증 GET 이후 Reader 구매권 스냅샷 재검사

- **기준:** PR #2819([완료](https://github.com/gycha0109-beep/MyeongHa/pull/2819))의 PostgreSQL 17·통합 CI 그린 및 `main` 병합 `9bfe2409` 확인.
- **구현:** 최초 DB 취소 Event/Receipt/Attempt/Reader Grant 확인과 인증된 PortOne 개별 취소 GET 후, 동일한 완전 가시성 읽기 전용 SQL로 다시 스냅샷을 읽어 일치하지 않는 취소 상태·금액·Grant revision/status/order·Receipt·결제 시도를 모두 HOLD 처리합니다. 두 조회는 모두 ROLLBACK이며 실제 Entitlement Effect 호출은 없습니다.
- **검증:** 변경된 Reader Grant 및 Provider Event, 최초/두 번째 DB 오류, 누락·중복, 권한 상실·롤백, 원본 결제 계보에 대한 신규 회귀 검사. 기존 실제 PostgreSQL 17 스모크에 조회 필드 추가(결과는 공식 CI 확인 전 미확정).
- **안전:** `postGetDbSnapshotStable`는 관찰값일 뿐 Provider `NEWER/STALE`, T2 원자적 잠금, 법적 환불 또는 실제 Grant 회수 승인으로 승격하지 않습니다. 운영 refund/LIVE/자동 revoke OFF 유지.
- **브랜치:** `feat/commerce-payment/postget-reader-cas-revalidation-20261101`. 상세: `docs/operations/COMMERCE_P4_POST_GET_READER_CAS_REVALIDATION_V1.md`.
- **통합 PR:** [PR #2825](https://github.com/gycha0109-beep/MyeongHa/pull/2825). 구현 커밋 `dfa7920c`, 관련 Vitest 12개 파일 232건 PASS, 타입 검사·빌드·SQL 생성 PASS. 필수 PostgreSQL 17 및 통합 CI 완료 전까지 실제 DB 검증 결과는 미확정입니다.

### 2026-11-01 — PortOne 개별 부분 취소 이벤트 집합의 영수증 단위 감사

- **기준:** #2825가 필수 CI 통과 후 `main`에 병합된 상태에서 분기, 최초 기준 `069c4650`.
- **실제 구현:** 기존 `commerce_provider_events`만 읽는 내부 취소 집합 감사 모듈을 추가했습니다. 검증된 Reading Receipt당 최대 256개 취소 Provider Event에서 서로 다른 취소 ID HMAC·서명 HMAC·최초 GET 증거·`SUCCEEDED` 금액을 대조합니다. 개별 취소 합계가 원금보다 크거나, 최초 관측된 누적액 집합과 일치하지 않거나, 동일 취소 ID가 서로 다른 이벤트에서 중복되면 보류합니다.
- **안전 경계:** 읽기 전용 완전 가시성 권한·트랜잭션 ROLLBACK 강제. 별도 원장·운영 migration·환불 POST·Grant 회수·공개 라우트 없음. 숫자 합계가 일치해도 Provider `NEWER/STALE`, 법적 청약철회, 제공/전달, Reader R2/T2 권한 회수 근거를 주장하지 않습니다.
- **격리 DB 검증:** 기존 전체 Reader B2/B3 PostgreSQL 17 테스트 스키마를 재사용하는 감사 SQL 검사와, 기존 **비배포 후보 저장 함수**를 격리 PG17에서 실행해 3,000원+5,900원 두 취소 및 동일 HMAC 중복을 확인하는 별도 검사를 CI에 추가했습니다. 후자는 로컬 PGlite/PostgreSQL 18.6 WASM에서 실제 SQL PASS. **공식 PostgreSQL 17의 두 검사 결과는 CI 완료 전까지 미확인**입니다.
- **로컬 단위 검증:** 취소 집합 32건, PostgreSQL 17 테스트 계약 6건 PASS. 관련 결제·Reader 전체 회귀 검사·타입·빌드 결과는 최종 단계에서 추가 기록합니다.
- **문서:** `docs/operations/COMMERCE_P4_CANCELLATION_SET_LEDGER_AUDIT_V1.md`.
- **다음:** 저장된 HMAC 집합과 독립적인 최신 Provider GET 성공 취소 목록의 동등성 검증, 이후 순서/법적/Reader T2 권한 조건 완료 전까지 실제 환불·회수 비활성.
- **최종 로컬 회귀:** 관련 Vitest 14개 파일 **270건 PASS**, TypeScript 타입 검사·빌드 PASS, PostgreSQL 17 전용 SQL 생성기 2종 및 Bash 검사 PASS. 별도 PGlite PostgreSQL 18.6에서 2건 부분 취소 실제 SQL PASS. PostgreSQL 17 공식 CI는 아직 대기 상태입니다.
- **통합 PR:** [PR #2831](https://github.com/gycha0109-beep/MyeongHa/pull/2831), 최초 구현 커밋 636f1d15. 관련 Vitest 270건, 타입 검사·빌드 및 격리 PG18 SQL 통과. 공식 PostgreSQL 17/필수 통합 CI 결과와 병합은 별도 확인 전까지 대기 상태입니다.

### 2026-11-01 — 인증된 PortOne 전체 취소 목록과 기존 Receipt 원장 HMAC 집합 대조

- **선행 병합:** [PR #2831](https://github.com/gycha0109-beep/MyeongHa/pull/2831) 병합 확인(`6674709a`). 기존 복수 취소 원장 자체의 중복·건별 합계 감사 기능을 기반으로 다음 작업을 분리했습니다.
- **실제 구현:** 내부 fixed-origin 인증 PortOne V2 GET을 단일 취소/전체 취소 공통 전송으로 정리했습니다. 기존 원본 Receipt/검증된 결제 Attempt에서 조회한 Payment ID를 사용하며, 최대 64개 GET 취소 항목을 서버 메모리에서 HMAC으로 변환한 뒤 **저장된 모든 성공 취소 건의 지문·금액·전체 합계와 정확히 대조**합니다.
- **안전:** 빠진/추가된 취소 항목, 금액 변경, 원 거래·통화 오류, 미완료/실패 취소, 다른 결제 시도, GET 전후 DB 원장 변경을 HOLD 처리합니다. 두 DB 조회는 완전 가시성·읽기 전용·개별 ROLLBACK이며 Provider NEWER/STALE, 법적 환불, Reader R2/T2 권한을 새로 승인하지 않습니다. 공개 API·운영 마이그레이션·환불 POST·Grant Effect 없음.
- **실 DB 계약:** #2831에서 이미 가동된 별도 PostgreSQL 17 두 검사에서 새 정확한 Payment Attempt ID도 확인하도록 강화했습니다. PostgreSQL 17의 변경된 전체 스키마 성공은 이번 PR 필수 CI 전까지 **미확정**입니다.
- **상세:** `docs/operations/COMMERCE_P4_CANCELLATION_SET_AUTHENTICATED_GET_RECONCILIATION_V1.md`.
- **남은 과제:** Provider 비교 가능 처리 순서 또는 안전한 동등 상태 조정, 실제 Legal/Reader 전달 증거, Reader R2/T2 원자적 잠금과 기존 Entitlement Effect 결속. LIVE/자동 환불/권한 회수는 비활성 유지.
- **최종 로컬 검증:** 관련 결제·Reader Vitest **16개 파일 / 303건 PASS**, TypeScript 타입 검사·빌드 PASS, PostgreSQL 17 독립 검증 SQL 생성기 2종 PASS. 실제 PostgreSQL 17 전체 실행 및 통합 CI는 PR 성공 전까지 미확정입니다.
- **통합 PR:** [PR #2837](https://github.com/gycha0109-beep/MyeongHa/pull/2837), 핵심 커밋 addc9e0. 관련 Vitest 303건 PASS, 타입 검사·빌드 PASS, PG17 생성기 2종 PASS. 공식 PostgreSQL 17·통합 CI 및 병합 여부는 확인 전까지 미확정입니다.

### 2026-11-01 — PortOne 전체 취소 집합과 정확한 Reader Grant 잠금·CAS 검증 연결

- **선행:** [PR #2837](https://github.com/gycha0109-beep/MyeongHa/pull/2837) 필수 CI 성공 및 `main` 병합 `d0cce502` 확인. 전체 취소 HMAC 지문·금액·원본 영수증 대조는 기존 구현을 재사용합니다.
- **구현:** 동일한 정확한 취소 Provider Event가 첫·두 번째 읽기 전용 DB 집합에 모두 들어 있고 인증된 전체 PortOne GET과 항목별 금액까지 일치한 경우에만, 기존 SERIALIZABLE Event→Reader Grant FOR UPDATE 잠금·revision CAS 사전검사를 실행하도록 연결했습니다. 잠긴 이벤트의 원본 Receipt가 사전 검증한 Receipt와 다르면 해당 Reader 구매권 잠금 이전에 보류합니다.
- **검사 경계:** 다른 Event/Receipt, 다른 Reader 구매권, GET 중 이벤트 변동, Grant 버전·마지막 처리 키 변화, 동일 이벤트 중복 회수, 부분 취소·누적 취소를 구분합니다. 기존 DB SQL·권한 변경 함수·마이그레이션은 변경하지 않습니다. 두 READ ONLY 트랜잭션·하나의 SERIALIZABLE 잠금 트랜잭션은 전부 ROLLBACK합니다.
- **안전:** Provider NEWER/STALE 순서, 법정 환불·디지털 Reader 제공/전달, R2/T2 공유 범위 잠금의 승인되지 않은 조건을 true로 올리지 않습니다. 과거 동일 이벤트의 실제 revoked Effect가 입증될 때만 기존 SAME 재실행을 관찰합니다. 환불 POST/실제 Entitlement Effect/사용자 API/LIVE OFF 유지.
- **로컬 검증:** 신규 모듈 및 기존 조회·잠금·CAS 경계 집중 Vitest 59건 PASS. 전체 관련 회귀·타입 검사·빌드 결과는 최종 검증 후 기록하며, 공식 CI와 병합은 확인 전까지 미확정입니다.
- **문서:** `docs/operations/COMMERCE_P4_CURRENT_CANCEL_SET_READER_LOCKED_CAS_REVIEW_V1.md`.
- **최종 로컬 검증:** 결제·Reader 관련 Vitest **17개 파일/323건 PASS**, TypeScript 타입 검사·빌드 PASS, 빌드된 PortOne V2 전체 취소 조회 모듈 로드 PASS, 기존 PostgreSQL 17 취소 집합 SQL 생성기 PASS. 공식 통합 CI 및 병합은 별도 결과 전까지 미확정입니다.
- **통합 PR:** [PR #2841](https://github.com/gycha0109-beep/MyeongHa/pull/2841), 최초 구현 커밋 03cee16. 관련 Vitest 323건 PASS, 타입 검사·빌드/모듈 로드 PASS. 필수 통합 CI와 병합은 완료 근거 전까지 대기 상태입니다.

### 2026-11-01 — 정확한 Reader 구매 단위의 고지·실제 전달 증거 구분 및 법적 HOLD 연결

- **선행:** [PR #2841](https://github.com/gycha0109-beep/MyeongHa/pull/2841) 필수 CI 그린 후 `main` 병합 `fddd6a61` 확인. 전체 취소 집합·Reader Grant 잠금 및 revision CAS는 기존 내부 검사 재사용.
- **실제 구현:** 기존 인증 PortOne 전체 취소 GET과 정확한 구매권 잠금·버전 검사에 이어, 읽기 전용으로 해당 Provider Event/원본 Receipt/Subject/Reader Grant의 동일 구매 Intent를 확인하고 정확한 서버 결제 시점 고지 `unit_id`를 읽습니다. 기존 검증된 production 결제·고지 확인 증거 어댑터와 디지털 Reading 청약철회 검토기를 재사용해 법적 검토용 자료의 상태를 분류합니다.
- **안전·보호:** 다른 Reader/Receipt/Subject/버전·미승인 고지/미검증 Purchase Intent는 차단. 기존 공식 증거 소스에 실제 고객 전달 기록이 없어 `durableConsumerDeliveryProven=false`를 유지하며, 조작된 전달 완료 분류조차 보류합니다. 고객 접수·환불 POST·LIVE·자동 Reader 권한 회수·영속화 기록·새 운영 마이그레이션은 없습니다. DB는 완전 가시성 읽기 전용 및 ROLLBACK만 사용합니다.
- **격리 PostgreSQL 17:** 기존 B2/B3 서로 다른 공식 Reading 구매와 합성 PortOne 취소 Event fixture에서 동일 운영 SELECT를 실행해 B2만 정확히 조회하고 B3/잘못된 Receipt/Event가 반환되지 않는지 검증하는 CI 항목을 추가했습니다. 고지 증거가 없는 기존 fixture에서 `unitId=null`을 확인하며 콘텐츠 전달을 추정하지 않습니다. 공식 PG17 CI 성공 전까지는 미확정.
- **로컬 검증:** 신규 법적/고지/권한 오류 25건 및 PG17 계약 4건 PASS; 관련 전체 회귀·빌드 결과는 최종 검증 후 추가합니다.
- **문서:** `docs/operations/COMMERCE_P4_EXACT_READER_WITHDRAWAL_NOTICE_DELIVERY_HOLD_V1.md`.
- **다음:** 실제 고객 전달 증거 승인 및 Reader R2/T2 공개·잠금, Provider의 신뢰 가능한 처리 순서·법적 최종판단 계약을 분리해 구현해야 합니다. P0-PR-01·LEGAL-004 재승인 요청 없음.
- **최종 로컬 회귀:** 결제·Reader·청약철회 관련 Vitest **22개 파일/435건 PASS**, 타입 검사·빌드 PASS, 신규 PostgreSQL 17 SQL 생성기·Bash 라우팅·테스트 계약 PASS. 실제 PostgreSQL 17 신규 검사 및 필수 통합 CI 성공은 결과 확인 전까지 미확정입니다.
- **통합 PR:** [PR #2844](https://github.com/gycha0109-beep/MyeongHa/pull/2844), 구현 커밋 2c97e396. 관련 Vitest 435건·타입 검사·빌드 PASS. 실제 PG17/필수 통합 CI 결과 및 병합은 완료 근거 전까지 미확정입니다.

### 2026-11-01 — PR #2844 CI red 원인 수정 (Work Track + PostgreSQL 17)

- **Work Track 실패:** CI가 타입 검사를 마친 후 전체 Vitest를 먼저 실행하고 빌드는 이후에 수행합니다. 새 테스트 1건이 아직 생성되지 않은 dist/ 내부 모듈을 불러와 7,671건 통과/1건 실패가 발생했습니다. 기존 소스 기반 검토 어댑터를 테스트에서 직접 연결하도록 수정했으며 **dist/ 폴더를 격리해 실제 사전 빌드 없는 상황에서 신규 테스트 29건 PASS**를 확인했습니다.
- **PostgreSQL 17 실패:** 새 읽기 전용 구입 단위 SQL이 PostgreSQL 예약어 grant를 테이블 별칭으로 사용해 파서 오류가 발생했습니다. 별칭을 egrant로 변경하고 PG17 계약 테스트에서 같은 오류 재발을 검출하도록 보강했습니다.
- **안전 경계:** 보안·법적 검토 로직/데이터 정책·실제 DB 마이그레이션·환불/Entitlement 실행 기능은 변경하지 않았습니다. PR #2844 필수 CI에서 변경된 실제 PG17 SQL 실행이 확인되기 전까지 PG17 PASS를 추정하지 않습니다.
### 2026-11-01 — PR #2844 두 번째 CI 실패: 배포 보류된 고지 테이블 참조 제거

- **재실행 결과:** 수정 커밋 `5e768849`에서 Work Track·Web·Governance·db-authority-core·commerce-payment/runtime/content/entitlement DB 검사는 PASS. PostgreSQL 17 전용 격리 검사만 FAIL. CI Integration은 일반 CI Verify가 실패했으므로 승인 검증에서 중단됨(독립 원인 아님).
- **정확한 원인:** `test/db/staged_commerce_migration_policy.sh`가 `20261027054525_digital_reading_checkout_notice_evidence_v1.sql`을 기존 히스토리 PG17 스키마에서 **의도적으로 제외**하지만, 새 Reader 구매 단위 SQL은 그 migration의 `digital_reading_checkout_notice_presentations_v1` 테이블을 정적 LEFT JOIN하여 `relation does not exist`로 실패.
- **구현 수정:** verified Receipt / Reader Grant / Reading 선택을 조회하는 항상 사용 가능한 SQL과, 고지 테이블 설치 여부만 조회하는 `to_regclass` 검사 및 설치된 경우에만 정확한 Intent·Subject·Reader·Bundle의 고지 `unit_id`를 조회하는 SQL을 분리. 테이블이 없으면 `exact_unit_checkout_presentation_schema_not_installed`로 **안전 보류**, 실제 구매·고지·전달 증거 및 법적/환불 승인 모두 false. 기존 stage migration 제외 정책, 생산 DB 스키마, 고객 API는 변경 없음.
- **검증:** 사전 빌드 없이 신규 법적 고지 검사 28건 + PG17 계약 검사 4건 PASS. 공식 PG17 SQL 생성기는 실제 운영 Reader 구매 계보와 고지 테이블이 **설치되지 않은 상태**를 확인하도록 수정. PG17 실제 실행 결과는 새 PR CI가 완료되기 전까지 미확정.

### 2026-11-01 — 유료 Reader 내부 해석 저장 증거와 실제 소비자 전달 증거 분리

- **선행 병합:** [PR #2844](https://github.com/gycha0109-beep/MyeongHa/pull/2844) 필수 CI 성공 후 `main` 병합 `1adc43e9` 확인. 단계적 도입 상태인 checkout notice 테이블이 없는 PostgreSQL 17에서도 안전하게 HOLD하는 계약을 유지합니다.
- **실제 구현:** 기존 Reading/Reader Interpretation 내부 원본을 검증된 정확한 구매 Intent·Reader Grant·Reader Bundle에 결속해 추가로 읽기 전용 조회합니다. 내부 Reading 응답 상태가 `delivered`더라도 `official_source_committed_not_consumer_delivery`로만 분류하고, 고객 전달 증거·법적 판단·환불/Grant 회수를 허용하지 않습니다.
- **분리 구매 보호:** 공식 SQL 테스트의 B2와 B3처럼 동일한 Reader의 서로 다른 콘텐츠 Bundle 구매가 존재합니다. 최초 Reader interpretation의 초기 Bundle만으로 대체하지 않고, B2/B3 각각의 독립 Purchase Intent·Entitlement Grant·Bundle을 일치시켜 잘못된 구매권·다른 Subject가 원본을 대여하지 못하도록 합니다.
- **실제 PG17 계약:** 기존 `commerce-exact-reader-withdrawal-hold-pg17` 전용 격리 CI의 **동일 실행용 SQL**에서 B2/B3 양쪽의 정확한 결속, B3가 B2 구매로 가장한 교차 구매, 교차 Subject 거부를 검증하도록 확장했습니다. 운영 migration·Provider 취소·Entitlement Effect·고객 API 변경 없음.
- **부재/실패 처리:** 내부 Source가 없거나 생성 중이어도 소비자 요청을 자동 거절하지 않고 수동 검토를 유지합니다. 확정된 Source 기록이 모순되면 고지·Legal 조회 전 HOLD. 모든 조회는 기존 완전 가시성 READ ONLY/ROLLBACK 안에서 수행하고, 개인정보·해석 원문·지문을 반환하지 않습니다.
- **안전 경계:** 고객 실제 전달 기록의 서버 소스는 **여전히 미구현/미승인**입니다. `durableConsumerDeliveryProven=false`, Provider NEWER/STALE·법적 최종 판단·Reader R2/T2 Effect 연계 미완료, LIVE/자동 환불·회수 비활성 유지.
- **검증:** 신규 Reader 내부 Source 검증 17건, 기존 법적 검토 확장 8건 및 PostgreSQL 17 계약 포함 집중 57건 PASS. 전체 관련 회귀/타입/빌드 결과는 최종 검증 후 기록합니다. 새 실제 PG17 실행은 공식 CI 완료 전까지 미확정.
- **문서:** `docs/operations/COMMERCE_P4_READER_PRIVATE_SOURCE_NOT_CONSUMER_DELIVERY_V1.md`.
- **최종 로컬 회귀:** 관련 Vitest **23개 파일/463건 PASS**, TypeScript 타입 검사·빌드 PASS, 실제 PG17 fixture 기반 SQL 생성기 및 Bash 문법 PASS. 로컬 Docker 엔진은 실행 중이지 않아 신규 실제 PostgreSQL 17 DB 통합 검사는 미실행이며, PR의 공식 postgres17 CI 성공으로만 증명합니다.
- **통합 PR:** [PR #2853](https://github.com/gycha0109-beep/MyeongHa/pull/2853), 구현 커밋 c06e05d5. 관련 Vitest 463건·타입 검사·빌드 PASS. 공식 PostgreSQL 17 전체 스키마/필수 통합 CI와 병합은 결과 확인 전까지 미확정입니다.

### 2026-11-01 — PR #2853 통합 PostgreSQL 17 실패 수정

- **공식 CI 사실:** [통합 CI #41290232104](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41290232104)에서 admission, 일반 Work Track, runtime/content/commerce-payment/commerce-entitlement, DB authority-core는 PASS. 실제 실패는 `full / DB dependency · postgres17`의 `commerce-exact-reader-withdrawal-hold-pg17` 1건이며, 뒤따르는 CI Verify/Integration Verify 실패는 그 결과에 종속.
- **원인 및 수정:** 새 PostgreSQL 17 격리 SQL 블록에서 `subject_id`를 PL/pgSQL 지역 변수명과 DB 컬럼명에 동시에 사용해 `column reference "subject_id" is ambiguous`가 발생했습니다. 지역 변수를 `v_subject_id`로 변경하고 B2/B3 조회·비교에서 같은 이름을 사용하도록 보정했습니다. 운영 Read-only Source SQL, 실제 구매 권한, 환불·권한 회수 코드에는 변경이 없습니다.
- **회귀 보호:** PG17 SQL 생성기의 지역 변수 선언·원본 Receipt 대응·B3 구매권 조건에 혼동 가능한 열-열 자기 비교가 남지 않았는지 직접 검사하는 테스트를 추가했습니다. 실제 PG17 SQL 실행 성공은 **새 CI에서 확인하기 전까지 미확정**입니다.

### 2026-11-01 — 정확한 유료 Reader 응답 준비·고객 기기 ACK 영속 기록 구현 후보

- **기준:** #2853의 공식 PostgreSQL 17 통합 CI #41292352193 SUCCESS 및 `main` 병합 `f5305809` 확인. 내부 공식 Reading 저장·Reader Interpretation 결속은 소비자 전달 사실이 아니라는 기존 경계를 유지합니다.
- **실제 작업 1 — 저장:** `docs/operations/candidates/commerce_reader_delivery_transport_capture_v1.sql`에 정확한 유료 Reader 구매 단위의 응답 준비 기록과 기기 ACK 기록을 **서로 다른 두 테이블**로 추가했습니다. 검증된 Purchase Intent·해당 구매의 개별 Grant·공식 Reading·Reader·구매 Bundle이 일치하고 공식 Reading이 내부 커밋된 경우에만 응답 준비를 기록하는 내부 DB 함수, 기기 ACK 수신 시 같은 구매·Challenge HMAC·활성 Grant를 검증하는 함수, 동일 요청 재시도 멱등 처리를 포함합니다.
- **실제 작업 2 — 서버 연동 후보:** `scripts/operations/commerce-reader-delivery-transport-capture-v1.mjs`에 서버에서 위 두 DB 함수를 호출하는 경계를 구현했습니다. 유효하지 않은 사용자/구매 ID·Challenge HMAC·DB 응답을 거부하고 출력에는 원본 고객·구매·Reading ID·비밀키를 넣지 않습니다. 결과는 `response_prepared_not_consumer_delivery` 또는 `client_acknowledged_not_human_read`이며 **실제 콘텐츠 전달·인간 열람·법적 환불 제한을 입증하지 않습니다**.
- **실제 작업 3 — 경계 보호:** 재시도 시 동일 응답 준비 기록을 대조하고, 별도 구매/Reader/Bundle/본문 ID로 재사용하거나 Grant가 회수된 뒤 동일 준비 요청을 재실행하는 경우도 차단합니다. 역할에 대한 직접 테이블·함수 접근은 기본 차단하며 Production/public API 권한은 부여하지 않습니다.
- **검증:** `test/commerce-reader-delivery-transport-capture-v1.test.mjs`에 호출 인자·불변 구매 범위·ACK 분리·실패 시 차단·비밀 출력 억제·SQL 보호 조건 검사 추가. 공식 CI/실제 PostgreSQL 17 실행 결과는 **확인 전까지 미확정**입니다.
- **배포 경계:** 신규 SQL은 **비배포 후보 폴더**에 있고 기존 운영 migration/checkout notice stage 제외 정책, P0-PR-01·LEGAL-004, 환불/Entitlement/LIVE는 변경하지 않습니다. 이 후보는 S5 보호 본문 identity를 승인된 원본 테이블에 대조하지 못하며 아직 Reader 최종 R2/T2 공개·S7 전송 경로에 연결되지 않았습니다. 특히 *서버 준비 기록*과 *기기 ACK*는 수신/제공에 관한 단서일 뿐 `DELIVERED_PROVABLE`의 긍정 authority가 아닙니다.
- **다음 작업:** 실제 Reader R2/T2·S5/S7 원본에 응답 준비/ACK 기록을 결속하고, 신설 테이블의 계정 삭제·보존 기간 규칙을 승인된 정책에 맞춰 연결한 다음 격리 PostgreSQL 17 실제 SQL 실행 검증과 forward-only migration을 수행합니다. 이후 독립 전달 증거를 법적 수동 검토 소스에 연결합니다. 새로운 무근거 전달 완료 판정은 금지합니다.
- **작업 브랜치:** `feat/commerce/reader-delivery-receipt-capture-20261101`. 신규 구현, 테스트, 워크로그는 동일 PR에 포함합니다. 자동 환불·Reader 권한 회수·LIVE 결제는 계속 OFF.

### 2026-11-01 — Reader 전달 기록 후보의 실제 PostgreSQL 17 실행 검사 연결

- **실제 작업:** 이미 실행되는 `commerce-exact-reader-withdrawal-hold-pg17` 격리 DB 검사에 비배포 후보 SQL 설치와 실제 INSERT/ACK 함수 호출을 추가했습니다. 기존 B2/B3 구매 fixture를 재사용하며 새로운 workflow나 CI case를 만들지 않았습니다.
- **실행 증명 대상:** 정확한 B2 구매권 준비 1건, 동일 요청 재시도 후 원본 시각 불변, 별도 구매 B3로 재사용 시 거부, 잘못된 ACK HMAC 거부, 정상 ACK 1건과 재시도 멱등, 마지막 ROLLBACK. 실험 도중 환불·권한 회수 함수는 실행하지 않습니다.
- **검증 상태:** 테스트 경로와 격리 DB 가드를 실제 코드에 연결했습니다. **공식 PostgreSQL 17 CI가 아직 성공하기 전이므로 SQL 실행 성공은 미확정**입니다. 결과가 나오면 해당 PR/커밋의 CI를 기준으로 판단합니다.
- **PR:** [#2855](https://github.com/gycha0109-beep/MyeongHa/pull/2855), 자동 병합 설정. 현재 단계는 *서버 응답 준비/기기 ACK의 영속 기록 후보 + 실 DB 검증 경로*이며 최종 사용자 전달 사실 또는 운영 권한은 아닙니다.

### 2026-11-01 — Reader 실제 공개 경로 의존성 확인

- **저장소 확인:** 기존 DB Owner PR [#2299](https://github.com/gycha0109-beep/MyeongHa/pull/2299)(원본 구매권·Reader 결속)와 [#2301](https://github.com/gycha0109-beep/MyeongHa/pull/2301)(취소/권한 회수)은 모두 **closed / unmerged Draft**입니다. 과거 격리 CI 성공을 `main`에 합쳐진 운영 Writer로 취급하지 않습니다.
- **구현 경계:** 이번 PR #2855의 후보 기록 함수를 S5 보호 본문·S7 기기 전송/ACK의 최종 승인된 Writer라고 주장하지 않습니다. 해당 실제 소유 경로가 `main`에서 확인된 뒤 같은 구매권·공개 트랜잭션에 결속해야 합니다.
- **다음:** #2855의 PostgreSQL 17 결과 확인 후, 기존 S5/S7 구현을 중복 설계하지 않고 현재 `main`의 실제 사용 가능 코드를 기준으로 호출 경로·개인정보 삭제 정책을 우선 연결합니다.

### 2026-11-01 — P3 실제 영수증→Reader 구매권 지급 코드 통합 작업

- **방식 변경:** 작업 단위 PR/CI 대기를 중단하고, 독립 통합 작업 브랜치 `feat/commerce/operational-integration-20261101`에서 구현을 모은 다음 최종 통합 검증한다. #2855의 전달 기록 후보를 출발점으로 사용한다.
- **선행 확인:** #2855 체크된 SHA `68deccc8`의 CI/Web/Governance 성공을 확인했으나, 아직 PR은 open이므로 병합됐다고 주장하지 않는다. 기존 DB Owner #2299/#2301은 closed/unmerged였으며 코드가 main의 현재 권한으로 활성화된 상태가 아니다.
- **실제 구현:** 기존 DB Owner 아카이브에서 `apps/api/src/commerce-verified-reader-fulfillment.ts`, `apps/api/src/commerce-verified-reader-receipt-bind.ts`와 `tests/commerce-verified-reader-fulfillment-idempotency.test.ts`를 현재 브랜치로 이식했다. 기존 서버 검증 Receipt를 바탕으로 내부 DB에 정확한 Purchase Intent/Reader 권한을 원자적으로 결속하는 코드이며, 기존 승인된 구매역할(initial/additional), 중복 확인, 공식 Reading 재사용과 잘못된 권한 발급 거부를 보존한다.
- **배포 금지 사유:** 이식한 함수가 호출하는 내부 DB 함수는 #2299/#2301의 미병합 SQL에 의존한다. 따라서 현재 운영에서는 직접 호출하거나 공개 API에 연결하지 않는다. 런타임/고객 결제/환불/LIVE 활성화는 아직 수행하지 않았다.
- **충돌 처리:** DB Owner 아카이브 전체 241개 파일을 그대로 병합하면 현재 웹·Saju·보안·운영 파일 16개 충돌 및 의도치 않은 권한 확장이 발생하므로 전체 병합은 취소했다. 특히 환불 전체 취소 어댑터는 현행 PortOne 타입과 불일치해 이식 대상에서 제외하고 기존 최신 검증 흐름과 통합할 예정이다.
- **검증 상태:** 이번 통합 브랜치의 타입/회귀/실제 DB·CI 결과는 아직 미확정. 새 작업을 모두 모은 뒤 최종 검사한다. 중간 CI 완료를 근거 없이 추정하지 않는다.
- **다음:** 선행 SQL Writer를 현행 공식 Receipt/Reader 버전에 맞춰 통합하고, 실물 지급/취소/전달 경로를 같은 구매권·원자 잠금으로 묶는다. P0-PR-01 개인정보 삭제 그래프와 전달/청약철회 보존 규칙을 적용한 뒤 최종 통합 CI를 실행한다.

### 2026-11-01 — 결제 P3/P4 ↔ 공식 Reader S2~S7 통합 구현 묶음 (통합 작업 브랜치)

- **방식:** 기존 완료 작업은 재작성하지 않고 DB Owner #2301 닫힌 Draft 아카이브에서 실제 구현한 기능을 현행 Commerce 통합 브랜치에 포팅했습니다. 과거 대형 PR 전체 병합에서 발생한 16개 충돌 파일은 자동 덮어쓰지 않았습니다.
- **DB 실제 기능:** 1740~2300 범위 공식 Reader 관련 forward-only migration 57개를 이식했습니다. 주요 구현은 결제 단위 공동 잠금, verified Receipt 기반 Grant 발급·Reader 결속, 취소 성공 이벤트 기반 특정 Grant 회수, 보호 답변 원자적 저장·현 권한 재조회, 전달 준비/기기 ACK, 환불 검토용 전달 이력 및 개인정보 삭제·복구·키 폐기 처리입니다. 과거 성공 근거만으로 현행 DB 적용 성공을 주장하지 않습니다.
- **P3 호출 연결:** 기존 Commerce **사용자 검증 결제 완료 / 인증 Provider 완료** 뒤, 서버 전용 명시적 내부 설정이 있는 경우에만 DB 검증된 Receipt로 `fulfillVerifiedReaderReceiptV1`를 호출하도록 연결. DB 내부에서는 같은 구매 권한 범위를 재검증하고 멱등 발급·공식 Reading의 추가 Reader 재사용 조건을 적용합니다. 기본값 OFF, 기존 P1 Owner Sandbox와 공개 구매 플로우는 건드리지 않았습니다.
- **P4 실제 취소·권한 회수:** 독립적인 PortOne V2 인증 GET을 통한 `CANCELLED`·정확한 `SUCCEEDED` 취소 건 검사와 해당 Reader Grant만 회수하는 기존 DB Writer·서버 어댑터 및 Webhook 실행 경로를 통합했습니다. Cloudflare가 거부하는 구형 `redirect:error`는 포팅하지 않고 현재의 `redirect:manual`+3xx 거부 구현을 그대로 유지했습니다. **서비스가 PortOne에 환불을 요청하는 POST API는 아직 연결되지 않았으며**, 다른 Reader 구매권/채팅 회수 금지는 기존 원자 범위를 유지합니다.
- **Reader 유료 콘텐츠:** 기존 DB Owner의 서버 보호 답변 저장/조회, 웹·모바일 전달 처리, 서버 ACK·계정 삭제 오프프라이머리 복원/키 폐기 모듈을 통합했습니다. `api/me.ts`에는 기존 일반 API를 보존하고 Reader/ACK/Records 요청 분기만 연결했으며 **paidReadReleaseEnabled=false/productReleaseEnabled=false**로 공개는 닫혀 있습니다.
- **Reader 원본 접근 검증:** 기존 Reader admission에 정확한 현시점 verified Purchase/Grant/Reader/Bundle 검증을 출처 로드 전·정책 확인 후·발급 직전에 추가했습니다. 기존의 Reader 메타데이터 전체 비교 및 hash 재검사는 제거하지 않았습니다. 독립 S1 범위 잠금/최종 T2 없이 공개 권한을 추정하지 않습니다.
- **개인정보:** 보호 답변·기기 ACK를 운영 데이터베이스에서 삭제하는 것만으로는 오프프라이머리 암호키 삭제가 완료되지 않으므로, 계정 삭제 Worker의 키 파기 장벽·재개 검사 및 미완료 시 최종 삭제 확인 차단 경로도 통합했습니다.
- **아직 미완료:** 현재 main 이력·Saju Production 근거·판매 가능한 Offer/Charge Terms·실제 결제사 취소 POST·운영 개인정보 삭제/복구 정합성·유료 Reader 공개 조건·LIVE 준비는 별도 미충족입니다. DB migration과 신규 파일은 **로컬 브랜치에만** 있고 실제 Production Supabase 적용이나 LIVE 운영 활성화가 이뤄진 것이 아닙니다.
- **검증:** 이 구현 묶음의 타입·회귀·실제 DB 검증 결과는 **아직 미확정**입니다. 작업 중간마다 CI를 재실행하지 않으며 통합 후 로컬 필수 확인과 공식 단일 CI를 수행합니다.

### 2026-11-01 — 중복 전달 테이블 제거, 기존 Reader 보호 검사 유지, 통합 구현 로컬 확인

- **전달 증거 단일화:** 초기 #2855의 독립 응답 준비/기기 ACK 후보 SQL·호출 모듈·테스트 파일 4개를 제거했습니다. 대신 이미 구현된 기존 공식 Reader S7 2140 DB 전달 시도·ACK 계약과 보호 본문·계정 삭제 연계를 유일한 Writer로 채택했습니다. 관련 PostgreSQL 17 과거 HOLD 검사는 main 원본으로 복원했습니다. 기존 Worklog 과거 기록은 사실 이력으로 유지하며 현 항목으로 폐기 경계를 명시합니다.
- **Reader Record 호환:** 현재 메인 Records의 공식 Reading/출생 Revision 보유 증거를 삭제하지 않고, 결제 Reader 조회 연속성 모듈이 재사용할 수 있도록 기존 Postgres authority port export만 추가했습니다. 과거 DB Owner 버전의 느슨한 Records 조회 코드를 덮어쓰지 않았습니다.
- **Reader 출처 접근:** 정확한 현재 구매 Intent/Grant/Reader/Bundle의 독립 검증을 3회 수행하는 동안 현재 Reader 메타데이터 및 공식 응답 지문 전체 재검사도 보존했습니다. T1/T2는 각 트랜잭션에서 현 구매 사실을 재조회하며, 실패 시 생성 결과를 반환하지 않습니다.
- **회귀 수정:** 이전 단위 테스트가 원본 구매권의 실제 SQL 확인을 모의하지 않았던 점을 고쳐, 승인/회수/출처 변경을 검증하는 기존 fixture에 정확한 현재 구매권 포트를 공급했습니다. 구현 코드를 느슨하게 고치지 않았습니다.
- **검증 결과(로컬):** 서버 `tsc -p tsconfig.build.json --noEmit` PASS, 결제·Reader 주요 8개 Vitest 파일 **92/92 PASS**. 전체 workspace typecheck는 기존 타 작업폴더의 `node_modules` 디렉터리를 임시 연결해 모바일 private class 타입 경로 충돌이 발생하므로 결과를 전체 PASS로 주장하지 않습니다. 신규 전체 PostgreSQL 17 SQL 실행/통합 CI는 아직 미검증입니다.
- **PR 관리:** 기존 단편 후보 PR [#2855](https://github.com/gycha0109-beep/MyeongHa/pull/2855)는 새 Reader S7 단일화로 대체돼 **closed/unmerged** 처리했습니다. 원본 PR의 중간 CI 성공은 현재 통합 브랜치의 통합 통과가 아닙니다.
- **남은 필수 구현/인수:** Saleable Offer/Charge Terms와 승인된 Saju 공급, 고객 실제 수령 증거 판정, 법정 청약철회 최종 처리·PortOne 환불 요청 POST, 개인정보 최종 복구 인수, 현재 DB migration 이력 정합성, 유료 Reader 공개 및 LIVE. 수동·운영 승인 없이 LIVE와 자동 환불을 켜지 않습니다.
- **다음:** 실제 결제사 취소 요청·Claim 영속화·법적 검토를 현재 저장된 원본 Receipt/Reader lock과 하나의 경로로 연결하고, 신규 DB migration을 격리 PostgreSQL 17에서 검증한 뒤 최종 통합 CI를 한 번에 실행합니다.

### 2026-11-01 — P4 실제 PortOne 전액 환불 요청과 영속 중복 방지 구현

- **실제 구현:** `2310_official_reader_private_refund_dispatch_v1.sql`에 원본 Receipt에 1:1로 결속된 소유자 승인 법적 판정, 단일 전송 예약, 결제사 취소 ID/요청 상태, 취소 확인 기록을 분리해서 영속화하는 함수와 테이블을 추가했습니다. 공개 API·service_role·일반 API executor에 직접 접근/승인 권한을 부여하지 않았으며 자동 법적 승인 경로도 생성하지 않았습니다.
- **실제 결제사 호출:** `commerce-portone-reader-refund-request-v1.ts`에서 공식 PortOne V2 전액취소 POST와 고정 멱등 키, 원결제 금액 기반 취소가능잔액 확인, 강제 타임아웃/리다이렉트 거부, 응답 범위 제한을 구현했습니다. POST·통신 불확실성 이후에는 영속 상태를 유지하고 재시도 POST를 금지합니다.
- **실제 권한 회수 연결:** 취소 응답 `REQUESTED` 또는 `SUCCEEDED` 자체로 환불 완료/권한 회수를 선언하지 않고, 인증된 결제사 GET이 해당 결제/취소/금액의 전체 성공을 검증해야 기존 단일 Receipt·Grant 회수 Writer를 실행한 뒤 환불 요청 상태를 confirmed로 갱신합니다. 비결제사 취소/다른 Reader·부분 환불은 회수 불가입니다.
- **보류:** 소유자의 개별 환불 결정 원본 DB 레코드 입력 도구/계정 삭제·법정 금융보존 정책 결속, 취소 요청 이후 타임아웃 재조정, 실데이터 DB 설치/통합 CI는 아직 미완료입니다. 이번 단계의 로컬 커밋은 Production DB에 적용한 것이 아니며 자동 환불과 LIVE는 OFF입니다.

### 2026-11-01 — 통신 실패 후 결제사 GET 복구·환불 결과 구분

- **실제 구현:** `commerce-portone-reader-refund-recovery-v1.ts`에 결제사 인증 GET으로 원본 paymentId/transactionId·KRW 원금·CANCELLED·성공 취소 1건만 허용하는 복구 함수를 추가했습니다. 최초 취소 POST가 타임아웃 등으로 불확실해도 새 POST를 발송하지 않고, 재실행 시 조회한 성공 취소 ID를 기존 승인 건에 기록한 후 정규 취소 검증/Receipt·Grant 회수 경로를 재사용합니다. 실패·다중 취소·원금 불일치는 보류합니다.
- **실제 구현:** 결제사 인증키·설정값을 DB 전송 예약 전에 검증하도록 수정하여 잘못된 설정 때문에 예약만 소진되지 않도록 했습니다. 이미 회수할 구매권이 없는 취소와 실제 회수 성공, 완료 재호출의 결과를 구분합니다.
- **로컬 필수 검사:** `tsc -p tsconfig.build.json --noEmit` **PASS**. 새 환불 요청·상태 복구 단위 테스트 `test/commerce-portone-reader-refund-request-v1.test.ts` **15/15 PASS**. 실제 PortOne 계정 네트워크 취소 또는 새 SQL 실제 DB 적용/통합 CI는 실행하지 않았습니다.
- **남은 구현/검증:** 정확한 법적 결정 이력 저장 입력·검증 경로, 신규 환불 테이블의 승인된 계정 삭제·금융증빙 보존 정책 연계, 격리 PostgreSQL 17 신규 SQL 실제 실행, 샌드박스 전액 취소 E2E 및 기존 판매 가능한 Reader SKU·사주 공급 선행 조건. 외부 계정에 환불 POST는 실행하지 않았으며 LIVE/HOLD 경계를 유지합니다.

### 2026-11-01 — P4 환불 수동 법적 결정 입력 및 금융증빙 P5Y 보존 연결

- **실제 작업 1 — 소유자 승인 입력:** `apps/api/src/commerce-reader-private-refund-decision-v1.ts`에 법적 판단을 끝낸 운영자만 별도로 기록할 수 있는 내부 DB 쓰기 함수를 구현했습니다. 실제 Receipt/verified Purchase/고정 Reader 선택 및 운영자 전용 전체 DB 가시성을 재검증하고, 동일 결정의 재실행은 멱등 처리하며 다른 결정으로 덮어쓰는 시도를 ROLLBACK합니다. 불확실한 COMMIT 결과는 성공으로 추정하지 않습니다. 법적 승인 자체는 자동화하지 않았습니다.
- **실제 작업 2 — 개인정보 최소화:** `2310_official_reader_private_refund_dispatch_v1.sql`에서 결정 참조는 지문, 운영자 정보는 별도 불투명 식별자, 환불 사유는 제한된 코드만 저장합니다. 고객 원문 사유/민감 사주·Reader 본문/결제사 원본 응답/고객 Subject는 신규 테이블에 저장하지 않습니다. 원본 Commerce Receipt의 금융증빙을 참조하므로 기존 P0-PR-01의 일반 서비스 삭제와 금융 P5Y 구분을 유지합니다.
- **실제 작업 3 — 보존·처리 경계:** 환불 결정 및 확정 기록은 최종 확정 시점부터 최소 5년 보존하도록 DB에서 보장하고, 법적 결정과 원본 Receipt 연결 필드의 변경·상태 역전·확정 전 삭제를 거부하는 트리거를 추가했습니다. 5년 경과 후 **확정된 건만** 제한된 건수로 지우는 내부 운영 함수를 구현했으며 일반 API/Commerce 실행자에게 사용 권한을 부여하지 않았습니다. 정해진 보존기간 이전의 계정 삭제는 금융증빙 테이블을 삭제하지 않습니다.
- **실제 작업 4 — 권한 회수 확정 조건:** 단순히 Receipt가 `revoked`인 경우가 아니라 해당 원본 Receipt·동일 취소 ID에 결속된 `portone_v2` 검증 취소 Provider Event까지 확인해야 환불 상태를 `confirmed`로 변경합니다. 별도 취소 ID의 상태 변경을 현재 승인 건에 재사용하지 않습니다.
- **로컬 검증:** 신규 소유자 입력 테스트 14건 + 실제 PortOne 환불/복구 테스트 15건 = **29/29 PASS**, `tsc -p tsconfig.build.json --noEmit` **PASS**. 실제 신규 PostgreSQL 17 migration 실행·오프프라이머리 복구·공식 전체 CI는 사용자 요청에 따라 최종 통합 단계까지 보류합니다.
- **명시적 미완료:** 실제 구매자의 일반 청약철회 접수 UI·접수증, 별도 승인 증빙의 운영 프로비저닝, P0-CM-03 saleable SKU 및 Saju Production, 실제 Provider 취소 E2E, PostgreSQL 17 DB 적용, LIVE 결제는 여전히 비활성/검증 전입니다. 이 작업은 고객 환불을 실제 수행하지 않았으며 공개 서비스로 활성화하지 않았습니다.
- **이번 묶음 최종 로컬 확인:** 결제 완료·Reader 접근·취소·환불 결정/실행 코드의 집중 Vitest **10개 파일 121/121 PASS**, 서버 빌드 타입 검사 **PASS**, 변경 파일 공백 오류 확인 **PASS**. 이는 **격리 PostgreSQL 17 새 SQL 실행 증명/전체 CI/실제 결제사 트랜잭션 결과가 아닙니다**.

### 2026-11-01 — 고객 청약철회 접수 자료의 실제 DB 이행·개인정보 삭제 그래프 연결

- **한 것:** 기존 비배포 `digital_reading_withdrawal_claim_private_v1.sql`을 기반으로, 최신 S4 계정 삭제 함수(2010)의 **보호 답변 삭제·외부 암호키 파기 확인**을 그대로 보존한 신규 순방향 `2320_commerce_digital_reading_claim_account_delete_v1.sql`을 작성했습니다. 접수 기록 테이블에 입력·변조 방지·본인 Subject/Purchase Intent 참조 검증을 적용하고, 계정 삭제 시 해당 고객 접수 기록을 먼저 삭제하며 삭제 완료 재실행에서 데이터 재등장을 차단합니다. 금융 P5Y 테이블은 삭제하지 않습니다.
- **한 것:** 회원의 구매 단위가 서버 검증 Production Receipt, Reader 선택, 실제 결제 전 구매정보 표시와 일치하는 경우에만 정해진 코드로 청약철회 요청을 DB에 기록하는 별도 DB 함수를 추가했습니다. 중복 요청은 최초 입력과 지문을 비교해 반환하며, 수정을 요구하는 동일 키 재전송은 실패합니다. 고객이 보낸 주관적 배송/읽음 플래그를 승인 판단으로 쓰지 않습니다.
- **남은 것:** 새 SQL의 실제 PostgreSQL 17 격리 이행과 계정 삭제 회귀 검사는 아직 미실행입니다. 이 기능은 일반 접수 중 증빙·구매 단위가 없는 건을 대체하지 않으며, 구형 구매·미인증 고객은 기존 문의 경로가 별도로 필요합니다. 운영 DB·공개 판매·LIVE는 변경하지 않았습니다.

### 2026-11-01 — 회원 청약철회 접수·접수번호 조회 API 구현

- **한 것:** `commerce-digital-reading-withdrawal-claim-http-v1.ts`에서 회원 신원 확인 후 동일 Subject 트랜잭션으로 접수/조회할 수 있는 POST/GET 경로를 구현했습니다. 서버 전용 HMAC 멱등 키·고정 요청 해시, 요청 본문 최대 2048바이트, 동일 출처 POST, 엄격한 필드·UUID 검증, no-store, 타인 구매/접수 존재 여부 비노출 및 DB COMMIT 뒤에만 접수 번호를 반환하는 경계를 적용했습니다.
- **한 것:** 기존 단일 `api/me.ts`에 `__myeongha_withdrawal_claim=1` 분기를 연결했습니다. `MYEONGHA_WITHDRAWAL_CLAIM_ENABLED` 기본 OFF, 별도 HMAC Secret 필요, 사용자 응답에 환불 승인·결제사 환불 완료 여부는 항상 FALSE입니다. 소비자 접수와 운영자 수동 법적 결정·실제 Provider 취소는 독립적으로 보존합니다.
- **로컬 검사:** 새 접수 HTTP 단위 테스트 11/11 PASS, `tsc -p tsconfig.build.json --noEmit` PASS. 계정 삭제 FK 및 실제 Postgres migration은 최종 통합 전 별도 검증이 필요합니다.
- **다음:** 접수 계약과 개인정보 삭제 실제 DB 이행을 격리 PostgreSQL 17에서 검증한 후, 접수 내역→운영자 결정→결제사 취소 인계의 안전한 연결을 완성하고 전체 CI를 한 번에 수행합니다.

### 2026-11-01 — 주문 증빙 없이도 접수 가능한 일반 청약철회 요청

- **한 것:** 기존 exact Purchase Intent/Unit 두 ID가 있는 경우만 저장하던 새 SQL Writer를 확장하여 **두 ID가 모두 없는 일반 고객 청약철회/환불 문의도** 로그인된 회원 Subject에 접수할 수 있도록 했습니다. 원본 Receipt/Reader를 찾았다고 추정하지 않고 NULL로 남기며, ID가 하나만 있거나 잘못된 경우는 거절합니다. 정해진 사유·HMAC 멱등 기록·본인 확인·일반 서비스 DELETE 정책은 그대로 유지합니다.
- **한 것:** 접수 API가 `{idempotencyKey,reason}` 또는 정확한 4개 필드 입력을 지원하도록 변경했습니다. 일반 접수는 실제 구매 확인이나 환불 지급을 뜻하지 않으며 추후 운영자 검토 대상입니다. 새로운 청약철회 조건·제외 사유를 자동으로 판단하지 않습니다.
- **로컬 검증:** 기존·일반 접수 사례를 포함해 신규 API 검증 **13/13 PASS**, 서버 빌드 타입 검사 **PASS**. 전체 PostgreSQL 실행은 아직 확인되지 않았습니다.

### 2026-11-01 — 마이페이지 청약철회 접수 화면 구현

- **한 것:** `apps/web/src/commerce/WithdrawalRequestPanel.tsx`에 사유 선택, 선택적 구매정보 입력, 재시도 시 동일 멱등 키, 회원 세션, 접수번호·접수시각 표시, 환불 미승인 안내, 문의 경로를 구현했습니다. `apps/web/src/my/MyPage.tsx`의 구매 내역 패널에 연결했습니다.
- **배포 경계:** 웹 화면은 `VITE_MYEONGHA_WITHDRAWAL_CLAIM_VISIBLE=1`에서만 표시되고 API는 독립적으로 `MYEONGHA_WITHDRAWAL_CLAIM_ENABLED=1`과 서버 HMAC Secret·승인된 신규 DB 계약을 모두 요구합니다. 현재 기본 OFF이고 실제 고객에게 미검증 접수 완료를 주장하지 않습니다.
- **로컬 검증:** 서버 TypeScript 및 웹앱 TypeScript 검사 **PASS**. 현재 신규 접수 API 테스트 **13/13 PASS**. UI 실제 브라우저·Provider·PG17 E2E는 아직 미검증입니다.

### 2026-11-01 — 계정 삭제/청약철회 접수 동시 실행 잠금 및 누적 검사

- **동시성 수정:** 새 접수 DB 함수가 현재 회원 행을 `FOR SHARE`로 잠가, 계정 삭제 finalizer의 회원 행 `FOR UPDATE`와 직렬화되게 했습니다. 계정 삭제 직후 신규 개인정보 접수 기록이 되살아나는 창을 닫았으며 finalizer는 기존 S4 보호 답변 외부 키 파기 장벽을 유지합니다. 실제 PG17 동시 실행 검증은 최종 통합 단계 전까지 미실행입니다.
- **로컬 검사:** 서버 및 웹 TypeScript 컴파일 검사 **PASS**, 결제·Reader·환불·청약철회 관련 11개 테스트 파일 **134/134 PASS**, 변경 공백 검사 **PASS**. 이는 전체 워크스페이스 CI와 PostgreSQL 실행 증명이 아닙니다.
- **상태:** 결제 판매·Reader 콘텐츠 공개·환불 자동승인·실제 PortOne 환불과 고객 접수 UI는 운영에서 활성화하지 않았습니다. 작업 브랜치 내에서만 코드를 연결했으며 마지막 통합 CI 방식은 유지합니다.

### 2026-11-01 — 고객 접수 ↔ 운영자 수동 환불 결정의 정확한 출처 연결

- **구현:** `commerce-reader-private-refund-decision-v1.ts`의 기존 승인된 Receipt 기록 함수에 선택적인 `sourceClaimId`를 연결했습니다. 수동 운영자 본인 확인·별도 법적 승인 기록은 그대로 필수이며, 원본 청약철회 요청의 Subject가 동일한 영수증 소유자이고, 특정 주문/구매단위가 주어진 경우 실제 구매 내역·결제 전 안내 단위와 모두 일치해야만 작성합니다. 구매 ID가 없는 일반 접수는 **운영자가 정확한 영수증을 명시적으로 선택한 경우만** 연결하고 자동 환불 결정을 내리지 않습니다.
- **개인정보/중복:** 장기 금융 보존 테이블에는 민감 정보인 원래 접수번호 대신 SHA-256 지문만 보존하도록 변경했습니다. 한 접수의 지문을 중복된 별개 환불 결정에 연결하지 못하도록 Unique 및 승인 결정/출처 불변성 검사를 추가했습니다. 기존 동일 결정 재실행 검증은 출처 지문까지 정확히 일치해야 합니다. 기존 `commerce_reader_full_refund_dispatches_v1` 테이블은 RLS를 활성화하고 API/Service Role의 직접 INSERT/SELECT는 계속 금지합니다.
- **검증:** 운영자 지급 승인 경계, 출처 조작, 출처 없는 고객 부정확한 연결 차단을 추가한 로컬 결정 테스트 17건 통과. PostgreSQL 17 내 신규 SQL은 아직 실행하지 않았습니다.

### 2026-11-01 — 운영자 청약철회 검토용 조회 경로

- **구현:** `commerce-reader-withdrawal-operations-review-v1.ts`에 읽기 전용, 공개 API 미등록의 내부 운영 조회 기능을 추가했습니다. 운영자 전용 전체 증빙 가시성이 확인된 연결에서만 정확한 고객 접수와 **서버 검증된 Production Reader 영수증 후보**를 좁혀 조회합니다. 주문 단위가 없으면 동일 고객의 후보를 최대 25건까지 조회하되 절대로 자동 선택/승인하지 않으며 후보가 많으면 불확실성을 표시합니다.
- **보안:** 고객/금액/결제사 정보를 브라우저에 공개하거나 Provider 취소·Entitlement Mutation을 자동 실행하지 않습니다. 같은 고객·주문·Reader 단위가 아닌 결과는 오류로 차단합니다. 운영자 검토 단위 테스트 9건 통과.

### 2026-11-01 — 본인 접수번호별 처리 단계 조회/마이페이지 연결

- **구현:** `2320_commerce_digital_reading_claim_account_delete_v1.sql`의 현재 회원 접수 조회에 P5Y 환불 결정 출처 지문과 **같은 고객 Receipt**를 재대조하는 읽기 전용 집계를 추가했습니다. `received`, `refund_decision_recorded`, `refund_processing`, `refund_confirmed`의 실제 영속 상태만 표시하며 환불 신청만으로 승인·완료를 추론하지 않습니다. 출처 연결이 없거나 다른 고객의 영수증이면 `received`로 남습니다.
- **웹/API:** `commerce-digital-reading-withdrawal-claim-http-v1.ts`의 GET 응답과 `WithdrawalRequestPanel.tsx`에 상태 새로고침 버튼을 연결했습니다. 회원 인증과 동일 Subject DB 컨텍스트에서만 본인 접수번호를 조회하고 상세 법적 증빙·다른 고객 자료·PortOne 원본은 반환하지 않습니다. 화면/API/LIVE 기본 OFF는 유지합니다.
- **로컬 확인:** 신규 결정/운영 조회/본인 상태 조회 집중 테스트 42건 및 서버·웹 TypeScript 검사 PASS. PostgreSQL 17 실제 신규 SQL 적용/동시성·기존 전체 통합 CI는 아직 실행하지 않았습니다.

### 2026-11-01 — 접수/환불/Reader 통합 변경 최종 로컬 정합성

- **검증 범위:** 청약철회 접수·상태·운영자 조회·정확한 고객 Claim/Receipt 결속·법적 판단/결제사 전액 취소/권한 회수·Reader 원본 접근에 걸친 12개 집중 테스트 파일 **149/149 PASS**. 서버 및 웹앱 TypeScript **PASS**. Git 변경 공백 검사 첫 실행에서 사소한 후행 공백 1건을 발견해 수정하고 재실행 **PASS**.
- **현실적 검증 경계:** 집 PC에 PostgreSQL 18 CLI/서비스와 Supabase CLI(2.82.0)가 설치되어 있지만, PostgreSQL 17 격리 환경은 확인되지 않았습니다. Docker Linux daemon이 연결되지 않았고 127.0.0.1:5432 연결도 불가하여 **신규 SQL의 실제 PG17 실행·데이터 이행 성공은 미증명**입니다. 운영 DB는 변경하지 않았습니다. P3/P4 코드만으로 생산 판매·법적 소비자 제공·실제 환불 성공을 주장하지 않습니다.
- **작업 방식:** 사용자 요청대로 중간 공식 CI는 실행하지 않았고 로컬 브랜치에 코드·워크로그를 누적했습니다. 전체 로드맵 기존 P2/P3/P4 경계는 미확인 완료율 없이 그대로 유지합니다.

### 2026-11-02 — 실제 환불 운영 경로 및 PostgreSQL 17 최종 실행 검사 연결

- **한 것 — 운영자 승인→결제사 처리:** `apps/api/src/commerce-reader-refund-operations-command-v1.ts`에 소유자가 직접 법적 결정·대상 영수증·선택적 고객 접수번호를 확인한 뒤 실행하는 내부 경로를 구현했습니다. 기존 법적 결정 저장이 성공한 경우에만 영속 환불 예약·PortOne 취소 요청·인증 조회·해당 Reader 구매권 회수를 연결합니다. 법적 DB COMMIT 결과가 불확실하거나 다른 고객/영수증과 충돌하면 결제사 POST를 시작하지 않습니다. 공개 API/자동 스케줄·고객 접수 트리거는 추가하지 않았습니다.
- **한 것 — 실제 PG17 최종 통합 검사 정리:** `test/db/commerce_private_claim_finalizer_full_pg17.sh`가 과거 '비배포 후보' SQL을 중복 적용하던 부분을 제거했습니다. 기존 CI 이행 절차의 신규 2310/2320 마이그레이션을 검사 대상으로 사용하고, 실제 DB 함수·청약철회 고객 데이터 RLS/ACL·영수증 환불 증빙 RLS/ACL·계정 삭제 finalizer 연결이 정확한지 확인하는 SQL 검사를 추가했습니다. 기존 계정 삭제 검사의 오류문구를 최신 finalizer와 일치시키며, 이전 S4 보호 답변·외부 키 파기 장벽은 유지했습니다.
- **한 것 — 고객 재시도:** `WithdrawalRequestPanel.tsx`에서 실패 뒤 구매 ID/구매 단위/접수 사유를 수정한 경우 오래된 멱등 요청 키를 폐기하고 새 요청을 사용하게 했습니다. 전송 중 입력 변경을 막아 같은 요청이 다른 데이터와 충돌하지 않도록 했습니다.
- **로컬 검사 결과:** 기존 Reader·구매권·환불·고객 접수·운영자 인계 대상 **13개 테스트 파일 154/154 PASS**, 서버 빌드 TypeScript PASS, 웹앱 TypeScript PASS, 수정 PG17 검사용 Bash 스크립트 문법 PASS, 변경 공백 검사 PASS. 실제 PostgreSQL 17 실행·공식 전체 CI는 **아직 미실행**입니다.
- **환경 제한:** 집 PC의 PostgreSQL 18을 사용해 운영 DB와 완전히 격리된 임시 클러스터를 생성했으나, 클라이언트 접속 시 PostgreSQL 18 서버 프로세스가 `0xC0000142`로 비정상 종료되어 실제 SQL 검증을 수행하지 못했습니다. Docker Linux 엔진도 연결되지 않았습니다. PostgreSQL 18 오류를 SQL 성공/실패로 추정하지 않으며, PostgreSQL 17 자체는 아직 검증되지 않았습니다.
- **남은 작업:** 마지막 CI에서 신규 마이그레이션의 실제 PG17 적용·계정 삭제·고객 청약철회·Provider event/Receipt·운영권한 회수·Reader 접근 회귀를 확인해야 합니다. P2 판매 가능 Offer/Charge Terms 및 사주 Production 공급, S5/S7 실제 전달, 정책/결제사 LIVE 준비는 이 로컬 코드 연결 결과만으로 충족되었다고 판정하지 않습니다. 현재 운영 DB 변경, 실제 환불, 라이브 결제 활성화는 하지 않았습니다.

### 2026-11-02 — PR #2869 통합 CI 실패 1차 원인 분석 및 수정

- **실제 실패 판독:** [PR #2869](https://github.com/gycha0109-beep/MyeongHa/pull/2869)의 Governance 및 CI 검증이 FAILED. Web/Mobile PR 검증은 PASS. Governance는 신규 1790/1800 Entitlement Outbox Writer가 계정 삭제 전송자 등록 목록에 빠진 것이 직접 원인. CI의 shared TypeScript check는 새 단위 테스트 4개에서 Vitest generic SQL mock과 실제 Postgres 인터페이스 타입 충돌. DB authority-core는 신규 Reader/S4/고객 Claim의 Subject 직접 FK 6개가 고정 30개 FK 목록 외에 존재하기 때문. Content/Postgres17은 이전 synthetic official Reader fixture가 신규 Reader 선잠금 요구에 미적합. Runtime/Commerce/Entitlement 다수 구형 DB test도 충돌해 전부 PASS로 추정할 수 없음.
- **수정 완료 — Governance:** `scripts/verify-account-deletion-finalization-preflight.mjs`가 기존 Entitlement Subject-bound Outbox 가드를 변경하지 않고 1790/1800 Writer를 정확한 추가 출처로 검증하도록 업데이트. 로컬 Governance preflight PASS.
- **수정 완료 — shared TypeScript:** 4개 신규 환불/접수 테스트의 비일반화된 SQL 모의 구현만 테스트 범위에서 타입 어댑팅하고, 환불 재조회 mock 호출 인자 타입 확인을 정정. Production TypeScript 코드는 변경하지 않음. 집 PC의 다른 작업 폴더 공유 node_modules로 인해 나타나는 모바일 사설 타입 경로 충돌은 별개의 로컬 환경 문제로 구분.
- **수정 완료 — Subject FK 목록:** P0-PR-01 원본 30개 삭제 그래프를 수정하지 않고, Reader S3/S4/S7 및 고객 청약철회 등 새 단독 개인정보 테이블의 정확한 Subject FK 6개를 `subject_owned_data_graph_catalog_guard.sh`에 명시적으로 등록. 새 6개 중 하나라도 빠지거나 승인되지 않은 7번째 FK가 생기면 실패하도록 보존. **기존 S4 개인정보 제거·외부 암호키 경계 실제 DB 검증은 계속 필수**이며 목록 등록 자체는 삭제의 충분조건이 아님.
- **중단·남은 문제:** 신규 Reader 선잠금 계약과 과거 synthetic DB fixture의 호환성 및 PostgreSQL 15/17 여러 DB suite 실패는 아직 해결되지 않음. 기존 강화된 잠금 규칙을 CI에 맞추려고 해제하지 않음. 모든 로컬 코드 수정은 PR 후속 커밋으로 제출 후 그 SHA의 CI 결과를 반드시 새로 확인해야 하며, 구 CI 재실행 성공으로 추정하지 않는다. LIVE와 실제 환불은 OFF.

### 2026-11-02 — CI #41322178403 실패 원인 수정 및 최종 재실행

- **직접 로그 확인:** 최신 CI에서 결제/권한/런타임/콘텐츠 DB 의존성 다수는 신규 1740~2320 Reader SQL을 적용한 뒤 구형 스키마 해시 92f014...와 비교한 구조 불일치로 실패했습니다. PostgreSQL 17의 과거 공식 Reader synthetic 테스트 역시 신규 전용 사전 잠금 경로 없이 기존 직접 Receipt effect를 호출해 충돌했습니다. 새 DB SQL이 불법 또는 정상임을 뜻하는 결과는 아니며, 두 실행 환경을 분리해 다시 검증합니다.
- **수정:** `test/db/staged_commerce_migration_policy.sh`가 신규 59개 Reader/Commerce SQL의 **Git blob 지문과 파일명**을 `test/db/official_reader_staged_migration_hashes_v1.txt`에서 정확히 확인하고 구형 스냅샷 fixture에만 미적용하도록 정리했습니다. 단 하나라도 지문이 다르거나 새로운 번호의 SQL이 누락되면 HOLD입니다. `test/db/run_ci_case.sh`는 기존 PG17 saju/읽기 회귀에 구형 경로를 사용하지만, 원래 지정된 4개 Commerce 통합 PG17 case는 신규 Reader 마이그레이션을 그대로 실행하도록 보존합니다. `subject_owned_data_graph_catalog_guard.sh` 역시 구형 승인 30개 FK를 보존하면서 실제 신규 Reader 영역을 적용한 경우 6개 개인정보 FK가 **전부** 존재해야 통과하도록 고쳤습니다.
- **수정 — cancellation:** `portone-v2-cancellation-webhook-candidate-v1.ts`에서 공통 HMAC 서명 검증기가 최종 취소를 `payment_cancellation`으로 반환하는 현실과 어댑터가 `ignored`만 허용하던 오류를 수정했습니다. HMAC 및 정확한 취소 건번호의 서버 검증을 변경하지 않았고, 잘못된 최종 취소 데이터는 서명 검증 단계에서 즉시 실패하도록 단위 테스트를 맞췄습니다. 신규 취소 증빙 단위 테스트 25건 통과.
- **수정 — 테스트 자료:** 미존재했던 S4 임시 SQL 테스트 경로 대신 실제 1990 S4 forward migration의 보호 답변 선삭제 순서, 기존 실행 DB rollback 테스트를 검사하도록 변경했습니다. 임시 청약철회 후보 SQL을 중복 설치하라는 과거 테스트 기대값은 실제 2310/2320 이행 검증 및 권한 보호 검사로 치환했습니다. 관련 집중 테스트 38/38 통과.
- **배포 차단:** `.github/workflows/supabase-production.yml`에서 Reader 전용 1740~2320 마이그레이션과 **비관련 SQL을 섞은 변경을 거부**하고 Reader 전용 미승인 이행을 일반 운영 DB 작업에서 제외합니다. `scripts/operations/run-supabase-production-migrations.sh`도 신규 Reader 이행 SQL이 존재하면 일반 include-all 동작 전에 차단합니다. 실제 운영 DB는 변경하지 않았습니다.
- **검증 상태:** Git Bash의 CI shell 문법 및 신규 Reader 예외 지문 확인 경로는 로컬 통과. Windows 전용 임시 디렉터리 권한(EPERM)으로 Production hold 테스트의 로컬 실행이 완료되지 않았으므로 GitHub Linux CI에서 검증해야 합니다. 실물 PG17 신규 Reader·환불 DB 통합 결과는 아직 미확정입니다. 전체 CI가 성공하기 전에는 완료로 판정하지 않습니다.

### 2026-11-02 — PR #2869 후속 CI (41324772237) 실패 분리·수정

- **CI 재실행 확인:** 새 마이그레이션 분리 뒤 41324772237의 `commerce-payment`, `commerce-entitlement`, `content`, `runtime` DB suite **PASS**. Reader 통합 PG17은 실행 중이며 성공으로 추정하지 않음. CI의 일반 테스트에서는 **승인된 단일 Production repair** 2개가 신규 일반 배포 차단문에 막혀 실패했습니다.
- **수정 — 승인된 좁은 복구 보존:** `run-supabase-production-migrations.sh`의 미승인 Reader 일반 배포 HOLD를, 기존 명시 승인된 Se-yeon ACL repair·Guest Promotion repair의 정확한 마이그레이션만 실행하고 종료한 뒤 위치하도록 이동했습니다. 일반 `supabase db push --include-all`에 도달하기 전에는 여전히 HOLD로 실패합니다. 기존 실제 복구 테스트 **18/18 PASS**, Bash 문법 검사 PASS.
- **수정 — Reader 구형 synthetic 실험:** `official_standard_reading_reader_interpretation.sql`에 신규 1740 잠금 계약이 존재하는 DB에서만 정확한 Subject×Reading×Reader 범위 잠금을 **같은 트랜잭션 내에서** 먼저 획득하는 경로를 추가했습니다. 실서비스 잠금 완화 없이 기존 초기 Receipt synthetic Grant 실험이 1800 검증과 함께 수행되도록 변경했고, 신규 migration이 없는 구형 SQL에서는 이전 경로가 유지됩니다. 실제 PostgreSQL 17 실행 결과를 반드시 CI로 확인해야 합니다.
- **상태:** 2차 CI가 완료되기 전에 원인 확인된 테스트 차단·Reader synthetic 호환성 문제를 수정 중. 최종 통합 SQL 실행 성공 여부는 미확정이며 LIVE·운영 DB 실행은 없습니다.

### 2026-11-02 — CI #41325221985 후속 수정
- 실제 실패: Work Track 내 7개 테스트 파일 269건, 추가로 PostgreSQL 17의 Commerce 3개 독립 케이스 실패 확인.
- 구현: Reader/Chat/Preview/HTTP의 정확한 현재 구매권 확인 포트를 기존 A2 접근 게이트에 전달. 실서비스 권한 검증을 우회하거나 기본 허가하지 않음.
- 테스트 자료: 사주·Reader·취소 웹훅·이전 형식의 기록 해시를 현재 명시된 테스트 계약에 맞게 수정. 기존의 부정 테스트는 유지.
- PostgreSQL 17: 독립적인 B2/B3 유료 Reader 결제 데이터 테스트에 기존 Subject×Reading×Reader 잠금 획득을 추가하여 1790 안전 장벽을 유지. 실제 PG17 재검증 필요.
- 로컬 검증: 관련 7개 테스트 파일 321/321 PASS, API TypeScript 검사 PASS. 학원 PC에서는 실제 PG17 테스트 미실행. 운영 DB·실제 환불·LIVE 미변경.

### 2026-11-02 — Reader Grounding Cross-Service E2E 실패 수정
- **실패 확인:** PR #2869 커밋 05e8bd2a의 핵심 CI·Governance·Web·Mobile는 PASS, 별도 `Reader Grounding Cross-Service E2E` 실행 41397268134는 1/3 FAIL. 원인은 `test/saju-character-grounding-cross-service.e2e.test.ts`의 공식 Reading source hash가 `sha256:cross-service-official-artifact`로 하드코딩되어, v2 출처가 요구하는 canonical `sha256:v1:<실제 응답 digest>`와 불일치한 점.
- **수정:** E2E가 실제 `deliveredResponse()`를 `hashSajuHeldSourceProofRequestV1`으로 해시하여 metadata/access/source에 동일한 정확한 immutable digest를 사용하도록 교체. 공식 Reader 권한·출처 일치 검증을 완화하지 않음.
- **로컬 확인:** TypeScript 서버 빌드 타입 검사 PASS, E2E 테스트 파일 import PASS (로컬 실제 Saju 호스트 미가동으로 3개 테스트 정상 SKIP), git diff --check PASS. 실제 타 서비스 HTTP round-trip과 인증/회수 부정 검증은 해당 PR의 Linux cross-service CI 결과를 확인해야 함. 운영 DB/실제 환불/LIVE 변경 없음.

### 2026-11-02 — P4 운영자 검토 건 → 정확한 영수증 → 수동 환불 실행 연결

- **기반 확인:** PR #2869이 최종 [CI Integration #41402864351](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41402864351) SUCCESS 이후 `main`에 squash 병합(`2b7af680`)됐습니다. 이 신규 작업은 최신 `main`에서 따로 분기하며 기존 통합 완료분은 반복 구현하지 않습니다.
- **구현:** `commerce-reader-reviewed-refund-execution-v1.ts`에 기존 관리자 전용 고객 접수 검토(READ ONLY)와 기존 운영자 법적 승인 기록·PortOne 환불 명령을 직접 연결했습니다. 관리자가 명시한 원본 접수번호와 영수증이 동일한 검증 대상인지 확인하고, 신청 누락·영수증 불일치·후보 초과·중복 후보·이미 `revoked`된 영수증을 환불 실행 전에 보류합니다. 선택 후보가 하나여도 자동 선택하지 않습니다.
- **기존 안전장치 재사용:** 고객 접수만으로 자동 승인·환불하지 않으며 공개 API/스케줄러에 경로를 등록하지 않습니다. 고권한 법적 승인 연결과 결제사 실행 연결의 풀을 분리하고, DB의 별도 직렬화 승인 함수가 동일 Subject·Purchase Intent·Unit·Receipt 출처를 재검증한 뒤에만 영속적인 법적 결정을 기록하도록 기존 코드를 그대로 사용합니다. 해당 결정의 COMMIT이 불확실할 때 결제사 POST를 하지 않는 규칙은 유지합니다.
- **검증:** 연계 신규 테스트 11건 및 기존 운영 승인·환불 관련 46건, 총 5개 파일 **57/57 PASS**. 서버 TypeScript build 타입검사 PASS, 변경 공백 검사 PASS. 격리 PostgreSQL 17 및 실제 PortOne 호출은 이번 별도 운영 연결에서 실행하지 않았습니다. 공개 환불/LIVE/운영 DB 활성화는 하지 않았습니다.
- **다음:** 새 브랜치 PR 통합 검증. 이후 판매 가능한 Offer/Charge Terms, Production Saju 공급, S5/S7 고객 제공 권한 및 운영 DB 적용은 각 미충족 선행 조건이 충족되기 전까지 HOLD로 유지합니다.

### 2026-11-02 — PR #2889 최종 통합 CI #41406605093 실패 수정 및 재실행
- **실패 원인 확정:** `admission` 단계에서 PR HEAD `859610ca`의 `scripts/ci/integration-candidate.mjs`가 `repos/.../commits/main`의 거대한 JSON 응답을 동기 호출하여 `spawnSync gh ENOBUFS` 발생. `full` 검증은 실행되지 않고 `CI Integration Verify`가 실패한 것. 결제·환불 실행 코드 자체의 실패 증거는 없음.
- **수정:** 이미 독립 CI 복구 PR #2891에 구현한 동일한 기본 브랜치 SHA 조회 변경을 **대기 중인 #2889 브랜치 자체에도 반영**. `git/ref/heads/main`의 최소 크기 SHA만 읽어 기존 커밋 정보 용량 문제를 제거. 동일 필수 검사 및 GitGuardian/동결 HEAD 검증은 유지.
- **검증:** 통합 CI 사전검사·운영자 환불 브리지 관련 로컬 테스트 **34/34 PASS**, Node 구문 및 git diff --check PASS. 수정된 PR HEAD의 일반 CI와 최종 CI가 실제 통과하기 전까지 병합 완료로 판정 금지.
- **재시도:** 새 PR HEAD를 Push하여 일반 필수 검사 재실행 뒤 동일 HEAD로 고정된 통합 검사를 1회 요청. 기존 실패한 #41406605093는 성공으로 변경되지 않음. 운영 DB/실제 고객 환불/LIVE는 변경하지 않음.

### 2026-11-02 — PR #2889 CI admission 재시도 전 main 동기화 충돌 해결
- **확인:** CI #41406605093 실패는 `admission`의 `spawnSync gh ENOBUFS`이며 전체 환불 회귀 검증은 시작되지 않았음. 해당 커밋의 `commits/main` JSON 조회가 1MB 이상이어서 실패. 새 커밋 `8421d74d`에서 `git/ref/heads/main` 조회로 변경하고 회귀 검증 34/34 PASS.
- **main 최신화:** 원격 main이 #2888 병합 `a19cb76b`까지 진행했으며 동일 ref 조회 수정이 먼저 반영되어, PR 브랜치의 충돌은 해당 코드 바로 위 주석 문장 차이만 발생. main의 동일 안전 로직을 유지하고 충돌을 해결. 별도 보안 트랙 파일들은 main 그대로 병합되며 환불 경로를 임의 변경하지 않음.
- **안전 경계:** 동결된 과거 통합 요청은 실패로 유지. 새로운 PR HEAD의 CI 성공과 다시 요청할 최종 `CI Integration Verify` 성공 없이는 병합하지 않음. LIVE/운영 DB/실제 환불 변경 없음.

### 2026-11-02 — PR #2889 최종 CI 성공 후 main 충돌 해소
- **확인:** 최종 [통합 CI #41410102536](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41410102536)의 admission/full/DB PG17/CI Verify/CI Integration Verify 모두 SUCCESS. 원 HEAD `2b5e3960`에서 재확인.
- **병합 차단:** 그 후 다른 트랙의 #2890/#2892 등의 병합으로 origin/main이 `d7d07f65`까지 이동하여 #2889는 GitHub mergeable_state `dirty`. `tests/ci-integration-candidate.test.mjs`의 CI 조회 검증 테스트 한 파일이 충돌했음.
- **수정:** 기존 브랜치의 중복 간이 검증 대신 신규 main의 더 엄격한 `defaultBranchRefSha()` 브랜치·SHA 검증 테스트를 그대로 유지함. 기타 main의 보안·채팅 변경을 제외/변형하지 않고 통합. 로컬 관련 테스트 **82/82 PASS**, API TypeScript PASS, staged diff check PASS.
- **다음 게이트:** 충돌해결 커밋 원격 제출 후 새 HEAD에서 CI 성공과 새 필수 고정 HEAD Integration CI를 확인하기 전에는 합병 완료로 추정하지 않음. LIVE 및 운영 DB 변경 없음.

### 2026-11-02 — #2889 병합 완료 및 P2 Offer/Charge Terms 상세 읽기 전용 증빙

- **완료 확인:** P4 운영자 환불 연결 PR #2889의 [고정 HEAD 통합 CI #41420335817](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41420335817)에서 모든 admission, full, PostgreSQL 17, CI Verify 및 CI Integration Verify **SUCCESS**. PR은 `aa953d034e73011443f3c2c07538bf5746484186`으로 `main`에 병합됨. 후속 구현은 새 브랜치 `feat/commerce/p2-readiness-evidence-20261102`에서 진행.
- **P2 선행 조건:** P0-CM-03에서 `standard.love_relationship`의 KRW 8,900은 **표시 가격만 확정**. 개별 상품 판매 활성화 승인·사주 Production Reading 권한·실행 가능한 Offer 및 Charge Terms는 여전히 충족되지 않았으며 기존 P2 카탈로그 HOLD 검사도 유지함.
- **구현:** `scripts/operations/commerce-p2-offer-charge-terms-evidence-v1.mjs`는 고권한(read-only/complete visibility) 단일 Repeatable Read 트랜잭션에서 해당 상품의 Offer와 버전별 Charge Terms를 최대 25행까지 조회하고, 현행 Offer/Terms, 8,900 KRW 가격과의 차이, 현행 Terms 중복 및 예상 밖 상품 구성 여부를 구분함. 외부 결제사 상품 식별자, 비밀·고객 정보는 결과에 포함하지 않음. 25행 초과, 잘못된 DB 결과, 권한 부족은 실패로 판정하고 ROLLBACK하며, 쓰기·결제사 호출·구매권 발급 기능은 없음.
- **안전 경계:** 가격이 8,900원으로 일치하더라도 Charge Terms 승인은 불가능. `saleActivationAuthorized`, `executableChargeAuthorized`, `productionFulfillmentAuthorized`는 항상 `false`. 이 점검 도구만으로 P2를 완료 또는 P5를 활성화할 수 없음.
- **로컬 검증:** 신규 상세 증빙 + 기존 P2 HOLD 회귀 테스트 총 **24/24 PASS**, Node 구문 검사 PASS, git diff 공백 검사 PASS. 실제 운영 DB는 조회하지 않음.
- **다음:** PR 일반/필수 통합 CI, 병합 후 상품별 운영 승인·Production Saju 공급·실제 고객 제공의 미충족 선행 조건 확인. LIVE는 HOLD.

- **추가 SQL 정합성 수정:** Offer가 존재하지만 Charge Terms가 없는 LEFT JOIN 결과에서는 `ct.retired_at is null`이 TRUE로 평가될 수 있으므로, `ct.id is null`이면 `termsCurrent`를 SQL NULL로 반환하도록 변경. 실제 DB null row와 검증 스키마가 일치하도록 테스트를 보강했으며 P2 테스트 24/24 재통과. 기존 판매 HOLD 유지.

### 2026-11-03 — PR #2898 병합 후 P2 동일 시점 상품·가격 판매 보류 증빙

- **기준선:** PR #2898은 `103ce134b9419baf6d28f756d252a249dcfc127c`로 main에 병합됨. 본 구현은 해당 최신 main에서 신규 브랜치 `feat/commerce/readiness-gate-20261103`로 분리.
- **로드맵 대상:** P2 `standard.love_relationship` Product·Reader 구매 단위와 Offer/버전별 Charge Terms의 일관된 판매 전 확인. 현재 P0-CM-03 개별 상품 활성화는 미승인, KRW 8,900은 결정된 표시 가격일 뿐 실행 가격 권한이 아니며, Saju Production Reading 권한도 미확정.
- **실제 구현:** `scripts/operations/commerce-p2-single-snapshot-readiness-hold-v1.mjs`에 기존 카탈로그·Offer/Terms 두 SQL을 단일 `REPEATABLE READ READ ONLY` 트랜잭션에서 조회하는 내부 점검 추가. 전체 Product/Capability/Reader spec 상태와 Offer 총 건수, 활성 Offer 건수, Charge Terms 건수를 한 DB 스냅샷으로 대조함.
- **실패 경계:** 완전 조회 가능한 DB 관리자 연결이 아니거나, 건수·상세 행이 불일치하거나, 25개 이상의 상세 행·중복 Charge Terms·모순된 Offer·잘못된 금액 등 입력을 발견하면 오류로 중단하고 ROLLBACK. 조용히 성공으로 취급하거나 상세 결과를 생략하지 않음. 정상 비활성 카탈로그는 `hold_observed`, 상품/가격 구성 변경은 `investigation_required`로 보고하며, **두 경우 모두 결제/판매/Production Reader 제공 승인값은 무조건 false**.
- **검증:** 신규 단일 스냅샷 증빙 + 기존 두 P2 읽기 전용 검증 관련 Vitest **39/39 PASS**, Node 구문 확인, Git 변경 공백 검사 PASS. 실제 Production DB/PortOne 접근·SQL 쓰기·LIVE 플래그 변경 없음.
- **다음:** PR 일반 CI·고정 HEAD 최종 통합 검증과 main 병합. 실제 개별 Product Offer/Charge Terms 실행 허가는 Saju Production 공급·Owner 판매 결정·PG 계약 등 미충족 조건이 확인되기 전까지 HOLD.

### 2026-11-03 — P2 동일 시점 보류 검사 수동 실행기

- **기준선:** P2 통합 검사 PR #2903은 최종 CI #41558536150 SUCCESS 후 main에 병합(b16b634e). 후속 브랜치는 검사 로직을 중복 구현하지 않고 별도 수동 진입점만 추가함.
- **구현:** scripts/operations/run-commerce-p2-readonly-audit-v1.mjs. 운영자 명시 호출에서 호스트·포트·감사 로그인·TLS CA 지문·verify-full을 고정 검증, DB 세션 default_transaction_read_only=on을 강제하고 기존 단일 스냅샷 검사 실행.
- **안전:** 누락된 인증·권한, DB 응답 오류, 가격/상품 이탈 모두 HOLD. 출력은 상태·제한 건수·차단 사유만 포함하고 접속 비밀번호·원본 SQL 예외는 제외. H​​OLD_OBSERVED도 판매 허가가 아니며 LIVE·실제 환불·DB 쓰기 없음.
- **검증:** 신규 및 기존 P2 감사 테스트 4개 파일 46/46 PASS, Node 구문 검사 PASS. 실제 운영 DB 접속 미실행.
- **다음:** 최신 main을 기준으로 독립 PR 및 CI 검증. P0-CM-03 판매 승인, Saju Production 공급, S5/S7 고객 전달 및 LIVE는 HOLD.

### 2026-11-03 — 실제 운영 DB P2 상태 및 P3/P4 Reader 배포 준비 증빙

- **실제 DB 읽기 전용 확인:** 명하 Supabase PostgreSQL 17에 고객/결제 개인정보를 조회하지 않는 SELECT 집계·to_regclass 조회만 수행. P2 standard.love_relationship Product 1(비활성 1), Spec 1, Capability 1, Offer 0, 활성 Offer 0, Charge Terms 0, 기존 retired 상품 1로 결정된 HOLD와 일치.
- **P3/P4 실배포 경계:** official_reader_paid_answer_bodies, official_reader_paid_delivery_attempts_v1, commerce_reader_full_refund_dispatches_v1, digital_reading_withdrawal_claims_private_v1, official_reader_s3_source_authority_receipts_v1 다섯 테이블은 실제 운영 DB에서 모두 미존재. CI에서 Reader SQL이 검증됐다는 사실과 운영 배포 상태를 구분.
- **구현:** 읽기 전용 내부 스키마 검사 `scripts/operations/commerce-reader-production-schema-hold-preflight-v1.mjs` 추가. P3/P4 필수 테이블 5개 존재 여부를 단일 Read Only 반복 읽기 트랜잭션에서 검사하고, 운영 상태와 구별해 누락/존재(추가 검증 필요) 결과를 반환. 어떠한 결과에서도 LIVE·환불·구매권·Reader 제공 허용하지 않음.
- **검증:** 해당 검사 11/11 테스트 PASS, Node 구문 및 서버 타입 검사 PASS. 실제 운영 DB 스키마 적용·환불/구매·고객 처리 없음.
- **미충족 조건:** P0-CM-03 상품 승인, Saju Production 권한, 운영 Reader 사전 승인 SQL, PG/LEGAL/고객 제공 준비 및 P5 LIVE 모두 보류. #2909 최종 CI는 별도 진행하며 동결 HEAD 변경하지 않음.

### 2026-11-03 — P3/P4 staged rollout full-batch preflight on PR #2913

- **로드맵 범위:** #2909 최종 통합 CI 성공 및 main 병합(13721199) 후 #2913의 기초 스키마 존재 검사부터 **운영 투입 선행 조건 묶음**까지 일괄 확장함.
- **실구현 묶음:** P3/P4 핵심 테이블 5개, 공식 Reader 1740–2320 단계 SQL 59개 Git blob 원본 확인, 운영 DB 적용 이력 59개, RLS/FORCE RLS·익명/회원 테이블 직접 접근, 내부 유료 Reader 전달/환불 함수 5개의 EXECUTE 노출, 원본 SQL/DB 이력/테이블/함수 상태 불일치 검사. 기존 P2 상품·가격 점검과 운영자 수동 CLI로 연결.
- **안전 경계:** 세 종류 독립 읽기 전용 트랜잭션을 하나의 운영 세션에서 수행하되 이를 동시 결제·고객 제공 권한으로 해석하지 않음. DB SQL/마이그레이션 적용·권한 GRANT·결제사 호출·환불·고객 Reader 노출·LIVE 활성화 없음. 모든 결과는 판매·배포·전달·환불 승인 false.
- **검증 방법:** 관련 전체 기능 구현 완료 후 한 번의 통합 테스트·서버 타입 검사·소스 무결성 및 공백 검사를 실행하고, CI 및 최종 통합 검증은 별도로 실제 통과 여부 확인.

### 2026-11-03 — Batch verification completed (P2/P3/P4 hold proof)

- **통합 검증:** 기존 P2 전용 4개 파일과 Reader 단계/배포/명령 4개 파일, 총 **8개 파일 99/99 PASS**. 서버 TypeScript 타입 검사 PASS, Node 구문 검증, 변경 공백 검사 PASS.
- **Windows 원본 SQL 지문 처리:** 작업 트리 CRLF 때문에 Git에 기록된 원본 LF blob SHA와 차이가 난 부분은 읽는 과정에서 Git 텍스트 정규화를 적용해 비교하도록 수정. SQL 파일 자체나 검토된 SHA manifest를 절대 변경하지 않음.
- **실제 운영 DB 읽기 전용 총 점검:** 2026-11-03 명하 PostgreSQL 17에서 Reader 1740–2320 마이그레이션 적용 이력 **0건**, 관련 비공개 테이블 **0/5 존재**, 핵심 비공개 전달/환불 함수 **0/5 존재**. 고객 데이터·결제 원본/비밀 조회 없이 시스템 메타데이터 SELECT만 수행. 고정 TLS 운영 CLI 자체의 실제 실행을 의미하지 않음.
- **최종 경계:** P2 상품은 비활성·Offer/Charge Terms 0, P3/P4 운영 스키마/함수 미배포, 상품별 Owner 판매 승인과 Saju Production 관계/출생/일반 공급 미충족이므로 LIVE·환불·고객 유료 Reader 제공을 진행할 수 없음. Reader 1740–2320 자동 마이그레이션 차단은 유지.

### 2026-11-03 — 단일 전액 취소·정확한 금액 검증 보강 (개발 전용 로드맵 1)

- **발견:** 기존 PortOne V2 Reader 전액 취소 GET 검증은 결제 상태 `CANCELLED` 및 정확한 취소 ID의 `SUCCEEDED`만 확인하여, 여러 부분 취소의 합계로 결제가 최종 취소된 상태를 한 번의 전액 환불로 오인할 여지가 있었습니다.
- **구현:** 환불 사후 확인과 POST 응답 소실 복구에서 **취소 내역 정확히 1건**, 그 건의 **성공 상태**, **원본 전체 금액과 동일한 `totalAmount`**를 필수로 검증합니다. 다건 부분 취소·추가 대기 취소·금액 누락·금액 불일치는 모두 안전 보류하며 권한 회수 경로로 승격하지 않습니다.
- **검증:** 정상 단일 전액 취소와 거부 사례에 대한 기존 테스트 fixture 및 신규 회귀 사례를 갱신했습니다. 이 변경의 실제 TypeScript·Vitest·CI 통과 여부는 PR 실행 후 판정합니다.
- **배포 경계:** 운영 DB, 실제 PG 환불 요청, LIVE, 고객 API, 권한 활성화를 변경하지 않습니다. 기존 수동 승인 및 Receipt/Grant 원자 검증을 유지합니다.
- **남은 것:** Provider 원본 이벤트의 순서 증명·유료 권한 정확한 연결·고객 전달/청약철회·개인정보 삭제·격리 E2E를 개발 로드맵에 따라 진행합니다.

### 2026-11-03 — 고객 청약철회 접수의 모바일 인증 요청 경계 보완

- **개발 로드맵:** 2026-11-03 개발 전용 실행 로드맵 3번, 실제 고객 청약철회 접수 경로.
- **발견:** 기존 `/api/me?__myeongha_withdrawal_claim=1`의 POST는 웹 Origin이 없으면 거부하여, 쿠키 없이 JWT를 명시 전송하는 모바일 앱에서 접수할 수 없었습니다.
- **구현:** 웹은 기존 정확한 동일 출처를 요구하고, Origin 없는 모바일 요청은 **쿠키가 없고 JWT 형태의 명시적 Bearer가 있는 경우에만** 기존 회원 신원 검증으로 진행합니다. 유효한 토큰 형식 자체는 인증이 아니며, Guest/미인증은 여전히 거부합니다. 외부 Origin, Origin `null`, Origin 없는 쿠키 요청, 불완전한 토큰을 DB 접근 전에 차단합니다.
- **검증:** 정상 모바일 POST, 외부 Origin·쿠키·미인증/비정상 Bearer 차단을 테스트에 추가했습니다. PR과 해당 HEAD CI 실제 성공 전까지 PASS를 선언하지 않습니다.
- **배포 경계:** 기존 `MYEONGHA_WITHDRAWAL_CLAIM_ENABLED` 기본 비활성 유지. 운영 SQL 적용·고객 접수 활성화·PG 취소·환불 승인·Reader 권한 회수·LIVE 변경 없음. 웹 동일 출처 정책과 계정별 DB 권한 검사는 기존대로 유지됩니다.

### 2026-11-05 — 취소 증거와 Reader 공통 S1 잠금 연결의 긍정 판정 보강

- **실제 수정:** 기존 취소 전체 집합 GET 검증→Reader 구매권 잠금 사전검사 연결 시 Reader 공통 S1 범위 잠금·재확인과 검토기 계약 버전이 없으면 정상 일치·중복 회수 SAME을 보고하지 않도록 차단했습니다. 잠금·버전 검증의 관측 여부를 명확히 분리했습니다.
- **검증 추가:** S1 누락 시 긍정·SAME 거부, 잘못된 결과 버전 거부, 기존 정상 경로의 S1 관측 확인. PR과 해당 커밋 CI 성공 여부는 별도로 확인하며, 검증 전 PASS를 선언하지 않습니다.
- **남은 것:** Provider의 검증 가능한 최신 상태/순서 비교, 실제 기존 Entitlement Writer·Reader T2 결속, 결과물 전달 입증, 격리 구매→회수→삭제 종단 검증 및 종료 문서화.
- **안전 경계:** 운영 DB/신규 마이그레이션·실제 PG 환불 POST·공개 유료 경로·LIVE 변경 없음.

### 2026-11-05 — PortOne 단일 전액 취소와 누적 부분 취소의 최신 GET 관측 분리

- **로드맵:** 6절 1·2번. 공식 PortOne V2 취소 조회의 성공/전액·부분 취소 형태와 기존 Event/Receipt/전체 취소 집합 검증을 이용합니다.
- **구현:** 인증 GET 전체 성공 취소 집합과 양쪽 DB 스냅샷 일치 후 **원본 결제액의 단일 전액 취소 항목**인 경우에만 관측값을 반환합니다. 3000+5900과 같은 누적 전액 상태는 취소 이력 자체는 일치해도 Reader Grant 잠금·CAS 단계에 진입하지 않고 안전 보류합니다.
- **검증:** 실제 PortOne 호출 없이 원본 형태를 모사한 단일 전액/누적 부분 취소 GET 테스트, 상위 Reader 잠금 미실행 테스트 추가. CI 성공 이전 PASS 미선언.
- **남은 것:** 공식 Provider `NEWER/STALE` 비교 또는 동등 최신성 신뢰 근거, 실제 Reader T2·Entitlement Effect 결속, 소비자 전달 입증 및 전체 격리 E2E.
- **운영 제외:** 운영 DB/PG 환불 POST·LIVE·공개 유료 API 무변경.

### 2026-11-05 — 서로 다른 취소 웹훅 ID의 원본 Receipt 잠금 실제 PG17 경합 검증

- **로드맵:** 6절 1번(취소 이벤트 중복 방지의 병렬 도착 검증). 이미 구현된 원본 Receipt 잠금·취소 ID HMAC을 재사용하며 새로운 원장을 만들지 않음.
- **구현:** 기존 전체 마이그레이션 PostgreSQL17 Reader B2/B3 공식 Fixture 검증 뒤 동일 일회용 DB에서 두 실제 트랜잭션이 하나의 cancellationId HMAC/서로 다른 서명 웹훅 ID로 저장을 경쟁하는 검증기 추가. READ COMMITTED 실제 DB 잠금 대기 이후 23505/원본 취소 항목 중복 제약을 직접 확인합니다(일반 40001은 PASS 불가). 하나의 원본 Event만 기록, 동일 웹훅 재시도 replay, 다른 Reader 권한 보존 및 Effect 0건 검사.
- **증거:** test/db/commerce_cancel_same_item_real_race_pg17.mjs, 기존 test/db/commerce_portone_cancellation_persist_full_pg17.sh 연결. 이 PR HEAD 통합 CI 완료 전 PG17 실행 성공은 미확정.
- **남은 것:** 신뢰 가능한 Provider NEWER/STALE, 기존 Reader T2/Entitlement Writer 실제 결속, 고객 전달 입증 및 구매→취소→삭제 전체 격리 검증.
- **안전:** 운영 DB·Live 상품·PortOne GET/POST·실제 환불/권한 회수·공개 라우트 미변경.

### 2026-11-05 — 원본 취소 저장→정확한 Reader 구매권 회수 연결의 실제 PG17 격리 검증

- **로드맵:** 6절 1·2·5번의 구매→원본 취소→정확한 Entitlement Effect 구간. 기존 합성 Event 직접 INSERT 검증과 달리 원본 Reader Receipt에 결속되는 **기존 비배포 취소 저장 함수**를 실제 호출하는 연결을 구현했습니다.
- **구현:** 별도 PostgreSQL 17 독립 테스트 DB의 공식 B2/B3 Reader 구매 Fixture에서 원본 B2 금액 1의 SUCCEEDED 전액 취소를 함수로 저장하고 동일 웹훅 replay, 다른 웹훅의 동일 취소 ID 거부를 검사합니다. 해당 원본 Event 및 정확한 B2 Grant를 잠근 뒤 기존 `internal_apply_entitlement_effect_v1`를 오직 합성 시나리오에서 호출해 단일 B2 회수, 정확한 Effect 멱등 재실행, 다른 B3 권한·교차 회수 차단을 검사합니다.
- **안전:** 실제 PG GET/POST, 운영 DB, 운영 schema migrations, LIVE, 사용자 대상 권한 회수 없음. 합성 Event/Effect 및 비배포 DDL은 같은 트랜잭션에서 **ROLLBACK**됩니다.
- **검증:** `commerce-persisted-cancel-reader-effect-pg17` 독립 CI 사례 추가. PR의 실제 CI·통합 결과가 나오기 전까지 PASS 미판정.
- **미완료:** Provider 신뢰 가능한 최신 사건 순서/최종성, 법적 판단, 실제 Reader R2/T2 권한 회수, 고객 전달/청약철회와 개인정보 삭제 연결, 전체 E2E. 이 합성 검증만으로 운영 회수를 허용하지 않습니다.

### 2026-11-05 — 고객 청약철회 원본 구매의 저장된 취소 Event 내부 검토 연결

- **로드맵:** 6절 1·3·5번의 원본 결제/청약철회 접수/취소 증거 결속. 기존 `reviewRecordedReadingWithdrawalPrivateV1`의 단일 전체 가시성 READ ONLY 스냅샷에 원본 구매별 취소 원장 관측을 추가했습니다.
- **실제 구현:** 저장된 Claim Subject·Purchase Intent·Checkout Unit을 원본 Notice/검증 Receipt/Reader Grant에 묶어 기존 Commerce Provider Event에서 취소 항목을 조회합니다. `commerce-recorded-reader-cancellation-evidence-v1.ts`에서 정확히 단일 전액 기록, 다건 부분 취소 및 기록 부재를 구분하고 원본 Receipt/Subject 교차 혼입·취소 HMAC 중복·증거 필드 위조·과금액을 안전 보류합니다. 호출자는 Event/Receipt/Grant를 지정할 수 없습니다.
- **검증:** 단일 전액·다건 부분 취소(3000+5900)·원본 계보 불일치·위조·중복·DB 장애에 대한 기존 청약철회 검토기 회귀 테스트 추가. 신규 PR CI 결과 전까지 PASS 미선언.
- **한계:** 저장 원장은 Provider 최신 GET·시간 순서·최종 환불/법적 청약철회/소비자 실제 전달 입증이 아닙니다. 모든 결과의 Provider 환불 허용·Reader Grant 변경 허용은 false이고 기존 S7 ACK도 사람의 실제 소비 증명으로 승격하지 않습니다.
- **운영 경계:** 기존 private read-only 기능에만 연결. 신규 SQL 마이그레이션/테이블/권한, 공개 API, 실제 PG 환불 POST, 운영 DB·LIVE·자동 권한 회수 변경 없음.

### 2026-11-05 — #2986 TypeScript CI 레드 원인 수정

- **실제 실패 근거:** CI 실행 [41901612252](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41901612252)의 Commerce TypeScript 검사에서 `test/commerce-recorded-reader-withdrawal-private-review-v1.test.ts` 220~221행에 `TS2345/TS2322`가 발생했습니다.
- **원인/수정:** 중복 Provider Event 2행을 포함한 `it.each` 데이터에서 행 배열이 테스트 함수의 여러 인자로 펼쳐져 타입에 맞지 않았습니다. 각 테스트 사례를 `{cancelRows:[...]}` 하나의 객체로 묶고 구조분해하여 전달합니다. 원본 취소·Grant·환불 비즈니스 로직은 무변경입니다.
- **검증 상태:** 수정 커밋의 CI 성공 확인 전까지는 GREEN으로 보고하지 않습니다. 자동 병합/필수 통합 CI 요건은 그대로 유지합니다.

### 2026-11-05 — 회수된 Reader 구매의 청약철회 원본 취소 내역 보존

- **수정:** 청약철회 내부 검토에서 현재 `verified` Receipt 사전검사 실패(예: 원본 구매권이 회수됨)가 발생하더라도 접수된 Claim을 유지하고, 동일 DB 읽기 전용 스냅샷에서 정확한 원본 Receipt/Subject/Unit에 결속된 **저장된** 취소 Event를 별도 조회하도록 연결했습니다. 다른 Reader 구매권·임의 Event로 대체하지 않습니다.
- **안전:** 구매·공지 사전검사가 충족되지 않은 경우 기존과 같이 `exact_unit_evidence_unavailable`·법적 검토 결과 null을 유지하며, 저장된 취소 기록이 단일 전액이어도 Provider 최신 GET·환불/정산 최종성·Reader 권한 회수 승인·고객 실제 제공 입증은 전부 false입니다.
- **검증:** 회수 등으로 현재 Verified 구매 증거가 사라진 경우에도 Claim 원본 취소 기록만 비공개 관측하고 다른 권한·법적 판단이 생성되지 않는 회귀 테스트 추가. 새 커밋 CI 및 필수 통합 검증 결과가 나오기 전까지 성공 미판정.

### 2026-11-05 — #2986 교차 Subject 청약철회 CI 테스트 실패 수정

- **실패 확인:** [Commerce CI 작업](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41905223372/job/126838099760)에서 TypeScript와 일반 테스트 1,983건은 통과했으나, 기존 교차 Subject 청약철회 회귀 테스트 1건이 실패했습니다.
- **원인:** Claim의 다른 Subject를 내부 취소 기록에 정확히 전달하도록 구현한 뒤에도 테스트의 DB 모의 응답이 기존 Subject를 고정 기대하고, 실제 SQL이라면 조회되지 않을 타인의 원본 Receipt를 가짜 행으로 반환했습니다.
- **수정:** 모의 DB의 취소 조회에서 원본 Claim Subject가 실제로 전달됐는지 검사하며, 타인 Subject일 때는 조회 결과가 0건이 되도록 조정했습니다. 반환 결과가 보류되고 타인의 구매·취소 기록과 환불·회수 권한이 포함되지 않는 검증을 유지했습니다.
- **검증 상태:** 새 커밋의 GitHub Actions 결과 대기. 운영 코드·DB/PG/LIVE/권한 회수 동작 무변경.

### 2026-11-05 — 검증된 Reader 구매→고객 접수→원본 취소→정확한 구매권 효과 PG17 통합 검증

- **로드맵:** 6절 1·2·3·5번 실제 연결 중, 정확한 Reader 구매부터 유료 권한 효과까지. 기존 개별 합성 Event/Claim 테스트를 재구현하지 않고, 공식 B2/B3 독립 Reader 구매 Fixture의 실제 전체 마이그레이션 스키마에서 하나의 연결 경로를 검증할 CI 사례를 추가했습니다.
- **구현:** B2 결제 검증 전 기존 서버 Notice 승인·표시·서버 확인 트리거 증거를 생성하고, 실제 Verified PortOne Receipt 이후 기존 `cmd_receive_digital_reading_withdrawal_claim_v1` 및 `qry_received_digital_reading_withdrawal_claim_v1`로 원본 B2 단위 Claim 수신·멱등 재전송을 검증합니다. B3 구매 단위로의 Claim 혼입은 거부합니다.
- **원본 취소/권한:** 기존 비배포 원본 취소 저장 함수를 실행하여 해당 B2 Receipt에 단일 SUCCEEDED 전액 이벤트를 저장하고, 같은 격리 트랜잭션 안에서 실제 `internal_apply_entitlement_effect_v1`를 *명시적으로 합성 권한에서만* 실행해 B2 효과 1건·멱등 재실행·B3 원본 Grant 보존과 B3 교차 회수 거부를 검사합니다. 고객 Claim 상태는 승인이나 전달로 변형하지 않고 `received`를 유지합니다.
- **검증:** `commerce-verified-reader-claim-cancel-effect-pg17`라는 독립 PostgreSQL17 CI 사례를 전체 DB 스키마에 연결. 신규 후보 DDL·합성 Source/Effect·Claim은 테스트 트랜잭션에서 모두 **ROLLBACK**합니다. Fixture는 일회용 DB에서만 생성하고 다른 B3 권한을 보존합니다. PR 통합 CI 결과 전 PASS 미확정.
- **안전/남은 것:** Provider NEWER/STALE 판정, 실제 환불·R2/T2 공유 잠금과 회수 권한, 사람의 소비/법적 제공 입증, 동일 Subject 실제 privacy finalizer까지 이어지는 완전 E2E는 미완료. 운영 DB/마이그레이션, PG API, 공개 API, LIVE, 자동 회수는 변경하지 않습니다.

### 2026-11-05 — #2991 PG17 DB 의존성 레드: 격리 Notice 스키마 누락 복구

- **실패 확인:** [PostgreSQL 17 작업](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41945250703/job/126975938906)에서 신규 `commerce-verified-reader-claim-cancel-effect-pg17`만 실패. 실제 로그: `psql:<stdin>:1012: ERROR: relation "public.digital_reading_checkout_notice_revisions_v1" does not exist`. DB 종합 CI 레드의 직접 원인으로 확인.
- **원인:** 역사적 fixture 보호를 위한 `test/db/staged_commerce_migration_policy.sh`에서 2026-10-27 Checkout Notice 이력을 의도적으로 제외합니다. 신규 케이스도 기본 `historical` Reader 범위를 사용해 2320 개인 Claim RPC가 필요한 Reader 통합 스키마를 로드하지 않았습니다.
- **수정:** `test/db/run_ci_case.sh`에서 **이 새 사례만** 기존 `reader-integrated` 스키마로 지정. `test/db/commerce_verified_reader_claim_cancel_effect_pg17.sh`가 일회용 PostgreSQL17 CI DB 및 Claim RPC 존재를 확인한 뒤, 기존 고정 해시로 검토된 **원본 Notice migration**을 이 테스트 DB에서만 설치합니다. 이후 3개 Notice 테이블 존재를 재검증하고 기존 B2/B3 구매 Fixture를 실행합니다.
- **안전:** 기존 역사적 CI fixture·스테이징 제외 규칙의 의미는 유지. `supabase/migrations/` 파일 자체, 운영 DB, LIVE 라우트/PG 취소/실제 구매권 회수는 변경하지 않습니다. 새 커밋의 DB 종속 CI 성공 확인 전까지 PASS를 선언하지 않습니다.

### 2026-11-05 — #2991 PG17 두 번째 레드: 회원 전용 청약철회 접수 경계의 합성 Fixture 수정

- **실제 실패:** [PostgreSQL 17 작업 41947551528](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41947551528/job/126983825528)에서 기존 Notice 스키마는 로드되었지만 신규 B2 Claim 통합 검증 중 `Verified member unavailable` (SQLSTATE 42501)이 발생했습니다. 기존 공식 B2/B3 Reader 구매 Fixture의 원본 Subject는 `guest`이며, 정식 `cmd_receive_digital_reading_withdrawal_claim_v1`는 정확한 `member`만 접수하도록 설계돼 있습니다.
- **수정:** 원본 구매/Receipt/Reader를 새 계정으로 위조하거나 회원 검증을 완화하지 않습니다. 단일 격리 PostgreSQL 17 트랜잭션에서 먼저 게스트의 Claim 접수가 명시적으로 거부되고 접수 기록이 생성되지 않음을 확인합니다. 이후 `auth.users`에 테스트용 인증 식별자를 삽입하고 *동일한 구매 Subject*를 `member`로 결속하여 실제 회원 전용 접수·멱등 재실행 경로를 검증합니다.
- **안전:** 회원 전용 운영 권한·인증 함수·마이그레이션 정책 불변. 합성 인증 레코드, Claim, Event, Effect는 기존 `ROLLBACK`으로 폐기. 새 커밋 CI 및 필수 통합 성공 전까지 PASS를 선언하지 않습니다.

### 2026-11-05 — #2991 PG17 세 번째 레드: Reader S1 잠금 누락 수정

- **실패 근거:** [DB dependency · postgres17 작업](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41950832634/job/126994675538)에서 신규 청약철회 Claim/원본 취소 Event 작성 후 기존 `internal_apply_entitlement_effect_v1` 호출이 `official_reader_s2_legacy_effect_scope_lock_required` / `Legacy Reader provider effect cannot bypass the S1 scope lock`로 차단됐습니다. 이는 운영 DB 보호 기능의 정상적인 거부입니다.
- **수정:** 새로운 통합 검증이 대상 B2와 별도 B3의 원본 `standard_reading_reader_access_grants`에서 Subject·Official Reading·Reader의 고유 스코프를 조회하고, 데이터베이스의 정해진 순서로 기존 `internal_acquire_official_reader_scope_lock_v1`를 사용해 S1 트랜잭션 잠금을 먼저 획득하도록 했습니다. 두 독립 구매의 스코프 존재를 확인한 후에만 원본 취소 Event/구매권 Effect 경로를 검사합니다.
- **안전:** 기존 1790 Reader 회수 방어·접수 회원 자격·기존 이벤트/Grant Writer 변경 없음. 합성 PG17 트랜잭션은 ROLLBACK, 운영 권한·실제 결제/환불/LIVE 변경 없음. 새 HEAD의 CI·통합 검사 결과 전까지 성공 미판정.

### 2026-11-05 — 결제 취소 최신 상태 확인의 HTTP 캐시 재사용 차단 (로드맵 §6-1)

- **현재 상태:** [#2991](https://github.com/gycha0109-beep/MyeongHa/pull/2991) 결제→청약철회→원본 취소→정확한 Reader Effect 격리 PG17 통합 검증은 필수 통합 CI까지 통과하여 main에 병합됨. 로드맵 §6-1의 PortOne 신뢰 가능한 NEWER/STALE 이벤트 순서 판정은 **여전히 미완료**.
- **발견:** 개별 취소 조회와 전체 취소 집합 대조에서 공통 사용하는 PortOne 인증 GET가 응답 상태·금액·HMAC을 정확히 검사하더라도, 중간 캐시가 과거의 유효한 취소 집합을 재사용했다는 명시적 신호를 차단하는 HTTP 경계가 없었음. 두 시점 DB 조회가 일치해도 외부 GET 과거 응답을 최신으로 단정할 수 없음.
- **수정:** 기존 `getPortOneV2PaymentReadbackPrivateV1` 공통 GET에 요청 `cache:'no-store'`, `Cache-Control: no-cache, no-store`, `Pragma: no-cache`를 지정. 응답에 RFC 9111 `Age`가 있거나 RFC 9211 `Cache-Status; hit`, 알려진 중간 캐시 `HIT/STALE/UPDATING/REVALIDATED`가 표시되면 본문 사용 전 실패 처리. `MISS/BYPASS`는 캐시 사용 증거로 오인하지 않음. 모든 실패는 기존 읽기 전용 보류 경로로 귀결.
- **회귀 검증:** 개별/전체 HMAC 취소 GET에서 새 요청 설정 확인, 캐시 적중·0초 `Age`·STALE 헤더 차단, 전체 집합 재검증이 캐시 신호 발생 시 두 번째 DB 스냅샷/Reader CAS로 진입하지 않음을 테스트. 커밋의 CI 및 최종 통합 검증 통과 전 실제 성공 판정하지 않음.
- **유지 한계:** 헤더가 없는 응답도 Provider 최신 상태나 취소 Event 순서를 증명하지 않음. `providerOrderingProven=false`, 법정 환불/고객 제공·Reader T2/Entitlement Effect 승인 false, 운영 환불 POST·운영 DB·LIVE·상품 활성화 불변. 취소 NEWER/STALE의 신뢰 가능한 비교 근거와 실제 안전한 권한 회수 결속은 추가 구현 필요.

### 2026-11-05 — 회수된 Reader 청약철회의 역사적 S7 수신 확인 증거 보존 (§6-3/5)

- **현황:** #2991이 구매·Claim·취소→정확한 Reader Effect의 격리 PG17 검증을 완료하고 #3007은 동일 구매 Subject의 계정 삭제까지 E2E 검증 중. 기존 고객 Claim 비공개 검토는 원본 Receipt가 현재 `verified`가 아니면 저장된 취소 Event만 조회하여, 아직 보존 중인 S5 생성 및 S7 서버 준비·고객 단말 ACK 이력이 빠졌습니다.
- **수정:** `reviewRecordedReadingWithdrawalPrivateV1`의 `exact_unit_evidence_unavailable` 경로에서도 **원본 Claim Subject/구매 Intent/Unit**으로 기존 `readRecordedReaderS7ClaimTimelineV1`를 읽습니다. 해당 SQL은 원본 `verified/revoked` Receipt·구매 Grant·해당 Reader 본문·남은 S7 기록이 정확히 결속될 때만 응답합니다. 원본 Claim의 일괄 비공개 반복가능 읽기 트랜잭션을 유지합니다.
- **실패/삭제 안전:** 개인 S7 증거는 개인정보 삭제나 보존기간 만료로 부재할 수 있습니다. 이 경우 **미전달 확정, 법적 거절, 환불/권한 회수 승인**으로 변환하지 않고 null만 반환합니다. PostgreSQL 이력 조회 오류 시 SAVEPOINT를 복구한 뒤 동일 스냅샷에서 기존 원본 취소 조회를 수행하되 Claim 자체를 변경하지 않습니다.
- **검증:** 회수로 기존 구매 Preflight가 실패하는 Claim에서 원본 S7 준비/ACK 이력 보존, 역사적 증거 부재, S7 SQL 실패 후 원본 취소 기록 유지, 타 Subject 혼입 거부 회귀 검증을 추가. 신규 HEAD CI/통합 CI 성공 전까지 PASS 미선언.
- **불변 조건:** 실제 사람이 해설을 받았거나 읽었다는 법적 제공 확정은 불가(`consumerDeliveryProven:false`). 현장 S7 사용 승인·공개 라우트·실제 PG 환불·운영 권한 회수·LIVE DB·신규 마이그레이션 무변경.


### 2026-11-05 — 사주 단품 10종/패키지 3종의 순결제액 기반 업그레이드 계산 (확정 정책 정정)

- **정책 우선:** 2026-11-05 사주 판매 개편 및 이후 차액 계산 정정을 반영합니다. `삶의 단계`·독립형 종합풀이 판매를 금지하고 `standard.love_relationship`의 현재 확정 정가를 9,900원으로 고정합니다. 전체 사주는 기본 6개 분야만 포함합니다.
- **실제 구현:** `apps/api/src/commerce-saju-upgrade-pricing-v1.ts`에 비판매 내부 견적 함수를 추가했습니다. 실제 승인된 Receipt의 고유 거래별 `verifiedPaidMinor - refundedMinor`만 한 번 인정하며, 업그레이드 Receipt는 **패키지 정가가 아닌 실제 추가 청구액**으로 저장·계산합니다. 원본 Receipt ID 연결·Purchase Intent 일대일·동일 명식·동일 출생정보 버전·환불 상태 정합성을 엄격히 검사합니다.
- **별도 상태:** DB의 실제 유효 분야권한을 `ownedFields`로 입력받아 구매기록과 분리합니다. 이미 목표 분야를 모두 소유하면 추가 구매 없이 0원을 반환하고, 초과 납부액을 자동 환급하지 않습니다. 다른 결제의 권한을 변경하지 않습니다.
- **보류:** 겹친 구매액을 목표에 귀속시킬 공인 기준이 없는 경우, 결제 중인 겹치는 상품이 있는 경우, 결제액이 이미 정가를 충족하는데 유효 권한이 없는 경우 금액을 제시하지 않고 HOLD합니다. 별도 부분 환불용 금액 배분을 업그레이드 공식에 사용하지 않습니다.
- **핵심 회귀:** 직업 9,900원 → 커리어·경제 15,000원 → 전체 사주 10,000원, 직업·재물·사업 단품의 커리어 재결제 불필요, 두 테마 패키지 보유 시 전체 사주 0원, 단품 복수→테마→전체·할인·부분/전액 환불·중복 영수증·동시 진행 주문 보류를 테스트에 포함합니다.
- **경계:** 계산 코드는 내부 `checkoutAuthorized:false` 견적일 뿐 결제 요청·승인·할인/환불 집행·Product/Offer seed·권한 부여·운영 DB 마이그레이션·LIVE 활성화가 아닙니다. 실제 주문 전 원장/권한/중복 주문을 **하나의 DB 잠금·거래**로 재검증하고, 출생정보 고정·구매 출처·사주 기록 연결 및 공식 상품 authority는 별도로 연동해야 합니다. PR CI 통과 전 PASS 선언하지 않습니다.

### 2026-11-05 — 사주 기록별 원본 실결제·업그레이드·환불의 DB 원장 연결 후보 (P2/P3/P4)

- **기준:** 앞선 정정 정책 구현 #3018의 실제 영수증별 순결제액 계산을 이어 받되, 개인정보 삭제 #3013의 별도 검증은 변경하지 않았습니다.
- **실제 구현:** `docs/operations/candidates/commerce_saju_record_verified_purchase_ledger_v1.sql`에 비배포 전용 사주 기록/출생정보 revision 연결, 원본 Intent→Record, 업그레이드→이전 Receipt, 검증된 환불 Event→원본 Receipt를 분리한 원장을 작성했습니다. 실패·미완료 Intent만으로 사주 기록이 영구 고정되지 않고 검증된 결제 이력이 있는 기록의 출생정보 revision 변경은 거부하도록 설계했습니다.
- **결제 출처 읽기:** `apps/api/src/commerce-saju-verified-ledger-source-v1.ts`에 DB 원장→실제 Receipt 금액/환불액/업그레이드 원본 연결 읽기와 기존 가격 계산기를 연결했습니다. 결제 원본/Subject/사주 기록/명식 revision 및 취소의 정산 누락·중복 Receipt·불일치/미승인 영수증을 차단합니다. 현재 분야별 유효 권한의 동일 DB 스냅샷 증명 없이는 실제 checkout으로 연결할 수 없습니다.
- **테스트:** 대표 9,900→15,000→10,000, 부분 환불, 진행 중 중복 주문, 취소 정산 누락, 위조 연결, 다른 Subject, 폐기 상품, 두 테마 보유 시 추가 결제 0원 등을 자동 회귀 테스트로 추가했습니다. 새로운 PR 통과 전 PASS 판정은 유보합니다.
- **실제 남은 경계:** 원장 SQL은 **staged candidate only**로 전체 PostgreSQL17 검증·개인정보 삭제 그래프 적용·출생정보 변경 경계의 결제 동시성 보장·공식 권한 읽기·원본 환불 검증 생산자 연결 전에는 migration에 넣거나 배포하지 않습니다. API 공개/Charge Terms·Product/Offer seed/실결제·LIVE·자동 환불은 전부 비활성화 상태입니다.

### 2026-11-05 — 사주 원본 결제·업그레이드·환불 후보의 격리 PostgreSQL 17 검증 연결

- **현황:** #3018의 정정된 순결제액 계산은 CI 성공 후 main에 병합됐습니다. #3023의 DB 원장 후보는 #3018 병합 뒤 최신 main에 재정렬해 충돌을 해소했고, 별도 필수 통합 검증은 결과 대기입니다.
- **새 검증:** #3032에서 `commerce-saju-record-ledger-candidate-pg17` 사례를 전체 이관된 별도 PostgreSQL 17 DB 스위트에 등록했습니다. 기존 검증된 합성 B2 원본 Receipt/출생 revision을 재사용해, 구매 확정 전 기록 revision 변경 허용·검증된 구매 후 변경 금지, 실제 원본 Receipt 업그레이드 연결, Provider 개별 취소액과 환불 원장 일치, 공개·API 직접 권한 부재를 검사합니다.
- **실행 안전:** 후보 DDL·가짜 결제/환불/업그레이드 데이터는 한 SQL `BEGIN…ROLLBACK` 안에만 존재합니다. 스크립트가 GitHub Actions의 격리 PostgreSQL 17 DB 이외 실행을 거부합니다. **새 CI 완료 전 검증 통과를 선언하지 않습니다.**
- **남은 일:** 원본 Reader fixture와 신규 사주 Product 의미를 운영에서 혼동하지 않으며, 사주 공식 상품·분야권한·출생정보 결제 직전 확인·청구 원자성·법정 환불/부분 제공·개인정보 삭제 그래프에 연결하기 전에는 이 후보를 Production migration에 설치하지 않습니다.

### 2026-11-06 — 사주 구매 원장 연결 시 출생정보 버전 변경 경계 보강 (P2/P3/P4)

- **선행 검증:** #3032 고정 HEAD `141ac4d` 격리 PostgreSQL 17 및 전체 통합 CI 성공, main 병합 `8585308` 확인. 이전 synthetic B2/B3 원장 검증은 반복 구현하지 않습니다.
- **발견:** 비배포 `commerce_saju_purchase_origins_v1`의 기존 FK는 원장과 출생 revision이 동일 Subject에 속한다는 사실만 강제했습니다. 실제 사주 기록이 가리키는 **현재 revision과 동일한지** INSERT 시 검사하지 않아, 이전 revision을 가진 구매 연결이 별도 코드 경로에서 삽입될 수 있었습니다. 연결 뒤 출생정보가 바뀌고 나중에 영수증이 verified 상태가 되는 경계도 원장에 남아 있었습니다.
- **수정:** 구매 Intent→Record 원장 연결 시 정확한 Subject·Record 행을 `FOR UPDATE`로 잠근 뒤 현재 Birth revision과 삽입값을 대조합니다. 사주에 연결된 영수증이 나중에 verified/revoked 상태로 삽입·전환될 때에도 같은 Record 잠금·revision 검사를 수행합니다. 일반 Reader 등 연결되지 않은 Commerce 영수증의 실행 권한·의미는 변경하지 않습니다.
- **격리 검증:** 기존 `commerce-saju-record-ledger-candidate-pg17`에 동일 소유자의 **다른 유효 Birth revision을 현재 원장에 위조 결속하는 실패 사례**, 잘못된 연결이 남지 않는 검사, 후기 영수증 검증 보호 트리거 존재 검사를 추가했습니다. 기존 구매·업그레이드·취소/환불 원장 시나리오는 그대로 유지합니다. **새 커밋의 실제 PostgreSQL 17 CI 및 전체 통합 결과는 확인 전까지 PASS 미선언**입니다.
- **한계:** 이 수정은 일회용 데이터베이스에서 검증하는 **비배포 후보**입니다. 결제 직전 원자적 전체 Quote/Grant 재확인, Reader 공식 권한 소유 분야 확인, 개인정보 삭제 그래프·복원, Provider 결제 확정과 실제 생산자 연동은 여전히 미완료입니다. 운영 DB 적용·공개 API·Offer/Charge Terms·LIVE 판매·실제 PG 환불·운영 권한 회수 모두 변경하지 않습니다.

### 2026-11-06 — 사주 Record 전용 권한 증거·실결제 원장의 동일 DB 시점 조회 (P2/P3/P4)

- **선행 결과:** #3053의 사주 원장 출생정보 revision 보호는 고정 HEAD `25f6777` 전체 통합 CI 성공 후 `87d7d88`로 main 병합됐습니다. 기존 단품·테마·전체 차액 계산과 격리 PG17 원장 검증은 유지합니다.
- **구현:** 기존 `executePostgresCommerceInternalTransactionV1`에 명시적인 `REPEATABLE READ READ ONLY` 실행 옵션을 추가했습니다. 독립된 내부 후보 `quoteSajuFromOnePrivateSnapshotV1`는 단일 연결/동일 DB Snapshot에서 먼저 사주 기록에 귀속된 현재 실제 권한 증거를 요청하고, 같은 연결로 실결제·원본 Receipt·Provider 환불 원장 및 출생 revision을 읽습니다. 권한 출처 누락·타 Subject/Record/revision·DB 예외 시 전체 조회가 실패 및 ROLLBACK하고, 무조건 `checkoutAuthorized:false`를 반환합니다.
- **검증:** 기존 Commerce 내부 트랜잭션의 실행·롤백 계약 및 신규 동일 연결/격리 레벨·조회 순서·오염된 분야 권한 거부·권한 소스 부재 사례를 단위 테스트로 추가했습니다. **새 고정 HEAD CI·통합 CI 결과 확인 전까지 PASS를 선언하지 않습니다.**
- **정확한 경계:** 새 사주 단품·패키지를 현재 유효한 Record-scoped Entitlement Grant 분야로 변환하는 공식 Product Capability/Grant 매핑은 아직 미연결입니다. 현재 후보는 `ownedFieldsAuthority`를 동일 스냅샷 안에서 읽을 **미래의 비공개 증명 생산자**로 필수 요구할 뿐, 구매 원장으로 현재 소유 분야를 만들어 내지 않습니다. 이 생산자와 실제 Grant/Record/Reader 권한 검증 및 구매 전 잠금·청구 원자성은 별도 미완료입니다. 이 후보를 운영 checkout에 연결하거나 상품 판매/환불·실제 PG·DB migration·개인정보 삭제 규칙을 변경하지 않습니다.

### 2026-11-06 — 사주 기록 유료 잠금: 샌드박스 검증과 실제 Production 결제 구별

- **선행 검증:** #3061의 고정 HEAD `ca8b2d7` 일반 CI 및 전체 Integration 성공, 병합 `4c1c683` 확인. 동일 DB 스냅샷 견적 후보는 비배포/checkout 불가 상태 유지.
- **문제:** 비배포 사주 원장 후보의 Record Birth revision 잠금은 Receipt 상태 `verified/revoked`만 검사해, `sandbox` 검증을 실제 결제로 오인하고 출생정보를 영구 잠글 수 있었습니다. 이후 Receipt verified 전환 검사도 이 둘을 구분하지 않았습니다.
- **수정:** Record 출생정보 변경 차단 및 Receipt 검증 이후 revision 재확인 조건을 `environment='production'`인 실제 확인 영수증(원본 `verified_at` 존재)으로 제한했습니다. 최초 Intent→Record 연결 시점의 같은 Subject/정확한 Birth revision 검사는 유지합니다. 이미 확인된 Production 구매의 Record 고정, 업그레이드 원본/환불 금액 검증은 변경하지 않습니다.
- **격리 증거:** 기존 실제 PostgreSQL 17 원장 테스트에 같은 Record에 결속된 `sandbox` verified Receipt를 만든 뒤 Birth revision 변경·복원을 허용하고, 이어서 본래 `production` verified Receipt를 결속하면 변경이 거부되는 경계를 추가했습니다. 모든 후보 SQL과 fixture는 격리 DB의 `BEGIN…ROLLBACK` 내부에서만 실행합니다. **신규 고정 HEAD 통합 CI 통과 전 PASS 미선언**입니다.
- **남은 경계:** 새 사주 Product 필드에 대한 공식 Record-scoped Grant/Capability 매핑, 실제 생산자에 의한 권한 read, 결제 직전 원자적 재검증, privacy graph 및 비운영 전체 E2E는 아직 완료되지 않았습니다. 운영 migration, 소비자 API, 실제 결제·환불·LIVE는 변경하지 않습니다.

### 2026-11-06 — 사주 Record별 실제 유효 Grant 증거를 내부 차액 견적에 연결 (P2/P3)

- **선행 검증:** #3064의 고정 HEAD `f6071ca` 일반/전체 통합 CI 성공, main 병합 `a764c99` 확인. 샌드박스 Receipt는 Record 출생정보 유료 잠금에 사용하지 않습니다.
- **구현:** 신규 비공개 `quoteSajuWithStoredCurrentGrantsV1`은 호출자가 임의의 `ownedFields`를 주입할 수 없도록, 앞서 구현한 한 번의 `REPEATABLE READ READ ONLY` DB 거래 안에서 `CURRENT_SAJU_OWNED_FIELDS_DB_READER_V1`를 고정합니다. DB 조회는 현재 Saju Record/Subject/Birth revision → Purchase Intent → 실제 Production Verified Receipt → 고정된 Product Capability Set·정확한 Item → 같은 Receipt가 발행한 Active Entitlement Grant → Active 유효 권한 집계를 한 번에 대조합니다. 원본 영수증·검증된 환불 합계·미정산 취소 원장 조회는 기존 코드에서 동일 스냅샷으로 이어집니다.
- **거부:** 현재 유효 Grant가 없으면 구매 Product만 보고 분야권한을 만들지 않습니다. 타 Subject/Record/revision, 상품에 없는 필드, 임의 권한, 동일 Grant 중복, 같은 Receipt·필드 중복, 실제 환불 또는 미정산 취소에 걸린 권한 증거를 차단합니다. 결과는 계속 `checkoutAuthorized:false`이며 권한 발급/회수/결제 없이 내부 계산에만 사용됩니다.
- **테스트:** 정확한 Grant 1개로 직업 9,900원 인정 → 커리어·경제 추가 15,000원, 분야 권한 없는 결제의 불인정, 서로 다른 필드 Grant, 잘못된/중복된 권한/환불·취소 증거의 트랜잭션 롤백 및 실제 읽기 전용 DB 조회 계약을 검사합니다. **새 HEAD의 CI 통과 전 검증 완료를 선언하지 않습니다.**
- **미완료:** 새 사주 상품/분야에 대한 운영 Product Capability·Grant 발행 계약/별도 Saju Record 접근 제어는 아직 배포·승인되지 않았습니다. 이 조회기는 이미 일치하는 활성 Grant가 DB에 있을 때에만 분야 소유를 입증하는 **비배포 후보**이고, 고유한 user-owned Record 권한 scope를 새로 발급하지 않습니다. 실제 Merchant/Offer·Checkout·Production DB migration·개인정보 처리·LIVE 활성화는 없습니다.

### 2026-11-06 — 사주 유료 권한 조회의 환불·취소 후 잔존 Grant 검출 (P2/P3/P5)

- **선행 검증:** #3070 고정 HEAD `3a3fa90` 일반·전체 통합 CI 성공, `main` 병합 `06551c5` 확인. 기존 단일 스냅샷 견적과 비판매 경계 유지.
- **발견:** 최초 분야권한 조회 SQL은 `verified` 영수증·정확한 Capability·유효 Entitlement에 **내부 조인**을 사용했습니다. 따라서 이미 `revoked` 처리되었거나 환불·권한 원천 불일치·Capability 정의 불일치가 있는 영수증에 **활성 Grant가 남아 있어도** 조회 결과에서 완전히 누락될 수 있었습니다. 원본 결제금만 환불된 상태의 재구매 견적이 그 잔존 권한을 무시할 위험이 있었습니다.
- **수정:** 동일한 실제 Saju Record/Subject/Birth revision 및 원본 Receipt를 따르는 **활성 Grant 전부**를 먼저 조회하고, Production Verified Receipt 원본 시각·동일 Offer/실제 금액·통화, 원본 Receipt Grant source key, 고정 Capability Set/Item, 현재 유효 Entitlement 투영, 전액·부분 환불 합계, 미정산 Provider 취소 사실을 각각 확인하도록 전환했습니다. 누락·타 출처·중복·미정산·환불 후 활성화는 `HOLD`·전체 읽기 트랜잭션 `ROLLBACK`입니다. 적법하게 폐기된 Grant는 보유 분야로 인정하지 않습니다.
- **테스트:** 정상 권한의 직업 → 커리어·경제 실제 차액 견적을 유지하며, 영수증 revoked 후 활성 Grant 잔존, sandbox/검증 시각 누락, 잘못된 원본 Offer/금액/Grant 출처, 고정 Capability 누락, 유효 Entitlement 누락, 부분 환불·미정산 취소를 거부하는 회귀 사례를 추가했습니다. **본 수정의 CI 결과 전에는 PASS를 주장하지 않습니다.**
- **한계:** Product Capability/Grant의 Saju Record 전용 발행 계약, 기존 일반 Grant 접근 제어, 실제 권한 부여·취소 실행과 운영 데이터베이스 적용은 여전히 미완료입니다. 이 PR은 비배포 후보의 조회 무결성만 강화하며, 실제 판매/환불·공개 API/Reader 배송·LIVE를 켜지 않습니다.

### 2026-11-06 — 사주 분야권한의 정확한 원본 Receipt 발급 이력 검증 (개발 로드맵 2·5)

- **선행:** #3075 고정 HEAD `408593d` 일반 CI·전체 통합 성공, `main` 병합 `68c24f6` 확인. 기존 비공개 사주 견적·DB 원장 조회는 운영에 배포하지 않았습니다.
- **발견:** 활성 Entitlement Grant 행과 현재 유효 권한 투영만 검사하면, 실제 원본 Receipt가 기존 `internal_apply_entitlement_effect_v1`으로 **그 Grant를 발급했다는 불변 Event 이력** 없이도 사주 분야 소유를 계산할 수 있었습니다. 이 결손은 Grant/Receipt 식별자가 연결됐다는 사실만으로는 해결되지 않습니다.
- **수정:** 같은 Grant/Subject/entitlement/scope에 관한 `entitlement_events`를 함께 읽고, 원본 Receipt로 발급된 `receipt + granted + ent-event-v2` 이벤트가 정확히 1개인지, Source Receipt·Product·활성 목표 상태가 일치하는지 확인합니다. 다른/중복 발급 이벤트, 발급 이벤트 누락, 확인된 Provider revoked 이벤트가 있는데 활성 Grant가 남은 경우는 `HOLD`로 거부하고 읽기 트랜잭션을 롤백합니다. 기존 차액 계산·Grant 쓰기·회수 의미는 변경하지 않습니다.
- **검증 추가:** 새 발급 이벤트 결손·중복·불일치·revoked 이력에 대한 테스트를 추가했습니다. 기존 **격리 PostgreSQL 17** 사주 원장 스위트에 실제 TypeScript 코드가 사용하는 세 SQL(Record/원장/현재 Grant)을 추출하여 전체 migration + ROLLBACK 후보 테이블에서 직접 실행하는 검증을 연결했습니다. SQL 문법/컬럼/실행 계약을 단순 mock으로만 검사하지 않습니다. 동일 B2 Reader Fixture는 쿼리 실행을 위한 가짜 거래이고 Saju 상품/권한으로 승인하거나 간주하지 않습니다. **새 CI/통합 성공 이전에는 PASS 미선언**입니다.
- **잔여:** Saju Record-scoped Capability/Grant를 실제 발행하는 공식 계약, 승인된 Product/Offer, 구매 직전의 원자적 재검증, 실제 지급·회수 및 개인정보 삭제/통합 E2E는 미완료입니다. 운영 DB·LIVE·실제 결제/환불·공개 API 변경 없음.

### 2026-11-06 — 사주 동일 명식·동일 상품의 미완료 구매 중복 차단 (개발 로드맵 2)

- **선행:** #3077의 고정 HEAD `06fbec0` 일반 CI 및 전체 통합 CI 성공, `af41b57`로 main 병합 확인. 원본 Receipt 발급 Event 검증과 격리 PostgreSQL 17 조회 테스트 유지.
- **확인한 공백:** 기존 사주 구매 원장 후보에서 구매 Intent를 Record와 결속하는 트리거는 Birth revision만 잠갔습니다. 이미 같은 명식에서 같은 Product의 `created` 또는 `pending` Intent가 존재하는데 또 하나를 생성하는 경합을 원장 계층에서 차단하지 않았습니다.
- **구현:** 기존 `tr_commerce_saju_origin_revision_lock_v1`의 **Record 행 FOR UPDATE 잠금**을 재사용하고, 동일 Subject·Record·Birth revision 및 **같은 Product ID**에 미완료 `created/pending` Intent가 있으면 신규 `created/pending` Origin 결속을 `SAJU_DUPLICATE_PENDING_SAME_PRODUCT`로 거부합니다. 같은 Product에 여러 Offer가 있어도 Product ID를 기준으로 판정합니다. 스냅샷이 오래되어 잠금 후 재조사가 성립하지 않는 격리 수준에는 신규 미완료 결속을 허용하지 않고 `READ COMMITTED`에서만 적용합니다.
- **격리 검증:** 기존 비배포 PostgreSQL 17 사주 원장 테스트에서 원본 실결제·사주 Record에 미완료 Upgrade Intent 하나를 결속한 뒤, 동일 상품의 또 다른 `pending` 결속 거부 및 결속 잔여 0건을 확인합니다. 같은 Subject·Birth revision·상품이라도 **다른 Saju Record**에는 결속되는 것을 확인합니다. 모든 후보 스키마와 fixture는 단일 `BEGIN/ROLLBACK` 내부에서 실행합니다. **새 고정 HEAD의 CI 통과 전 PASS 미선언**이며 실제 2세션 경쟁 타이밍 재현은 이 테스트의 주장 범위가 아닙니다.
- **남은 경계:** 이 제약은 정확히 같은 Product의 중복만 조기 방어합니다. **서로 다른 Product/패키지의 분야 겹침**은 승인된 Saju Record-scoped Capability/Grant 권한 매핑과 결제 직전 원자적 결정이 완료될 때까지 HOLD입니다. 운영 Checkout, 실제 PortOne 결제, 이미 검증된 Entitlement Event/Reader 회수, 운영 DB 마이그레이션/공개 라우트/판매는 변경하지 않습니다.

### 2026-11-06 — 사주 동일 명식의 미완료 단품·패키지 교차 구매 충돌 방어 (개발 로드맵 2)

- **선행 CI:** #3078 고정 HEAD `0338559` 일반 CI와 전체 Integration SUCCESS, `a59cc8a`로 main 병합 확인. 기존 동일 상품 미완료 결속 방어는 유지합니다.
- **구현:** 기존 비배포 `commerce_saju_purchase_origins_v1`의 **같은 Saju Record FOR UPDATE 잠금** 아래, 다른 Product의 미완료 `created/pending` Intent까지 확인하고 이미 결정된 사주 상품 10단품·3패키지 **분야 구성** 사이에 교집합이 있으면 `SAJU_OVERLAPPING_PENDING_PRODUCT`로 Origin 결속을 거부합니다. 기존 동일 Product는 별도 `SAJU_DUPLICATE_PENDING_SAME_PRODUCT`로 거부합니다. 서로 다른 명식 및 겹치지 않는 상품은 보존합니다.
- **정책 경계:** 이 분야 목록은 이미 존재하는 `COMMERCE_SAJU_PRODUCTS_V1`의 구매 **충돌 보류용 목록**입니다. 새 Entitlement Key/Scope/Grant mapping을 만들거나 지급하지 않으며, 다른 상품에 대한 목록이 없는 경우 임의로 겹치지 않는다고 판정하지 않고 HOLD합니다. 새 Product/Offer를 배포하지 않습니다. Pending 결속은 Record 잠금 후 최신 상태를 읽을 수 있는 `READ COMMITTED`에서만 허용합니다.
- **검증:** 저장소의 13개 상품 정의와 후보 SQL 분야 구성이 정확히 같은지 확인하는 테스트를 추가했습니다. 격리 PostgreSQL17 테스트에서는 기존 B2 Reader 결제 fixture를 사주 권한으로 재해석하지 않고, 기존 **판매 비활성** `standard.love_relationship` Product와 rollback-only Offer/Intent를 만들어 동일 상품 중복, 연애 단품→연애·가족·배우자 패키지 중복, 독립 직업 단품, 다른 명식 격리를 검증합니다. 모든 후보 상품·Offer·Intent/Origin은 `BEGIN/ROLLBACK` 범위이며 LIVE/운영 변경이 없습니다. **신규 CI/Integration 성공 전 PASS를 선언하지 않습니다.**
- **미완료:** 원본 Receipt·권한·환불을 결제 직전 실제로 잠그고 검증하는 운영 Checkout Admission, 상품의 실제 Record-scoped Capability/Grant 발급·취소와 전체 결제→Reading 제공→철회→삭제 E2E는 별개로 남습니다. 이 Candidate는 결제/권한 지급·회수/실제 PG 호출·공개 API/운영 DB 적용을 하지 않습니다.

### 2026-11-06 — 고객 원본 청약철회 검토의 취소·전달 증거 동일 PostgreSQL17 검증 (개발 로드맵 3·5)

- **선행:** #3082 고정 HEAD `38911be` 일반·전체 통합 CI 성공, `5327cba`로 main 병합 확인. 사주 미완료 단품/패키지 겹침 방어는 운영 비배포 상태를 유지합니다.
- **공백:** 기존 회원 청약철회→정확한 B2 Reader 원본 Receipt→Provider 취소→단일 Grant Effect→개인정보 삭제·재실행 PostgreSQL17 통합 검증은 있었으나, 고객 Claim 심사기에 사용되는 `RECORDED_READER_CANCEL_EXACT_CLAIM_SQL_V1` 및 `RECORDED_READER_S7_EXACT_PURCHASE_SQL_V1`의 실제 스키마 실행·다른 Reader 경계는 그 통합 케이스에 포함되지 않았습니다.
- **연결:** 기존 검증용 PostgreSQL17 단일 스위트에 추가 `BEGIN/ROLLBACK` 검증을 연결했습니다. 현재 TypeScript의 **정확한 원본 Claim 취소/S7 SQL**을 추출하여 B2·B3 구매/Subject/Checkout 단위로 실행하고, 기존 합성 B2 PortOne cancellation을 같은 원본 Receipt에 결속·중복 replay해 (1) B2 취소 원본 HMAC·금액·상태 보존, (2) 독립 B3에 동일 취소가 전파되지 않음, (3) S5 본문이 없는 상태에서 S7 응답 준비·클라이언트 ACK 및 전달 완료를 만들어내지 않음을 검증합니다.
- **정확한 의미:** 이는 원본 저장 취소 증거와 S7 **기록 부재**를 실DB에서 대조하는 음성/출처 검증이지, 합법적인 전달 완료 또는 실제 고객 미제공 확정이 아닙니다. Reader S5 Production 발행은 여전히 HOLD이고, 근거 없는 protected body를 생성하지 않습니다. 전체 회원 청약철회·Reader exact revoke·개인정보 finalizer 테스트는 별도 기존 케이스에서 그대로 통과해야 합니다.
- **경계:** 모든 후보 취소 함수와 신규 Event는 격리 DB 트랜잭션 내에서만 생성/롤백합니다. 기존 고객 접수·S7·Provider 처리 코드를 바꾸지 않고 운영 DB SQL, 공개 API, Saju 발급 계약, LIVE 결제/환불·전달을 활성화하지 않습니다. 새 고정 HEAD의 CI/통합 결과 확인 전에는 PASS나 ROADMAP_COMPLETE 선언을 하지 않습니다.

### 2026-11-07 — 승인된 Saju Record-scoped Capability 구현

- **승인:** 사용자가 서버 생성 불투명 Record scope와 Receipt→Purchase Origin→Record 연결 방식을 승인했습니다.
- **DB 권한:** migration `2330_saju_record_scoped_capability_authority_v1.sql`에 Saju 전용 `scope_mode='saju_record'`, 고유 `entitlement_scope_id`, 기존 Receipt Grant writer의 서버 측 scope resolver를 추가했습니다. 13개 Saju Product만 이 scope를 사용할 수 있고, 다른 Product의 기존 `global/fixed` 의미는 유지합니다.
- **구매 연결:** 기존 Purchase Intent v3를 일반 호출로 우회할 수 없도록 transaction-local private admission context를 추가했습니다. Record 행을 먼저 잠그고 Subject·Birth revision·Offer·Capability Set을 확인한 뒤 기존 Purchase Intent v3를 호출하고 Origin을 같은 트랜잭션에서 생성합니다. 동일 멱등키 재호출은 기존 Origin의 Record/Revision까지 대조합니다.
- **중복·환불 경계:** 같은 Record의 pending 분야 중복은 기존 Record 잠금 트리거가 보류합니다. 이미 활성 권한, 환불 증거 또는 미해결 취소가 겹치는 분야는 새 원본 구매를 보류합니다.
- **업그레이드 제한:** 현재 Offer Charge Terms는 정적 금액이므로 Record별 가격 차액을 안전하게 고정할 수 없습니다. 따라서 이번 Admission은 `original`만 허용하고 `upgrade`는 quote-specific immutable Charge Terms가 생길 때까지 HOLD합니다. 클라이언트가 차액을 제출하는 우회는 허용하지 않습니다.
- **개인정보 삭제:** 계정 삭제 Finalizer가 Upgrade link → Origin → Record 순서로 개인 매핑을 지운 뒤 Birth revision을 삭제합니다. Receipt·Provider Event·Grant/Event·환불 증거는 삭제하지 않습니다.
- **검증 추가:** PG17 테스트에 두 개의 서로 다른 Saju Record가 동일 Subject에 속해도 각각 다른 opaque scope와 독립 Grant를 받는 실제 Receipt→Origin→Record→Grant 경로를 추가했습니다. 계정 삭제 테스트에도 Record/Origin 제거와 Purchase Intent 보존 검증을 추가했습니다.
- **비운영 경계:** Product/Offer seed, 공개 Checkout route, Provider handoff, 실제 charge/refund, LIVE 판매는 변경·활성화하지 않았습니다. CI 성공 전 통과 선언은 하지 않습니다.

### 2026-11-07 — Record scope의 상품·권한·가격 일치 검증 보강

- **권한 키:** 10개 Saju 분야를 내부 `saju.<field>` 키로 고정했습니다. 13개 상품의 분야 목록과 각 Capability Item의 `item_key/entitlement_key` 조합이 일치하지 않으면 구매 승인과 Receipt Grant 발급을 거부합니다.
- **가격 일치:** 기존 TypeScript 상품 정책의 13개 KRW 가격을 DB 불변 함수로 미러링하고, 원본 구매 승인 시 현재 Offer Charge Terms의 금액·통화가 정확히 일치해야 합니다. 가격 정책과 Offer 금액이 다르면 결제 Intent 생성 전 HOLD합니다.
- **일반 경로 우회 차단:** 일반 Purchase Intent v3 경로에서도 Saju Product는 Record Admission 문맥 없이는 신규 생성·재호출할 수 없고, 비Saju Product가 Saju Record scope를 사용하거나 Saju Product가 global/fixed scope를 사용하는 경우도 거부합니다.
- **업그레이드 제한:** 정적 Offer Charge Terms로는 Record별 차액을 고정할 수 없어, 이번 버전은 원본 구매만 허용하고 업그레이드는 별도 불변 quote Charge Terms 구현 전까지 HOLD합니다.


### 2026-11-07 — Guest 무료 이용 / Member-only 유료 구매 정책 정정 (P0-CM-05)

- **오류 확인:** 기존 `P0-CM-04`가 active Guest의 Web one-off 유료 구매와 회원가입 전 유료 권한 소비를 허용하고 있었습니다. 같은 정책이 `COMMERCE_GUEST_PURCHASE_OWNERSHIP_DECISION_V1.md`, `COMMERCE_PAYMENT_TRACK_ARCHITECTURE_V1.md` §2.4/§4.2, `COMMERCE_ENTITLEMENT_SPEC.md`에도 반영되어 있었습니다.
- **정정:** 사용자의 2026-11-07 지시에 따라 `P0-CM-04`를 superseded 처리하고 `P0-CM-05`를 추가했습니다. Guest는 무료 오늘의 운세와 추후 지정할 무료 사주 상품 1종만 이용하며, 모든 유료 구매는 활성 인증 Member 로그인 후 시작합니다. Guest 유료 Purchase Intent/Payment Attempt/Provider checkout/paid Grant는 금지합니다.
- **API 경계:** Purchase Intent 및 Payment Attempt HTTP foundation은 Guest identity를 `LOGIN_REQUIRED`로 거부하고 PostgreSQL 연결 전에 종료합니다.
- **DB 경계:** 신규 forward-only migration `2340_paid_purchase_member_auth_v1.sql`이 Purchase Intent와 Payment Attempt insert 모두에서 활성 Member/auth binding을 확인합니다. 역사적 migration `0960`/`1070`은 수정하지 않습니다.
- **기록 보존:** 과거 Guest-owned Commerce row가 있더라도 Receipt/Event/Grant의 원래 `subject_id`를 재작성하지 않습니다. Guest free flow와 Guest bootstrap은 유지합니다.
- **검증 범위:** Guest paid-create 거부, Guest payment-attempt 거부, HTTP `LOGIN_REQUIRED`, historical Guest purchase history read를 회귀 검사에 포함합니다. 새 HEAD의 CI/PG17 결과 전 PASS를 선언하지 않습니다.
- **운영 경계:** Saleable Offer/Charge Terms, public Checkout route, LIVE PortOne, Production DB 적용 및 실제 판매는 계속 HOLD.


### 2026-11-07 — Guest 유료 구매 replay 경계 추가 하드닝 (P0-CM-05)

- **추가 발견:** 2340 INSERT trigger만으로는 기존 Guest-owned Purchase Intent 또는 Payment Attempt의 멱등 replay 경로를 막지 못합니다. v2/v3 Purchase Intent와 Payment Attempt command는 원래 replay 조회가 신규 insert보다 먼저 실행됩니다.
- **수정:** 신규 forward-only migration `2350_paid_checkout_member_command_gate_v1.sql`에서 기존 구현을 내부 전용 이름으로 보존하고, 공개 command 이름은 활성 인증 Member를 replay보다 먼저 검증하는 wrapper로 교체합니다. 기존 내부 구현은 API executor를 포함한 런타임 역할에서 직접 실행할 수 없도록 권한을 회수합니다.
- **보존:** 과거 Guest-owned Purchase Intent/Payment Attempt 행은 변경·삭제하지 않습니다. 과거 기록의 replay를 신규 유료 checkout 수단으로 사용할 수 없게만 차단합니다.
- **회귀 검사:** Guest 신규 Purchase Intent v2/v3, 과거 Guest Purchase Intent replay, Guest 신규 Payment Attempt, 과거 Guest Payment Attempt replay를 각각 거부하고, 역사적 행이 그대로 남는지 확인하도록 DB 테스트를 추가했습니다.
- **정책 범위:** Guest 무료 오늘의 운세 및 추후 지정할 무료 사주 상품 1종 경로는 paid Commerce command와 분리된 상태로 유지합니다. LIVE 판매 및 Production 적용 승인은 포함하지 않습니다.


### 2026-11-07 — Provider handoff-context Guest 차단 (P0-CM-05)

- **추가 발견:** Payment Attempt 생성은 Member-only였지만, 이미 생성된 Attempt의 pre-browser handoff-context read는 인증 Guest에게도 열려 있었습니다. 이 조회는 PSP `paymentId`와 고정 결제 금액을 반환하므로 Guest가 기존 Guest Attempt를 이어서 결제하는 경로가 될 수 있습니다.
- **수정:** 신규 forward-only migration `2360_paid_handoff_member_gate_v1.sql`에서 handoff-context query를 Member 검증 wrapper로 교체하고, 이전 query 구현은 API executor가 직접 실행할 수 없도록 내부 전용으로 전환했습니다. HTTP 경계도 Guest를 `LOGIN_REQUIRED`로 PostgreSQL 연결 전에 거부합니다.
- **검증:** Guest handoff-context DB query 거부, API HTTP Guest 거부, private query ACL을 회귀 검사에 추가했습니다.
- **범위 보존:** server-side payment verification은 이미 발생한 provider 사실을 확인하는 별도 경로이므로 이 변경으로 막지 않습니다. Guest 무료 이용 흐름도 변경하지 않습니다.

### 2026-11-07 — 사주 Record 신규 FK의 전체 Subject 의존성 목록 동기화

- **실패 근거:** [PR #3090 DB 권한 검사](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42364797597/job/128380535690)에서 실제 전체 마이그레이션은 성공했으나, 계정 Subject를 기준으로 추적하는 전이 FK 목록이 기존 140개인 반면 최신 DB에는 149개가 존재해 검증이 중단됐습니다.
- **수정:** 기존 목록에 신규 Saju Record/Origin/Upgrade Link/Verified Refund Evidence 연결 9개를 실제 제약 이름·참조 컬럼·최소 깊이 그대로 추가하고, 연결 149개·직접 연결 31개를 검증하도록 갱신했습니다. 기존 Wallet 4개 예외와 최대 경로 깊이 4 조건은 유지합니다.
- **정책:** 이 그래프는 FK 구조 목록이며 테이블의 보존·삭제 여부를 새로 승인하지 않습니다. 기존 계정 삭제·개인정보 삭제/금융 증거 보존 정책과 실행 경계를 그대로 유지하며, 새 CI 및 PG17 통과 전 완료 선언을 하지 않습니다.


### 2026-11-07 — PostgreSQL17 구식 Saju 원장 중복 생성 제거

- **실패 근거:** [PR #3090 PostgreSQL17](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42364797597/job/128380535790)에서 과거 비배포 원장 후보 SQL이 마이그레이션 2330이 생성한 Saju Record 테이블을 중복 생성하여 실패했습니다.
- **수정:** 사주 Record·권한 스키마 검증은 마이그레이션 2330으로 유지하고, SQL 견적 스모크에서 구식 후보 DDL 재적용만 제거했습니다. 기존 SQL 추출·읽기 및 ROLLBACK 범위는 유지합니다.
- **문서 교정:** Subject FK 그래프의 탐색 테이블 총수는 루트 subjects 포함 63개로 바로잡았습니다. 새 HEAD의 CI·PG17 성공 전에는 완료 선언하지 않습니다.


### 2026-11-07 — 기존 승인 개인정보 그래프와 신규 Record FK 분리, 과거 DB 검증 호환 복구

- **실패 근거:** [PR #3090 최신 Governance](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42365636485)에서 승인 당시의 고정 140 FK/59 테이블 그래프가 현재 149 FK/63 테이블 그래프와 혼합되어 실패했습니다. [DB 권한 검사](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42365636393/job/128383142704)에서는 단계별로 설치하는 Reader/청약철회 테이블이 없는 과거 DB에서도 신규 Saju 계정 삭제 함수가 해당 테이블을 참조하여 실패했습니다.
- **수정:** 140 FK 승인 그래프의 해시/정책 판정을 기존대로 유지하고, 신규 149 FK 그래프를 별도 현재 스키마 목록으로 관리하여 DB 검사의 정확한 목록 확인에 사용합니다. 계정 삭제 함수는 이전 단계에 아직 설치되지 않은 Reader·청약철회 테이블만 조건부 처리하며, 테이블이 존재하면 기존 실제 삭제·잔여 검사를 그대로 실행합니다.
- **불변 경계:** 승인된 금융 증거 P5Y 보존, 사주 개인 매핑 삭제, Reader 보호 콘텐츠의 외부 삭제 증거 요구, 미승인 운영 활성화 HOLD 및 PG17 통합 검증 계약을 변경하지 않습니다. 새 HEAD의 CI 통과 전 성공 미확정입니다.


### 2026-11-07 — 계정 삭제 경계 및 표준 DB 스키마 지문 회귀 정합화

- **실패 근거:** [PR #3090 최신 DB CI](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42366472499)에서 PostgreSQL17 통합과 Governance는 통과했지만, 기존 20개 PostgreSQL15 격리 사례가 동일한 새 전체 카탈로그 SHA-256 `22f9c1cac9d642e46ae2346902a7fbe335ea3a1d33f464e44640628fa8477d08`를 반환해 이전 지문과 불일치했습니다. 2330 계정 삭제 함수의 단계별 Reader/Claim 테이블 처리 보완이 SQL 함수 정의를 변경한 결과입니다.
- **수정:** 기존 `catalog_snapshot.sh`의 SQL 전체 정의, 제약·트리거·권한 검증은 완화하지 않고, 4개 DB 병렬 트랙/20개 독립 DB에서 일치하게 재현된 새 카탈로그 지문으로 고정값을 갱신합니다. 계정 삭제 시작 테스트의 비활성 Member 유료 Purchase Intent 차단 문구도 이미 승인된 Member-only 선행 검증 `LOGIN_REQUIRED`와 일치시킵니다. 요청 및 원장 상태의 안전 차단은 그대로 유지합니다.
- **미완료:** 새 HEAD에 대한 전체 CI/통합 PASS 및 PR 충돌 해소·병합 검증은 별개입니다. 운영 DB, LIVE 결제/환불/제공 및 공개 판매 경로는 변경하지 않습니다.


### 2026-11-07 — 기존 Reader 구매 테스트의 회원 전용 정책 충돌 복구

- **실패 근거:** [PR #3090 핵심 DB CI](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42367049323/job/128387240283)는 기존 Reader 통합 fixture의 구매 Subject를 이미 활성 인증 Member로 만들었는데, 연결 테스트가 과거 Guest 구매를 가정하고 그 Subject에 다시 Guest→Member promotion을 시도하여 `guest promotion requires an active unmerged guest subject` 오류로 중단됐습니다. 같은 HEAD에서 PostgreSQL15 개별 결제·권한·콘텐츠·런타임 DB 트랙, Governance 및 Web 검사는 통과했습니다.
- **수정:** 비운영 Reader 구매-Chat 연결 fixture에서 역사적 Guest 구매 재현용 임의 Guest Session/Promotion을 제거하고, 원본 구매 주체가 정확한 활성 Member/Auth ID 그대로인지 검사합니다. Reader Grant·Thread/Bundle·타 구매권 독립성 검증은 유지합니다.
- **경계:** Guest 무료 이용과 과거 Guest-owned 금융 기록 보존은 건드리지 않습니다. DB 스키마·실제 Checkout·금융 기록·Provider/환불 POST·LIVE 노출을 변경하지 않았으며, 새 CI 통과 전 PASS 미선언입니다.


### 2026-11-07 — 취소 웹훅 원본 ID별 PortOne GET 성공 증거 대조 보강

- **근거:** 공식 PortOne V2 취소 웹훅은 결제 전체 식별자 외에 개별 `cancellationId`를 제공합니다. 이전 read-only 재조합은 결제 전체의 `CANCELLED/PARTIAL_CANCELLED` 상태를 믿었으나, 서명된 **정확한 취소 ID**가 실제 GET에서 `SUCCEEDED`인지와 개별 취소 금액·누적 금액을 필수로 검사하지 않았습니다.
- **구현:** `commerce-signed-cancellation-private-reconciliation-v1.mjs`에 서명 알림의 취소 ID 의무화, GET 결과의 동일 취소 ID/상태/정수 금액/원본 Receipt 금액 대조를 추가했습니다. 완전취소 알림을 부분취소 조회 결과로 잘못 채택하는 경우도 HOLD합니다. 후속 완전 취소 때문에 오래된 정상 부분취소 알림이 재전달되는 사례는 개별 ID 성공 금액이 일치할 때 비권한 검토 결과로만 허용합니다.
- **검증·경계:** 내부 비운영 mock 회귀 4건 추가. Provider Event 기록기, 원본 Receipt·Grant·환불 데이터, 공개 API·웹훅 연결·실제 취소/환불 POST·운영 DB·판매 활성화는 변경하지 않습니다. 정확한 공급자 이벤트 순서 및 권한 회수 허가를 추정하지 않으며, 전체 CI 이전 PASS 미선언입니다.


### 2026-11-07 — Reader TypeScript/실DB 연결 회귀의 중복 Guest 전환 제거

- **실패 근거:** [PR #3090 핵심 DB CI](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42367519466/job/128388734751)에서 구매-Chat 연결 fixture가 통과한 직후, 별도 TypeScript/실DB 연결 fixture가 이미 활성 Member인 유료 Reader 구매자에게 다시 `cmd_promote_guest_v1`을 호출하여 `guest promotion requires an active unmerged guest subject`로 실패했습니다.
- **수정:** 테스트 전용 Guest 세션 생성·비회원 전환 호출을 없애고 동일 구매자의 Member 활성 상태와 기존 Auth ID를 검증한 뒤, 기존 구매 Grant 복원·Reader 첫 채팅 생성 및 별도 패키지 검사 로직을 그대로 수행하도록 갱신했습니다. 비운영 fixture 이외 운영 SQL, 승인 정책, 공개 API·LIVE·실제 환불 호출은 변경하지 않았습니다. 새 HEAD CI 통과 전 완료 미확정입니다.


### 2026-11-07 — 취소 검토 CI 테스트 입력 정합화

- **실패 근거:** [PR #3090 Work Track CI](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42368338149/job/128391169640)에서 새 취소 검증의 두 테스트가 실패했습니다. 부분취소 성공 응답에 실제로는 `Transaction.Cancelled` 알림을 사용했고, ID 누락 테스트는 기존 signed webhook parser가 DB/GET 전에 `authentication_rejected`를 반환했습니다.
- **수정:** 부분취소 사례는 정확히 `Transaction.PartialCancelled` 서명 알림으로 변경하고, 식별자 누락 사례는 먼저 실행되는 기존 서명/형식 검증의 거부 응답을 요구하도록 수정합니다. 취소 ID·성공 상태·정확한 금액을 필수로 대조하는 신규 검증 로직, 다른 Reader 격리 및 운영 실행 HOLD는 그대로 유지합니다. 새 HEAD 통합 CI 통과 전 PASS 미선언입니다.


### 2026-11-07 — 실DB TypeScript 인증 주체 정합화

- **실패:** [PR #3090 DB authority CI](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42368338149/job/128391169635)는 `official_reader_first_thread_typescript_postgres.sh`의 Member 소유 Purchase/Reader 데이터는 정상 생성했지만, 그에 대응하는 TypeScript 테스트가 Guest promotion 시절의 인증 ID `c1990000-...`를 계속 사용하여 `AUTH_REQUIRED`로 실패했습니다.
- **수정:** `test/postgres-official-reading-reader-first-thread-db.test.ts`의 verified auth fixture를 동 테스트 DB에서 실제 Member와 결속된 `11380000-...`로 변경했습니다. 실제 회원 검증은 유지하고, Reader 정책 보류·Bundle 불일치·처음 생성/재진입·Grant 회수 테스트를 완화하지 않습니다. 운영 서비스·결제·환불/고객 노출은 변경하지 않습니다. 최신 CI 통과 전 완료 미확정입니다.

### 2026-11-07 — 서명 취소 알림·원본 Receipt·전체 PortOne 취소 항목 집합 비운영 대조 연결

- **기존 공백:** 운영 비노출 `reconcileSignedCancellationPrivateV1`는 정확한 취소 ID의 단일 GET 및 기존 Event 조회까지만 시행했습니다. 별도로 작성된 `reconcileStoredPortOneCancellationSetWithGetPrivateV1`의 **전체 성공 취소 항목 HMAC·개별 금액·두 시점 DB 스냅샷 대조**를 서명 알림에 연결하지 않아, 한 개 웹훅이 실제 기록된 전체 취소 내역에 포함되는지 확인하는 결과를 돌려주지 않았습니다.
- **구현:** 내부 재조합 함수가 전용 `sourceHmacSecret`를 제공받으면 서명된 `cancellationId`의 HMAC을 계산하고 기존 read-only 전체 항목 대조기를 호출합니다. 대조기는 exact cancellation HMAC의 DB 원장 존재를 GET 이전과 이후에 확인하고, 성공 시에만 원본 Receipt·전체 성공 항목·현재 GET 일치 여부를 **읽기 전용 관찰** 결과로 표시합니다. 미제공/약한 키, 원장 항목 누락·불일치·역할 문제는 안전 보류합니다. 기존 Source/Provider Event 순서를 임의로 만들어내지 않습니다.
- **검증/경계:** 정확 항목 존재·누락과 서명 알림→전체 집합 합성 테스트를 추가했습니다. 운영 라우트, Provider 환불 POST, 계정 삭제, 실제 금액 변경·Grant 회수·LIVE 판매는 전혀 연결하지 않았습니다. CI 완료 이전에는 완료/PASS로 주장하지 않습니다.


### 2026-11-07 — 정확한 원본 Receipt ID의 내부 전체 취소 집합 대조 연결 복구

- **CI 근거:** [PR #3090 Commerce Work Track](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42369563243/job/128394786467) 신규 signed cancellation→전체 취소 집합 테스트가 1건 실패했습니다. `resolveCancellationOriginalReceiptPrivateV1`의 기존 내부 결과에는 원본 Receipt UUID가 누락되어, 전체 집합 대조기가 정확한 Receipt를 찾을 수 없어 안전 보류했습니다.
- **수정:** 기존 동일 SQL에서 이미 검증 중이던 `verifiedReceiptId`를 **사설 운영 Resolver 반환에만** 추가했습니다. 기존 공개/일반 read-only 판정 API는 식별자를 노출하지 않습니다. 사설 조회에서 정확한 Receipt·결제 거래번호·금액·통화 결속과 malformed ID 거부를 별도 회귀 검증합니다.
- **보존:** 취소 전체 내역 대조는 read-only, Provider 순서와 법정 환불/권한 회수 확정은 계속 HOLD. 운영 PG/환불 POST, LIVE, 공개 라우트/DB 적용 없음. 새 HEAD CI 통과 전 성공 미확정.


### 2026-11-07 — 기존 취소 Provider Event의 원본 Receipt 및 서명 본문 결속 검증

- **미완료 경계:** 서명 웹훅·PortOne GET·전체 취소 집합이 검증되더라도, 별도 읽기 전용 `inspectExactCancellationProviderEventReadinessV1`는 **기존 이벤트 원본 Receipt ID 또는 signed raw payload HMAC** 일치 여부를 요구하지 않았습니다. 같은 외부 이벤트 ID와 거래번호만으로 기존 Event ready를 보고할 수 있었습니다.
- **구현:** 기존 `commerce_provider_events`에서 `payload_fingerprint` 및 이미 최소화해 기록한 `verified_payload_jsonb.signedPayloadHmac`를 함께 읽고, 서명 원본 바이트로 계산한 `portone-cancel-signed-v1` HMAC과 **두 필드 모두** 일치해야 사설 Event ready로 판단합니다. 원본 Receipt ID는 `verifiedReceiptId`를 그대로 대조합니다. 테스트 입력에서 위조 영수증/서명지문, malformed HMAC를 추가해 보류 검증합니다.
- **범위:** 기존 Event writer 및 금전/권한 변경 없음, Provider 의미적 NEWER/STALE order와 법적 환불 권한은 여전히 미증명/HOLD입니다. 내부 검토만 개선하며 공개 Route·운영 데이터·실제 환불 POST·LIVE 판매 경로는 활성화하지 않습니다. 새 CI 통과 전 PASS 미선언입니다.


### 2026-11-07 — 정확한 Reader 구매권만 취소 이벤트 감사 범위로 제한

- **발견:** `inspectExactCancellationProviderEventReadinessV1`의 기존 `purchaseGrantCount/exactEventRevocationCount`는 Receipt에 붙은 **모든 종류의 Entitlement Grant**를 집계했습니다. 해당 이벤트에 비Reader 권한이 있으면 Reader 권한 지급·회수 확인을 오판할 수 있었습니다.
- **구현:** 두 수치 모두 기존 `standard_reading_reader_access_grants`와 **정확한 원본 Purchase Intent ID/Subject/Grant ID**를 결합한 Reader 구매권만 세도록 변경했습니다. 이미 회수된 건은 동일 Provider Event의 `entitlement_events.event_type=revoked` 및 `target_status=revoked`인 실제 효과만 인정합니다. 기존 DB 테이블·Reader 회수 Writer·원본 이벤트 중복 방지/서명·타 Reader 권한은 변경하지 않습니다.
- **검증:** 회귀 검사에서 Reader 접근권과 구매 ID/Grant 결속, 목표 revoked 상태를 확인하도록 보강했습니다. 이 감사는 관찰만 하며 개별 Provider 최신 순서·법적 환불·Reader/T2 잠금에 대한 권한을 발행하지 않습니다. 실제 결제, PG POST, 운영 스키마/공개 API/LIVE 변경 없음. 새 HEAD의 CI 통과 전에는 완료 미확정입니다.


### 2026-11-07 — 서명 알림의 특정 취소 건과 기존 Provider Event의 지문 결속 강화

- **발견:** 기존 사설 이벤트 감사는 원본 영수증 ID와 서명 원문 지문을 검증했지만, 같은 결제에 여러 부분취소가 있는 경우 **해당 이벤트의 `verified_payload_jsonb.cancellationIdHmac`**가 서명 알림의 정확한 `cancellationId`와 일치하는지는 요구하지 않았습니다. 전체 취소 집합 감사는 항목의 존재를 별도로 확인하므로 서로 다른 이벤트로 착각할 여지가 있었습니다.
- **구현:** `inspectExactCancellationProviderEventReadinessV1`에서 정확한 취소 항목 HMAC을 기존 이벤트의 `cancellationIdHmac`와 비교하고, 잘못된/누락된/형식 불일치 값은 읽기 전용 HOLD합니다. 내부 서명 검토기는 동일 원본 알림·키로 만든 항목 HMAC을 **기존 Provider Event 감사와 전체 취소 집합 감사 양쪽에 재사용**합니다.
- **검증/경계:** 같은 영수증의 다른 취소 건, 누락 지문, 잘못된 입력과 연결 파라미터를 회귀 테스트에 추가했습니다. SQL 후보·Provider 환불 POST·Entitlement Effect/Reader T2·운영 DB·공개 webhook·LIVE는 변경하지 않습니다. 새 CI 통과 전 완료 미확정, 공급자 최신 순서·최종 정산은 여전히 HOLD입니다.


### 2026-11-07 — 서명 웹훅·개별 취소 지문을 같은 Provider Event 행으로 일치시키는 대조 연결

- **확인된 공백:** 이전 전체 취소 집합 대조는 `cancellationIdHmac`가 원장 안에 존재하는지 확인했지만, 실제 서명된 `providerWebhookId`와 **동일 이벤트 행**에 결속되었는지는 증명하지 않았습니다. 서로 다른 3,000원/5,900원 부분취소 이벤트가 각각 존재하면 서명 웹훅을 다른 취소 항목에 잘못 연결할 수 있었습니다.
- **구현:** 기존 `commerce_provider_events.external_event_id`만 사설 SELECT에 추가하고, 서명 웹훅 ID·기존 Provider Event UUID(전달된 경우)·개별 취소 HMAC 중 전달된 식별자가 **하나의 동일 원장 행에서 동시에 일치**해야 전체 취소 집합 대조를 허용합니다. 첫 DB 스냅샷과 GET 후 스냅샷 모두 확인합니다. 서명 검토기에서 웹훅 ID를 직접 전달하고 `exactSignedWebhookIncluded=true`가 없으면 안전 보류합니다.
- **회귀/안전:** 서로 다른 취소 항목 혼동, 알 수 없는 웹훅, GET 사이 식별자 바뀜, 모의 증명 누락을 검사합니다. 기존 Provider Event·Receipt·권한 원장/DB 스키마/운영 API·환불 POST·LIVE는 변경하지 않습니다. 공급자 최신 순서·법정 환불·Reader T2 회수는 여전히 HOLD이며 새 CI 통과 전 완료 미확정입니다.


### 2026-11-07 — 서명 취소 ID를 기존 Reader S1 잠금·구매권 버전 검사에 연결

- **확인된 기존 구성:** 읽기 전용 현재 PortOne 전체 취소 집합 GET과 기존 `inspectLockedReaderRevokeCasPreflightV1`의 원본 Event→Reader Grant→S1 잠금·변경 버전 검사 흐름이 구현돼 있었으나, 서명 알림의 **웹훅 ID와 취소 항목 HMAC**을 같은 preflight 입력으로 전달하지 않았습니다.
- **구현:** `inspectCurrentCancelSetExactReaderLockedCasReviewV1`에 서명 검증 단계에서만 공급 가능한 `expectedProviderWebhookId + expectedCancellationIdHmac` 쌍을 선택적 내부 입력으로 추가했습니다. 둘 다 있으면 GET 이전 및 이후 동일 Provider Event 행 결속을 검증한 경우에만 기존 Reader S1 잠금·Grant 버전 검사를 실행합니다. 한쪽만 있거나 형식이 불량하면 DB 조회 전 거부하고, 묶음 증거가 누락·불일치하면 Reader 잠금 실행 전 HOLD합니다. `exactSignedCancellationBoundToEvent`는 읽기 전용 검토 결과일 뿐 권한이 아닙니다.
- **보존:** 기존 무서명 사설 검사 호출과 격리 테스트는 유지하되 서명 증명으로 표시하지 않습니다. 실제 Entitlement Effect·Reader T2 commit·환불 API·운영 DB/라우트·판매 활성화는 변경하지 않았습니다. 공급자 semantic NEWER/STALE 및 법정 최종 환불 권한은 여전히 미증명. 최신 CI 통과 전 PASS 미선언입니다.

### 2026-11-07 — 최신 PR CI 구문 오류 복구 (결제 트랙 재개 2)

- **기준:** PR #3090의 `da87f39c327b`. [Commerce Work Track 실패](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42372921096/job/128404672591)에서 3개 테스트 파일이 동일 내부 취소 검토 모듈을 구문 분석하지 못했으며, [PostgreSQL17 통합 실패](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42372921096/job/128404672799)에서도 `commerce-exact-reader-withdrawal-hold-pg17` 사례가 같은 모듈 로딩 오류로 종료됐습니다. 다른 검사를 전체 성공으로 간주하지 않습니다.
- **수정:** `scripts/operations/commerce-current-cancel-set-reader-locked-cas-review-v1.mjs`에서 서명 웹훅 ID와 개별 취소 HMAC의 쌍을 검증하는 `if` 조건문에 빠진 닫는 괄호 1개를 복원했습니다. 입력 검증 의미·기존 read-only HOLD 및 Reader 잠금/버전 사전검사는 변경하지 않았습니다.
- **검증:** 위 실패 로그와 수정 대상 소스를 직접 대조했습니다. 이 커밋의 GitHub Actions·PostgreSQL17 재실행 결과는 아직 확인되지 않았으므로 **PASS 미선언**입니다.
- **남은 과제:** 해당 HEAD의 Commerce, PostgreSQL17 및 전체 CI 재검증; 정확한 Provider 취소 순서/최종성 증거, 법정 환불 결정, 실제 Reader T2 원자적 회수, Reading 제공·청약철회·개인정보 삭제 통합 검증은 미완료 상태입니다.
- **운영 경계:** 운영 DB 적용·공개 결제/환불 API·실제 PG 취소 POST·Entitlement Effect 실행·LIVE 판매는 활성화하지 않았습니다. 승인된 P1–P5 로드맵 범위 유지.

### 2026-11-08 — 서명 취소 항목을 청약철회 증거 검토까지 결속

- **목표·로드맵:** 승인된 개발 로드맵 §6-1~3의 기존 취소 Event → Reader S1 범위 잠금/권한 사전 검사 → 정확한 유료 구매 단위의 고지·청약철회 증거 경로에서 취소 항목 결속을 유지합니다.
- **확인된 기준:** PR [#3090](https://github.com/gycha0109-beep/MyeongHa/pull/3090), 브랜치 `feat/commerce/saju-record-scoped-capability-v1-20261107`, 변경 전 SHA `6e1da706b6cdbac478afb127e0a04d0d453060f5`. [기존 전체 CI](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42377687416), Web Auth/Domain, Governance는 이 SHA에서 성공. PR은 여전히 open/unmerged입니다.
- **변경 파일:** `scripts/operations/commerce-exact-reader-withdrawal-evidence-hold-v1.mjs`, `test/commerce-exact-reader-withdrawal-evidence-hold-v1.test.mjs`, `docs/operations/COMMERCE_PAYMENT_WORKLOG.md`.
- **실제 구현:** 선택적 서명 웹훅 ID+정확한 취소 항목 HMAC을 한 쌍으로 검증해 이전 GET/원장/Reader 잠금 사전검사에 그대로 넘깁니다. 누락/변조 항목은 조회 전에 거부하고, signed 검토를 요청한 경우 동일 Event 항목 결속이 증명되지 않으면 구매·고지 SQL을 실행하지 않습니다. 기존 긍정 사전검사 결과에도 단일 성공 전액 취소 및 Reader S1 공통 잠금·재확인 확인을 추가했습니다.
- **테스트·CI:** 기존 Vitest 회귀에 signed pair 전달, 부분/오류 입력 사전 차단, 서명 Event 불일치·누적 부분취소·S1 미확인 HOLD를 추가했습니다. 신규 커밋의 실제 GitHub CI/PG17 **결과 미확인, PASS 미선언**입니다.
- **완료·미완료:** 이번 코드·회귀·기록 단위 구현 완료. 공급자 의미적 NEWER/STALE 순서, 법적 환불 판단, Reader T2 최종 권한 회수 실행, 실제 소비자 전달 완료, 백업 복원 후 privacy replay 및 전체 E2E는 미완료입니다.
- **브랜치·커밋·PR:** `feat/commerce/saju-record-scoped-capability-v1-20261107`, 변경 이전 `6e1da706b6cdbac478afb127e0a04d0d453060f5`, PR #3090. 본 기록과 변경 파일을 하나의 후속 커밋으로 반영합니다.
- **블로커·다음:** 새 HEAD의 전체 CI 결과를 확인하여 실패를 수정하고, 이후 승인된 로드맵의 미완료 결제/취소·권한 회수 연결을 진행합니다. 실제 PortOne 환불 POST·운영 DB·공개 checkout·LIVE는 실행하거나 활성화하지 않습니다. 승인 요청 없음.

### 2026-11-08 — 서명 취소 Event를 고지 재조회 시점에 다시 결속

- **작업 목표/로드맵:** 승인된 개발 로드맵 §6-1~3에 따라 인증 PortOne GET/취소 Event→Reader S1 잠금 이후 별도 청약철회 고지 재조회 트랜잭션에서도 같은 서명 취소 이벤트·항목이 유지되는지 검증합니다.
- **기준 브랜치·PR:** `feat/commerce/saju-record-scoped-capability-v1-20261107` / [PR #3090](https://github.com/gycha0109-beep/MyeongHa/pull/3090), 변경 이전 커밋 `5df87e208b3eeb68c22ef20d2e6cfdd24706601e`. 이전 커밋의 [Commerce CI](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42386850544/job/128445985797) 성공 및 Web/Governance 성공 확인. PostgreSQL17·DB authority는 조회 시 실행 중이었으므로 통합 성공을 추정하지 않습니다.
- **변경 파일:** `scripts/operations/commerce-exact-reader-withdrawal-evidence-hold-v1.mjs`, `test/commerce-exact-reader-withdrawal-evidence-hold-v1.test.mjs`, `docs/operations/COMMERCE_PAYMENT_WORKLOG.md`.
- **구현:** 기존 구매 단위 조회 SQL에서 동일 canonical `commerce_provider_events` 행의 `external_event_id`와 `verified_payload_jsonb.cancellationIdHmac`를 읽고, 서명된 취소 쌍 요청 시 이전 검사 값과 재비교합니다. GET/S1 잠금은 이미 해제되었으므로 새 읽기 전용 스냅샷에서 값이 바뀌거나 누락되면 사설 Reader 해석과 구매 고지 조회 전에 HOLD하고 ROLLBACK합니다. 기존 DB 원장/Writer/스키마 변경 없음.
- **테스트:** 기존 Vitest에 다른 웹훅·다른 취소 ID HMAC·이벤트 값 누락 시 비공개 소스·고지 미조회, 트랜잭션 ROLLBACK, 결과 식별자 비노출 검증을 추가했습니다. 새 커밋의 CI·PostgreSQL17 결과는 아직 미확정, PASS 미선언입니다.
- **완료/미완료:** 이번 사설 재조회 결속 코드·테스트·작업 기록을 함께 커밋합니다. 공급자 사건 NEWER/STALE 판정, 실제 Reader T2 원자 회수/Entitlement Effect, 법적 환불 결정, 소비자 전달 완료 증거, 복원 후 개인정보 replay, 전체 비운영 E2E는 미완료입니다.
- **커밋/다음/블로커:** 작업 전 `5df87e208b3eeb68c22ef20d2e6cfdd24706601e`, 이번 변경은 PR #3090의 새 커밋에 포함합니다. 새 CI를 확인해 실패를 복구하거나 통과하면 다음 미완료 기능을 진행합니다. 운영 PG 취소 POST·DB 적용·LIVE 공개 실행 없음. 승인 요청 없음.
