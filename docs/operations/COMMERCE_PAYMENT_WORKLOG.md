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