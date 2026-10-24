# 명하 법무·규제 준수 트랙 — 최소 실행 로드맵 v1

- 기준: 2026-10-23 대한민국 현행법 / MyeongHa `main@78425326` / Privacy #2318, Draft #2301·#2488.
- Track Key: `legal-compliance`. 제품·법적 최종 판단자는 사용자 1인. 가상 승인자 없음.
- **이 문서는 법률 적합성 인증이 아니다.** 코드·계약·운영 설정의 실제 증명이 없는 사항은 출시 조건 미충족으로 유지한다.
- 기존 `P0-PR-02` D1/D2/D3/D5/D6, D4 사용자 진술, `P0-PR-01` P5Y/P30D, RR-03 정책 **변경하지 않는다**.

## 1. 2026-10-23 최신 구현 기반 위험 분류

| 범위 | 확인된 구현·정책 | 실제 미해결 위험/불확실성 | 출시에 필요한 증명·소유 트랙 | 우선 |
| --- | --- | --- | --- | --- |
| **L1 삭제·복원** | `docs/OFFICIAL_READER_S4_PRIVACY_POLICY_DECISION_V1.md` 승인; #2318 OPEN. DB Draft #2301 및 합성 PG15/17 E2E Draft #2488에서 격리·삭제·구백업 재노출 방어 개발 | **운영 실증 미확인**: 본 DB 24h 내부 파기 목표의 실측, 실제 P30D 백업 복원/삭제 원장 영속성·키 파기, 권리행사 접수 | DB/Privacy는 기존 구현·테스트 지속. Legal은 개인정보 보호법 §21 파기/법정 예외와 §35~38 권리행사 체크; 실제 데이터·운영 증거 확보 전 완료 불가 | 높음 |
| **L2 민감정보·아동** | 사주 폼 생년월일/시간, 선택 성별 확인. P0-AGE-01 중 최소 연령 제품 정책은 2026-10-23 부분 결정, 캐릭터 콘텐츠·공통 신뢰 연령검증은 OPEN. 자유 대화가 건강·종교·성생활 등을 포함할 가능성 존재. 출생시간 자체는 법정 민감정보라고 단정하지 않음 | **실제 전송·저장 필드/필터 미실증**, 만 14세 미만 개인화 제한은 Birth Profile API에 부분 반영, 가입/게스트/대화 서버 전체 검증 미완료 | Legal은 개인정보 보호법 §23, §22의2 기준 입력·전송·저장 경로 명세; UX/API 소유 트랙에 차단/고지/법정대리인 동의 필요 조건 인계. 정책 연령(무료 14+/직접 구매 19+) 부분 결정; 공통 연령 검증 및 서버·운영 증거 미완료 | 높음 |
| **L3 외부처리·국외이전** | `LEGAL_002_EXTERNAL_VENDOR_CONTRACT_REVIEW_KO.md`: 코드상 OpenAI, Supabase, Vercel, PortOne 경로 및 과거 계정 조회상 Supabase Singapore·Vercel Hobby 증거 | **현 운영 설정·실 송수신·계약 적용 미실증**. 위탁/국외이전 구분·데이터 항목·처리 기간·학습/재사용/삭제 지원 최종 미확정. 과거 Hobby 상업사용 약관 위험 재확인 필요 | Legal은 실제 공급자·국가·기반·위탁문서·고지 검증(개인정보 보호법 §26·§28의8). Ops는 호스팅 플랜/계약 증거, API는 실제 페이로드 경로 검증. 확인 전 미승인 외부 유료 원문 전송 금지 | 높음 |
| **L4 결제·환불** | `COMMERCE_DIGITAL_READING_REFUND_DISCLOSURE_POLICY_V1.md` 및 읽기 전용 `commerce-digital-reading-withdrawal-review-v1.ts` + 테스트 존재. 공개 판매 OFF | **제공 사실의 서버 증빙/상품별 고지·미리보기·결제·환불 UI 미검증**. 결제·내부 생성·T2 Commit만으로 제공 개시로 간주할 수 없음 | Commerce/S7이 실제 판매 단위·고지/인도·예외·가분적 미제공·취소/환급 검증. Legal은 전자상거래법 §17·§18 및 시행령 §21의2 대조·회귀 조건 인계 | 유료 출시 전 높음 |
| **L5 AI 고지·방침·약관** | LEGAL_001/002/003 **초안만** 존재; 대문·대화 React 화면에 명시적 AI 고지가 확인되지 않았음. 약관 게시/문의·처리방침 실사용 일치 미증명 | 무료 대화 화면의 **고지 누락 가능성**은 즉시 수정 대상. 외부업체·보존기간·권리행사·연령 미확정 상태에서 초안을 공개문서라고 표시하면 안 됨 | 이번 PR: 대문 사전 고지 + 대화 응답 표시 + 회귀 테스트. UX/Legal은 실제 화면 시각 검증, 읽기/결제 진입·서비스 약관 게시 완성. 인공지능기본법 §31, 개인정보 보호법 §30·§35~38 | **즉시** |

위험도는 **위반 확정 판정이 아니라 출시 전 확인 필요성**이다. 상업용 호스팅, 유료 원문과 AI 처리 경계, 환불 기능은 현재 공개가 막혀 있으므로 미구현만으로 이미 법 위반이라고 선언하지 않는다.

## 2. 중복 없이 끝내는 실행 순서 및 완료 기준

