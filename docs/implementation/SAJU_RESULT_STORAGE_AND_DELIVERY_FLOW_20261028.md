# 사주 결과 DB 저장 및 제공 흐름 — 현재 정본 연계 설계 (2026-10-28)

상태: **구현 연결안 / 상품 활성화·Production 발행은 HOLD**. 이 문서는 기존 DB/Commerce/Saju 권한을 변경하지 않으며 새로운 판매 승인이나 스키마 권한을 부여하지 않는다.

## 2026-10-28 제품 운영 원칙 업데이트

- **12개 사주 상품은 모두 동일한 상품 레이어**다. 아래에 남아 있는 과거 '첫 상품' 또는 일부 주제 중심 서술은 현행 상품 계층·출시 우선순위의 기준이 아니다. Saju 별도 트랙의 8개 메뉴 연구 범위 역시 상품 카탈로그 제한이 아니다.
- **8,900원 가격 결정은 확정**이다. 이 가격을 다시 승인 요청하지 않는다. 다만 기존에 확인되지 않은 다른 SKU의 개별 판매 조건을 추측해 구성하지 않으며 실제 서버 Product/Offer/Entitlement 권한을 따라 처리한다.
- **공식 결과는 엔진이 해석한 만큼 명확하게 제공한다.** 내부 근거·출처·정합성 검증을 사용자 문장에 반복적인 일반 면책 표현으로 노출하지 않는다. 불확실성이 실제 결론에 영향을 미치는 입력·충돌·범위만 구체적으로 밝힌다. 보고서와 캐릭터는 엔진에서 나오지 않은 예측·판단을 덧붙이지 않는다.
- **발행·저장과 최종 공개를 분리한다.** 운영용 Saju source 및 DB/Privacy·Commerce 권한의 미완료는 실제 구매/공식 발행을 차단하는 기술 상태이지, 이미 산출 가능한 해석의 품질·서술 기준을 저하시키는 사유가 아니다.

## 설계 전제 정정 — 완성형 서비스 기준

이 문서의 **제품 목표는 명하의 사주 엔진, 공식 결과 발행, DB, Commerce, Reader 연동이 모두 완성된 상태**다. 현재 Production HOLD는 단계별 구현·배포 게이트이지, 최종 화면의 상품 범위를 줄이거나 서비스 기능을 삭제하는 근거가 아니다.

- 완성형 사주 허브: **전체 사주·직업·재물·연애**를 비롯한 주제별 상품 탐색 → 상세 범위/가격 확인 → Reader 선택 → 구매 → 개인 공식 해석 발행 → 보고서 제공 → 기록 보관함에서 재열람. 추가 주제는 개별 상품 계약으로 확장한다.
- 각 상품은 별도의 상품 정의, 가격·Offer·권한·해석 섹션 템플릿을 가진다. 지금 일부 가격/활성화가 미결정인 것은 *구현 중 상태*일 뿐, 최종 제품에서 상품을 숨기거나 폐기한다는 뜻이 아니다.
- 공식 결과 저장은 단순 JSON 덤프가 아니라 **구매 권한 + 발행 시점의 출생정보 기준 + 계산 근거 + 상품별 해석 결과 + 문서 버전 + Reader 표시 이력**을 하나의 발행 계보로 묶는 구조다. 재열람은 생성 시점 원문을 유지하고, 재발행은 명시적 신규 버전/신규 기록으로 관리한다.
- 화면의 보고서 예시는 **개인별 운세를 꾸며낸 텍스트가 아닌 문서 구성 예시**로 유지한다. 실제 유료 상품의 결과는 서버 공식 발행 경로에서만 나온다.

## 1. 화면·상품 기준

- 사주 허브는 **무료 명식·프리뷰와 완성형 주제별 상품 카탈로그**를 함께 제공한다. 전체·직업·재물·연애 상품은 목표 제품에서 유지하며, 실제 결제 가능 여부는 상품별 서버 활성화 상태에 따른다. 개인별 결과를 꾸며내는 가상 구매 해석만 금지한다.
- 유료 상품은 Product별 독립 활성화. 현 Commerce 정본에서 `standard.love_relationship`은 **비활성**, 표시 정가 KRW 8,900만 결정되어 있으며 Offer/Charge Terms/실제 결제권이 없다. `saju.general_natal.deep.v1`은 역사적 후보로 폐기. 가격/출시 범위/제공 결과를 다른 주제에 전파하지 않는다.
- 구매 전 예시는 **문서 구성 안내로 명시한 프리뷰**에 한정. 저장된 공식 결과로 승격하지 않는다.

## 2. 저장 단위: 계산 사실 / 공식 결과 / 권한 분리

