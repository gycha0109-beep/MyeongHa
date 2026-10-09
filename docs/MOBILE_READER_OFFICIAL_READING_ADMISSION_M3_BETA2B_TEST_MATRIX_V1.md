# M3-β-2b 검증 매트릭스와 배포 종료 기준 v1

> Status: DRAFT TEST CONTRACT / NO EXECUTION CLAIM
> 관련 설계: MOBILE_READER_OFFICIAL_READING_ADMISSION_M3_BETA2B_DESIGN_V1.md
> Owner 핸드오프: MOBILE_READER_OFFICIAL_READING_ADMISSION_M3_BETA2B_OWNER_HANDOFF_V1.md
> 이 표는 검증 대상이며 현재 완료된 실제 테스트 결과가 아니다. Test fixture의 positive case와 운영 접근 권한은 구분한다.

## 1. 테스트 환경 구분

- Unit: pure Reader view-model, API parser, identity binding 및 fail-closed. 서버 Product/Commerce/Grant를 모의하되 테스트의 승인 증거를 운영에 재사용하지 않음.
- Integration: isolated canonical Subject PostgreSQL, auth, Reader access metadata, approved rule, exact artifact, pinned release, Reader A2/A3, Saju guarded runtime. 실제 current transaction/revoke 규칙과 맞춰 검증.
- Staging: 실제 배포된 별도 호스트·비운영 정책, 결제 sandbox 및 격리 Subject. 실패 상태에서 원본 artifact 및 Saju 호출 0 보증.
- Production: Product/Commerce/Reader/DB/Release 소유자 명시적 승인 뒤에만 제한적 세연 cohort. 실결제/실권한 복원·환불 등은 정책 승인 범위 내 별도 실측. 전 Reader 일괄 오픈 금지.

## 2. 기능·권한 테스트 매트릭스