1. **L5-A (이번 PR):** 공개 첫 진입·대화 허브·대화방에 '생성형 AI 기반/실제 사람 아님/생성 결과' 고지. 회귀 테스트에서 사전 노출 순서·웹/모바일 번역 사전 일치 확인. **상태: 코드 구현; 실제 배포 사용자 시각 검증 대기**. 각 PR SHA별 CI/Workers Preview의 결과는 별도 확인하며 이전 GREEN으로 최신 SHA의 배포 성공을 추정하지 않는다.
2. **L3-A:** 기존 공급자 감사 문서와 실제 활성 endpoint/설정(비밀값 수집 금지), 국가·항목·목적·계약·보존/학습/삭제를 교차 대조. `확인됨/미확인/미사용` 구분; 미확인 송신 비활성. 실제 계약과 개인정보 처리방침 항목 일치 시 완료.
3. **L2-A:** 실제 사주·자유대화 입력 및 AI 로그 흐름 확인. 불필요한 민감정보의 영속화·외부전송 0, 필요한 예외의 적법한 근거 및 별도 동의 조건 확인. 만 14세 미만 처리 여부와 검증된 정책/진입차단 또는 법정대리인 동의 검증까지 완료.
4. **L1-A:** #2318/#2488 산출물에 법적 수락 조건과 운영 실증 결과만 결합. 실제 복원 후 삭제/회수 원문 재노출 0, 일반/보호 원문 분리, 본 DB 파기 지표, 권리행사 동선 증명. DB 구현 중복 금지.
5. **L4-A + L5-B:** 판매 단위별 고지/미리보기/실제 제공·미제공/하자/가분성/환불 접수·반환 및 약관·처리방침·AI 고지 **실제 게시와 동선 E2E** 검증. Commerce/S7 변경은 해당 소유 트랙에 인계.

완료는 **현행 법조항 + 실제 운영/코드 사실 + 공개 문구·입력/전달/삭제/환불 검증**의 교차 증거가 모두 있을 때만 선언한다. 기존 정책 재승인 요청이나 법적 서명 권한을 가진 가상 팀 생성 금지.

## 3. 이번 PR 소유 변경 및 인계

- 직접 수정: `apps/web/src/landing/LandingPage.tsx`, `apps/web/src/chat-hub/ChatHubPage.tsx`, `apps/web/src/chat/ChatPage.tsx`, `apps/web/ui-i18n.js`, `apps/mobile/src/ui/mobile-ui-copy.ts`, `test/legal-ai-disclosure-surface.test.ts`, `test/legal-external-ai-egress-contract.test.ts`, `test/legal-commerce-public-checkout-hold.test.ts`, `docs/LEGAL_002_EXTERNAL_DATA_PROCESSING_AUDIT_KO.md`. 캐릭터 생성 방식·모델·결제·DB·기존 일반 채팅 저장 정책 변경 없음.
- **한계:** 텍스트는 소스의 공개/허브/대화 화면에 삽입했으며 실제 배포의 사용자 시각 확인·Native UI 직접 노출·SSR 접근성·다른 AI 출력 진입점 전수 확인은 미완료. `LEGAL_003_AI_DISCLOSURE_DRAFT_KO.md`는 여전히 초안. 법정 표시 방법의 예외·세부 요건도 제공 형태별 별도 검토.
- UX/Chat 인계: 읽기 결과/후속 대화/기타 AI 출력에서 '생성 결과' 고지의 실제 시각 노출 확인. Commerce/S7 인계: **유료 결제 전** 디지털 콘텐츠 계약 범위·환불 법정 예외·AI 활용의 정확한 고지. DB/Privacy는 #2318 계속 소유.

## 4. 공식 법령(2026-10-23 시행본 확인)

- 개인정보 보호법(2026-09-11 시행) §21 파기, §22의2 아동, §23 민감정보, §26 위탁, §28의8 국외이전, §30 처리방침, §35~38 권리: https://www.law.go.kr/법령/개인정보보호법
- 전자상거래법(2026-07-21 시행) §17·§18 및 시행령 §21의2: https://www.law.go.kr/법령/전자상거래등에서의소비자보호에관한법률
- 인공지능기본법(2026-07-21 시행) §31 생성형 AI 사전 고지·결과 표시: https://www.law.go.kr/법령/인공지능발전과신뢰기반조성등에관한기본법

**제품 출시 가능 판정: 현재 증거로는 불가.** 공개/유료 활성화를 뜻하는 커밋, UI 약관 초안 게시, DB·결제 운영 변경을 본 트랙에서 실행하지 않는다.

## 5. 추가 검증·미완료 정책 증거 (2026-10-23)

- **L3:** Supabase 명하 프로젝트 Singapore 리전, Vercel 팀 현재 Hobby, AI 제공자 선택 코드에서 OpenAI 직접/AI Gateway 대체 경로, 전송 후보의 최근 대화·기억 요약 확인. 연결된 Vercel 프로젝트 환경변수 *이름* 조회는 **403 Forbidden**으로 거절되어 실제 선택되는 AI 전송 경로 및 DPA/재위탁·로그는 **미확정**. 운영 설정 접근 권한을 임의로 우회하거나 비밀값을 수집하지 않는다.
- **L2:** 사용자 위임에 따라 `LEGAL_MINOR_POLICY_V1_20261023`에서 무료 14+, 직접 결제 19+, 14세 미만 개인화 이용 제외를 **제품 정책으로 부분 결정**. 14세 미만 신고 출생정보의 Birth Profile 생성 API 거절, 가입 본인 선언 UI를 반영했으나, **이것은 인증된 연령 확인이 아니다**. 게스트·소셜·기존 회원·채팅 서버 강제와 캐릭터 표현 범위는 계속 미완료. 별도 보호자 동의 확인 플로우 도입 없음.
- **L1:** #2318 및 Draft #2488(합성 삭제/복원), Draft #2301(DB Authority) 현행 OPEN. 본 DB/백업 **운영 실증을 완료한 것으로 인정하지 않는다**. 권리행사 화면은 MyPage에서 공식 접수처 미연결 상태를 표시하고 있으며, LEGAL-002 초안은 게시되지 않았다.
- **L4:** `PORTONE_V2_BROWSER_CHECKOUT_PREPARATION_V1`, `PORTONE_V2_BROWSER_REQUEST_COMPOSER_V1`, `PORTONE_V2_BROWSER_SDK_EXECUTION_GUARD_V1`의 `active:false`/SDK OFF/공개 route 없음에 대한 Legal 회귀 테스트를 추가. *판매 비활성 증명*일 뿐 사전 환불 고지·인도·환급 구현 완료로 계산하지 않는다. 디지털 콘텐츠 환불 수동 분류기는 별도 Commerce 소유로 유지.
- **L5 게시:** 사업자 상호·연락처, 최종 실제 데이터 처리방침과 국외 이전 항목, 미성년자 범위가 검증되지 않아 LEGAL-001/002/003 초안의 사용자 공개는 계속 보류. 대화 AI 사전 고지 구현은 이 보류를 해제하지 않는다.

