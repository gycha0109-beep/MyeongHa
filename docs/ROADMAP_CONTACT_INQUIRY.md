# 명하 문의 페이지 · 운영 연결 구현 로드맵

- **트랙:** `frontend-integration`
- **기준:** 2026-10-26 `main` / 문의 UI·Vercel API 기초 구현 PR #2628 병합 완료
- **작업 브랜치:** `feat/frontend-integration/contact-inquiry-production` (**처음부터 끝까지 이 브랜치 하나만 사용**)
- **목표:** 마이페이지 → 문의 작성 → Cloudflare 실제 접수 → Resend 발송 → `gycha0109@gmail.com` 수신을 동작시키고, 최종 검증 **한 번**을 통과한 후에만 `main`에 병합
- **범위:** 웹 문의 채널의 운영 완성. 별도 헬프데스크, 티켓 DB, 관리자 콘솔, 자동 답변 시스템은 이번 작업에 추가하지 않음

## 0. 현재 실제 구현 지점 (기준선)

**기존에 완료된 부분 — 재구현 금지**
- `apps/web/src/my/MyPage.tsx`의 **문의** 링크와 `apps/web/contact.html`, `contact.css`, `contact.js`의 접수 폼
- `POST /api/contact`의 Vercel 재작성 및 `api/me.ts` 분기
- `apps/api/src/contact-inquiry-http.ts`의 입력 검증·세션 콜백·Resend 전송·실패 응답
- `workers/cloudflare-api-router.mjs`의 `rewrite.contact.inquiry` 경로 **목록 등록**
- `docs/CONTACT_INQUIRY_SETUP.md`의 Vercel 중심 설정 설명

**아직 완료되지 않은 부분**
- **실제 Cloudflare Worker에서 `POST /api/contact` 처리**: 현재 경로 목록에만 있으며 `workers/cloudflare-static-preview.mjs`의 승인 처리기에 연결되지 않아 거부됨
- Worker에서 기존 회원/게스트 세션을 검증할 연결, 문의 전송 빈도 제한, Worker용 메일 발송 설정
- Cloudflare 운영 환경의 Resend 발신 설정 및 실제 Gmail 수신 확인
- 문의 페이지 본문 및 전송 상태의 지원 언어 UI 처리

**배포 전제:** `cloudflare/myeongha-worker.mjs`는 웹 정적 리소스와 API를 담당하는 단일 Worker. Vercel용 코드를 전부 재구현하거나 Worker→Vercel 내부 프록시를 만들지 않는다.

## 1. 실행 원칙

1. **한 브랜치 고정:** 위 작업 브랜치에 로드맵과 모든 후속 구현 커밋을 누적한다. 중간에 PR을 열거나 `main`에 병합하지 않는다. 다음 작업 시 새 브랜치로 갈라지 않는다.
2. **구현 우선:** 단계별 기능을 순서대로 실제 코드에 반영한다. 문서 검토·반복 점검·중간 스모크/CI 재실행을 구현 단계로 넣지 않는다.
3. **검증은 V1 한 단계만:** 모든 구현과 운영 설정이 끝난 후 **단 한 번의 최종 통합 검증 구간**을 둔다. 테스트 파일과 필요한 수선은 구현 도중 작성할 수 있으나, 검증 실행·CI 판단·브라우저 실접수는 V1에서 묶어서 한다. 필수 CI가 실패하면 **같은 브랜치**에서 원인 수정 후 V1을 재시도한다.
4. **최종 검증 전 병합 금지:** V1이 전부 통과해야 PR을 최종 병합한다. 필수 통합 CI는 PR을 생성한 뒤 마지막 검증 구간에 포함한다.
5. **승인·비밀정보:** 설계 범위 내 구현에는 중간 승인을 요구하지 않는다. 실제 발신 도메인과 메일 API 키처럼 사용자 소유 설정이 꼭 필요한 경우에만 블로커를 밝힌다. 저장소·PR·로그에 비밀키를 쓰지 않는다.
6. 기존 인증/개인정보 권한 경계, 다른 API 라우트, Commerce/Saju/Reader 로드맵은 변경하지 않는다. **새 서버 함수·DB 테이블·별도 Worker는 만들지 않는다.**

## 2. 구현 순서

### I1. Cloudflare 문의 요청 진입 연결 [미완료]

**수정 위치:** `workers/cloudflare-static-preview.mjs`, 필요 시 `cloudflare/myeongha-worker.mjs`; 신규 문의 전용 Worker 어댑터 파일.

