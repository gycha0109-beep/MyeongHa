# 명하 기록 · 공식 사주 보고서 구현 로드맵 (2026-10-27)

## 2026-10-30 확정된 Records 범위 — 명식록·대리가 기억 중복 제거

- **최신 사용자 결정:** 기록 페이지는 `사주 보고서`와 `현세록`만 제공한다. 기존 기록 페이지의 `명식록`과 `대리가 기억`은 마이페이지에 이미 존재하므로 기록 페이지에서 **탭·본문·전용 상태·렌더러·조회 호출을 제거**한다. 아래의 4탭·명식록/기억 보존 서술은 과거 단계의 설계 기록이며 재도입 지시가 아니다.
- **구현 정본:** `apps/web/src/records/RecordsPage.tsx`는 공식 보고서와 현세록 탭만 출력하고, `apps/web/records-page.js`는 해당 데이터만 렌더링한다. `apps/web/records-runtime-client.js`의 페이지 단위 `readRecords()`는 `/api/me`, `/api/life-record`, `/api/readings`만 조회하며, 기록 전용 출생정보·기억 조회/Grant 철회 UI는 더 이상 없다. 마이페이지·서버 API의 해당 기능은 건드리지 않는다.
- **연동 링크:** 공식 보고서에서 현재 명식 확인은 제거된 `records.html?tab=birth`가 아닌 `my.html`로 이동한다. 공식 보고서에 표시되는 발행 당시/현재 출생정보 차수는 별도의 권한 검증된 보고서 메타데이터이며, 삭제된 기록 페이지의 현재 Birth 조회를 복구해서는 안 된다.
- **검증:** PR [#2757](https://github.com/gycha0109-beep/MyeongHa/pull/2757)의 `7ed505cfcb022cd7b9d366d63fbd4ee4a43aa1cb`에서 관련 CI 13건 전부 GREEN. 자동 병합/중간 병합 금지와 Saju Production·Commerce·Reader HOLD는 그대로 유지한다.

## 2026-10-30 최신 통합 PR 및 기록 화면 S0 후속 구현

- 실행 트랙은 계속 `frontend-integration`이다. 기존 PR [#2670](https://github.com/gycha0109-beep/MyeongHa/pull/2670)은 긴 커밋 이력의 보안 검사 오탐을 분리하기 위해 **병합 없이 종료**되었고, 작업 파일과 HOLD 계약은 후속 단일 통합 PR [#2757](https://github.com/gycha0109-beep/MyeongHa/pull/2757)로 승계했다. 아래 #2670 참조는 당시 작업 이력이며 **현재 병합 대상은 #2757**이다.
- PR #2757의 자동 병합을 해제했다. 본 문서의 **S0 통합 완료·실제 Production/Commerce/Reader 게이트 확인 전 main 중간 병합 금지**가 계속 우선한다.
- 1단계 S0 권한 보호: `apps/web/records-page.js`에 로딩 시작·종료 시 동일 브라우저 owner 검사, 계정/세션 변경 이벤트·탭 복원 시 owner 재검사, 보호 목록/프로필 DOM 및 캐시 폐기를 구현했다. 이미 읽은 다른 계정의 기록을 언어 전환으로 다시 표시하지 않는다. 변경 안내는 5개 언어의 정적 UI로만 번역한다.
- 6단계 S1 접근성: 기록 탭의 기존 좌우 화살표 탐색에 `Home`(첫 탭)·`End`(마지막 탭)를 추가했다. 기존 보고서 중심 첫 탭과 깊은 링크는 변경하지 않는다.
- 관련 범위 회귀 검사: `apps/web/records-saju-surface.test.ts`. **이 변경의 GitHub Actions 최종 PASS 여부는 해당 PR 최신 HEAD 체크를 별도로 확인해야 한다.** 기존 Production Saju `NO_BUILD`·상품 판매 HOLD·운영 DB 미변경 원칙을 유지한다.

> **트랙:** `frontend-integration` (기록 화면·보고서 읽기), 기존 Saju / DB·Privacy / Reader / Commerce 작업은 각 정본 구현을 소비한다.  
> **목표:** 첫 유료 사주 상품의 **공식 Reading 생성 → 보호 저장 → 구매권 확인 → 기록에서 상세 보고서 재열람 → 첫 Reader 연결**을 재사용 가능한 코드로 완성한다.  
> **현재 상태:** 기존 Records 읽기 기반은 구현되어 있으나 **첫 유료 보고서 생성·구매·재열람의 운영 종단 간 경로는 미완료**. 본 문서는 **구현 순서**이지 상품 판매·권한·운영 DB·Saju Production 활성화 승인이 아니다.  
> **출시 범위:** `saju.general_natal.deep.v1` (정밀 원국 리포트) **한 종류**를 기준으로 한다. 출생 정보 변경 시에는 같은 활성 구매권으로 신규 revision의 재생성을 허용하되 과거 결과는 보존한다. Career/Wealth/Relationship/Annual 등은 확장 후보일 뿐 최초 출시 상품에 포함하지 않는다.  
> **원칙:** 기존 기능 중복 구현 금지 · 현재 저장소의 실제 경로 재사용 · 독립 작업부터 구현 · 기능별 1~2개 필수 테스트 · 최종 통합 검증 · HOLD 우회 금지.

## 2026-10-29 S0 후속 구현 — 발행 당시 명식 / 현재 명식 비교

- **확인된 실제 DB 정본:** `reading_sessions.source_birth_revision_id`는 발행 당시 참조이고, `birth_profiles.current_revision_id`는 해당 SELF 프로필의 현재 차수다. `birth_profile_revisions`의 `revision_no`를 각각 읽어 비교한다. 기존 API 실행 역할은 해당 원본 테이블을 직접 SELECT할 수 없다.
- **최소 권한 경계:** 기존 `qry_official_reading_record_runtime_v1`의 owner/current exact Grant 검사를 먼저 통과한 경우에만 새 서버 전용 `qry_official_reading_birth_revision_status_v1`가 같은 DB Subject 트랜잭션에서 원본/현재 차수와 `current | changed | unknown`을 제공한다. 소유자/현재 Grant가 없는 보고서는 메타데이터도 공개하지 않는다. 이미 적용된 1735 마이그레이션은 그대로 두고 **새 후속 마이그레이션** `20261029094500_records_official_birth_revision_status_v1.sql`로 분리했다.
- **정확한 구분:** 발행 당시 source와 현재 revision이 같은 SELF Birth Profile일 때만 `current` 또는 `changed`를 판정한다. 과거 기록에서 출처가 없거나 SELF 프로필이 아닌 경우 `unknown`으로 유지한다. 유효한 차수가 없다고 새로 추산하지 않으며, 내부 Birth revision UUID 및 출생 원문은 클라이언트에 노출하지 않는다.
- **화면:** 공식 보고서의 발행 당시/현재 차수 및 변경 상태를 표기한다. 명식이 달라져도 저장된 본문·해시·발행일을 변경하지 않는다. 새 명식 기준 **유료 재생성은 승인된 구매권/발행 경로 전까지 비활성**이다. 계정 전환 시 차수 표시도 제거하며 다국어 UI 문구 5개 언어를 유지한다.
- **회귀 검사:** API current/changed/unknown/invalid, 웹 계약, DB 권한 가드와 disposable PG17에서 변경 전후 동일 공식 보고서 확인 검사를 추가했다. **로컬 disposable PostgreSQL 17 마이그레이션 201개 적용, DB 카탈로그 해시 검증·ACL negative·공식 보고서 HTTP E2E 통과**이므로 완료를 주장하지 않는다. 운영 DB에는 본 트랙 마이그레이션을 적용하지 않았다.
- **실행 증거:** 일회용 `myeongha_ci_case_2901`에서 201개 유효 마이그레이션 적용 후 카탈로그 SHA-256 `116ef373f647baccc9fc53386129d444fa83e5577fdbb86392e44ff1af90d38e` 산출·검증. `api_role_acl_negative`, `schema_usage_authority_model_negative` PASS. 실제 PostgreSQL 연동 HTTP E2E는 무권한 401, 철회된 권한 404, 활성 구매권 원본 재열람, 명식 revision 1→2 변경 시 공식 원본 불변, 재철회 404를 검증했다. 관련 Vitest 35개 PASS. GitHub Actions 최신 HEAD 결과는 별도 확인 대상이다.
- **배포 기준:** 사용자 확정 Cloudflare Worker이며 과거 배포 사업자의 검사를 이 트랙 블로커로 취급하지 않는다. Saju Production issuer와 Commerce 유료 활성화 HOLD는 그대로다.

## 2026-10-29 이어서 구현 — 12개 상품 동일 진입 화면

- `apps/web/src/reading/ReadingPage.tsx`의 4개 주력 상품 + 접힌 8개 추가 상품 구조를 없애고 **12개 상품을 하나의 `sajuProductTopics` 카탈로그·동일 카드 그리드**에 표시한다. 이는 판매 활성화 순서나 Saju 연구 8메뉴의 우선순위가 아니다.
- 기존 12개 주제별 정확한 URL과 현재 Preview 허용 목록을 유지한다. **실제 허용된 Preview 5개만 읽기 링크를 제공**하고 나머지 7개는 서비스 준비 중으로 표시해 미지원 경로를 상품 구매 동작처럼 제시하지 않는다.
- 공식 보고서의 저장·재열람 UI와 Owner/Grant 검사는 기존 계약을 유지한다. 아직 Saju Production issuer가 승인되지 않았으므로 상품 카드 추가를 공식 발행·판매 완료라고 취급하지 않는다.
- 관련 구현·레이아웃: `apps/web/src/reading/ReadingPage.tsx`, `apps/web/saju-preview-landing.css`; 화면·라우트 표면 검사: `apps/web/saju-reading-readiness.test.ts`, `test/web-reading-availability-ux.test.ts`, `test/web-golden-master-layout.test.ts`.
- Saju 정본 `docs/product/22-production-interpretation-authority-audit.md`는 2026-10-29 재확인 기준 **NO_BUILD / Production BLOCKED**다. 운영 발행 활성화나 중간 main 병합은 수행하지 않는다.

## 2026-10-28 제품 확정 기준 — 12개 사주 상품 동일 레이어

> 이 절은 아래에 남긴 과거 첫 SKU·연애 우선·8메뉴 확대 후보 문구보다 **최신 제품 의사결정으로 우선한다**. 이전 서술은 당시 구현 이력을 설명할 뿐 현재 상품 계층이나 출시 우선순위를 결정하지 않는다.

- **12개 사주 상품 전체를 동일한 상품 레이어로 유지한다.** 연애·관계도 독점적인 첫 상품 또는 선행 레이어로 취급하지 않는다. Saju 별도 트랙의 8개 메뉴 집중은 **현행 연구·품질 개선 범위**이지 나머지 4개 메뉴의 상품 배제 또는 별도 계층화를 뜻하지 않는다.
- **표시 가격 8,900원은 이미 확정된 결정**이며 동일 가격에 대한 반복 승인 절차를 만들지 않는다. 상품별 실제 판매 가능 여부·Offer·Charge Terms·구매권은 서버 정본에서 따로 검증한다. 확인되지 않은 각 SKU의 가격·판매 활성화 상태를 임의로 복제하지 않는다.
- **엔진이 계산·도출한 만큼 명확히 해석한다.** 공식 보고서와 Reader 해설은 실제 Saju Claim/Evidence/해석을 구체적이고 자연스럽게 전달한다. 연구가 진행 중이라는 사유만으로 이미 제공 가능한 해석을 억제하거나 '근거 부족/단정 불가' 같은 일반적인 방어 문구를 반복하지 않는다.
- **근거의 엄격한 검증은 내부에서 유지한다.** 실제로 계산할 수 없는 상태·입력 부재·충돌·범위 제한만 사용자가 이해할 수 있도록 정확한 위치에 제시한다. 엔진이 생성하지 않은 사건/시점/수치/확률을 UI나 LLM이 만들어내지 않는다.
- 공식 발행·개인정보·결제·Reader exact Grant가 준비되지 않은 상태는 **실제 운영 연결의 미완료**이며, 사용자를 위한 해석 서술을 연구 보고서처럼 작성해야 한다는 뜻이 아니다. 기존 중간 병합 금지 정책은 그대로 유지한다.

## 2026-10-28 사주 허브 현행화 및 저장·제공 계약

- **완성형 제품 기준** 전체·직업·재물·연애 등 유료 해석 상품 탐색과 선택을 유지하며, 무료 명식·프리뷰·저장된 공식 기록을 함께 제공한다. 임의로 꾸며낸 개인별 구매 결과만 제거한다. 현재 상품 활성화 HOLD는 출시 게이트이며 목표 기능 축소 근거가 아니다.
- 저장·발행·구매권·실패·재열람의 구체적인 연계 설계는 [SAJU_RESULT_STORAGE_AND_DELIVERY_FLOW_20261028.md](SAJU_RESULT_STORAGE_AND_DELIVERY_FLOW_20261028.md)에 기록한다. 실제 유료 발행·결제는 상위 정본 게이트 충족 전까지 계속 차단한다.
- 동일 브랜치 `feat/frontend-integration/official-report-detail-stage2-20261027` / PR #2670에서 작업하며 중간 병합하지 않는다.

## 2026-10-28 실행 기준 정정 — 현재 결제 정본 우선

> 이 구간은 2026-10-27 당시 구현 계획의 역사적 범위를 삭제하지 않고 **현재 정본과의 변경점**을 명시한다.

- **중간 병합 없음:** 로드맵 문서와 1·2단계 작업을 `feat/frontend-integration/official-report-detail-stage2-20261027` 하나의 브랜치 / PR #2670으로 통합한다. #2666·#2667은 **병합 없이 종료**. 이후 구현은 같은 브랜치에 누적하며, 관련 최종 CI·출시 승인 게이트가 완료되기 전 병합하지 않는다.
- **유료 상품 기준 업데이트:** 이 문서에 역사적 출시 후보로 기재된 `saju.general_natal.deep.v1`은 최신 `docs/P0_DECISION_REGISTER.md` P0-CM-03에서 **forward-retired historical candidate**로 명시한다. 기존 초기 출시 SKU 가정으로 상품/가격/Offer/Entitlement 활성화를 구현하지 않는다. 현재 제품 방향은 **전체 사주 페이지 출시 준비 + 상품별 독립 승인**, 현재 비활성 정본 `standard.love_relationship`(표시 정가 8,900원, 실행 가능한 Charge Terms 아님)이다. 개별 상품 실행/판매는 여전히 `OPEN-P0 / HOLD`이고 원문 생성·보호 저장·판매권/환불 활성화에 대한 별도 권한이 없다.
- **실행 가능 범위:** 1단계 보관함 화면 및 상태·부분 실패 처리, 2단계 Owner-authorized 저장된 Reading 보고서 재조회, 5단계 Reader **과거 참여 이력 표시/권한 혼동 방지**, 6단계 실제 저장 응답만으로 구성한 요약·계산 근거·목차·다국어/모바일을 동일 브랜치에 계속 구현한다.
- **외부 Production 의존:** 3단계 공식 생성·불변 저장, 4단계 결제/생성권·환불 및 5단계 정확한 Reader Grant에 따른 해설 공개는 Saju Production issuer, Native→DB Reading ID 매핑, DB/Privacy 원자 저장, 개별 상품 P0-CM-03, Commerce Entitlement fulfillment/runtime 게이트가 **실제로 충족되어야** 완료 처리한다. 현재 근거만으로 임의 Production issuer/Grant/가격/결제 경로를 새로 생성하거나 미완료를 완료로 표시하지 않는다.

### 단일 통합 브랜치 진행 상태

| 로드맵 영역 | 코드 현황 · 공개 조건 |
|---|---|
| 1단계 기록 중심 화면 | 작업 브랜치 구현, 기록 독립 조회 실패 시 오류와 빈 기록 구분, auth denial fail-closed |
| 2단계 상세 보고서 | 작업 브랜치 구현, owner-verified 단건, 저장된 승인 섹션·근거·발행 버전, 과거 Birth revision 없는 경우 판정 유보 |
| 3단계 유료 Production 생성·저장 | **상위 소스/DB 승인 대기**; Runtime 판매·실제 발행 미구현 |
| 4단계 구매권·환불 | **최신 상품별 P0-CM-03, Commerce fulfillment 및 Privacy 대기**; 판매 비활성 |
| 5단계 Reader | 과거 Reader provenance 표시, 현 접근권과 분리, 유료 해설 재조회는 정확한 Grant 게이트 대기 |
| 6단계 보고서 사용성 | 목차/실제 첫 승인 해석/명식 근거/반응형/5언어 구현 중 |
| 최종 병합 | **전 단계의 실제 구현·출시 게이트 확인 후 단 한 번만 수행** |

---

## 1. 출시 기준 및 우선순위

| 섹터 | 출시 취급 | 기능 | 난이도(상대적) | 작업 시작 조건 |
|---|---|---|---|---|
| **S0 · 필수** | 출시 게이트 | 공식 Reading 목록 / owner 전용 상세 보고서 / 동일 결과 재조회 | 중~상 | 현재 읽기 API·화면 활용해 즉시 착수 |
| **S0 · 필수** | 출시 게이트 | 정확한 출생 revision·상품 버전·출처·생성 상태·권한 확인 | 상 | 기존 DB/계약 재사용; 미승인 공개 금지 |
| **S0 · 필수** | 출시 게이트 | 공식 General Natal 생성 → 불변 원본 확정 → 실패 후 무중복 재시도 | 최상 | Saju Production 및 DB·Privacy 정본 게이트 충족 후 활성화 |
| **S0 · 필수** | 출시 게이트 | 검증된 결제 → 구매권 → 읽기/재생성 → 환불·회수 차단 | 최상 | 기존 Commerce 판매 활성화 게이트 충족 후 연결 |
| **S0 · 필수** | 출시 게이트 | 첫 Reader 연결·공식 결과와 해설 분리·재방문 | 중~상 | 정확한 Reader Grant·원본 공개 권한 필요 |
| **S1 · 출시 권장** | 출시 전 여력 확보 시 | 보고서 목차, 핵심 요약, 실제 근거 펼침, 명식 기준 표시, 모바일·다국어 | 하~중 | 공식 보고서 공개 View Model 및 기존 출생 조회 재사용 |
| **S2 · 초기 확장** | 출시 후 | 보고서 북마크, 구매한 결과 기반 사주 지도, 현세록/인생 연대기, Reader 해설 재조회 개선 | 중~상 | S0 정상 사용·기존 Privacy 범위 확인 |
| **S3 · 장기 확장** | 출시 후 별도 범위 | 인연록/궁합, 대운·세운 흐름표, 관상 공식 보고서 | 상~최상 | 각각 별도의 엔진·상품·출처 승인 필요 |
| **S4 · 실험** | 수요 검증 후 | 대리자 편지, 고민 일지/변화 추적, PDF/외부 공유 | 중 | 데이터 보관·동의·공개 정책 확인 |

**첫 출시 컷라인 = S0 완료.** S1은 가능한 만큼 추가하되 출시를 막는 선행 조건이 아니다. S2~S4를 초기 유료 출시 로드맵에 끼워 넣지 않는다. 난이도는 구현 전 상대 평가이며 인력·일정·진행률을 임의 산정하지 않는다.

## 2. 이미 존재하는 구현 — 다시 만들지 않는다

| 현재 기반 | 실제 경로 / 계약 | 재사용 방식 및 아직 증명하지 못한 것 |
|---|---|---|
| 웹 기록 화면 | `apps/web/records.html`, `apps/web/src/records/RecordsPage.tsx`, `apps/web/records-page.js`, `apps/web/records-v2.css` | React 화면·사주 보고서/현세록 2개 기록 영역·사주 이력 카드 재사용. **상세 장문 보고서가 완성된 것은 아님** |
| Records 세션/조회 | `apps/web/records-runtime-client.js` | 회원·게스트 현재 세션, 주체 변경 감지, 페이지네이션 활용 |
| 저장된 Reading 이력 | `GET /api/readings`, `apps/api/src/reading-history-http.ts`, `apps/web/reading-history-contract.js` | 현재 주체의 이력/완료 상태만 목록에. 이력 조회 성공은 유료 보고서 열람권이 아님 |
| 저장된 공식 Reading 단건 | `GET /api/readings?readingId=...`, `apps/api/src/official-reading-record-http.ts`, `apps/web/official-reading-record-contract.js` | **별도 Records owner 검증** 재사용. API 원본 스냅샷을 검증 없이 소비자 화면에 직렬화하거나 판매 권한으로 추론하지 않음 |
| 기록에서 풀이로 이동 | `apps/web/reading-history-handoff.js`, `apps/web/reading-detail.html`, `apps/web/src/reading-detail/ReadingDetailPage.tsx` | 기존 `source=records` / Reading ID 기반 진입과 Reader 장면 재사용. 장문 공식 보고서는 별도 읽기 모드로 분리 |
| 명식록 (마이페이지 소유) | `GET /api/me/birth-profile`, My Birth UI | 현재 Birth 프로필은 마이페이지에서 확인한다. Records는 보호된 공식 보고서의 발행 당시/현재 Birth revision **메타데이터만** 표시한다. |
| 불변 보고서 근거 | `reading_sessions → readings → reading_refs.response_snapshot_jsonb / response_hash → reading_groundings` | 기존 DB 출처 계보 사용. 생성/조회 경로 전체의 실제 유료 권한 결속은 미완료 |
| 첫 판매 상품 계약 | `docs/PAID_PRODUCT_CATALOG_V1.md` | `saju.general_natal.deep.v1` / `reading.saju.general_natal.deep.v1`; **Product/Offer disabled** |
| Reader/구매 경계 | `docs/MyeongHa_UX_Reading_Reader_Knowledge_Spec_v1.1.md`, `docs/COMMERCE_ENTITLEMENT_SPEC.md` | 공식 결과는 Reader 독립. Reader마다 별도 정확한 접근권; 구매·환불은 서버 정본 |

**진행 중 격리 수정:** [기록 조회 복구 PR #2653](https://github.com/gycha0109-beep/MyeongHa/pull/2653)의 화면 보완/오류 처리는 본 로드맵과 중복 구현하지 않는다. 실제 병합 여부를 실행 시점에 다시 확인하고, 이미 main에 들어온 동등한 기능은 건너뛴다.

## 3. 단일 화면/데이터 모델

### 3.1 출시 시 사용자가 보는 화면

```text
기록
├─ 사주 보고서 (기본 진입 / 핵심)
│  ├─ 내 공식 Reading 목록 (상품·발행일·상태·최초 Reader)
│  ├─ [보고서 읽기] → 구매/현재 접근권 확인 후 상세
│  │    ├─ 표지: 상품/발행일/버전/사용한 Birth revision
│  │    ├─ 공식 핵심 요약 + 승인된 항목별 해석
│  │    ├─ 각 항목의 승인된 근거·범위·구체적 모호성
│  │    └─ Reader 해설 다시 보기 / 권한 있는 대화 진입
│  └─ 생성 중 / 재시도 가능 / 정보 변경 / 접근 종료 상태
└─ 현세록 (현재 기록 페이지의 유일한 별도 원장)

※ 현재 명식록·대리가 기억은 마이페이지에서 확인하며 Records에서는 조회·표시하지 않는다.
```

사주 목록과 본문은 같은 Source Truth를 읽지만 **일반 채팅 transcript / Reader 생성 문장 / Life Fact / Memory**를 공식 보고서 본문에 섞지 않는다. 같은 주제의 다른 Reader 해설이 추가돼도 공식 보고서를 중복 생성하지 않는다.

### 3.2 확정된 읽기 규칙

- **목록 ≠ 본문 열람권:** Reader History/Reading 목록이 조회되더라도, 단건 본문·유료 섹션은 각 요청에서 **현재 Subject·상품/Reading·구매권·취소/환불·Privacy·Birth provenance**의 승인된 정책에 따라 조회한다. 기존 단건 Records owner 검사는 유지하고, 필요한 유료 열람권은 별도 현재 권한 검사에 결속한다.
- **불변성:** `readingId`, 원본 해시, Response/Spec·Profile/Registry 버전, 발행 시 Birth revision을 보존한다. 출생 정보 수정 시 과거 보고서를 새 해석으로 조용히 교체하지 않고 `stale` 표시 및 **현재 구매권으로 새 revision 생성**을 별개 실행한다.
- **보고서 작성:** Saju가 확정한 General Natal 의미·Claim/Evidence/Disclosure만 UI 표시용 섹션으로 변환한다. 텍스트 분량을 채우려고 LLM/캐릭터가 새로운 명리 판단·다른 도메인 결론·근거 없는 점수를 생성하지 않는다.
- **소유/권한:** 동일 `Reading`의 공식 원본과 Reader별 Interpretation/Grant는 다른 책임. Reader A의 해설 접근권 회수가 Reader B 또는 공식 원본 자체를 수정하지 않는다. 다만 **유료 상품의 현재 열람 권한**이 소멸하면 해당 유료 본문 신규 조회는 차단한다.
- **결제:** 단순 브라우저 결제 성공, 존재하는 DB 행, 클라이언트가 보낸 `readingId`나 임시 프리뷰만으로 유료 결과를 해금하지 않는다.
- **사용자 표시:** 근거가 없거나 생성에 실패한 경우를 `기록 없음`으로 위장하지 않는다. 해석의 한계는 `docs/READING_PUBLIC_TRUST_LANGUAGE_POLICY_V1.md`에 맞춰 **실제 입력·근거의 구체적인 제한**으로 제시한다.

## 4. 구현 단계 — 기존 코드에 순서대로 반영

각 단계는 **코드 산출물 + 완료 조건**을 명시한다. 출처/DB/결제의 외부 게이트가 닫혀 있어도 화면·조회 계약 등 독립 구현을 먼저 진행하고, 미승인 기능은 계속 fail-closed로 둔다.

### 1단계 · 기록 진입을 보고서 중심으로 정리 (S0, 지금 착수 가능)

**수정 위치:** `apps/web/src/records/RecordsPage.tsx`, `apps/web/records-page.js`, `apps/web/records-v2.css`, 관련 locale/테스트.

- [x] 현 `사주 기록`의 Reading 목록을 **첫 화면의 보고서 보관함**으로 올린다. 최신 범위에서는 `현세록`만 별도 탭으로 유지하고 명식록·대리자 기억은 마이페이지에 맡긴다. 공식 보고서·현세록 깊은 링크와 뒤로 가기는 보존한다.
- [ ] 실제 Reading History의 항목만 카드로 렌더링하고, 식별자/시각/상품·상태/Reader 표시는 **서버에서 검증된 필드**만 사용한다. 데이터 없는 게스트에게 미구매 보고서/생성 완료 보고서를 꾸며서 보여주지 않는다.
- [ ] 저장된 결과/진행 중/생성 실패/정보 변경/접근 종료/조회 실패를 제품 상태로 구분한다. 서버가 상태를 아직 제공하지 않는 경우 임의로 추론하지 않고 `확인할 수 없음`으로 둔다.
- [ ] 독립 호출 실패 시 가능한 정상 기록만 보이고, 401/403·주체 변경은 전체 보호 내용을 숨긴다. PR #2653 및 동등한 main 수정 사항은 재활용한다.

**완료 조건:** 회원·게스트·빈 기록/오류/다른 주체 전환의 목록 동작 확인; 사주 보고서·현세록의 소유자 보호 및 마이페이지 소유 데이터 중복 조회 없음; 보고서 미생성 상태에서 유료 원문 노출 0.

### 2단계 · 기존 단건 Reading을 상세 '공식 보고서'로 읽기 (S0, 지금 착수 가능 — 사용자 공개는 권한에 종속)

**수정 위치:** `apps/web/official-reading-record-contract.js`, `apps/web/reading-history-handoff.js`, `apps/web/src/reading-detail/ReadingDetailPage.tsx` 및 필요한 전용 report UI/스타일, 기존 `GET /api/readings?readingId=...` 경로.

- [ ] 기존 저장 Reading 클릭 시 **단건 요청 → 단건 계약 검증 → 서버에서 공개 승인된 본문 투영** 순서로 열고, 없는 Reading/다른 주체/권한 불충족은 차단한다. 임의 샘플과 DB 내부 raw `response_snapshot_jsonb`를 소비자 화면에 그대로 렌더링하지 않는다.
- [ ] 공식 보고서 독서 모드를 현재 Reader 단계형 장면과 명확히 분리한다. **공식 제목·발행일·실제 섹션·본문·출처 요약·해석 조건**만 보인다. 승인된 source section이 없는 경우 임의 제목이나 긴 본문을 만들어 채우지 않는다.
- [ ] 현재 Birth와 **발행 시 Birth revision/원본**이 다를 때 stale 안내와 허가된 재생성 진입점(아직 미허가면 비활성)을 제공한다. 본문·해시·생성일은 고정한다.
- [ ] 단건 요청마다 fresh 접근권·동일 Subject 재확인; 로그·캐시·URL·추적 이벤트에 내부 원본/개인정보/토큰 노출 금지. 언어 변경은 UI 라벨만 변경하고 공식 사주 의미는 재번역/재해석하지 않는다.

**완료 조건:** 승인된 fixture에서 공식 섹션·버전·해석 한계 재현, 새로고침/직접 링크/권한 만료/다른 사용자/변경된 출생 정보 음성 사례 통과. 실제 운영에 Production Interpretation 게이트가 열리기 전에는 **비공개 fixture 검증 완료**까지만 인정.

### 3단계 · 정밀 원국 보고서 생성·보관 연결 (S0 핵심 의존성, Saju/DB 게이트 이후)

**구현 위치:** 기존 `docs/SAJU_INTEGRATION_SPEC.md`의 ProductReadingResponse admission 경로, Saju production issuer, 기존 `reading_sessions/readings/reading_refs/reading_groundings` writer/DB·Privacy 원자 확정 경로, 보호 단건 조회. **새 독립 사주 엔진이나 별도 진실 저장소를 만들지 않는다.**

- [ ] **Saju 소스 트랙 선행:** `general+natal` Production 규칙·T8 bounded synthesis, source locator/ambiguity, 등록된 immutable profile/registry 및 실행 전 preflight가 실제 승인된 상태여야 한다. Preview·research·signed transport 성공을 Production 의미 승격으로 간주하지 않는다.
- [ ] **정본 인수:** Saju native `official_reading_<digest>`와 DB Official UUID의 출처/매핑 승인·원본 바이트·hash/revision/selected & companion Evidence 일치를 서버에서 검증한다. 기존 strict-ID/SourceUnit HOLD를 무단 완화하지 않는다.
- [ ] **불변 저장:** 승인된 실행만 Subject·상품 버전·Birth revision·attempt·source·response hash로 결속해 원자 확정한다. 저장 성공 이후에만 Reader/Records 공개를 시도한다. 중간 실패는 권한/행을 일부 성공처럼 표시하지 않는다.
- [ ] **재시도:** 요청 취소/네트워크 오류/중복 클릭/DB 충돌은 idempotent 동일 실행으로 복구하며, 이미 성공한 artifact는 재작성하지 않는다. 새 Birth revision을 위한 재생성은 과거 보고서와 별개 버전으로 저장한다.
- [ ] **보고서 품질:** 실제 승인된 구조화 결과로만 요약·항목·근거를 구성하고, 생성 실패·근거 부족은 분명하게 구분한다. 별도 LLM 보조 서술은 추후 의미 보존 검증을 통과하기 전까지 사용하지 않는다.

**완료 조건:** 실제 승인된 동일 General Natal source → 검증된 원본 저장 → 같은 `readingId/hash/revision`로 Records/Reader 양방향 재조회; 잘못된 SourceUnit/ID 매핑/비인가 생성/중복 재시도/부분 실패 모두 차단. **이 단계가 완료되기 전 유료 공식 보고서 생성 완료를 주장하지 않는다.**

### 4단계 · 유료 구매권과 생성·재열람을 연결 (S0 핵심 의존성, Commerce 게이트 이후)

**구현 위치:** `docs/PAID_PRODUCT_CATALOG_V1.md`의 **기존 `saju.general_natal.deep.v1`** 정본, 현 PortOne V2 server verify/webhook/Entitlement Effect/Grant runtime, 기존 기록 단건 read/admission.

- [ ] `products.enabled=false` 및 `product_offers.enabled=false`를 유지한 채 비공개 구조 검증부터 실시한다. 실제 판매 전에는 Saju Production, P0-CM-03, 이용권·결제 운영 및 Privacy/DB 활성화 조건 모두 충족해야 한다.
- [ ] 구매 흐름은 **검증된 PortOne 거래 → 현재 구매권 Grant·Entitlement 투영 → 공식 Reading 생성 허용**으로 연결한다. 브라우저 콜백이나 결제 UI만으로 생성/조회/권한을 해금하지 않는다.
- [ ] 동일 상품/버전 + 활성 구매권의 중복 구매 방지, 구매권 있는 경우 실패 생성 **재시도 무료**, 새 Birth revision 재생성, 환불·회수 시 새 유료 조회 차단을 구현한다.
- [ ] 구매 성공/생성 대기/실패/재시도/환불 처리를 기록 목록·상세에 표시하되, 결제 영수증·개인정보 원본을 화면 로그·추적 데이터에 누출하지 않는다.
- [ ] 비공개 TEST/Sandbox에서 구매→Entitlement→생성→보관→재접속→재열람→실패/재시도→환불 차단을 실제 구매권과 검증한다.

**완료 조건:** **중복 결제 0, 무권한 유료 본문 공개 0, 실패 후 동일 권한 재시도 가능, 환불 후 새 열람 차단**. 운영 판매 활성화는 위 조건과 기존 상품/결제 정본의 **독립된** 게이트를 충족한 경우에만.

### 5단계 · 최초 대리자 해설과 기록 연결 (S0, 기존 Reader 권한 재사용)

**수정 위치:** 기존 Reader Scene, `standard_reading_official_bindings` / `standard_reading_reader_interpretations` / `standard_reading_reader_access_grants` 및 공식 Reader 입장·재조회 진입점, Records UI.

- [ ] 보고서에는 원본 공식 Reading **하나**만 두고, **처음 구매 시 선택한 Reader**를 연결한다. Reader 해설·대화 기록은 별도 표시하며 공식 보고서 원문을 변경하지 않는다.
- [ ] 현재 유효한 **정확한 Reader 접근 Grant**가 있을 때만 해당 대리자 해설 재조회·대화 진입을 제공한다. 다른 Reader/상품/회수된 권한의 내용 자동 공유 금지.
- [ ] `Additional Reader Interpretation`의 UI는 기존 공식 Reading 재사용에 맞춰 확장 가능하게만 구성하되, 승인되지 않은 추가 Reader Offer/할인·결제는 **비활성** 유지한다.

**완료 조건:** 동일 공식 Reading은 Reader가 달라도 ID/hash 불변; Reader A 회수 시 A만 차단, B/공식 원본에 임의 영향 없음; 최초 Reader 복귀·공식 보고서 재조회 분리.

### 6단계 · 출시 권장 다듬기 (S1, S0 방해 금지)

**수정 위치:** 기존 Records/보고서 UI 및 승인된 Public View Model.

- [ ] 보고서 목차·섹션 바로 이동·핵심 요약을 **이미 존재하는 승인된 섹션**으로 생성한다.
- [ ] 섹션별 실제 근거·분기·제외된 범위를 펼쳐 볼 수 있게 한다. 근거 없는 점수·대운·세운·타 도메인 해석 추가 금지.
- [ ] 현재 명식록과 보고서의 발행 당시 명식 기준을 명확히 구분한다.
- [ ] 데스크톱 긴 글 가독성, 모바일 세로 보고서, 5개 언어의 **정적 UI**, 키보드/스크린리더 탐색을 기존 웹 디자인 체계에 맞춘다.

**완료 조건:** 본문 긴 글·모바일·다국어/접근성 스모크. 이 단계는 S0 공식 Reading 의미를 재작성하지 않는다.

## 5. S2~S4 후속 작업 보관함 — 출시 작업에 섞지 않음

| 시점 | 작업 | 선행 조건 | 출시 초기 제외 이유 |
|---|---|---|---|
| S2 | 보고서 북마크/문단 저장 | 보고서 섹션 안정적 ID, 사용자 저장/삭제 정책 | 최초 결제 가치와 별개 |
| S2 | 나의 사주 지도 | 다수의 실제 구매·승인된 해석 | 한 상품만 존재할 때 데이터 부족; 새로운 종합 명리 판단 금지 |
| S2 | 현세록 기반 인생 연대기 | 사용자 입력·수정·삭제·동의 범위 | 자기 기록 제품의 별도 설계 |
| S2 | Reader 해설 아카이브 확장 | 정확한 Reader별 권한과 보호 본문 | 공식 보고서와 권한 구조가 다름 |
| S3 | 인연록·궁합 보관 | Target Person 동의/정보 통제·공식 궁합 Production | 다른 사람 정보와 미출시 상품 |
| S3 | 연도별 흐름표 | 대운/세운/월운 해석 권한 및 결제 상품 | 시간 흐름을 가짜 수치로 채울 수 없음 |
| S3 | 관상 보고서 | 관상 Production 엔진·별도 상품/프라이버시 | 얼굴 관측 research ≠ Production 해석 |
| S4 | 대리자 편지, 고민 일지, PDF/공유 | 보관·공유·revocation/privacy 정책과 실제 수요 | 출시 필수 아님 |

## 6. 실제 실행 순서와 통합 검증

```text
[즉시 착수] 기존 Records 확인
  → 1단계 기록 중심 화면
  → 2단계 승인 단건 보고서 표시 계약/화면 (비공개 검증)
  ├── [독립 진행] Saju general+natal Production 해석·source issuer
  ├── [독립 진행] DB/Privacy source·ID·보호 확정/복원
  └── [독립 진행] Commerce verified grant/refund/TEST
               ↓ 모두 준비된 이후
  → 3단계 실제 공식 Reading 생성·저장
  → 4단계 구매권/재시도/환불 연결
  → 5단계 최초 Reader 재조회
  → 하나의 출시 통합 검증/Cloudflare 배포
  → 6단계 S1 품질 보완 / S2 이후 별도
```

**최종 S0 출시 필수 시나리오(검증은 관련 변경이 모였을 때 수행):**

1. 회원·게스트의 기존 세션으로 정확한 소유 기록만 표시, 로그아웃·교차 Subject·권한 재사용 시 내용 비노출.
2. 기존 승인된 하나의 Official Reading을 새로고침·재접속·직접 링크로 동일 `readingId`와 버전·해시를 통해 재조회.
3. 명식 수정 → 과거 Reading은 stale로 남고 현재 revision으로만 새 생성; 타인의 Birth/Reading 혼합 없음.
4. Product/Offer 비활성 동안 미구매·임의 ID·Preview 샘플·연구용 원문으로 유료 본문/가격 해금 불가.
5. 검증된 TEST 결제 후 단 하나의 Grant 및 공식 Reading, 중복 callback/webhook/중복 클릭에도 중복 청구·중복 출처 생성 없음.
6. 결제 후 생성 실패 → 같은 권한으로 재시도, 이미 성공했다면 과거 불변 artifact 반환.
7. 환불·권한 회수 후 새 유료 원문 조회와 Reader AI 유료 Context 주입 차단; 역사적 원본은 정본 보존/삭제 정책 적용.
8. Reader A와 B 권한 분리; 추가 Reader 구입은 새 공식 의미 생성이 아님.
9. Web 정적 번역/실제 소비자 본문 분리, 모바일·접근성·빈 결과/오류 처리 및 Cloudflare 운영에서 실제 기능 확인.

**검증 수단:** 변경 파일의 관련 단위/브라우저·서버 계약 테스트 + 현행 GitHub Actions 영역별 CI + 보호 DB/Privacy 테스트 + PortOne TEST + Cloudflare 운영 읽기 확인. **CI 녹색 ≠ 실제 유료 운영 승인.** 필요하지 않은 중복 검증 구간이나 선행 로드맵 외 구현을 임의로 추가하지 않는다.

## 7. 미완료 게이트·명시적으로 금지된 우회

| 미완료 사항(2026-10-27 문서 기준) | 정본 및 현재 차단 |
|---|---|
| Saju General Natal 해석·Production Reading 승인 | `docs/SAJU_PRODUCT_INTERPRETATION_INVENTORY_V1.md`, `docs/SAJU_INTEGRATION_SPEC.md`: **HOLD**. 의미/근거를 프론트·LLM에서 생성하여 대체 불가 |
| Saju native ID ↔ DB UUID 정본 / 불변 보호 저장 | `docs/architecture/SAJU_NATIVE_DB_READING_ID_MAPPING_OWNER_HOLD_20261022.md`, `docs/architecture/SAJU_READER_RECORDS_EXACT_SOURCE_HANDOFF_20261022.md`: **HELD**. 프리뷰 source 서명/서버 내부 교차 비교만으로 원문 공개 불가 |
| 첫 유료 상품 판매 | `docs/PAID_PRODUCT_CATALOG_V1.md`: SKU/Capability 결정, Product/Offer **disabled** 및 activation gate 10항 |
| 결제 → 권한 활성화·환불·복구 | `docs/COMMERCE_ENTITLEMENT_SPEC.md`: PortOne 기초는 구현, **P0-CM-03·실운영·이용권 fulfillment·환불 경계** 미완료 |
| 유료 보고서의 실제 노출/Reader별 개인정보 분리 | `docs/MyeongHa_UX_Reading_Reader_Knowledge_Spec_v1.1.md`, `docs/OFFICIAL_READER_S4_PRIVACY_POLICY_DECISION_V1.md`: Privacy/유료 권한과 원문 재노출 조건 별도 |

**구현 중 정책:** 기존 설계 범위 내 소스/UX 구현은 추가 내부 승인 없이 진행한다. 사용자의 결정이나 실제 운영 자격·비밀정보가 필수인 부분만 명시적으로 보고한다. 위 HOLD를 완료로 표기하거나 다른 사람을 운영 승인권자로 가정하지 않는다.

## 8. 작업 현황 기록 방식

2026-10-28 작업 브랜치의 **실제 구현 현황**을 기재하며, 진행률은 임의 산정하지 않는다. 단계별 Production Gate는 별개다.

| 작업 | 현재 |
|---|---|
| Records 기존 목록 | **사주 보고서·현세록 유지**. 기록 페이지의 명식록·기억은 탭·화면·조회 코드 제거(마이페이지 소유); 이력용 구 서술보다 2026-10-30 결정을 우선한다. |
| 1단계 보고서 중심 진입 화면 | **브랜치 구현·CI GREEN**: 보고서 기본 탭·현세록·owner 조회·실제 기록 수·부분 실패와 전체 권한 거부 구분, 중복 명식록/기억 제거 |
| 2단계 공식 장문 보고서 읽기 UX | **브랜치 구현**: 승인된 단건 원문·섹션/목차·출처·현재 계정 확인, 새로고침과 직접 링크 |
| 3단계 Production 공식 결과 생성/불변 저장 E2E | **서버 내부 연결부 구현 / Production HOLD**: 현재 Birth→Saju 요청→Production issuer·DB ID 매핑·현재 Grant/Privacy 별도 검증→기존 원자 DB finalize 및 원문 출처 해시 재조회 경로는 코드로 연결. 실제 Saju Production issuer·DB/Privacy 권한 포트와 운영 E2E 미완료 |
| 4단계 검증된 유료 구매·권한·재생성·환불 E2E | **HOLD / 미완료**: 상품별 활성화·Commerce Grant 및 환불 검증 필요 |
| 5단계 최초 Reader와 보고서 재조회 연결 | **과거 Reader provenance UI만 구현**: 현재 Reader 정확한 Grant/유료 해설 미연결 |
| 6단계 보고서 독서 UX 보완 | **일부 구현**: 실제 목차/근거·모바일·5개 언어·목차와 읽기 모드 초점 이동; 여러 scope limitation 보존, 없는 구조 근거는 미표시 |
| S2~S4 확장 | **출시 범위 밖** |

**다음 구현:** 3단계 서버 연결부의 Production Source verifier·DB 승인 매핑 영수증·현재 Commerce/Privacy 권한 포트와 기존 DB finalize 실행권을 **정본 증거에 따라 실구현**하고, 정식 발행·환불·재열람 E2E를 검증한다. 그 전에는 **현재 보유한 승인된 공식 Reading의 권한 검증·재열람·Reader provenance 분리·보고서 사용성**에서 독립적으로 구현 가능한 개선을 수행한다. 과거 첫 SKU/출시 가정은 2026-10-28 최신 상품 정본보다 우선하지 않는다.

## 9. 원본 설계·계약 링크

- [Master Specification Index](../MASTER_SPEC_INDEX.md)
- [UX Screen State Spec](../UX_SCREEN_STATE_SPEC.md)
- [UX · Reading · Reader Knowledge](../MyeongHa_UX_Reading_Reader_Knowledge_Spec_v1.1.md)
- [General Natal Paid Product Catalog](../PAID_PRODUCT_CATALOG_V1.md)
- [General Natal Product Proposal](../SAJU_GENERAL_NATAL_PAID_PRODUCT_PROPOSAL_V1.md)
- [Saju Production Interpretation Inventory](../SAJU_PRODUCT_INTERPRETATION_INVENTORY_V1.md)
- [Saju Integration Contract](../SAJU_INTEGRATION_SPEC.md)
- [Commerce/Entitlement](../COMMERCE_ENTITLEMENT_SPEC.md)
- [Saju ↔ Records exact source handoff](../architecture/SAJU_READER_RECORDS_EXACT_SOURCE_HANDOFF_20261022.md)
- [Reading User Trust Language Policy](../READING_PUBLIC_TRUST_LANGUAGE_POLICY_V1.md)


## 2026-10-29 S0 발행 연동 추가 — Saju 요청 전·저장 직전 이중 권한 경계

- 기존 공식 발행 구성은 Saju 네트워크 호출 뒤에만 `currentAuthority`를 검사했다. **Saju 네트워크 실행 전에 별도 Subject-scoped DB preflight를 반드시 통과**하도록 `executeAndPersistCurrentBirthSajuOfficialReadingV1`를 수정했다. preflight 미연결·실패·잘못된 Reading/Attempt/Birth UUID는 네트워크 호출과 DB 발행 모두 수행하지 않는다.
- 기존 원자 확정 트랜잭션 안에서 `executionAttemptId`까지 묶어 동일한 preflight 함수를 다시 실행한다. 구매권·현재 SELF Birth·Subject 상태·공식 Reading 및 실행 Attempt를 정확히 검증하고 `FOR SHARE`로 필요한 DB 행을 잠가 환불·명식 변경·발행 상태 변경과의 경쟁을 막는다. 첫 preflight 성공만으로 최종 발행·공개를 허용하지 않는다.
- 신규 **후속 마이그레이션** `20261029111500_saju_official_issuance_preflight_v1.sql`은 `public.qry_saju_official_issuance_preflight_v1`를 제공한다. 기존 Product·Offer·Grant·Privacy·Reader 데이터는 재사용하고, 임의 유료 승인·새 테이블·원본 DB 테이블의 일반 API SELECT 권한은 부여하지 않는다.
- 발행 직후 불변 계보 재조회에서 기존 API 역할에 없는 `reading_refs`·`reading_execution_attempts` 직접 SELECT를 제거했다. `20261029112500_saju_official_stored_lineage_v1.sql`의 **Subject + exact committed Attempt + active initial purchase Grant** 보호 RPC를 사용해 Saju native ID, issuer request ref, Birth hash, Product 응답 JSONB/hash를 같은 DB 트랜잭션에서 대조한다. 해시/출처 불일치 시 ROLLBACK한다.
- 두 SQL 함수는 일반 `myeongha_api_executor`에만 EXECUTE를 부여하며 `PUBLIC`·`anon`·`authenticated`·`service_role` 접근을 금지한다. **기존 transport finalize writer의 EXECUTE 차단은 해제하지 않는다.**
- **검증:** 일회용 PostgreSQL 17 `myeongha_ci_case_2902`에서 203개 마이그레이션 후 카탈로그 SHA-256 `d8c8b37d2eef0a179462be54824f8601c5a254447f71f3605852e6a20ad02131` 반영. 신규 preflight 정확한 구매권·Birth·Attempt 승인과 불일치 거부, active/revoked Grant 보호 계보 조회, 잘못된 Attempt 차단, private table 직접 SELECT 금지, 기존 공식 보고서 HTTP E2E(권한 철회 404·활성 Grant 200·Birth 변경 불변) 검증을 수행했다. 관련 Saju 발행 경계 단위 검사 24개 통과.
- **운영 상태:** 운영 Supabase DB·Commerce·Cloudflare 설정은 변경하지 않았다. 실제 Production Source issuer/서명·의미 검증 및 Native→DB ID 승인 공급자는 여전히 미구현/HOLD다. 테스트 합성 결과는 제품 발행 권위가 아니다. 판매·공식 발행 공개·PR main 병합 금지.