## 6. L1-A 권리행사 정보 동선 — 부분 구현 (2026-10-23)

- `apps/web/src/my/MyPage.tsx` 설정에 **개인정보 확인 · 권리 안내** 접이식 패널 추가: 기존 `birth.html` 출생정보 화면과 `records.html` 저장 기록으로 안내. `aria-expanded`/연결된 패널 레이블로 키보드·스크린리더 상태 확인 가능.
- 새 패널은 **읽기 전용 길찾기 안내**만 제공. 실제 열람·정정·삭제·처리정지 신청, 재인증, 접수·처리 완료 메시지 또는 계정 삭제 API 호출을 만들지 않았다. 정식 접수·문의 채널이 아직 없음이 안내되고, 실제 신청이 접수된 것처럼 표시하지 않는다.
- `apps/web/ui-i18n.js`와 `apps/mobile/src/ui/mobile-ui-copy.ts`의 일본어·번체중국어 authored UI 복제, `test/legal-privacy-rights-surface.test.ts`의 링크·무접수·다국어 회귀 테스트를 추가했다. Native 화면에 동일 패널이 있다는 뜻은 아님.
- **남은 L1 수락 조건:** 공식 개인정보 문의 접수 수단(운영 정보 확정), 신원 확인 및 접수·처리 이력, 권리행사별 법정 절차·예외·시한, 실 DB/백업의 실제 삭제·복원 후 비재노출 실증. DB/Privacy #2318·Draft #2488/#2301의 코드/운영 상태를 인수하되 중복 구현하지 않는다.

## 7. L2-A 사용자 입력 전 안내와 실제 경계 (2026-10-23)

- **채팅:** `apps/web/src/chat/ChatPage.tsx`의 전송 폼 직전에 민감한 내용·타인 개인정보 입력 주의 및 AI 답변 생성 사용 가능성 고지를 추가했다. 이 안내는 클라이언트 전송 차단·별도 동의·민감정보 탐지 시스템이 **아니다**. 실제 송신은 `apps/web/chat-runtime-client.js`의 POST 경로와 `production-seyeon-turn-send-runtime-v1.ts`/외부 모델 분기 정책을 따른다.
- **Birth Profile:** `apps/web/src/birth/BirthPage.tsx`와 `apps/web/src/reading/ReadingPage.tsx`의 명식록 생성 폼에 본인 정보만 입력하라는 안내와 명식 계산/저장 목적을 명시한다. 두 경로 모두 `/api/birth-profiles` POST를 호출한다. 기존 출생시각 모름 및 성별 미선택 옵션은 유지한다.
- **다국어/회귀:** `apps/web/ui-i18n.js`, `apps/mobile/src/ui/mobile-ui-copy.ts`에 일본어·번체중국어 작성 문구를 동기화하고 `test/legal-sensitive-input-guidance.test.ts`에서 전송 버튼 전 배치 및 화면 간 동일 목적 설명을 검증한다. Native 실제 화면 UI를 추가한 것으로 주장하지 않는다.
- **법무 미완료:** 대화 본문에 포함될 수 있는 법정 민감정보의 실제 저장·조회·AI 외부 전송·로그/재사용·삭제 실증, 사전 고지의 실배포 가시성, 필요한 적법한 처리 근거/별도 동의, **신뢰 가능한 공통 연령 인증 및 `P0-AGE-01` 캐릭터 표현 제한**. 14세 이상 본인 선언 체크박스는 서버 증명에 해당하지 않는다.
- **증빙 한계:** 기존 설계·코드상 안전 경계를 검토하는 단계이며, 민감정보 외부 전송 0이나 미성년자 수집 0을 증명했다고 판정하지 않는다.

## 8. 법령 검토 기반 미성년자 제품 정책 — 부분 구현 (2026-10-23)

- **정본:** `docs/LEGAL_MINOR_POLICY_V1_20261023.md`. 법령: 개인정보 보호법 §22의2, 시행령 §17의2, 민법 §4·§5. 법정대리인 동의·확인은 필요한 경우 정확히 검증되어야 하므로, 확인 체계가 없는 상태에서 만 14세 미만의 개인화/가입을 제공하는 대신 **서비스 대상 제외**를 선택. 만 14~18세는 무료 기능만, 직접 유료 구매는 만 19세 이상에 한함.
- **구현:** `apps/api/src/legal-minor-age-policy-v1.ts`, `birth-profile-create-http.ts`의 서버 기준 한국 날짜 계산 및 **DB 요청 전 403 차단**. 양력 14번째 생일은 허용, 음력 경계 생일은 보수적 보류. `apps/web/src/auth/AuthPage.tsx` 14세 이상 자기 선언, `apps/web/src/chat/ChatPage.tsx`·`apps/web/chat-runtime-client.js`의 **브라우저 채팅 자기선언 전 송신 보류**, `apps/web/src/birth/BirthPage.tsx`/`apps/web/src/reading/ReadingPage.tsx` 연령 안내, `apps/web/birth-runtime-client.js`/`apps/web/saju-hub.js` 거절 피드백 구현. 직접 유료 결제는 이전과 같이 비활성.
- **검증:** `test/legal-minor-age-policy-v1.test.ts`, `test/legal-minor-policy-surfaces.test.ts`, `test/birth-profile-create-http.test.ts`의 최소·성년·KST 자정·음력 경계·DB 진입 차단 테스트. Web/Mobile 정적 UI 번역 사전 동기화.
- **중요한 한계:** Birth Profile 생일 값이나 14세 이상 자기 선언은 신뢰할 수 있는 **연령/법정대리인 인증이 아니다**. 서버 회원가입/소셜·게스트·기존 계정·대화에 공통 연령 권위가 없으므로 **전 서비스의 14세 미만 이용·개인정보 수집 차단을 입증하지 못함**. P0-AGE-01 캐릭터 콘텐츠 표현 정책은 OPEN. 유료 구매 19+는 향후 Commerce 권위에서 확인 필요.
- **최종 상태:** L2 전체 완료 아님, 생산 운영/법정 동의 대체 아님, 출시 HOLD 유지. 기존 Privacy·DB·Commerce 권한 변경 없음.

## 9. L2-P: PortOne V2 본인확인 제공자 확정 (2026-10-23)

