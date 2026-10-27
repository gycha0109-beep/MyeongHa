# 명하 문의 접수 운영 설정

> 운영 연결 구현 브랜치: `feat/frontend-integration/contact-inquiry-production`.
> 이 문서는 **구현된 코드 경로**를 설명하며, 배포·메일 실제 수신 성공을 선언하지 않습니다.
> 최종 검증과 병합 순서는 [문의 로드맵](./ROADMAP_CONTACT_INQUIRY.md)의 V1 → M1을 따릅니다.

## 실제 웹 / API 진입

- 마이페이지 **문의** 링크: `/contact.html`.
- 문의 폼: `apps/web/contact.html`, `contact.js`, `contact-i18n.js`.
- 공개 API: **`POST /api/contact`** (추가 쿼리 없음).
- 운영: `cloudflare/myeongha-worker.mjs` → `workers/cloudflare-static-preview.mjs` → `workers/cloudflare-contact-inquiry.mjs` → 공통 `apps/api/src/contact-inquiry-http.ts`.
- 원래 Vercel의 `api/me.ts` 분기도 남아 있으며, **Cloudflare Worker는 Vercel로 프록시하지 않습니다.** 별도 Worker나 DB 테이블을 만들지 않습니다.

## Cloudflare 서버 설정 (실제 운영 전 필요)

Cloudflare 계정의 **Workers & Pages → `myeongha` → Settings → Variables and Secrets**에서 확인합니다.

| 바인딩 | 유형 | 용도 |
|---|---|---|
| `RESEND_API_KEY` | **Secret** | Resend 실제 발송 키. 유효한 키만 사용 |
| `CONTACT_FROM_EMAIL` | **Secret 또는 서버 전용 변수** | 검증용 `onboarding@resend.dev` 또는 자체 인증 도메인의 발신 이메일 |
| `CONTACT_TO_EMAIL` | 선택적 서버 전용 변수 | 수신처 변경 시에만 사용. 미설정 시 `gycha0109@gmail.com` |
| `MYEONGHA_AUTH_RATE_LIMIT_SECRET` | 기존 Secret 재사용 | 발신 IP를 해시한 rate-limit 식별자 |
| `AUTH_RATE_LIMITER` | 기존 Cloudflare rate-limit 바인딩 재사용 | 문의 전용 `contact-inquiry` 네임스페이스 |
| 기존 Cloudflare Auth/DB 승인 및 Hyperdrive 바인딩 | 기존 설정 유지 | 현재 회원·게스트 세션 확인 / 주체 권한 |

- **2026-10-27 사용자 설정 보고:** Cloudflare `myeongha` Worker에 `RESEND_API_KEY`와 `CONTACT_FROM_EMAIL`을 모두 등록했다고 확인했습니다. 연결 도구가 Secret 이름 조회를 차단하여 실제 반영 여부 및 값은 직접 검증하지 못했습니다.
- **자체 도메인 없는 초기 검증:** `CONTACT_FROM_EMAIL=onboarding@resend.dev`는 Resend 기본 테스트 발신자입니다. 이 발신자로는 계정 소유자에게 허용된 주소 등 제한된 수신처에만 보낼 수 있으므로, `gycha0109@gmail.com`이 해당 Resend 계정에서 수신 가능한지 실제 발송으로 확인해야 합니다. 이 구성은 일반 고객에게 보내는 운영 발신 주소가 아닙니다.
- `support@example.com`은 개발 예시이며 운영 값으로 입력하지 않습니다. 일반 고객에게도 발신하려면 나중에 자체 도메인을 Resend에서 인증해야 합니다.
- GitHub 또는 ChatGPT에 연결된 Gmail은 웹사이트의 발송 권한이 아닙니다. **Resend는 발신자, Gmail은 수신함**입니다.
- Cloudflare의 이 바인딩은 Vercel 환경 변수와 **별개**입니다. Vercel에 값을 등록해도 Cloudflare 런타임에는 전달되지 않습니다.
- Secret 값을 GitHub, `wrangler.jsonc`, 로그, PR 설명, 문의 본문에 기입하지 않습니다. 실 키가 없다면 사용자 설정 사항으로 남깁니다.

## 동작·보호 경계