- 기존 `rewrite.contact.inquiry` **목록 항목을 실제 요청 처리기에 연결**한다. `/api/contact`가 정적 자산이나 기본 404로 빠지지 않게 한다.
- 외부 공개 경로는 **`POST /api/contact` 하나**로 유지한다. 쿼리·비공식 마커·다른 메서드·교차 출처 요청은 차단한다.
- 단일 Worker 내부 직접 호출을 사용한다. Vercel Function 호출/자기 자신에 대한 HTTP 프록시를 추가하지 않는다.
- 승인되지 않은 Worker 환경 또는 비정상 요청은 **fail-closed** 상태를 유지하고 성공으로 응답하지 않는다.
- 요청/응답은 비캐시 JSON 원칙을 유지하며 CORS, 쿠키, 리디렉션 권한을 확대하지 않는다.

**구현 종료 산출물:** Cloudflare의 정식 문의 라우트와 별도 승인 어댑터가 결선된 코드.

### I2. 기존 세션 권한 재사용 및 접수 남용 방지 [미완료]

**수정 위치:** I1의 어댑터, 기존 Cloudflare Auth/DB 진입 구성, 필요 시 `apps/api/src/contact-inquiry-http.ts`.

- `handleContactInquiryRequestV1`의 `verifySession` 계약을 **현재 Cloudflare에서 이미 승인한 회원·게스트 세션 확인 절차**로 연결한다. 단순 토큰 문자열 검사로 대체하지 않는다.
- 기존 주체 검증/DB 연결을 재사용하고, 요청마다 권한 확인 및 자원 정리를 수행한다. 신규 인증 저장소, 직접적인 신원 추정, 권한 우회는 만들지 않는다.
- **권한 확인과 빈도 제한을 통과한 요청만** 메일 공급자로 보낸다. 기존 Worker rate-limit 바인딩을 문의 전용 구분 키로 재사용해 인증 요청의 제한과 구분한다.
- 재전송 식별자, 본문 12KB 제한, 필드 검증·honeypot, 안전한 제목/답장 주소, 타임아웃을 유지한다. 문의 본문이나 Bearer·API 키는 로그에 남기지 않는다.
- 세션 오류, 빈도 초과, 메일 설정 누락, 공급자 오류를 구분하되 서버 내부 상세 오류를 노출하지 않는다.

**구현 종료 산출물:** 실제 회원/게스트 보호를 받는 문의 접수 및 제한 처리.

### I3. Cloudflare 메일 발송 설정 및 운영 연결 [미완료]

**수정 위치:** Worker 환경 연동, `docs/CONTACT_INQUIRY_SETUP.md`, 배포 설정이 필요한 기존 경로.

- 현재 `apps/api/src/contact-inquiry-http.ts`의 Resend 전송 구현을 Worker에서도 호출하고, **Cloudflare 서버 환경**에서 `RESEND_API_KEY`, `CONTACT_FROM_EMAIL`, 선택값 `CONTACT_TO_EMAIL`을 주입한다.
- 수신 기본값은 **`gycha0109@gmail.com`**. 발신 주소는 **Resend에서 실제로 인증된 발신 도메인**의 주소여야 한다. 예시 이메일을 실제 설정으로 쓰지 않는다.
- Cloudflare Secret/환경 변수에만 인증 정보를 보관한다. Vercel과 Cloudflare 설정 범위를 혼동하지 않도록 설정 문서를 실제 배포 기준으로 수정한다.
- 메일 공급자가 발송 요청 ID를 정상 반환한 경우에만 접수 성공을 반환한다. 설정 미비·실패·타임아웃에는 성공 메시지를 반환하지 않는다.
- 별도 저장 DB 없이 원래 지정 수신함으로만 전송하고, 사용자가 입력한 답변 이메일을 `Reply-To`로 반영한다.

**구현 종료 산출물:** Cloudflare 환경의 발송 설정과 기존 메일 전송 코드 연결. **실제 키/도메인 확보가 불가능하면 이 단계의 외부 설정만 명시적 블로커로 둔다.**

### I4. 문의 페이지의 운영 UX·언어 처리 [미완료]

**수정 위치:** `apps/web/contact.html`, `contact.js`, `contact.css`, 기존 정적 UI 번역 사전.