- 사용자 최종 선택으로 **PortOne V2**를 명하의 본인확인 제공자로 고정했다. `docs/P0_DECISION_REGISTER.md`에 `P0-AGE-02 = DECIDED`를 추가했으며 기존 결제 결정 `P0-CM-02`는 변경하지 않는다.
- V2 공식 SDK `requestIdentityVerification` 및 서버 단건조회 `GET /identity-verifications/{id}` 계약을 정본으로 한다. 브라우저 success 쿼리·콜백만으로 연령을 승인하지 않고, 서버 조회의 `VERIFIED` + 소유 Subject의 미소비 인증 시도 + 검증된 `verifiedCustomer.birthDate`를 판정한다.
- `apps/api/src/portone-v2-identity-verification-contract-v1.ts`에 **실제 PortOne 호출·DB 쓰기·공개 endpoint 없는 오프라인 검증 계약** 구현. ID 교체·재사용, 상태 오류, 형식 오류, 미성년은 거절하고 최소한의 연령 밴드만 반환. `test/legal-portone-v2-identity-verification-contract.test.ts` 회귀 검사 추가.
- **L2/출시 HOLD:** 인증업체 계약/요금제와 채널키 미확정, **서버 조회 HTTP 어댑터·오프라인 평가·권위 포트 오케스트레이션 구현**, 하지만 인증 시도 DB 원장·만료·원자적 소비의 실제 저장 권위, 회원·게스트·소셜 공통 인증 강제, 연령 확인정보 보존·삭제·처리방침, 운영 실증은 미완료. `PORTONE_V2_IDENTITY_VERIFICATION_LAUNCH_HOLD_V1`는 SDK·라이브 채널·공개 인증 API 모두 OFF. 별도 승인 없이 계약·실결제·실인증 활성화 금지.

## 10. L2-P 서버 단건조회·연령 판정 오케스트레이션 (2026-10-23)

- **실제 코드:** `apps/api/src/portone-v2-identity-verification-lookup-v1.ts`는 서버 전용 GET 요청 및 응답 파싱을 구현. PortOne 서버 재조회 `GET https://api.portone.io/identity-verifications/{id}`; 5초 기본/30초 최대 전체 deadline; JSON·HTTP 200 확인; 16KiB 최대 읽기/스트림 취소; redirect 차단; 오류에 비밀키/개인정보 원문 비포함. 인증 시도 ID와 소유 Subject 불일치/소비됨은 **네트워크 요청 전에 거절**.
- **저장 경계:** `apps/api/src/portone-v2-identity-age-finalization-v1.ts`에 저장소가 제공해야 하는 `readPendingOwnedAttempt`와 `consumeAndRecordAgeBand` 포트 계약 구현. Subject 소유·미사용 인증 시도 → 서버 조회 인증 성공 → 원자적 1회 소비 및 최소 연령 밴드 기록이 가능한 순서로 구성했다. **DB 실구현·발급/TTL/자동 마이그레이션을 제공하거나 호출하지 않음**.
- **검증:** `test/legal-portone-v2-identity-lookup-v1.test.ts`, `test/legal-portone-v2-identity-age-finalization-v1.test.ts`로 HTTP 인증 헤더/고정 URL/한정된 리소스/타임아웃, 14·19세 경계/본인 소유·미사용, 재사용·불일치, 개인정보 원문 비반환을 합성 검증.
- **다음 실제 구현:** 기존 DB/Privacy Authority 소유 트랙의 저장 모델 검토 후, 인증 시도 ID 발급·연결·만료 및 정확히 한 번 소비하는 DB 저장 권위를 연결. 그 뒤 Auth/Guest/Social/Chat API에서 같은 검증 상태를 참조하고 사용자가 실제 PortOne 채널과 API 키 계약을 준비한 때에만 SDK/공개 API를 활성화. 현재 모든 출시 게이트 HOLD.


## 11. L2-P PostgreSQL 시도 권위 제안 및 서버 연결 (2026-10-23)

- **구현:** `supabase/proposals/1740_portone_identity_age_authority_v1.proposed.sql`에 정규화된 최소 테이블 2개와 서버 호출용 발급/유효 조회/원자적 소비 SQL 제안. DB 시계 10분 유효기간, 동일 Subject당 1건 pending, replay/만료/삭제 상태 차단, Context assert 및 계정 row lock 포함. **이 SQL은 아직 DB에 적용되지 않았다.**
- `apps/api/src/postgres-portone-identity-age-authority-v1.ts`에서 기존 `executePostgresSubjectTransactionV1`을 통해 신뢰된 Auth/Guest 증거를 매번 Subject로 재해결하고 각 DB 작업을 별도의 짧은 트랜잭션에서 실행. 외부 인증 서버 조회는 DB 트랜잭션 안에서 실행하지 않으며, 새 공개 HTTP API·SDK는 등록하지 않았다.
- `test/legal-postgres-portone-identity-age-authority-v1.test.ts`에 모의 DB 트랜잭션 동작과 SQL 계약 테스트 추가. 실제 PostgreSQL 17 적용/권한/동시 실행 실증은 미완료.
- **DB/Privacy 인수 조건:** 제안 SQL의 Security Definer 권위 및 EXECUTE ACL, 35 DELETE / 4 ANONYMIZE / 9 RETAIN P5Y·P30D 삭제/복원 정합, Guest→Member 승격과 인증 시도 폐기, 연령 밴드 보존기간·권한 재확인 주기 확정. 그 전엔 production migration 및 데이터 수집 보류.


## 12. L2-P 검증 연령의 서버 이용 권한 연결 (2026-10-24)

