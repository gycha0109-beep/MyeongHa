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