- 기 구현한 폼의 구조와 마이페이지 링크는 유지하고, 실제 Worker 결과에 맞춰 **전송 중 / 접수 성공 / 입력 오류 / 인증 만료 / 제한 초과 / 메일 발송 불가**를 구분해 표시한다.
- 실패 시 입력값·사용자 재시도 문맥을 유지하고, 성공 판정과 폼 초기화는 실제 발송 요청 성공 응답 뒤에만 수행한다. 중복 클릭 및 동일 요청 재전송을 제어한다.
- 기존 서비스 언어(`ko-KR`, `ja-JP`, `zh-TW`, `en-US`, `zh-CN`)의 문의 페이지 **고정 UI·에러 메시지**를 기존 번역 체계에 연결한다. 웹/모바일 공유 번역 사전의 일치 계약을 유지한다.
- 개인정보 입력 주의문, 필수 동의, 모바일 레이아웃, 마이페이지 복귀 동선을 유지한다. 실제 보장되지 않는 SLA·즉시 답변 약속은 추가하지 않는다.

**구현 종료 산출물:** 접수 상태와 다국어가 일관된 웹 문의 화면.

### I5. 배포·운영 연결 마감 [미완료]

**수정 위치:** 관련 Worker 배포 설정·기존 운영 문서.

- Cloudflare의 **현재 단일 Worker 배포 경로**에 새 문의 어댑터와 발송용 서버 환경 설정을 포함한다.
- 문의 전용 Secret/발신 주소 설정 방법, 필요한 권한, 운영자 수신 Gmail 및 구성 누락 시 503 동작을 문서에 명확히 남긴다.
- 실제 연결되지 않은 공개 지원 주소, 임의의 티켓 번호, 자동 접수/처리 약속을 표시하지 않는다.
- 운영 정책 초안 `docs/OPS_001_CUSTOMER_SUPPORT_POLICY_DRAFT_KO.md`의 민감정보 최소 수집 원칙을 반영한다. 전체 정책·법무·환불 시스템까지 확장하지 않는다.

**구현 종료 산출물:** 배포 가능한 변경 세트와 운영 설정 설명. **이때까지 PR/병합 없음.**

## 3. V1. 마지막 통합 검증 — 단 1개 게이트 [최종에만 실행]

**개시 조건:** I1~I5 코드 구현 완료, Worker 발송에 필요한 실제 인증 설정 준비.

이 단일 구간에서 아래 항목을 함께 실행한다.

1. 로컬 전체 영향 범위 확인: TypeScript, Cloudflare 라우트·인증·응답 경계, 웹 빌드·번역·문의 폼, 관련 회귀 테스트를 **한 묶음으로 실행**한다.
2. Cloudflare의 운영과 분리된 **검증 가능한 Worker 실행 환경**에서 실제 회원/게스트 접수, 미인증 차단, 중복·과다 요청 차단, 공급자 실패 처리를 확인한다. 운영 환경의 다른 API는 건드리지 않는다.
3. **실제 Resend 발신 설정으로 한 건 전송**, `gycha0109@gmail.com` 수신함의 메시지 도착·제목·문의 내용·`Reply-To`까지 확인한다. **API 200만으로 실제 Gmail 수신 성공을 대체하지 않는다.**
4. 구현이 완료된 **같은 브랜치에서 최종 PR을 한 번 생성**하고, 기존 GitHub Actions 필수 체크(`CI Verify`, `Web PR Verify`, `Governance Verify`, `CI Integration Verify` 등)를 진행한다. `CI Integration Verify`는 앞선 필수 체크가 성공한 뒤 기존 `ci-integration-ready` 제출 절차로 실행한다.
5. 단 하나라도 실패하면 **같은 브랜치에서 수정**하고 이 V1만 다시 실행한다. 재검증 없이 통과로 간주하거나 필수 체크를 우회하지 않는다.

**통과 기준:** 실제 수신 1건 확인 + 보안/기능 회귀 통과 + PR 필수 체크 전부 Green + 승인·운영 블로커 없음.

## 4. M1. 최종 병합 [V1 통과 후에만]

- V1의 모든 근거가 갖춰진 뒤에만 `main`에 **squash/linear history 준수 방식**으로 병합한다.
- 자동 병합을 사용할 경우에도 **V1의 통과 조건을 충족한 다음에만** 활성화한다.
- 병합 전 기능별 중간 PR, 우회 병합, 별도 트랙 브랜치 분리는 금지한다.
- 병합된 `main`의 기존 CD가 Cloudflare 운영 Worker를 배포한다. **V1 전에 운영 배포하여 검증을 대신하지 않는다.**
- 운영 환경 실제 비밀정보가 아직 없거나 검증용 환경에서 실수신이 불가능하면 **V1 미완료 → 병합 보류**로 보고한다.

## 5. 현재 진행 카드