- `supabase/proposals/1740_portone_identity_age_authority_v1.proposed.sql`에 검증된 Subject의 최소 연령 밴드를 읽는 private DB 함수 `qry_verified_legal_portone_age_v1` 추가. active Subject 검증·Subject context assertion·동시 삭제와 충돌하는 공유 잠금 적용. **제안 SQL은 운영 DB에 적용되지 않았음**.
- `apps/api/src/portone-v2-verified-age-admission-v1.ts`: 기존 Subject 인증 트랜잭션으로 `free_minor`/`adult` 조회. 무료 개인화는 두 밴드 허용, 직접 유료 구매 자격은 `adult`만 허용, 인증 기록이 없으면 거절. 미상 DB 상태는 조용히 성인으로 추정하지 않는다.
- `apps/api/src/chat-open-http.ts`·`apps/api/src/chat-turn-send-http.ts`: 서버가 검증한 연령 권위를 **명시적으로 주입한 경우**, 확인 전 채팅방 생성 또는 AI 전송을 거절하고 기록 조회 실패 시 503으로 차단. `production-seyeon-turn-send-runtime-v1.ts`에서 해당 서버 전용 주입 슬롯을 전달할 수 있게 연결했다. 실제 운영에서 이 슬롯은 **아직 미설정**, 따라서 전 서비스 연령 강제 구현 완료로 판정하지 않는다.
- 핵심 테스트만 추가: `test/legal-portone-v2-verified-age-admission-v1.test.ts`에서 연령별 이용 범위/미확인 거부, 기존 chat-open/turn-send HTTP 테스트에서 연령 미확인 시 DB 생성·AI 호출 금지 검증.
- **다음:** DB/Privacy 삭제 그래프·데이터 보존 정합 및 최소 PG 권한 검증 후 제안 SQL 적용, Auth/Guest/Social 서버 합류 지점과 실제 PortOne 본인확인 시도 발급·완료 HTTP 경로에 이 권위를 활성 연결. 라이브 인증/결제 모두 계속 OFF.


## 13. L2-P 본인확인 HTTP 및 삭제 정합 코드 (2026-10-24)

- **구현:** `apps/api/src/portone-v2-identity-http-v1.ts`에 Subject 인증을 선행하는 인증 ID 발급·PortOne 결과 확인·DB 원자 소비 처리기를 추가. 클라이언트는 Subject·만 나이를 선택할 수 없음. 인증 소유권/만료/한번 사용 결과가 모두 확인될 때 최소 ageBand만 반환. 아직 실제 라우트/SDK/실운영 네트워크로 배선하지 않음. 기본 OFF.
- **삭제 정합:** `supabase/proposals/1740_portone_identity_age_authority_v1.proposed.sql`에 Subject 상태가 비활성 또는 병합으로 변할 때 최소 개인정보인 인증 시도·연령 밴드를 즉시 삭제하는 트리거 제안. 계정 삭제는 Subject 행을 익명화하므로 FK ON DELETE CASCADE만 믿지 않는다. 신규 SQL은 **비적용 제안**이며 기존 승인된 삭제 정책 지문과 마이그레이션을 수정하지 않음.
- **최소 검증:** `test/legal-portone-v2-identity-http-v1.test.ts`로 OFF/발급/완료/재사용 차단. DB Authority/Privacy 소유의 신규 DELETE 처분, PG17 trigger·권한, 실제 환경 증빙 및 PortOne 사업자 채널 계약은 여전히 선행 조건.
- **다음:** 기존 삭제 복원·보존 계약에 맞춰 제안 SQL을 인수하고, 가입/게스트/소셜 공통 연령 검증을 활성화할 수 있는 상태인지 DB 적용 및 운영 증빙으로 판단. 결제/공개 인증 OFF 유지.


## 14. L2-P DB·Privacy 삭제 처분 추가 후보 + 비자동 배포 SQL (2026-10-24)

- **기존 승인 정책 보존:** `docs/operations/ACCOUNT_DELETION_DISPOSITION_POLICY_V1.json` 59 테이블/46 DELETE/4 ANONYMIZE/9 RETAIN, fingerprint `c745bacb0e9b2d13013c1048fc4273203af68b9c4816eef7b6c9fe37e4db167b` 유지. 기존 P5Y Commerce/백업 P30D를 새 인증정보에 복제하지 않음.
- **신규 처분 추가 후보:** `docs/operations/PORTONE_IDENTITY_PRIVACY_DISPOSITION_DELTA_CANDIDATE_V1.json`의 `legal_portone_identity_attempts_v1` 및 `legal_portone_verified_age_v1`를 DELETE 후보로 분리. 승인된 그래프에 무단 합산·덮어쓰기하지 않으며 새 테이블의 물리적 만료/소비 후 정리 주기는 여전히 확정·구현이 필요함.
- **실행 가능한 SQL 사본:** `supabase/release-candidates/1740_portone_identity_age_authority_v1.sql`로 DB DDL을 독립 파일로 준비. **supabase/migrations에는 추가하지 않았으며 실행하지 않았다.** 신규 두 테이블 RLS ON, service_role/공개 API 직접 접근 차단, Subject 비활성·병합 전이 DELETE 트리거 및 Subject Scoped 내부 함수 포함.
- **필수만 확인:** `test/legal-portone-identity-privacy-release-candidate.test.ts`에서 원 승인 policy/그래프 지문 유지, DELETE 추가 후보 2건, 제안 SQL과 배포 후보 동일성, 비자동 migration 상태 확인. PostgreSQL 17 실제 트랜잭션·RLS 실증은 이번 단계 수행하지 않음.
- **배포 조건:** 기존 Privacy/DB 삭제 그래프 개정 결정, 만료·소비된 인증 시도의 물리적 파기 라이프사이클, SQL 실DB 권한 및 삭제 전이 검증, 인증 채널 계약·비밀키. **운영 DB/인증 API/PG 결제 전부 OFF**.


## 15. L2-P PortOne 인증 시도 만료·소비 데이터 물리 정리 (2026-10-24)