| 데이터 | 기존 권한·저장 경계 | 원칙 |
|---|---|---|
| 출생정보 및 현재 명식 | Birth Profile 및 Saju Engine 계산 권한 | 현재 입력·계산과 과거 공식 발행 결과를 혼합하지 않는다. 출생시간 미상 등 제한은 보존한다. |
| 공식 풀이 생성 세션 | `reading_sessions` | owner/subject, 제품·도메인, 생성 요청, 실행 상태와 발행 ID를 연결. 동일 요청 중복 발행을 방지할 idempotency 계약이 필요하다. |
| 공식 풀이 결과 | `readings` + `reading_refs` + `reading_groundings` | 확정된 Saju Production 결과만 승인된 writer를 통해 저장. 원문 `response_snapshot_jsonb`, `response_hash`, 출처·버전은 발행 후 수정하지 않는다. 새 모델이 조회 시 재생성하지 않는다. |
| 구매 및 제공권 | 기존 `purchase_intents`, Commerce Product/Offer/Charge Terms/Entitlement 권한 | 클라이언트 결제 성공 화면은 권한 근거가 아니다. 서버의 검증된 구매/환불 상태로만 생성권·열람권을 판단한다. |
| 대리자 | Reader 별도 선택·Grant | 과거 참여 Reader ID는 이력. 현재 대화/해설권과 동일시하지 않는다. |

**DB 저장 계약(목표)**: owner/subject 식별자, `reading_session_id`, `reading_id`, 상품·도메인, 출생정보 기준 revision 또는 발행시 스냅샷 참조(실제 권한 계약 확정 시), Saju 계산·해석 계약 버전, 불변 공식 응답, 해시, 근거, 완료시각, Reader 참여 이력. 각 필드는 기존 DB 스키마와 API 계약에 매핑 검증 후 사용하며, 미존재 필드를 임의 INSERT하지 않는다. 현재 발행시 Birth revision이 응답에 없다면 기록 화면은 **알 수 없음**으로 표시한다.

## 3. 제공 과정(목표 상태 기계)

1. **상품 확인**: Product가 활성이고 실제 Offer/Charge Terms가 승인된 경우에만 구매 가능 표시. 비활성이면 무료 명식·기록만 제공.
2. **구매 의사/결제**: 서버가 소유한 Purchase Intent에 상품, 선택 Reader, 사용자/대상 및 가격 근거를 고정. 결제사 서버 검증이 성공할 때까지 권한 미부여.
3. **권한 승인**: 결제 확인 → Commerce Entitlement를 원자적·중복 안전하게 발급. 중복 웹훅/재시도는 동일 구매로 귀속. 취소/환불은 독립 상태와 권한 반영을 따른다.
4. **공식 생성 요청**: 소유자·대상·상품·권한을 서버에서 재검증하고 발행 요청을 생성. 같은 구매/상품/대상 요청의 중복 생성 금지. 출생정보 변경 또는 불충분한 입력은 확정된 정책에 따라 재입력/보류.
5. **Saju Production 생성**: 계산 사실 및 정본 Product Reading 계약에 따라 의미를 생성·검증. Preview/LLM 즉석 문장을 공식 결과로 저장하지 않는다. 실패 시 결제권을 임의 소멸시키지 않고 재시도/환불 상태를 분리.
6. **불변 저장**: 승인된 DB/Privacy writer가 공식 결과·해시·근거·Reader provenance를 동일한 발행 계보로 원자 저장. **완전한 커밋이 확인된 후에만 완료 상태**.
7. **최초 제공**: `readingId`가 포함된 서버 소유 경로로 단건 조회. 사용자 owner/subject, `readingSessionId`, domain, 구매·열람권, 정확한 Reading ID를 검증해 승인된 응답만 제공.
8. **기록에서 재열람**: `GET /api/readings`의 실제 저장 완료 기록만 목록에 표시하고, 단건 `GET /api/readings?readingId=...`는 `public.qry_official_reading_record_runtime_v1` 권한 경계로 조회. 원문/버전/근거를 그대로 렌더링. 조회 중 새 풀이 생성·수정·과거 Birth 추정 금지.
9. **대리자 재방문**: 해당 Reader의 **현재 유효한 정확한 Grant**를 다시 확인해야 해설/대화 공개. Reader 이름만으로 접근 허용하지 않는다.

## 4. 실패·보호 규칙

- 상품 비활성: 구매 CTA 없음. 서버 생성도 fail-closed.
- 결제 실패·미검증: 발행 금지. 결제 성공 UI/웹훅 원문만으로 권한 승격 금지.
- 발행 실패/타임아웃: `pending/failed/retryable` 등 실제 상태를 구분, 재시도 중복 발행 금지. 결제 취소·환불은 Commerce 정본에 위임.
- 기록 일부 조회 5xx: 해당 목록만 '조회 불가'; **기록 없음으로 표시하지 않음**. 어느 보호 endpoint든 401/403이면 전체 기록 보호.
- 다른 계정·세션: 저장된 공식 본문 DOM 제거, 재조회 시 owner 재검증.
- 변경된 Birth Profile: 과거 결과 원문 불변. 발행 당시 revision 미확정이면 비교/오래됨 판정 금지.
- 권한 철회·환불·개인정보 삭제: 기존 Privacy/Commerce 정책과 일치하게 보호 조회를 차단하고, 보존·삭제는 정본 retention 정책 확정 후 구현. 프런트에서 임의 삭제/유지 결정 금지.

## 5. Saju Production 발행 → DB 불변 저장 연결부 (2026-10-28 구현)

