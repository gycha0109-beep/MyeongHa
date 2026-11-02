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