- **실제 구현:** `supabase/proposals/1740_portone_identity_age_authority_v1.proposed.sql`의 `internal_purge_expired_legal_portone_attempts_v1(integer)`는 이미 확정된 인증 **10분 TTL**이 지난 `legal_portone_identity_attempts_v1` 행만 삭제한다. `FOR UPDATE SKIP LOCKED`, 정렬 인덱스, 1~250건 배치 제한으로 장시간 잠금/중복 작업을 방지하고, 비밀키·본인정보를 반환하지 않고 삭제 건수만 반환한다. `legal_portone_verified_age_v1`는 정리 대상 아님.
- **서버 작업자:** `apps/api/src/postgres-portone-identity-attempt-purge-v1.ts`의 `createPostgresPortOneIdentityAttemptPurgePortV1`가 기존 격리 시스템 작업자 `myeongha_system_executor` 트랜잭션에서만 실행되도록 준비. 일반 API/anon/authenticated/service_role에는 EXECUTE를 부여하지 않는다.
- **배포 경계:** SQL 원본과 `supabase/release-candidates/1740_portone_identity_age_authority_v1.sql` 동기화 완료. **migration 미적용, 작업자 스케줄 미등록, 운영 DB 삭제 미실행**. 물리 삭제의 자동 실행 주기·운영 보존기간·개인정보 삭제 정책 승인은 확정하지 않는다. 만료·소비 상태와 관계없이 TTL 경과 행만 삭제 가능하며 미만료 consumed 기록은 만료 시각 이전에 강제 정리하지 않는다.
- **필수 확인:** `test/legal-portone-identity-attempt-purge-v1.test.ts`에서 시스템 역할·배치 상한·트랜잭션 롤백·나이 권한 테이블 비삭제를 최소 검증. 기존 승인 삭제 정책 59개 테이블/46 DELETE/4 ANONYMIZE/9 RETAIN 변경 없음.
- **다음:** DB Authority/Privacy에서 신규 테이블 처분과 정리 주기 확정 후 제안 SQL의 PG17 함수·ACL·계정 삭제 전이 실증, 작업자 호출 스케줄/운영 연결. 인증 제공자 계약·채널키 전에는 SDK/공개 본인확인·결제 OFF 유지.

## 16. 2026-10-24 단일 브랜치 연속 구현 — 출시 HOLD 유지

> 범위: PR #2504의 `fix/legal-compliance/ai-disclosure-and-launch-audit-20261023` 브랜치. 통합 CI 완료·운영 실증 또는 법적 적합성 완료를 의미하지 않는다. 전환 승인과 운영 DB 변경은 수행하지 않았다.

- **L2 서버 연령 경계:** `MYEONGHA_PORTONE_VERIFIED_AGE_ENFORCEMENT=ENFORCE` 시 기존 무료 Chat Open/Send 및 Chat Read에서 검증된 Subject 연령 권위를 조회하고, 회원 신규 가입·소셜 인증 시작/완료·Naver Bridge·신규 게스트 발급은 검증된 가입 전 Subject 바인딩이 없는 동안 503으로 차단한다. **가입 전 본인인증 바인딩은 미구현**이므로 ENFORCE를 켜면 신규 유입이 가능해졌다고 해석하면 안 된다. 기존 계정의 로그인·탈퇴/개인정보 권리행사를 나이 체크로 무조건 차단하지 않는다.
- **L2 PortOne V2:** 서버 발행 인증 시도 ID는 KCP의 영숫자 40자 제한에 맞춘 `iv` + 소문자 hex 32자리(총 34자). SQL 제안·서버 파서·웹 브라우저·격리 PG17 테스트 동일. 현재 Vercel 12개 함수 예산은 유지하면서 `/api/identity-verifications/{attempts,complete,capability}`를 기존 `/api/me` 디스패처의 명시적 재작성으로 연결했다. 전용 공개 함수는 추가하지 않았다.
- **L2 인증 화면:** 마이페이지 회원 계정은 서버 `GET /api/identity-verifications/capability` 가 `available:true`일 때만 실제 시작 버튼을 표시. server-issued ID와 공개 `storeId/channelKey`를 받은 후에만 공식 PortOne V2 SDK ESM을 지연 로딩하며, 팝업·모바일 리디렉션 이후에도 서버의 단건조회+원자적 소비로만 연령을 확정한다. 브라우저 callback 성공값 자체는 신뢰하지 않는다. 서버 API 비밀키·CI/DI·실명·전화번호·원문 생일은 브라우저 응답에 싣지 않는다.
- **승인 게이트:** PortOne identity HTTP `ENFORCE`는 검증된 연령 DB migration `APPROVED_AND_APPLIED`, 개인정보 disposition `APPROVED`, 공급자 계약 `APPROVED`, Store ID, Channel Key, 서버 비밀키가 모두 있어야만 활성화하도록 구성했다. 배포 환경 설정을 변경하거나 승인 없이 실인증을 수행하지 않았다. SDK 도메인은 CSP에 정확한 `https://cdn.portone.io`만 추가했으며 기능이 OFF일 때 SDK 다운로드·신원 제공자 호출은 발생하지 않는다.
- **L2 SQL 격리검증:** `test/db/portone_identity_age_authority_pg17.sh`를 실제 `postgres17` DB CI 매니페스트에 등록했다. 일회성 소비·동시성·시간 만료·권한/ACL·시스템 전용 purge·계정 삭제·복원 후 권한 비재노출·게스트 병합시 원본 인증 권위 제거를 **폐기형 로컬호스트 CI DB에서만** 검사하도록 작성. **해당 신규 케이스의 실제 GREEN 결과를 관측하기 전에는 성공 판정하지 않음.**
- **L4 연령 판매 경계:** 아직 공개되지 않은 Purchase Intent V3에서 성년 검증권위가 OFF면 HTTP 503, 켜진 상태라도 검증된 `adult` 없이는 403으로 구매 시도를 만들지 않는다. Reading Web/Native 유료 19+ 제한을 표시한다. 이는 결제·인도·환불 체인 자체의 구현 완료는 아니다.
- **L5 AI 고지:** 모바일 홈/대화 허브/대화방과 Web Reader·모바일 공식 Reading 보관 본문에 생성형 AI 및 비실재 캐릭터 고지와 검증 한계를 실제 텍스트로 배치. Web/Native 일본어·번체중국어 사전을 작성한 동일 번역으로 동기화했다. 실제 배포 시각 및 접근성 검증은 계속 필요하다.

### 다음 실행 시 필수 잔여 작업 (범위를 축소하거나 완료 처리하지 말 것)

