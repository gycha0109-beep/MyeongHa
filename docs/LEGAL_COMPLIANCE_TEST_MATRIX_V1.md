# LEGAL L1–L5 전체 테스트 시나리오 매트릭스 v1

> 범위: PR #2504 법무 코드·관련 인증·Commerce 내부 경계. 2026-10-25. 이 표는 **테스트 계획/추적성**이며 자동 시험 통과 자체를 법령 준수·Production 인수로 해석하지 않는다. 소유 트랙 #2318/#2488/#2299/#2301은 미병합이므로 본 PR에서 권한을 복제하지 않는다.

**분류:** S1 = TypeScript/Vitest/거버넌스·정적 검증, S2 = Production과 분리된 PG17, S3 = 로컬 mock 브라우저/네이티브 export, HOLD = 현재 실행 불가한 실제 계약·사용자 승인·운영 증거. **모든 검증은 실제 PR HEAD SHA와 로그로 판정하며 미실행을 PASS로 표기하지 않는다.**

**검증 실행:** `.github/workflows/legal-full-scenario-validation.yml` — 범위를 나눈 6개 독립 잡; S4 최종 `ci-integration.yml`이 아니고 Production에 접근하지 않는다.


## L1 개인정보·권리행사·삭제/복원

| 시나리오 | 기대 결과·검증 목표 | 검증 출처/명령 | 단계 |
|---|---|---|---|
| L1-01 | 정보 확인 패널 및 실제 링크 정상 | `test/legal-privacy-rights-surface.test.ts` | S1 |
| L1-02 | 권리 신청을 접수했다고 허위 안내하지 않음 | `test/legal-privacy-rights-surface.test.ts` | S1 |
| L1-03 | 한/일/번체 안내문 정합 | `test/legal-privacy-rights-surface.test.ts` | S1 |
| L1-04 | 익명·타인 인증으로 계정 삭제 시작 불가 | `test/account-deletion-start-api-boundary.test.ts` | S1 |
| L1-05 | 삭제 worker의 Subject 경계·트랜잭션 복구 | `test/account-deletion-worker-runtime-postgres.e2e.test.ts` | S1 |
| L1-06 | 59 테이블 삭제/익명화/보존 승인 그래프 변경 방지 | `verify:approved-account-deletion-policy · verify:account-deletion-disposition-execution-gate` | S1 |
| L1-07 | 복원 ledger·키·P30D 정책 실행 계약 확인 | `verify:production-postgres-privacy-recovery-ledger-workflow · verify:postgres-privacy-reconciliation-plan` | S1 |
| L1-08 | PortOne 신원정보 처분 후보와 Privacy 충돌 탐지 | `verify:portone-identity-privacy-candidate` | S1 |
| L1-09 | DB 본환경 24h 파기·백업 복원 후 재노출 0 | `실 운영 DB·복원·권리 접수 증빙` | HOLD |
| L1-10 | 신규 1740–1743 테이블의 최종 파기 그래프 승인 | `개인정보 처분 책임자(사용자) 결정` | HOLD |

## L2 가입·연령·PortOne A1·소셜

| 시나리오 | 기대 결과·검증 목표 | 검증 출처/명령 | 단계 |
|---|---|---|---|
| L2-01 | 14/19세 KST 경계·음력 불확실·미성년 직접결제 거절 | `test/legal-minor-age-policy-v1.test.ts` | S1 |
| L2-02 | 사주 입력·게스트·채팅 보호 화면의 미성년 경고 | `test/legal-minor-policy-surfaces.test.ts` | S1 |
| L2-03 | PortOne VERIFY 서버 재조회만 신뢰 | `test/legal-portone-v2-identity-verification-contract.test.ts` | S1 |
| L2-04 | ID 소유자 불일치·만료·중복·위조 부인 | `test/legal-portone-v2-identity-age-finalization-v1.test.ts` | S1 |
| L2-05 | 신원 HTTP 입력 상한·상태·제한 응답·오류 노출 | `test/legal-portone-v2-identity-http-v1.test.ts` | S1 |
| L2-06 | 가입 전 이메일 생성 후 기존 Member 결속/복구 실패 | `test/legal-portone-preenrollment-member-signup-v1.test.ts` | S1 |
| L2-07 | Guest/Member 증명 1회 사용과 인증 오류 | `test/legal-portone-preenrollment-v1.test.ts` | S1 |
| L2-08 | Google/Kakao 소셜 기존/신규 회원 분리 | `test/legal-portone-preenrollment-social-v1.test.ts` | S1 |
| L2-09 | 소셜 state 서명·동시 재사용·TTL·IP rate limit | `test/legal-existing-social-state-authority-v1.test.ts · test/legal-portone-preenrollment-social-v1.test.ts` | S1 |
| L2-10 | 네이버 미지원 브리지 fail closed | `test/legal-portone-preenrollment-social-v1.test.ts` | S1 |
| L2-11 | 인증 A1 OFF이면 기존 로그인 호환 | `apps/api/src/supabase-auth-http.test.ts` | S1 |
| L2-12 | 회원·게스트 소비·삭제·병합·만료·RLS/ACL | `portone-identity-age-authority-pg17 (1740/1741/1742)` | S2 |
| L2-13 | 상태 동시 두 소비 중 하나만 성공 | `portone-identity-age-authority-pg17` | S2 |
| L2-14 | 브라우저 실제 로그인·Guest 부트스트랩·리로그인 | `Web browser smoke (local synthetic Chrome)` | S3 |
| L2-15 | PortOne 실채널 브라우저 리디렉션/본인확인 | `실채널 계약·서버 키·실기기` | HOLD |

