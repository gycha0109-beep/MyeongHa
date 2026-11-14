# Saju 내부 상용 해석 정책 — MyeongHa 구매·발급·Reader 인계 (2026-11-13)

> 현재 상품·연동 판단의 정책 갱신. 대상: [Saju #2762](https://github.com/gycha0109-beep/Saju/pull/2762), [Saju #2763](https://github.com/gycha0109-beep/Saju/pull/2763), [MyeongHa #3174](https://github.com/gycha0109-beep/MyeongHa/pull/3174). 이전 pinned 실행 증거·과거 설계 결정은 이력으로 보존하며, 본 문서는 실제 출시 또는 금전 거래를 승인하지 않는다.

## 확정 결정

1. 명하의 해석은 **제품 소유자가 채택한 내부 계산·서비스 해석 규칙**을 기준으로 검증한다. 추가 논문, 명리 전문가/기관 승인, 전체 학파 통합을 **출시 선행 조건으로 요구하지 않는다**. 과거 서지·원문 증거는 삭제하지 않는다.
2. 실제 입력·원국/대운/서울 기간·상대 2명식·해석 규칙 버전과 Korean Reading의 **정확한 대응**은 필수다. 지원하지 않는 용신 강약·관계 결과 예언을 생성하지 않는다. 외부 문헌 미비가 다른 검증된 내부 풀이를 일괄 보류할 이유는 아니다.
3. 이미 작성된 구매·발급 경계는 그대로 유지한다: 승인된 Offer/가격, Birth revision, Record, 결제 Origin, 대행사 확정 영수증, 서명/해시 검증, nonce 및 재시도·중복 방지, 상대의 처리 동의·철회, 환불/취소 후 Grant 차단, Reader 재열람, 민감정보 최소화·운영 복구.
4. `source`, `grounding`, `authority`, `proof`, `signature` 기술적 출처·무결성 장치의 이름만 보고 비활성화하지 않는다.

## 실제 현재 인계 격차

| 경로 | 계산·의미 측면 | 발급·구매 측면 | 현재 결론 |
| --- | --- | --- | --- |
| 연운 | Saju #2762에 서울 선택년/입춘 구간·원국·대운 및 기존 T9 후보 의미와 Reader 기간 사실 계산이 있다. 내부 검증된 규칙만 정식 소비자 문장으로 확정해야 한다. | 승인된 구매 연도·Birth revision·요청 해시와 Saju 정식 발급 Release의 정확한 연결 및 연도별 Reader 재열람 확인 필요 | **내부 해석 준비는 별도 확인, 판매 HOLD** |
| 월운 | Saju #2762에 절입 전후 계산과 월주·원국 맥락이 있다. 각 구간의 실제 핵심 의미와 모순·시각 미상 검증이 필요하다. | 요청한 서울 달력월·두 절입 구간, signed source 및 Reader의 기간 완전성 확인 필요 | **내부 해석 준비는 별도 확인, 판매 HOLD** |
| 관계 첫 비교 | Saju #2763은 두 원본 명식·합충 계산·조건부 한국어 내부 해석 시안을 갖는다. 별도 Official 소비자 Reading 계약으로 입증되기 전 연구용 내부 시험 경로다. | 상대 처리 동의·원본 명식 두 건·Origin·서명·중복 발급·Reader | **실제 해석/발급 연결 미완료, 판매 HOLD** |
| 관계 추가 비교 | 동일 본인과 서로 다른 상대 명식·각각의 독립 구매/동의/발급을 구별해야 한다. | 상대별 Grant·이미 지급된 첫 비교 이후 상품 구성·동의 상태 변경 검사 | **판매 HOLD** |
| 본인 관계운+첫 비교 | 원국 T8과 T10을 단순 병치하지 말고 각각의 해석 출처와 범위를 보존한다. | 묶음 구성의 두 해석 모두 정확한 구매·서명·Reader 경로 검증 | **판매 HOLD** |

**검토한 실제 MyeongHa 현재 코드:** `apps/api/src/commerce-approved-saju-purchase-admission-v1.ts`는 각 구성의 Offer/현재 승인 Release를 확인하며, `apps/api/src/saju-production-reading-issue-source-v1.ts`는 Saju issuer 서명·기간·원본 해시·발급 맥락을 검증한다. 이들은 '학술 전문가 승인'이 아니라 **기술·권리·운영 계약**이다. 해석 정책을 바꿨다는 이유로 이 보호 장치를 우회하지 않는다.

## 출시 적격성 판정의 두 단계

**① 해석 트랙 준비:** 채택 내부 의미 규칙 구현, 실제 사람·기간 입력에 대한 문단/모순/지원 범위 검사, 서명된 Saju Official Artifact 및 정확한 MyeongHa Reader 연결의 통합 검증, 관련 로드맵/이슈 갱신이 확인될 때만 완료.

**② 전체 판매 개시:** ① 이후에도 실제 결제/PortOne, 운영 DB, 민감정보 및 동의/철회, 환불·복구, 운영 배포와 정책을 각각 증명해야 하며 자동 판매 열림이 아니다.

**이번 변경:** 현재 연결 정책을 교체·문서화한 것. 아직 해석이 완성되지 않은 범위를 '완료'로 만들거나 테스트용 승인/Release를 운영에 허용하지 않는다. 실제 코드·테스트·CI는 각 PR 커밋과 별도로 추적한다.

## 2026-11-13 추가 구현 — 연·월운 서명 발급 및 재열람의 동일 근거 보존

- **발급 시** `apps/api/src/saju-production-reading-issue-source-v1.ts`의 실제 검사에서 연운/월운이라면 호출자 옵션이 비활성 상태여도 두 기간을 모두 포함하는 **서명된 원본 Reader 자료**를 요구한다. 구매 기간·원본 응답·문단 연결을 임의로 우회하지 않는다.
- **보관함에서 다시 열 때도** 같은 자료가 없거나 서명·원본 해시·연/월 기간이 불일치하면 복원을 거부한다. 종전의 '서명은 있지만 Reader 원본이 없는 유료 연·월운' 자료를 정식 해석으로 간주하지 않는다. 비기간 상품의 기존 계약은 그대로 둔다.
- `apps/api/src/saju-production-reading-temporal-issue-source.test.ts`에서 월운/연운의 실제 두 구간 서명→보관→Reader 설명 유지, 소스 없는 유효 서명 거부, 연운·월운 구매 범위 바꾸기 거부를 검증한다.
- **업스트림 Saju** `src/host/production-reading-issue-proof.ts`도 연·월운 원본이 없으면 서명 자체를 발급하지 않도록 맞췄다([Saju #2762](https://github.com/gycha0109-beep/Saju/pull/2762)).
- **미완료:** 명하 내부 채택 T9 본문을 실제 Official 해석으로 확정·승격하는 검증, 구매/동의/서명·운영 DB·실결제·환불·복구 E2E; T10 세 관계 비교 상품의 두 명식 보호 발급과 상대 동의·Reader 결속. 기존 임시 실행 데이터를 운영 승인으로 취급하지 않는다.

## 2026-11-13 관계 비교 연구 인계 추가 구현

- Saju #2763의 사내 채택 T10 일지 합·충/양면성 설명을 **서명된 비공개 두 명식 검토 응답**으로 이관한다. 기존 자체 계산/출처 감사 및 명하 구매/동의/발급 주체를 바꾸지 않는다.
- `apps/api/src/saju-held-pair-review-v1.ts`는 검토 응답의 **두 사람 계산 해시, Saju 관측 사실 경로, 내부 규칙/문장, 관계 결과 비단정 및 연구용 미판매 상태**를 확인하며, 서명 응답이더라도 실제 명식 원본에서 벗어난 설명이나 `readyForOfficialIssue=true` 반환을 거부한다.
- 연관 테스트 `apps/api/src/saju-held-pair-review-v1.test.ts`는 정상 서명 연구 검토·인물 해시 바꾸기·허구 근거 경로·공식 발급 승격 시도 거부를 검사한다.
- **남은 필수 단계:** 첫 상대/추가 상대/본인 T8+첫 상대 구성 각각의 구매·동의·출생 revision/상대 권리, **서명된 Official T10 Reading** 발급, Reader 보관함/재열람, 환불/철회·실결제·운영 복구 E2E. 현재 연구 검토 통과는 발급/판매 허가가 아니다.

## 2026-11-13 — 관계 비교 3상품의 결제 당시 선택·동의·두 명식 묶음 검증

- **기존 공식 발급 블로커 유지:** 현재 Saju 생산 발급 및 MyeongHa 발급 작업자는 단일 본인 명식 처리만 구현되어 있고, 관계 비교 `compatibility` 발급을 의도적으로 차단한다. 내부 서명 검토 결과를 운영 Grant로 승격하지 않는다.
- **이번 실구현:** `docs/operations/candidates/commerce_approved_saju_issuer_facades_v1.sql`의 `qry_approved_saju_pair_issue_scope_v1`은 기존 구매·현재 동의 잠금 검증을 통과한 다음, *동일한 승인 구매 기록*에서 정확한 상품 `first-counterpart` / `additional-counterpart` / `relationship-plus-first`, 첫/추가 상대 구분, 상대 ID, 사용 동의 승인번호를 읽어 반환하도록 확장했다. 외부 요청의 상품명을 신뢰하지 않는다.
- `apps/api/src/postgres-approved-saju-issue-scope-v1.ts`는 DB가 읽은 선택이 승인된 3개 상품의 구성/순서와 일치하는지, 두 출생 revision이 다른지, 상대 식별값/동의 번호가 유효한지 검사한다. 결합 구매만 `['relationship','compatibility']`, 다른 두 상품은 `['compatibility']`로 별도 유지한다. 산출된 `paidComparison.authorizedForIssue=false`는 그대로다.
- `apps/api/src/postgres-approved-saju-issuance-v1.ts`의 비공개 두 명식 소스 검토에서는 **해석 요청 전·후** DB 조회에서 상품·상대·승인번호·구성·해석 요청 해시·명식 revision·Release가 그대로인지 다시 검증한다. 구매 취소·동의 철회·상대 변경 시 신규 확인에서 null/HOLD를 유지한다.
- **검증:** `apps/api/src/postgres-approved-saju-pair-issuance-scope-v1.test.ts`와 `apps/api/src/postgres-approved-saju-pair-offer-handoff-v1.test.ts`에서 세 상품·양 명식·동의 및 구매 변경 거부를 검사한다. 이 작업의 SQL은 배포된 마이그레이션이 아니라 후보 문서이므로 운영 DB 적용이나 실제 결제 테스트 완료로 간주하지 않는다.
- **다음 필수:** 공식 T10 이중 명식 서명 Source 계약, 관계 구성별 DB 발급 작업, 실제 동의/철회/구매 영수증·중복발급·환불/Reader E2E. 기존 명하 운영 판매 HOLD.

## 2026-11-13 — 관계 비교 두 명식 원본 Reading 자료 검증

- Saju #2763에서 두 명식의 일간·일지 및 타주 합충을 독립 원본 경로와 연결해 조건부 **고객 한국어 풀이**를 보강하고, `saju-t10-pair-reading-material-v1`에 두 원국 식별값·각 문장/규칙/근거의 해시·전체 자료 해시를 결합했다.
- `apps/api/src/saju-held-pair-review-v1.ts`에서 이 자료를 기존 Bearer/Ed25519 서명 검증에 이어 확인한다. 잘못된 명식 대응, 문장·해시 변경, 원본 미첨부, 연구용 결과의 자의적 발급 승격을 거부한다.
- **현재의 한계:** 계약은 **비공개 서명 검토/정식 발급 준비 자료**이지 Saju Production Pair Issue Proof나 고객 저장/Reader 결과가 아니다. 최초·추가·결합 구매의 정식 전용 Issuer/서명/DB 연결은 구현하지 않았으며 실제 구매·동의/환불·복구 무결성 미충족 상태에서 판매를 열지 않는다.

## 2026-11-14 — T10 정식 두 명식 Source 서명·구매 재검증 구현 경계

- Saju #2763에서 Preview와 별도 Production Pair Issue Proof 계약 및 인증된 두 명식 발급 경로를 구현했다. 해석 정책·각자의 Canonical 계산·고객 한국어 문장별 근거·실제 발급 시도·구매/상대 동의·Revision·Release 전체를 Ed25519로 결속한다.
- 명하 #3174의 `saju-t10-production-pair-issue-source-v1.ts`는 전용 공개키·서명 영역·만료·구매/동의/출생 Revision·원본 내용·문장 해시를 검증한다. `verifyApprovedSajuPreparedPairIssueV1`는 DB에 존재하는 발급 시도를 요구하며 출처 호출 전후 현재 구매/동의를 재확인한다. 세 관계 비교 상품별 분리와 교체 거부 테스트를 추가했다.
- **여전히 미발급 상태:** 이 시점의 정식 Source 검증은 DB에 공식 Reading을 확정·보관하거나 Reader 접근 권한을 부여하지 않는다. 별도 두 명식 DB 확정/서명 아카이브/Reader 복원·묶음 T8/T10·중복/환불/철회 통합 검증이 필요하다.
- 기존 자기 명식 발급 Worker의 `compatibility` 차단을 유지한다. 후보 SQL을 운영 반영으로 간주하지 않고 판매·실결제·배포는 HOLD. 외부 학술 감수는 별도 승인 조건으로 요구하지 않는다. `ROADMAP_IN_PROGRESS`.

## 2026-11-14 추가 — 별도 T10 발급 작업자·서명 보관·Reader 재열람 구현

- T10은 개인 명식용 기존 Worker에서 compatibility 차단을 유지하고, `approved-saju-t10-pair-issuance-worker-v1.ts`로 별도 발급을 준비·검증한다. 이전 발급 시도가 존재하면 새 Source 호출을 중지하고 재조정 대상으로 보류한다.
- `commerce_approved_saju_pair_issuer_v1.sql`은 **운영 미적용 후보**로, 구매·상대 동의·양쪽 출생 Revision·해석 문장 대조와 기존 Reading 확정 및 Ed25519 서명 원본 보관을 하나의 DB 트랜잭션으로 연결한다. 정식 서명 자체는 TypeScript에서 검증하며 DB는 확인된 원본과 거래 범위를 다시 대조한다.
- `postgres-approved-saju-pair-official-commit-v1.ts`, `postgres-approved-saju-pair-reader-v1.ts`가 저장된 원본과 두 사람 해시를 재확인하고 환불/철회 등 현재 Grant가 없는 접근을 거부한다. `approved-saju-t10-pair-reader-http-v1.ts`는 기존 Reader HTTP 호스트의 명시적 opt-in에서만 활성화하며 로그인한 구매자와 해당 Reader에 한정한다.
- 관계운+첫 비교 구매는 관계운(T8) 발급과 궁합(T10) 발급을 다른 Reading으로 유지한다. 새로운 가격·상품은 추가하지 않았다.
- 추가 검증·운영 DB 적용/복구·배포·실결제는 남아 있다. 운영 결제와 판매 활성화는 HOLD, `ROADMAP_IN_PROGRESS`.

## 2026-11-14 — 실제 Saju 정식 서명과 명하 T10 Reading·Reader 저장물 계약 교차 검증

- **기준:** Saju [#2763](https://github.com/gycha0109-beep/Saju/pull/2763)에서 3종 검사 통과가 확인된 정확한 커밋 `8278c8cb72ae6dcbb7bd7edb8fb44b07c47c53b9`을 별도 저장소 체크아웃으로 고정한다. 명하 자체 서명 모의값 대신 **실제 Saju Production 호스트**가 두 개의 Canonical 명식과 한국어 원본 자료를 계산·Ed25519 서명한다.
- **새 전용 CI:** `.github/workflows/saju-t10-pair-production-cross-service-e2e.yml`은 실제 Saju 호스트를 로컬 격리 프로세스로 띄워 `test/saju-t10-pair-production-cross-service.e2e.test.ts`를 실행한다. 서명한 원본을 명하 Production Pair Source 검증기에 통과시켜 첫 상대·추가 상대·본인 관계운+첫 비교 **3개 구매 구성**별 양쪽 출생 Revision·원본 해시·조건부 한국어 문단의 동치를 확인한다.
- **별도 서명 보관 재열람 경계:** 동일 원본을 저장하는 상황을 DB 조회 모의로 구성하여 실제 `readPostgresApprovedSajuT10PairReaderV1` 경로에서 서명·구매 식별·Reader·반환 문단을 재검증한다. 구매/상대 동의 범위가 소멸하거나 Reader가 다르거나 보관 서명이 바뀐 경우 재열람 불가를 확인한다. 이는 **운영 DB 연결 테스트가 아니라 서명 원본을 사용한 Reader 계약 검증**이다.
- **이미 있는 PostgreSQL 17 후보 검증과 범위 차이:** `test/db/commerce_approved_saju_purchase_scope_pg17.sql`은 별도로 후보 DB의 저장·구성·취소/철회 구조를 검사한다. 두 검증을 결합해도 실제 운영 결제·운영 DB 설치·복구/계정 삭제·민감정보 정책 및 공개 판매의 증명으로 자동 승격하지 않는다.
- **상태:** T10 로드맵 5단계 실발급 교차 검증을 일부 전진시켰으며, 전체 운영과 판매는 HOLD, `ROADMAP_IN_PROGRESS`. 신규 CI의 성공 여부는 해당 커밋 결과를 별도 확인한다.

## 2026-11-14 — PostgreSQL 17 T10 발급·불변 원본·환불 후 보관함 차단 보강

- **검증 위치:** 기존 `test/db/commerce_approved_saju_purchase_scope_pg17.sql`의 **실제 PostgreSQL 17 거래/제약 함수**에서 T10 Finalizer가 서명 원본과 고객용 한국어 문장을 함께 확정하는 구간을 확장한다. 변조한 한국어 블록을 제출하면 확정을 거부하고 서명 원본이 기록되지 않는지 확인한다.
- **구매 단위 무결성:** 본인·상대 Birth Revision, 실제 Offer/상대 처리 동의, 구매 요청 해시, Release, 최초 실행 ID와 Reader에 보이는 문단 순서가 DB에 보관된 증거와 일치해야 한다. 동일 Reading/시도에 **다른 서명 원본을 다시 제출해 교체할 수 없는지** 확인한다.
- **환불 범위:** 본인 T8+첫 T10 묶음을 전액 취소한 경우 **두 결과와 T10 증거의 현재 열람 권한을 모두 차단**한다. 첫 상대 비교를 환불하더라도 별도 유료 구매인 추가 상대 비교의 발급·보관함은 유지되어야 하고, 취소된 건의 비공개 증거는 구매자가 읽을 수 없어야 한다.
- **검증의 정확한 범위:** PostgreSQL 17 시나리오는 합성 구매 기록과 형식 검사용 서명 데이터를 사용하므로 **실제 Ed25519 서명 검증 완료 또는 운영 DB 반영의 증명은 아니다**. 실제 Saju 호스트 서명 검증은 별도 고정 커밋 기반 교차 서비스 CI가 담당한다. 판매·운영 발급·실제 결제·복구는 계속 HOLD, `ROADMAP_IN_PROGRESS`.

## 2026-11-14 — T10 발급 후 큐 완료 누락의 비재발급 복구 검증

- **경계:** 정상 발급 DB 확정은 되었으나 Outbox 완료 표시 이전에 작업자가 중단된 경우, 원본 Source를 다시 호출하지 않는 기존 정책을 유지한다. `already_issued` 상태에서는 단순 서명 증거 행의 존재만으로 작업 완료를 허가하지 않는다.
- **새 전용 후보 조회:** `commerce_approved_saju_pair_issuer_v1.sql`의 `qry_approved_saju_pair_recovery_record_v1`은 현재 유료 Grant와 상대 처리 동의가 유효하고 이미 확정된 T10 Reading·서명 증거가 연결된 건에 한해 원래 Reading ID와 Reader ID만 반환한다. 실제 계산/서명 내용을 임의로 재생성하지 않는다.
- **작업자 복구:** `approved-saju-t10-pair-issuance-worker-v1.ts`는 해당 ID로 **기존 Reader 보관본을 재열람**하여 원본 Ed25519 서명, 서명 수락 시점, 당시 두 명식·해석 문단, 현재 구매/동의·Reader/Grant를 검증한 경우에만 Outbox 완료를 표시한다. 증거·권한·서명·Reader가 맞지 않으면 보류하고 새 발급을 하지 않는다.
- **검증:** 작업자 단위 검사에서 유효/변조/누락/동의 해제 복구 경로를 나누고 PostgreSQL 17 후보 검사에서 발급 전·정상 확정 후·상대 동의 철회·묶음 환불·첫 상대 환불 및 별도 추가 상대 발급 권한을 점검한다.
- **한계:** 개발용 합성 구매 DB 검사는 운영 권한/운영 DB 배포/실제 결제/재해 복구 승인에 해당하지 않는다. Saju 실서명 교차 서비스 시험은 별도 CI이며, 출시·운영 DB 적용과 판매는 HOLD, `ROADMAP_IN_PROGRESS`.

## 2026-11-14 — T10 신규 발급 권한만 중단하는 격리 DB 연습

- **추가 후보:** `docs/operations/candidates/commerce_approved_saju_pair_issuer_hold_v1.sql`은 전용 T10 Scope 조회·공식 확정·보관본 복구 위치 조회의 세 권한만 발급 역할에서 철회한다. 이를 운영 적용하거나 실행 중인 작업자를 자동 중지하는 기능은 없다.
- **보존 조건:** 공용 서명 원본 조회 및 한 명식 발급 역할은 유지하고, 고객 구매·기존 Signed Reading·Grant·대기 작업은 삭제하지 않는다. 작업자를 먼저 멈추는 절차는 `docs/operations/SAJU_T10_PAIR_ISSUER_HOLD_REHEARSAL_20261114.md`에 기록했다.
- **실제 검사:** 기존 PostgreSQL 17 격리 구매·환불·Reader 시나리오 뒤 동일 트랜잭션에서 권한 철회 후보를 적용하고, T10 신규 발급 권한 차단·한 명식/서명 조회 권한 보존·서명 원본 내용 지문 불변을 점검한 다음 ROLLBACK한다. **운영 DB 변경/판매/배포는 수행하지 않는다.**
- **남은 것:** 실제 운영 환경에서의 승인된 실행·복구 절차와 PortOne 실결제, 개인정보·권한·운영 관측 증거는 별도. `ROADMAP_IN_PROGRESS`, 판매 HOLD.