현재 코드에 아래 **서버 내부 구성 요소**를 추가했다. Product/Offer 활성화, 별도 Production issuer 인증, DB/Privacy 역할 승격은 여전히 포함하지 않는다.

- `apps/api/src/saju-production-reading-execution.ts`: 기존 `executeCurrentBirthProfileSajuReadingV1`가 **권한 있는 Saju 서버 요청**을 실행한 뒤에만 DB Subject 트랜잭션 콜백으로 진입한다. 승인 Source/ID Mapping/DB Transaction 포트가 없으면 Saju 외부 요청도 수행하지 않고 `held`를 반환한다. API가 생성 시 고정한 Birth revision과 현재 서버 Birth revision이 다르면 네트워크·DB 쓰기 모두 차단한다.
- `apps/api/src/saju-official-reading-issuer-db-persistence-v1.ts`: 원본 ProductReadingResponse v2의 delivered 상태와 섹션/Disclosure 구조를 검사하고, Saju **Production issuer 서명·의미 권한을 검증한 별도 verifier** 및 DB Owner가 검증한 native Reading ID→DB UUID 매핑을 독립적으로 요구한다. 기존 Preview HMAC이나 동일 문장 비교는 자격이 아니다. ID만 변경한 저장용 JSON의 정규 해시를 계산해 매핑 승인 해시와 비교한다.
- 동일 경로에서 **현재 Subject×출생 revision×정확한 구매 Grant×Privacy**를 DB 트랜잭션 안에서 재검증하는 포트가 반드시 true를 반환해야 기존 writer를 호출한다. 인증 불충분·다른 Birth·native/DB ID·해시·owner·session 불일치는 저장하지 않는다.
- `apps/api/src/postgres-saju-official-immutable-commit-v1.ts`: 새 SQL INSERT/UPDATE나 별도 발행 테이블 없이 기존 `public.cmd_finalize_reading_transport_success_v1`의 **원자적 상태 전이+Reading Ref+Outbox**를 호출한다. `reading_refs.external_reading_ref`에 Saju native ID를, `reading_execution_attempts.external_request_ref`에 Production issuer 증명 참조를 전달하고, `reading_refs.response_snapshot_jsonb/response_hash`에 승인된 DB ID 버전 원문과 해시를 전달한다. 커밋 직후 **같은 DB 트랜잭션**에서 native ID·issuer ref·Birth input hash·계약/응답 상태·JSONB 원문 해시를 다시 확인한다. 저장 원본의 Reading ID만 되돌려 Saju 출처 digest와 일치해야 하며, 재시도 재생에서도 동일하게 확인한다.
- `test/saju-official-reading-issuer-db-persistence-v1.test.ts`: 미승인/누락·변조·출생 revision 불일치·거부된 현재 권한·저장 해시/원본 불일치·재시도 계보 변조를 거부하는 회귀 계약.

**실행 경계:** 위 모듈은 새로운 공개 POST/발행 API로 등록하지 않는다. 현행 Saju `/api/internal/preview/source-readings`는 `state=held`, `canPublish=false`여서 Production verifier를 충족하지 못한다. DB 마이그레이션 `1000_reading_transport_executor_authority_guard.sql`은 일반 API executor의 transport prepare/finalize 실행 권한을 계속 거부한다. **이 두 승인 포트의 Production 구현·운영 증명이 없는 동안 실제 공식 발행·저장 성공은 미완료**다. 개발/TEST fixture의 positive 실행은 운영 승인이 아니다.

최종 연결 시에는 서버 내부 인증·Source Signature/Meaning 검증 구현, 승인된 읽기 ID 변환 영수증, DB current Grant/Privacy 재조회 포트 및 **최소권한 내부 writer의 권한 인수**를 공급하고, `executePostgresSubjectTransactionV1`로 결속된 한 DB 트랜잭션 내 저장·원본 재조회 검증을 수행한다. 고객에게는 완료 커밋 및 보호 재열람 검증 이후에만 공개한다.

## 6. 구현·검증 체크포인트

- **현재 구현**: 전체·직업·재물·연애 상품 탐색과 무료 계산 결과/기록 허브, owner 검증 공식 단건 보고서, 다국어/모바일, 조회 부분 장애 구분.
- **구현된 연결부**: 서버 Saju 요청 → Production source verifier → DB 원본 ID 매핑 승인 → 최신 권한 → 원자적 finalize 및 저장 후 출처 검증. 실제 issuer/DB 실행 권한은 아직 HOLD.
- **다음 실제 연결**: 승인된 Production Source/DB·Privacy 권한 포트 실구현 → 실제 TEST 구매권/발행과 중복 요청/실패/환불/재조회 E2E.
- **통합 병합**: 전체 구현과 필수 게이트 확인 뒤 PR #2670에서 한 번만. 상위 승인 미충족 상태에서 판매·발행 기능을 열거나 완료라고 보고하지 않는다.

관련 정본: `docs/P0_DECISION_REGISTER.md` (P0-CM-03), `docs/implementation/RECORDS_OFFICIAL_REPORT_IMPLEMENTATION_ROADMAP_20261027.md`, `apps/api/src/official-reading-record-http.ts`.