| 단계 | 내용 | 상태 |
|---|---|---|
| 기준선 | 문의 UI·공통 발송 로직 및 기존 PR 병합 | **완료** |
| I1 | Cloudflare 실접수 경로 | 미완료 |
| I2 | 회원/게스트 권한·빈도 제한 | 미완료 |
| I3 | Worker 메일 발송 및 실설정 | 미완료 |
| I4 | 운영 UX·다국어 | 미완료 |
| I5 | 배포·운영 설명 정리 | 미완료 |
| V1 | **최종 통합 검증 한 번** | 대기 |
| M1 | **마지막 병합** | 대기 |

**외부 의존성:** `RESEND_API_KEY`, 실제 인증된 `CONTACT_FROM_EMAIL`, Cloudflare 해당 환경 설정 권한. 확보·등록 여부는 아직 확인되지 않았으며 추정해서 완료로 표시하지 않는다.

**다음 실행 작업:** `feat/frontend-integration/contact-inquiry-production` 브랜치에서 **I1 — Cloudflare 문의 요청 진입 연결**부터 코드를 구현한다.

## 6. 구현 진행 기록 (2026-10-26)

- [x] **I1** Cloudflare `POST /api/contact` 라우트에서 실제 어댑터 호출 (`workers/cloudflare-contact-inquiry.mjs`)
- [x] **I2** 기존 승인된 `GET /api/me`를 이용한 게스트/회원 주체 확인 및 기존 Worker 요청 제한기 연결
- [x] **I3 코드** 공통 Resend 발송 경로를 Worker에 연동했습니다. **2026-10-27 사용자가 Cloudflare `RESEND_API_KEY`와 `CONTACT_FROM_EMAIL` 등록을 보고**했으며, 실제 환경 반영·발송·Gmail 수신은 V1에서 확인합니다. 자체 도메인 없는 테스트 발신자는 계정 수신처 제한이 있습니다.
- [x] **I4** 문의 상태 메시지와 정적 폼의 5개 언어 처리, 전송 확인 코드 기반 성공 처리
- [x] **I5** 단일 Worker 경로 유지, 배포 구성/Secret 설정 문서 업데이트
- [ ] **V1** 최종 통합 검증 **미실행** (I3의 실제 발송 설정 필요)
- [ ] **M1** 최종 병합 **미실행** (V1 필수 선행)

단계별 기능 검증·중간 PR·자동 병합은 수행하지 않는다. **I3 발송 비밀정보가 준비되어야 V1로 넘어갈 수 있다.**

## 7. I4 사용성 후속 보완 (2026-10-27)

- [x] `contact.js`에서 별도 로그인 없는 방문자의 `ensureActiveBearer()` 호출로 기존 공식 Guest bootstrap 재사용.
- [x] honeypot의 실제 `company` 값을 서버로 전달하며, 사용자에게 접수 성공은 `SENT` 영수증일 때만 표시.
- [x] `data-contact-i18n-root` 범위를 공통 자동 번역 처리에서 제외하고 전용 5개 언어 번역기만 관리해 언어 변경 시 충돌 방지.
- [x] 문의 API의 공급자 거부·응답 ID 누락·통신 오류·honeypot·승인 경계 회귀 테스트 코드 추가. **테스트 실행은 V1에만 편성.**
- [x] 2026-10-27 사용자로부터 Cloudflare `RESEND_API_KEY`, `CONTACT_FROM_EMAIL` 등록 완료 보고. Secret 조회는 연결 도구의 안전 제한으로 확인 불가, 임의 생성·가짜 값·다른 서비스 설정으로 우회하지 않음.

현 브랜치: `feat/frontend-integration/contact-inquiry-production`; 최종 검증 전 PR 생성·병합 금지.

## 8. V1 개시 전 운영 보고 (2026-10-27)

- 사용자 보고: Cloudflare 단일 `myeongha` Worker에 `RESEND_API_KEY`와 `CONTACT_FROM_EMAIL` 등록 완료.
- 기본 도메인 `myeongha.gycha0109.workers.dev` 유지. 별도 도메인 없이 Resend `onboarding@resend.dev`를 쓰는 경우 계정 소유 수신처 제한 아래 실제 수신 검증만 가능하며, 일반 고객 대상 발신 운영 승인을 의미하지 않음.
- 연결 도구가 Cloudflare Secret 이름 메타데이터 조회를 차단함. 비밀값을 조회·출력하지 않고 사용자 보고를 기준으로 V1의 CI·실수신 검증으로 판정.
- **V1 통과 전 배포 성공, Resend 실제 발송, Gmail 실수신, 필수 CI Green, 병합을 추정하지 않음.**