| ID | 시나리오 | 반드시 확인할 것 |
| --- | --- | --- |
| AUTH-01 | 공개 스위치 OFF | bearer 조회, thread query, artifact read, Saju/LLM, Reader HTTP 호출 모두 0 |
| AUTH-02 | owner Subject가 다른 Thread | generic DENY, 해설·원본 반환 0 |
| AUTH-03 | Reader A에 권한, Reader B 요청 | B의 정책/원본/해설 0, A Grant 공유 금지 |
| AUTH-04 | Reading A에만 Grant, Reading B 요청 | B 접근 거부, source mix 금지 |
| AUTH-05 | 동일 Reader지만 다른 bundle/release | stale scope/proof 거부 |
| AUTH-06 | 조회 직후 Thread Reader 교체/권한 변경 | 서버 최종 실행 시 재검증·거부 |
| AUTH-07 | entitlement refund/revoke/expire | 변경 후 새 호출 불가, 처리 중 생성한 본문 노출 정책까지 검증 |
| AUTH-08 | 두 개 이상 독립 Grant 중 하나 revoke | 남은 유효 Grant의 권한만 보존(해당 정책 기준) |
| AUTH-09 | 타인 Reading의 존재 추론 | 외부 status/error/content/latency 차이로 존재를 노출하지 않음 |
| AUTH-10 | cache/replay/duplicate/ticket 재사용 | server-only A2 proof는 동일 실행 한 번만 소비 |
| AUTH-11 | malformed/unknown Product rule | raw artifact 및 Saju 호출 0 |
| AUTH-12 | Product 적격지만 구매 Grant 없음 | 해설 차단, UI에서 '구매됨' 표시 금지 |
| AUTH-13 | 구매 Grant 있지만 Reader 비공개 | 해설 차단, 공개 정책 우선 |
| AUTH-14 | 소유 Reading은 delivered 아닌 상태 | 해설·재열람 진입 차단 |
| AUTH-15 | current Release가 비게시/컨텐츠 무효 | 해설 차단, Published Character 흉내 생성 금지 |
| AUTH-16 | 서버 verified policy adapter 누락/예외 | fail-closed, 인위적 'standard_all_readers' 대체 금지 |
| AUTH-17 | Product 후보 `standard.love_relationship`의 출시 비활성 | 정가 결정만으로 Offer/Grant/paid activation 생성·공개 0 |
| AUTH-18 | valid Preview result를 paid result로 재사용 | `lifecycle=preview`는 결제/fulfillment/persistence 권한이 아니므로 paid 기능 차단 |
| HTTP-01 | Preview body에 readerId/productId/offerId 추가 | strict rejection, server-owned Reader만 사용 |
| HTTP-02 | invalid UUID, duplicate JSON key 정책 | malformed input 거부; parser 및 transport 정책으로 검증 |
| HTTP-03 | 응답 공식 Reading ID/Reader/domain/utterance 불일치 | 클라이언트 결과 표시 0 |
| HTTP-04 | protected_fallback + 몰래 utterance/body | strict parser가 비정상 응답 거부 |
| HTTP-05 | 네트워크 timeout 및 401/403/404/409/5xx | 민감 원인 추정·결제 권유 없이 안전한 표시/재시도 |
| HTTP-06 | 재시도, 앱 복귀, 로그인 변경 중 요청 응답 지연 | 늦게 도착한 이전 Subject의 해설이 화면에 나타나지 않음 |
| HTTP-07 | 동일 요청 반복/응답 손실 | Saju/LLM 중복 결제·중복 결과 정책의 서버 보증 확인 (idempotency 설계 필수) |
| HTTP-08 | 인증 Thread read 통과 후 Grant revoke | 현재 결과 표시 또는 Reader 실행을 클라이언트 조회 결과만으로 승인하지 않음 |
| HTTP-09 | 미래 API가 Preview와 다른 schema/lifecycle 반환 | 출시 승인된 versioned parser가 없으면 오류 처리, Preview parser를 억지로 통과시키지 않음 |
| HTTP-10 | 서버 OFF / internal_preview 외 공개 모드 조작 | 백엔드 Production reader activation이 미승인 요청을 차단, native 앱만 OFF여서는 불충분 |
| UX-01 | 처음 Reader 9명 목록 표시 | 프리뷰/컨셉 ≠ 상품 지원/권한/공개임을 명시 |
| UX-02 | 기존 공식 Reading 다시 읽기 | 원문 결과, 제목, 단계, 근거 무변경 |
| UX-03 | 타 Reader 추가 구매 UX | 신규 사주 재계산 금지; 승인 SKU·가격 없다면 구매 CTA 숨김 |
| UX-04 | 정보 없는 Reader, 접속 실패 | 기본 잠김, 상세 구매/Reading 유무 추측 금지 |
| UX-05 | 시각·스크린리더 접근성 | disabled action은 눌러도 네트워크/구매 발생 0 |
| UX-06 | Reader 해설과 후속 Chat | 해설 본문을 임의 chat message에 주입하지 않음 |
| UX-07 | 서버에서 다른 Reader 해설 열람 | 정확한 별도 Grant 없으면 기록 조회 불가 |
| UX-08 | 첫 상품 후보와 추가 Reader 판매 UI | `standard.love_relationship` 정가 KRW 8,900은 현 시점 결제 가능 Offer가 아님. Web-only 정책·미승인 할인/추가 Reader 가격을 표시·판매하지 않음 |
| UX-09 | Preview 내부 응답과 유료 해설 UX 구분 | 내부 Preview 성공으로 paid Reading 전달·기록 저장·Chat 해금 표시하지 않음 |
| SAJU-01 | 9 Reader×9 standard domain synthetic coverage | Product eligibility와 canonical Saju 의미 공통, persona만 차별화 |
| SAJU-02 | unsupported premium restricted | 승인 allowlist 이외 Reader 거부 |
| SAJU-03 | semantic/grounding hash 변조 | 원본/의미 위조 차단, protected fallback 또는 거부 |
| SAJU-04 | 서버 A3 guard fail | 사주 의미 유출 없이 guarded fallback, 정상 해설 성공으로 오인 금지 |
| OPS-01 | 공개 게이트 오픈 전 사전 검증 | app version/build/backend revision/catalog/Grant/release 맞춤 |
| OPS-02 | 서버 kill switch 또는 rollback | 기존 앱 설치분도 신규 Reading 요청을 즉시 거부 |
| OPS-03 | 관측·프라이버시 감사 | 서버 로그의 Subject/Reading/거래·증빙·사주 본문 최소화 및 접근통제 |
| OPS-04 | 약관·환불·복원/다중 단말 | Commerce 승인 후 사용자 권한과 UI 상태 일치 |
| OPS-05 | 과거 #680 배포 문제 상태 확인 | #680 CLOSED는 repo 배포 권한 이슈의 이력이며 Product/Reader/결제 출시 승인 근거로 사용하지 않음 |
| OPS-06 | 신규 Native checkout 호출 또는 미승인 외부 결제 이동 | P0-CM-01 Web one-off 정책에 반하는 앱 내 결제/IAP/자동 redirect 금지 |