1. **A1:** 가입 전 신뢰된 연령 인증을 안전하게 Signup/Social/Guest에 결속하고 재사용·탈취·실패 재시도/성공 소유권을 원자적으로 보장하는 별도 서버/DB 설계·실구현. 현 ENFORCE는 가입 차단이라는 안전한 임시상태이지 완성된 가입 플로우가 아님.
2. **L2 DB/Privacy:** 제안 SQL과 삭제 분류 delta의 최종 승인, 실제 PG17 케이스 GREEN, 본 DB 변경/권위·보존·복원 후 비재노출 운영 실증. 원본 승인된 46 DELETE/4 ANONYMIZE/9 RETAIN 집계·지문 임의 변경 금지.
3. **L3:** OpenAI/Vercel/Supabase/PortOne 활성화 계약·국외 처리항목·배포 환경 확인, 공급자 계약 증거와 개인정보 처리방침 최종 합치. 사업자정보·정식 접수 채널 미확정.
4. **L4/L5:** Commerce/S7 소유 환불 접수·제공/철회·미제공 처리 검증, 법적 게시문구 확정과 공개 UX E2E, 모바일·웹 실제 배포 확인. 최종 통합 GREEN 및 사용자 결정 이후에만 병합.

## 17. 2026-10-24 A1 가입 전 PortOne V2 검증 권위 — 구현 진행 및 출시 보류

- **A1 데이터 모델:** 비적용 `1741_portone_preenrollment_age_authority_v1.proposed.sql`의 10분 TTL·256비트 무작위 브라우저 nonce 서버 HMAC·고정 길이 KCP 영숫자 ID·일회성 VERIFY/CONSUME 권위. `1740`의 기존 최소 연령 밴드 권위에 새로운 Guest/Member를 **각각 같은 DB 트랜잭션 안에서** 결속하되 PortOne 원문·CI/DI·생년월일·전화번호는 저장하지 않는다. Supabase Auth 계정 생성과 DB Subject 생성 **간의 분산 원자성은 구현되지 않았으며**, 외부 인증 실패/DB 장애 후 미연결 Auth 계정 복구·삭제는 별도 처리와 실증이 필요하다.
- **A1 실제 진입:** 기존 `/api/me` 한 함수에 `/api/identity-verifications/pre-enrollment/{attempts,complete,capability}` 정확한 재작성 등록. 완전 승인된 `MYEONGHA_PORTONE_PREENROLLMENT_HTTP_MODE=ENFORCE`, 적용 SQL, Privacy, 기존 PortOne 제공자 계약·인증 게이트 없이는 요청/SDK/DB 연계를 허용하지 않는다. **운영 설정은 변경하지 않았다.** 서버에서 1회 발급한 ID/HttpOnly·Secure·SameSite=Strict 쿠키를 인증 서버 결과에 결속한다. 가입·소셜·신규 게스트의 사전 검증과 귀속은 이 기본 OFF 권위를 공유한다.
- **회원·게스트·소셜:** 신규 게스트 발급과 최소 연령 저장은 1개 PG 트랜잭션. 이메일 가입은 서버 연령 판정 후 Supabase 응답의 UUID만으로 회원·연령을 DB에서 결속; 실패 시 신규 토큰 보류. 신규 소셜은 OAuth 완료 후 소비 전 권위를 검사하고 미검증 시 세션 보류. 기존 확인된 Member는 별도의 신규 증명 재사용 없이 서버 DB 최소 연령 권위로 확인; 기존 유효 Guest/Member 세션 재사용 및 개인정보 권리행사는 차단하지 않는다. 인증 완료 리다이렉트 후 가입 탭 복귀, 비의도적 선행 Guest 발급 방지 및 동일 출처 검사를 구현했다.
- **정합성 복원:** A1 SQL의 문자열 치환 손상 및 PG17 Bash 인용부를 복구하여 SQL 원본/수동 배포 후보를 동일하게 유지하고, 손상 재발 방지 소스 회귀 단언을 추가. 새 `legal_portone_preenrollment_v1`은 승인된 Subject 소유 테이블 59개 집합 **외부**의 10분 단기 데이터로 별도 삭제 제안에 남긴다. 별도 `myeongha_system_executor` 물리정리 포트 구현, 자동 실행·운영 DB 적용은 하지 않았다.
- **필수 후속:** (1) 관련 GH CI 및 격리 PG17 신규 케이스 실제 GREEN (아직 미확인), (2) Supabase Auth 직접 등록 우회/장애 후 고아 Auth 계정 처리 및 Social redirect state와 브라우저 증거의 재사용 방지 E2E, (3) PortOne 인증 제공자 계약·선불/보안 설정, (4) Privacy 삭제·만료/복원 정책 사용자 승인, (5) 본 DB 권한/서버 SDK/공개 UX 실증. 해당 요건 전에는 전체 L2와 서비스 출시를 완료로 표시하지 않는다.

## 18. 2026-10-25 A1 모바일 신규 가입 경계 — 웹 소유 인증으로 안전하게 이관

- `apps/mobile/src/core/auth/mobile-preenrollment-web-handoff.ts`: 공식 API 원점의 `/api/identity-verifications/pre-enrollment/capability`를 무캐시로 검사. 미승인/OFF일 때 기존 Native 흐름 유지, 서버 A1 `available:true`일 때 Native는 **독립적인 PortOne 인증 권한을 주장하지 않고** 같은 공식 HTTPS 웹 원점의 `/auth.html?mode=sign-up`으로 전환. 능력 확인 실패/비정상 응답/비신뢰 원점은 Guest 생성·신규 가입을 시도하지 않는 `unavailable` 상태.
- `use-mobile-member-auth.tsx`: 회원가입 및 소셜 OAuth 시작 **전** 사전 검사. A1 웹 전환 시 Guest 신규 발급·사회관계 로그인 시작·가입 요청 전송 없음. 기존 계정 비밀번호 로그인, 개인정보 권리행사 목적의 로그인 및 기존 서명 경로 유지. Native App과 시스템 웹 브라우저 사이에 HttpOnly `__Host-` 쿠키, PortOne 인증 ID, 인증 결과, Access/Refresh Token을 전달·저장하지 않음.
- `apps/web/auth-page.js`: 웹 가입 버튼의 명시적 `mode=sign-up` 진입을 지원. Auth callback 및 `social` 재진입 보호 흐름을 유지.
- `MyComponents.tsx`: 웹 이동 조건·기존 앱 로그인 안내와 일본어/번체중국어 사전 동기화. 실제 웹 인증 완료 후 신규 세션은 기존 API에서만 발급.
- **출시 HOLD:** 이것은 모바일 SDK를 통한 네이티브 본인인증 구현이 **아니며**, 시스템 브라우저의 인증 쿠키를 앱으로 반환할 수 있는 것이 아니다. 브라우저에서 계정을 만든 뒤 앱 로그인해야 한다. PortOne 공급자 계약·DB 제안 SQL 승인/실제 적용/PG17 GREEN/수집처 및 외부처리 적합성은 미확인; 현재 인증·결제 모두 OFF.