- 운영 Worker의 `/api/contact`는 **POST만** 허용합니다. 비공식 마커·쿼리·다른 출처·미승인 Worker 환경은 거부합니다.
- 공통 문의 핸들러는 기존 `GET /api/me`의 프로덕션 검증 경계를 Worker 내부에서 재사용합니다. Supabase 회원 또는 정식 게스트 Bearer가 **검증되고 현재 주체가 active**일 때만 통과합니다. 위장된 토큰 문자열만으로 허용하지 않습니다.
- 문의 전용 요청 제한은 기존 `AUTH_RATE_LIMITER` + `MYEONGHA_AUTH_RATE_LIMIT_SECRET`을 재사용합니다. 구체적인 분당 제한은 Worker 바인딩 정책을 따릅니다.
- 요청 본문 최대 12KB, 필드 길이, 이메일/제목 검증, 동의, honeypot, Resend 요청 식별자(Idempotency-Key), 공급자 타임아웃 적용.
- **Resend가 HTTP 성공과 발송 ID를 반환했을 때만** JSON `{ok:true, code:'SENT'}` 성공을 전송합니다. 브라우저는 이 코드를 확인한 경우에만 작성 내용을 지웁니다. 비정상·누락 응답은 접수 완료로 표시하지 않습니다.
- 비밀번호·인증번호·카드 전체 번호를 문의에 포함하지 않도록 안내하며, 본문·인증 토큰·메일 API 키를 Worker 로그에 남기지 않습니다. 별도 문의 DB·자동 답장·허위 티켓 번호를 만들지 않습니다.
- 이메일 도착이나 전달을 API 200만으로 추정하지 않습니다. 실제 Gmail 수신 확인이 필요합니다.

## 최종 검증 및 병합

로드맵 I1~I5 코드를 **같은 브랜치에서** 누적합니다. 중간 별도 PR·병합을 만들지 않습니다.

필수 Secret과 검증 가능한 발신자(현재는 Resend 테스트 발신자)가 준비되면 V1 단일 통합 검증 구간을 실시합니다. Worker의 인가·실제 발송, 이메일 받은편지함 수신·Reply-To, 전체 관련 코드·브라우저 검사, 단일 PR의 필수 GitHub CI와 `ci-integration-ready` 통합 검증을 **마지막 한 구간에서** 확인합니다. 하나라도 실패하면 같은 브랜치에서 보정하고 **V1만 재실행**합니다. 모두 통과한 후에만 PR을 squash 병합합니다.

**현재 검증 상태:** 두 바인딩의 등록은 사용자가 보고했습니다. 실제 반영 여부, Resend 발송 승인, Gmail 실수신 및 전체 V1 통합 검증은 아직 확인되지 않았습니다. 실패·미확인 상태에서는 병합하지 않습니다.

## 운영 Worker 문의 실발송 1회 검증 스크립트 (배포 이후에만)

`scripts/verify-cloudflare-contact-live.mjs`는 운영 원본 도메인에만 요청하며, 실제 Worker 배포 버전 UUID를 사전에 고정해야 합니다. 버전이 일치하지 않거나, `GET /api/contact`가 405가 아니거나, 미인증 POST가 401이 아니면 실제 게스트 생성 및 메일 전송을 수행하지 않습니다. 임의 Preview URL 또는 기존 404 운영 배포에서는 전송하지 않습니다.

실행 전 환경 변수 `CLOUDFLARE_EXPECTED_WORKER_VERSION`(Cloudflare API에서 직접 확인한 현재 배포 UUID), `MYEONGHA_CONTACT_LIVE_CONFIRM=SEND_ONE_CONTACT_TEST`가 필요합니다. 명령: `node scripts/verify-cloudflare-contact-live.mjs`. 정식 게스트 세션으로 운영자 수신처에 한 건만 발송합니다. 응답 코드 `SENT`는 Resend 접수 영수증이며 Gmail 전달 성공을 의미하지 않습니다. 테스트 후 `gycha0109@gmail.com`에서 제목, 본문, 답장 주소 및 접수 요청 ID를 별도로 확인해야 합니다. 스크립트는 API 토큰과 게스트 Bearer를 출력하지 않습니다.

운영 전 배포 금지 로드맵을 준수하는 한 이 스크립트는 **병합 전 실제 수신 증거를 대체하지 않으며 실행할 수 없습니다.** 검증 환경에 독립 인증·발신 바인딩이 없는 상태에서 운영 보호 경계를 우회하지 않습니다.