## 3. 특히 중요한 경계 테스트

1. **미구매 Reader**: DB access metadata 단에서 deny. Product rule lookup 이전 raw artifact 0, Saju 0. 시뮬레이션 테스트에서 이 원칙과 실제 DB query trace가 일치해야 한다.
2. **미승인 Product**: A1 rule 조회 오류·unclassified/disabled/stale이면 raw artifact 0, Saju 0.
3. **revocation race**: Reader 생성 중 환불/회수가 발생하면 결과를 그대로 공개하지 않는다. 기존 transaction 연동의 최종 reveal 검증·취소 가능한 실행 경계는 DB/Reader owner가 정한다.
4. **캐시된 상태**: client visible 'allowed' 또는 과거의 성공 응답은 재호출 허가 근거가 아니다.
5. **서버 내부 proof**: 클라이언트가 proof ID, nonce, Reader Grant object, Product/Policy revision을 합성·요청에 넣지 않는다.
6. **프로세스 종료·네트워크 끊김**: 이미 승인된 해설이라도 delivery/idempotence/과금 경계를 별도 검증한다. 더블 청구·중복 사용 권한 금지.

## 4. 출시에 필요한 검증 증거

| 게이트 | 승인 주체 | 증거 |
| --- | --- | --- |
| G1 Product classification | Product/Commerce | SKU/spec/domain별 승인된 versioned Reader rule |
| G2 Actual purchase → Grant | Payment/Entitlement/DB | verified receipt + exact Reader access + revoked/expired audit |
| G3 Admission and runtime | Reader/A2/A3/Saju | Source hash, one-use scope, semantic guard, DB/concurrency tests |
| G4 Public endpoint security | API/Security | Auth, RLS, rate limit, bounded body, replay/abuse guards, public OFF negative test |
| G5 Mobile integration | frontend-integration | Strict API contract, 9-reader UI, session-race test, Android/iOS bundle, store build |
| G6 Staging and real cohort | QA/Release/Product | Complete journey: checkout→Grant→Official Reading→Reader→archive→followup→revoke |
| G7 Rollback readiness | Operations | Feature kill switch, api-client fallback, privacy-preserving logs and SLO |

## 5. PR 경계와 적용 순서 (예상)

- PR-A (Reader/Commerce/DB): 운영 상품 source와 exact Grant evidence의 승인 계약·운영 adapter. 운영값 승인 없으면 code-only tests 후 HOLD.
- PR-B (API/Reader): server-owned Reader/Reading Thread 바인딩, 공개 여부·Preview/paid response lifecycle·rollout 계약. 기존 Preview `{threadId, officialReadingId}`는 참고 호환 계약이지 paid schema로 자동 채택 금지; public OFF negative checks.
- PR-C (frontend): 승인된 서버 응답을 통한 Reader 상태/Thread 획득/실행 UI. 클라이언트 permission 발급 금지.
- PR-D (Records/Chat): 승인된 Reader별 재열람 및 후속 채팅 read-only provenance 연결. 별도 출시 통제.
- PR-E (QA/Release): 제한 cohort 실측, 환불·권한 종료, rollback. Gate 충족 전 Production public OFF.

이들은 모두 제안된 작업 단위이며 owner 승인/기존 변경과 중복 확인 후 조정한다. PR-A/B/C의 선후 관계에서 승인 누락을 모바일 코드로 우회하지 않는다.

## 6. 종료 판정

- **A — 설계 검토 PASS 조건**: D-01~D-08 담당자·승인 증거·정확한 API/상태 경계 결론 확정. OPEN 항목이 남으면 `DESIGN DRAFT / A HOLD`.
- **B — 구현 PASS 조건**: 실제 서버 계약과 모바일 연결, 거부 보안 테스트/전체 CI/통합 CI/병합 후 main PASS. 설계 문서만으로 B PASS 불가.
- **C — 운영 PASS 조건**: 실판매·Grant·공식 Reading·Reader·기록·후속 대화·권한회수 경로를 실제 환경에서 검증하고 Rollout owner 최종 승인. 하나라도 미확정이면 C HOLD.

**현재 판정**: 상세 설계 초안·테스트 매트릭스 및 Owner 핸드오프 작성. D-01~D-08 승인 리뷰 0건, A HOLD. 구현·공개 미변경, B HOLD / C HOLD. 설계에 기재된 테스트를 아직 실행했다고 주장하지 않는다.