## L3 국외 처리·민감데이터·AI

| 시나리오 | 기대 결과·검증 목표 | 검증 출처/명령 | 단계 |
|---|---|---|---|
| L3-01 | AI 목적지는 OpenAI/Gateway 지정 origin만 | `test/legal-seyeon-external-egress-evidence-v1.test.ts` | S1 |
| L3-02 | Gateway 모델 namespace 외 공급자 차단 | `test/legal-seyeon-external-egress-evidence-v1.test.ts` | S1 |
| L3-03 | 민감 입력 주의 고지와 전송 이전 위치 | `test/legal-sensitive-input-guidance.test.ts` | S1 |
| L3-04 | 아웃바운드 경계 계약·비허용 외부 URL 차단 | `test/legal-external-ai-egress-contract.test.ts` | S1 |
| L3-05 | 서버 DB API 외부 노출·개인정보 우회 차단 | `verify:production-data-api-containment` | S1 |
| L3-06 | 실 송수신 메타 필드·국가·위탁/DPA 증거 비교 | `실 운영 환경·공급자 계약·트래픽` | HOLD |
| L3-07 | 민감 대화 원문 로그·학습/재사용/삭제 실제 통제 | `공급자 계약·운영 감사 증거` | HOLD |

## L4 구매·환불·S7

| 시나리오 | 기대 결과·검증 목표 | 검증 출처/명령 | 단계 |
|---|---|---|---|
| L4-01 | 유료 상품 공개/생성 모두 OFF 유지 | `test/legal-production-adult-purchase-hold-v1.test.ts · test/legal-release-boundary-integrity-v1.test.ts` | S1 |
| L4-02 | 구매/PG 호출 전 소유자의 고지·ACK DB 확인 | `apps/api/src/payment-attempt-create-http.test.ts` | S1 |
| L4-03 | 기존 Payment Attempt handoff에도 게이트 재검증 | `apps/api/src/payment-attempt-handoff-context-http.test.ts` | S1 |
| L4-04 | 무고지·다른 구매·실PG 이전·역순 ACK 거절 | `test/legal-digital-reading-checkout-admission-v1.test.ts` | S1 |
| L4-05 | 서버 영수증→고지→T2→실제 제공의 합성 상태 전이 | `test/legal-commerce-checkout-delivery-e2e-v1.test.ts` | S1 |
| L4-06 | 검증 Receipt 없는 인도·중복 고지·ACK·인도 거절 | `legal-commerce-checkout-delivery-pg17 (1743)` | S2 |
| L4-07 | 결제 후 handoff 재사용·다른 Unit·RLS·ACL 거절 | `legal-commerce-checkout-delivery-pg17` | S2 |
| L4-08 | 법정 하자·미제공·중복 결제·가분적 미제공 우선 | `test/commerce-digital-reading-withdrawal-review-v1.test.ts` | S1 |
| L4-09 | 차단된/누락된 영수증·타인 요청·보조 단위 거절 | `test/commerce-digital-reading-withdrawal-orchestration-v1.test.ts` | S1 |
| L4-10 | S7 서버 prepare와 실제 제공을 구분 | `test/legal-reader-s7-original-receipt-withdrawal-e2e-v1.test.ts` | S1 |
| L4-11 | 클라이언트 ACK·재시도·타임라인 이상은 인도 확정 아님 | `test/legal-reader-s7-original-receipt-withdrawal-e2e-v1.test.ts` | S1 |
| L4-12 | 원본 Receipt revoke·Grant 분리·타 구매 증빙 대체 거절 | `test/legal-reader-s7-original-receipt-withdrawal-e2e-v1.test.ts` | S1 |
| L4-13 | 원본 DB Owner 2250/2300 실SQL + S1 잠금 경합 | `DB Owner Draft #2301 S7 직접 실행/인수` | HOLD |
| L4-14 | 실클라이언트 성공 전송과 독립 인도 증거 재현 | `실 S7 전송/ACK/후속 반환 가용성` | HOLD |
| L4-15 | 소비자 환불 요청 접수·청약철회·결제 취소 PG 전 과정 | `고객 UI·Commerce 운영 계약·PortOne 테스트채널` | HOLD |