## 19. 2026-10-25 L4 구매 보류 및 L3 외부 전송 경계 보강

> PR #2504 동일 브랜치 후속 구현. 법적 검토 완료·운영 DB 적용·상업적 판매 승인 또는 통합 CI 통과를 뜻하지 않음.

- **L4 Purchase Intent 운영 차단:** `production-purchase-intent-create-runtime-v3.ts`에서 PortOne 성인 연령 권한이 `ENFORCE`로 활성화되더라도 상품별 계약·가격 고지, 미리보기/충분한 정보, 체크 증거, 제공·환불 처리 권위가 검증되지 않았으면 `503 PURCHASE_UNAVAILABLE` 상태 유지. 고객이 입력하는 임의 동의 boolean이나 환경변수만으로 이 차단을 해제하지 않음. `test/legal-production-adult-purchase-hold-v1.test.ts`에 이 경계 회귀 확인 추가. Commerce/S7 소유의 실제 고지·인도·환불·철회 구현은 여전히 미완료.
- **L3 수신지 고정:** `openai-seyeon-structured-provider-v1.ts`의 외부 AI 요청 목적지를 `https://api.openai.com` 또는 `https://ai-gateway.vercel.sh`만 허용. 임의 HTTPS 원점이 감사 로그상 OpenAI Direct로 오분류되면서 사용자 메시지·기억을 받는 경로 차단.
- **L3 Gateway 하위 처리 업체 제약:** Gateway 모델은 `openai/` 네임스페이스만 허용, OpenAI Direct 모델은 비접두 식별자만 허용. 운영 환경 모델 재설정만으로 미감사 AI 사업자에게 전송되는 경로 차단. `test/legal-seyeon-external-egress-evidence-v1.test.ts`에 허용·차단 사례 추가.
- **검증 한계:** 위 코드는 신규 정적/단위 회귀 조건을 추가한 상태. 2026-10-25 해당 브랜치 최신 SHA의 전체 통합 GitHub Actions, PG17 A1 실행·Web/Native 빌드·운영 공급자 계약 및 배포 지역/실데이터 송수신 실증은 아직 성공 증거 없음. Workers/GitGuardian 개별 성공만으로 통합 GREEN으로 간주하지 않음.
- **계속 보류:** `1740`/`1741` Production 적용, 실제 본인확인·PG 결제·유료 판매, LEGAL-001/002/003 공개, P5Y/P30D 및 승인 삭제 그래프 변경은 하지 않음. PR은 전체 수락 조건 충족 전 Draft 유지 및 미병합.


## 20. 2026-10-25 L4 서버 구매·고지·실제 인도 시각 증거의 순서 검증

- `commerce-digital-reading-withdrawal-review-v1.ts`의 읽기 전용 법률 검토 후보는 이제 **검증된 결제 시각**(`purchasedAt`), 서버 기록의 **고지 표시·확인 시각**(`displayedAt`/`acknowledgedAt`), 실제 인도 시각(`deliveredAt`)을 요구한다. 표시 ≤ 확인 ≤ 결제 ≤ 인도 순서를 입증하지 못하면 단순변심 제한 검토 후보로 올리지 않고 `evidence_review_required`를 반환한다.
- 구매 후 소급 확인, 표시 이전 확인, 결제 전 인도를 법적 제공 증명처럼 분류하는 경우를 차단한다. 브라우저 시간이 아닌 독립 서버 권위만 입력이라는 계약은 유지하고, **자동 환불 거절·환급·Grant 변경 권한은 계속 전부 false**다.
- `test/commerce-digital-reading-withdrawal-review-v1.test.ts`의 정상·역순·시간 누락·비실재 날짜를 보완했다. **테스트 실행/최종 통합 CI/PG17 GREEN은 이 커밋만으로 주장하지 않는다.** Commerce/S7이 실제 주문·고지/미리보기·배송 증빙을 서버에서 기록하고 조회하는 기능은 여전히 미완료이며 유료 판매 OFF를 유지한다.


## 21. 2026-10-25 A1 인증 서버 선등록·Member 결속 실패의 복구 경계

- Supabase 회원가입 또는 신규 소셜 OAuth가 **상류 인증 서버에서 성공한 이후**, 신뢰된 연령 증거를 canonical Member에 원자 결속하지 못한 경우 기존 일반적인 가용성 오류 대신 `AGE_BINDING_RECOVERY_REQUIRED`를 반환한다. 무조건 재가입 성공/실패를 추측하지 않고, 인증 서버에 계정이 남아 있을 수 있음을 사용자에게 알린다. 계정 UUID·비밀번호·토큰·원본 개인정보는 오류 본문에 싣지 않는다.
- 브라우저 가입 화면에서 동일 계정 반복 생성 대신 **가입 전 본인확인을 다시 완료하고 기존 비밀번호로 로그인하여 복구**하도록 안내한다. 소셜 신규 계정은 동일 브라우저 검증 증명 후 같은 제공자로 재시도한다. 기존 연령 권한이 없는 로그인은 개인정보 권리행사 목적의 접근을 계속 보장하되 개인화 API 자격으로 간주하지 않는다.
- 오류 조건에서도 인증 세션·Refresh 쿠키·기결속 연령 권한을 반환하지 않는다. 실패 시 이미 상류에 만들어진 Auth 계정을 자동 삭제하는 위험한 보상 트랜잭션은 추가하지 않았으며, 분산 원자성 미해결·장기 미연결 계정 관리 및 운영 PG17 검증은 계속 남는다.
- `test/legal-portone-preenrollment-member-signup-v1.test.ts`의 가입 실패 응답 코드·쿠키 비발급 회귀를 반영했다. 전체 통합 CI 및 실제 PortOne·Auth 실증은 아직 수행/확인하지 않았다.
