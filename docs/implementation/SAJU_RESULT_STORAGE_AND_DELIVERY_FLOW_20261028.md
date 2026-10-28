# 사주 결과 DB 저장 및 제공 흐름 — 현재 정본 연계 설계 (2026-10-28)

상태: **구현 연결안 / 상품 활성화·Production 발행은 HOLD**. 이 문서는 기존 DB/Commerce/Saju 권한을 변경하지 않으며 새로운 판매 승인이나 스키마 권한을 부여하지 않는다.

## 1. 화면·상품 기준

- 사주 허브는 **실제 무료 명식/계산 상태 + 무료 프리뷰 + 기록 열람**을 표시한다. 과거 네 개 상품 카드(전체·직업·재물·연애) 및 가상 구매 결과는 현재 판매 정본이 아니므로 제거한다.
- 유료 상품은 Product별 독립 활성화. 현 Commerce 정본에서 `standard.love_relationship`은 **비활성**, 표시 정가 KRW 8,900만 결정되어 있으며 Offer/Charge Terms/실제 결제권이 없다. `saju.general_natal.deep.v1`은 역사적 후보로 폐기. 가격/출시 범위/제공 결과를 다른 주제에 전파하지 않는다.
- 구매 전 예시는 **예시로 명시한 개발/프리뷰**에 한정. 저장된 공식 결과로 승격하지 않는다.

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

## 5. 구현·검증 체크포인트

- **현재 구현**: 무료 계산 결과/기록 허브, owner 검증 공식 단건 보고서, 다국어/모바일, 조회 부분 장애 구분.
- **다음 실제 연결**: Product/Offer·Entitlement 계약 및 Saju Production issuer의 정본 게이트 확인 → 기존 writer 및 Native→DB Reading ID 매핑 → 동일 구매 중복 요청/실패/환불/재조회 E2E.
- **통합 병합**: 전체 구현과 필수 게이트 확인 뒤 PR #2670에서 한 번만. 상위 승인 미충족 상태에서 판매·발행 기능을 열거나 완료라고 보고하지 않는다.

관련 정본: `docs/P0_DECISION_REGISTER.md` (P0-CM-03), `docs/implementation/RECORDS_OFFICIAL_REPORT_IMPLEMENTATION_ROADMAP_20261027.md`, `apps/api/src/official-reading-record-http.ts`.