## L5 AI 고지·약관·문서/접근성

| 시나리오 | 기대 결과·검증 목표 | 검증 출처/명령 | 단계 |
|---|---|---|---|
| L5-01 | 공개 진입 AI 사전 고지의 진입버튼 선행 | `test/legal-ai-disclosure-surface.test.ts` | S1 |
| L5-02 | 대화 허브·채팅 AI 결과 라벨 | `test/legal-ai-disclosure-surface.test.ts` | S1 |
| L5-03 | Reading 상세·Records 웹/네이티브 라벨 | `test/legal-ai-disclosure-surface.test.ts` | S1 |
| L5-04 | 다국어 ko/ja/zh-TW 소스 문구 일치 | `test/legal-ai-disclosure-surface.test.ts` | S1 |
| L5-05 | 개인정보 권리 패널 aria-expanded/controls | `test/legal-privacy-rights-surface.test.ts` | S1 |
| L5-06 | 실제 브라우저 로그인 시각·쿠키 경계 smoke | `Web browser smoke + build:web` | S3 |
| L5-07 | iOS/Android 앱 번들 및 계약상 고지 포함 | `Mobile export:ci + verify:mobile-export-artifacts` | S3 |
| L5-08 | 실기기 VoiceOver/TalkBack·화면 리더 검사 | `실기기 수동 검사` | HOLD |
| L5-09 | LEGAL_001/002/003 공식 정책·사업자·연락처 최종 게시 | `사용자 최종 승인·공급자 증빙` | HOLD |

## 실행 판정 기준

1. **S1/앱:** `npm ci --ignore-scripts`, `npm run typecheck`, `npx vitest run test/legal-*.test.ts`와 인접 Payment/Auth/Privacy tests. 하나라도 fail이면 해당 SHA의 S1은 FAIL. 로그에는 실제 테스트 총수를 명시한다.
2. **S1/거버넌스:** 승인 59개 테이블의 DELETE 46/ANONYMIZE 4/RETAIN 9 해시·P5Y/P30D 회귀와 DB containment; 검사 실패는 무단 재승인/정책 변경으로 고치지 않는다.
3. **S2:** PortOne 제안 SQL 1740–1742, Commerce 제안 1743을 각각 별도의 PostgreSQL 17.6 컨테이너 `localhost` / 일회성 `myeongha_ci_case_숫자` DB에만 적용. 수동 또는 Production migration 금지. 교차 Subject, 중복, 만료, RLS/ACL, 소유 거래 및 결제 후 우회 거절.
4. **S3:** chrome local mock 웹 로그인/게스트 브라우저, 정적 Web 배포 검증, 비상업 iOS/Android Expo export. 이는 실제 PortOne 로그인, SameSite cross-domain provider callback 실증, 실기기 접근성, Production 호스팅 인수가 아니다.
5. **S4:** CI Integration은 로드맵 §28 및 기존 `LEGAL_COMPLIANCE_VALIDATION_PLAN_V1.md`의 **전 기능/소유 트랙 완료 조건 이후**에만 별도 핀 고정 SHA로 실행. 이 매트릭스의 초록색 배지는 S4 결과를 대신하지 않는다.
6. **S5/HOLD:** 계약·신원채널·실결제·운영 DB·권리접수·국외처리 증빙·실사용 약관·실제 S7 인도가 필요한 항목은 `미검증`으로 명시하고 정상/합성 테스트 성공에 끼워 넣지 않는다.

## SHA별 실행 결과

- 이 문서가 최초 커밋될 때에는 **모든 시나리오의 최신 SHA 결과는 미검증**. GitHub Actions의 실제 검증된 URL, HEAD SHA, 성공·실패·실패 상세는 후속 결과 절에 기록한다.
