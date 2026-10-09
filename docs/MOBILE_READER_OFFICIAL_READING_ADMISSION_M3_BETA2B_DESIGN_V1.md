# 명하 앱화 M3-β-2b — Reader 공식 Reading 서버 승인 연동 설계 v1

> 상태: DESIGN CANDIDATE / NOT APPROVED / PUBLIC OFF
> 점검 기준: main 459e9c93d3881f1d3e41e88e3df876e739676041 (2026-10-09)
> 소유: frontend-integration(모바일 UX/클라이언트), reader-runtime(실행/공개), applizing(A1/A2/상품 능력), commerce-payment/entitlement(구매·Grant), DB(증거·동시성), saju-bridge(공식 의미)
> 범위: 기존 M3-α(#1809), M3-β-1(#1813), M3-β-2a(#1818) 다음 단계. 이 문서는 제안이며 새로운 API, 판매 상품, 가격, 결제 권한, SQL, 출시를 승인하거나 구현하지 않는다.

## 1. 제품 목표와 변경 불가능한 계약

1. 사용자가 이미 보유한 **공식 Reading은 단일 Source Truth**다. Reader를 바꿔도 사주를 재계산하거나 공식 Reading의 의미·근거·불확실성을 다시 만들지 않는다.
2. 정식 Reader 9명이 승인된 일반 사주 상품을 해설할 *제품 능력*을 가질 수 있다는 사실은 현재 고객의 **구매 기반 exact Grant**, 공개 승인, Reading 열람 권한과 별개다.
3. 동일 Reading을 다른 Reader에게 맡기는 흐름은 **기존 공식 Reading 재사용 + 대상 Reader별 독립 접근권**으로만 진행한다. UI에서 다른 Reader를 탭하거나 일반 Chat Thread를 생성한 행위는 Grant가 아니다.
4. Character는 Saju 의미를 창작하지 않는다. Reader 고유 대사·관점·연출은 승인된 Character content와 pinned release로부터만 온다.
5. 모든 권한 판정과 admission proof 생성/소비는 서버 내부에서만 한다. 모바일은 raw artifact, 구매 증빙, 서버 admission ticket을 저장·전달하지 않는다.
6. 권한·응답 불확실성은 기본 거부, 타인 Reading 존재 여부 및 거래 정보 노출 금지. Reader 해설 본문을 후속 Chat 메시지에 몰래 삽입하지 않는다.
7. 현재 public OFF 및 internal Seyeon-only Preview는 별개 정책으로 유지. 9 Reader 표시·프리뷰 준비 상태는 일반 운영 출시가 아니다.

## 2. 현재 코드와 확인된 경계

| 축 | 현재 실체 | 결론 |
| --- | --- | --- |
| 기록 | `readOfficialReadingRecordV1`, `OfficialReadingRecordV1`, `reading/[readingId].tsx` | 기존 서버가 검증한 official record와 display만 소비 |
| Reader UX | `MobileOfficialReadingReaderEntry.tsx`, `mobile-reader-access-view-model.ts` | 9명 프레젠테이션, admission 항상 불가 |
| 클라이언트 | `mobile-reader-interpretation-service.ts`, `mobile-reader-response-binding.ts` | Reader/Reading/domain 응답 결속, 현재 Bearer로 Thread 조회 후 Reader 비교 |
| Preview HTTP | `reader-interpretation-preview-http.ts`, `packages/api-client/src/reader-interpretation.ts` | Body는 **{threadId, officialReadingId}** 두 값뿐, 응답 Preview schema 버전화 |
| A1/A2 | `product-reader-eligibility-policy-v1.ts`, `official-reading-reader-admission-v1.ts` | server-only rule lookup/정확한 Grant·source proof. Product 운영 adapter 미확인 시 차단 |
| Reader 공개 | `reader-production-rollout-policy-v1.ts` | `READER_RUNTIME_PUBLIC_ACTIVATED_V1=false`, 내부 세연 후보만 |
| Production 실행 | `reader-interpretation-preview-postgres-execution.ts` | canonical subject transaction·activation·A2 검증 seam. 실제 approved Product port는 명시적 주입 필요 |
| Public 경로 | `vercel.json` 및 `api/me.ts` | Reader Interpretation 공개 rewrite/dispatch 없음 |
| Character A3 | #1815 V2 plan/renderer/semantic guard 병합 | bounded 기능 구현 ≠ public Reader/Chat V2 운영 연결 |
| Commerce | P0-CM-03/실판매 SKU·실결제/fulfillment 승인 | 현 기준 완료 증거 없음. 문서·합성 테스트로 대신할 수 없음 |

최종 출시 결정은 GitHub PR 병합/CI 성공만으로 내려선 안 된다. 운영 정책 row, Grant 발급, 배포·회수 및 사용자의 실제 E2E 증거가 따로 필요하다.

## 3. 권한과 책임 경계 (불변)

| 담당 | 서버 소유 판정 | 모바일 역할 |
| --- | --- | --- |
| Auth/DB | canonical Subject, owned Thread, exact official Reading, version/hash, revoke 처리 | 현재 세션으로 호출, 신원 추측하지 않음 |
| Product/Commerce | approved Product/spec/domain rule, **실제 purchase-backed Reader Grant** 및 유효기간·환불 | 상품/구매 권한 자체를 계산하지 않음 |
| Reader Runtime | pinned Character Release/Bundle, Reader rollout, A2 one-use proof, A3 bounded semantic | 서버에서 허용된 결과만 표현 |
| Saju | 공식 의미·근거·불확실성/grounding | 기존 official record를 보존 |
| frontend-integration | 오류 표현·로딩·Reader 소개·비권한 표시·접근성 | 버튼 상태는 서버의 허용 사실과 별도 공개 스위치를 모두 요구 |

**Reader별 4개 상태를 분리:** productEligibility ≠ purchaseAccess ≠ releaseApproval ≠ officialReadingAccess. 특히 `readerCharacterIds` 기록 이력은 이미 구매한 해설 결과나 현재 활성 권한이 아니다.

## 4. 단계별 사용자 동선 — 현재/목표 분리

1. 현재: 지난 읽기에서 서버 검증된 Official Reading을 열고 Reader 목록 9명을 봄. 모두 해설 실행 OFF.
2. 목표: 출시 승인된 환경에서만 서버가 해당 Subject×Reading에 대해 안전하게 투영한 Reader별 *표시용 접근 상태*를 조회. 조회 실패/미구현이면 비활성.
3. 목표: 보유 중인 특정 Reader 해설을 누르려면 서버가 확인한 owned single-Character Thread ID가 필요. UI가 `readerId`, 기록 연결 목록 또는 새 Chat Thread로 권한을 합성하면 안 됨.
4. 목표: 서버가 그 실행 시점에 canonical Subject, exact Thread Reader, pinned release/bundle, exact active Grant, Product rule, official artifact version/hash를 **다시 검증**하고 내부 proof 발급·일회성 소비. 클라이언트 preflight는 방어층이지 이 검증의 대체물이 아님.
5. 목표: 검증 후에만 A3 renderer/semantic guard가 보호된 응답을 생성. 서버 응답은 기존 Schema와 source identity가 일치하는지 모바일에서 재검증.
6. 목표: Reader별 해설 재열람/후속 대화는 **별도 서버 권한·기록 계약**이 승인되었을 때만 열림. 성공 응답 하나로 기록·대화 접근권을 자동 발급하지 않음.
7. 목표: 추가 Reader 구매는 동일 공식 Reading을 재사용하는 별도 Offer/Grant 흐름. 할인 여부·금액·SKU·환불 조건은 Commerce 승인 전까지 미정이며 버튼/가격 생성 금지.

## 5. 모바일 상태 머신 설계

- `PUBLIC_OFF`: default, 모든 Reader 해설 호출 금지·표시만 가능
- `NEED_SERVER_EVIDENCE`: public 후보라도 현재 Subject×Reading×Reader 증거 미확인, 실행 불가
- `CHECKING`: 서버 표시용 상태 조회/갱신 중, 버튼 차단
- `WITHHELD`: 권한 없음/미승인/서버 거부. 외부 메시지는 개인정보를 유추할 수 없는 범용 문구
- `TEMPORARY_FAILURE`: 네트워크/일시 오류. 결제 실패·Grant 없음으로 해석 금지; 재시도 가능
- `PROTECTED_FAILURE`: malformed, identity mismatch, semantic guard conflict, stale session. 해설 본문 표시 금지
- `SERVER_ADMISSION_PENDING`: Reader별 UI 증거가 모두 긍정이어도 최종 실행 시 서버 원자적 검증 요구
- `READY_TO_DISPLAY`: **서버 공개 정책 활성화 + 성공 응답·identity binding 검증 후** 현재 호출의 결과만 표시. 이 상태 자체는 이후 호출의 permission cache가 아님
- `PROTECTED_FALLBACK`: 서버가 유효 권한 이후 발급한 bounded fallback일 때만 사용자 안전 메시지로 표시, 정상 해설과 혼동 금지

현재 구현의 `MobileOfficialReadingReaderEntryViewStateV1.canStartInterpretation=false`를 임의로 true로 바꾸지 않는다. 실제 상태 API·출시 권한 소유자가 합의·배포한 후에만 별도 소비 모델을 작성한다. UI에 서버 내부 상세 거절 사유·타인의 구매 내역·policy revision을 표시하지 않는다.

## 6. 결정 필요 사항 (승인 전 OPEN)

| 결정 ID | Owner | 반드시 합의할 질문 |
| --- | --- | --- |
| D-01 | Product + Commerce | 승인된 live Product SKU/spec/domain, Reader rule source, 상품별 적용 Reader, Offer/환불/추가 Reader 가격 |
| D-02 | Commerce + DB | exact Subject×Official Reading×Reader 구매 Grant의 DB evidence, 소멸·환불 시점, revoke race/reveal 직전 검증 |
| D-03 | Reader + API | 운영 Reader 공개와 cohort/release 정책, public route 생성 여부 및 Read/POST 권한 경계 |
| D-04 | API + frontend | UI용 **안전한 Reader별 표시 상태 조회 계약** 필요 여부와 개인정보 비노출 응답 분류. 조회는 Grant 발급이 아님 |
| D-05 | API + DB | 클라이언트에 신뢰 가능한 `threadId`를 어떻게 제공·재조회할지. 일반 `POST /api/chat`은 구매 승인 수단이 아님 |
| D-06 | Reader + Saju | V2 renderer/semantic guard의 실제 Preview 경로 연결·응답 계약 및 protected fallback |
| D-07 | API + UX | 결과 persist/re-read, 재진입, 후속 Chat 해금의 서버 계약. 기존 채팅 메시지 내용과 분리 |
| D-08 | Release + QA | 단계적 세연 cohort, 확대 전 9 Reader 검증, live smoke, 즉시 OFF/rollback owner |

D-04/D-05는 새 endpoint가 필요하다는 확정이 아니다. 현 API의 서버 증거로 충분한지 owner가 결정해야 한다. 제안하는 any JSON shape/path는 전부 미승인으로 취급한다.

## 7. 구현 순서

P0: D-01~D-05 Product/Commerce/DB/Reader/API 승인; 출시 전 필수 증거 정리.
P1: 서버의 exact Reader Grant+Policy+Release 게이트를 HTTP 진입점 앞에 결속하고 OFF 상태 부정 테스트. Server-owned Thread 바인딩/권한 투영 계약 합의.
P2: 해당 서버 계약만 대상으로 `@myeongha/api-client`에 엄격 응답 검증 및 모바일 native service 주입; Reader 소개→권한 표시→실행 상태 머신 연결. OFF 기본값은 별도 승인 때까지 보존.
P3: 서버 result와 출처를 유지하여 화면 표시; 해설 기록·후속 Chat은 승인된 재열람/Chat 계약에 한해 별도 트랙.
P4: synthetic+staging+production cohort E2E, revoke race/identity isolation/rollback을 실제 데이터 경계에서 확인한 뒤 명시적 출시 승인.

## 8. 설계 범위 제외

현재 PR은 모바일 UI/API 구현이 아니라 **검토 가능한 상세 설계 문서**다. 신규 Product catalog, Price, Offer, Entitlement grant, SQL migration, Reader Runtime public activation, Vercel rewrite, 결제 활성화, Character canon, Saju 해석 생성, 후속 Chat 공개를 포함하지 않는다.

참조: #1777 범용화 설계, #1789 A2 설계, #1815 A3-γ, #1809 M3-α, #1813 M3-β-1, #1818 M3-β-2a, docs/architecture/COMMERCE_ENTITLEMENT_ARCHITECTURE_V1.md, MyeongHa_UX_Reading_Reader_Knowledge_Spec_v1.1.
