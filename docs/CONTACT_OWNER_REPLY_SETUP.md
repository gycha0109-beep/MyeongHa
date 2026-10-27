# 명하 고객 문의 회신 — 도메인 확보 전 사전 구현

> 트랙: `frontend-integration`. 기존 고객 문의 수신 `POST /api/contact`는 변경하지 않습니다.
> 이 구현은 **실제 도메인 확보 및 Resend 도메인 인증 이전에는 의도적으로 발송 불가**입니다.

## 현 구현 범위

- 운영자용 직접 접근 화면: `/contact-reply.html` (마이페이지에 공개 링크를 노출하지 않음).
- 회신 API: `POST /api/admin/contact/reply`. 단일 Cloudflare Worker 내부에서 동작합니다. 별도 Worker·티켓 DB·헬프데스크는 만들지 않습니다.
- Gmail로 받은 원본 문의의 **고객 답변 이메일, 문의 제목, 접수 요청 ID**를 운영자가 직접 옮겨 입력합니다. 현재 원본 문의는 DB에 저장하지 않으므로 수신 메일이 참조 근거입니다.
- 기존 Supabase **회원** 세션의 서명 검증 및 RLS를 거치는 `public.qry_myeongha_owner_admin_access_v1`의 `isOwnerAdmin=true`일 때만 허용합니다. 게스트·일반 회원은 거부합니다.
- 기존 Cloudflare 요청 제한기를 `contact-owner-reply`로 분리하여 적용하고, 매 발송마다 UUIDv4 회신 식별자로 Resend Idempotency-Key를 보냅니다.
- 수신 이메일, 회신 제목, 본문, 접수 ID 및 주소 확인 체크박스를 검증합니다. 문의 수신과 회신은 DB에 별도로 기록하지 않습니다. 따라서 자동 고객 식별·메일 스레드 연동·발송 기록 조회는 제공하지 않습니다.
- Resend 요청이 성공하고 발송 ID가 반환된 때만 `REPLY_SENT`로 표시합니다. 수신함 도착을 의미하지 않습니다.

## 도메인 확보 전: 절대로 발신 활성화하지 않음

`CONTACT_REPLY_ENABLED`를 설정하지 않으면 HTTP 503 `REPLY_NOT_ENABLED`입니다. **운영 배포만으로 실제 회신이 시작되지 않습니다.** 테스트 발신 `onboarding@resend.dev` 및 개인 `gmail.com` 주소는 회신 발신자로 사용할 수 없습니다. 개인 Gmail은 기존 문의 수신함으로만 유지합니다.

## 도메인 구매 및 Resend 인증 완료 후 설정

1. 사용자 소유 명하 도메인을 확보합니다. 임의 도메인이나 메일 주소를 운영 값으로 설정하지 않습니다.
2. Resend에서 해당 도메인에 필요한 DNS 레코드(SPF/DKIM 등)를 적용하고 **도메인 Verified 상태**를 확인합니다.
3. Cloudflare 운영 Worker의 서버 전용 바인딩에 아래 값을 등록합니다.
   - `RESEND_API_KEY`: 기존 Resend Secret 재사용.
   - `CONTACT_REPLY_FROM_EMAIL`: 실제 도메인의 공식 발신자(예: `support@<소유도메인>`).
   - `CONTACT_REPLY_VERIFIED_DOMAIN`: 위 공식 주소 `@` 뒤 도메인과 정확히 일치하는 인증 도메인.
   - `CONTACT_REPLY_ENABLED=enabled-with-verified-domain-v1`: 위 인증·발신 설정까지 끝난 후 명시적으로 전송 활성화.
4. 고객이 공식 회신 주소에 다시 답장할 수 있도록 **Cloudflare Email Routing** 등으로 해당 주소를 비공개 운영자 Gmail 수신함에 전달합니다. 이 수신 라우팅은 Resend 발신 도메인 인증과는 별개입니다.
5. **실제 고객에게 발송하기 전 별도의 소유 테스트 수신함을 이용한 통합 확인**이 필요합니다. Reply-To·From·전달·재회신 경로를 확인하고, Gmail 원본 주소가 보이지 않는지 검사합니다.

## 보안·운영 주의

- 서버 측 발신자는 고객이나 브라우저에서 지정할 수 없습니다. 검증된 도메인 및 설정된 운영 공식 주소만 사용합니다.
- 답변은 서버에서 직접 Resend로 발송합니다. 운영자가 Gmail에서 개인 계정으로 직접 '답장'을 누르면 **개인 주소가 노출**되므로 이 기능의 대체 수단으로 사용해서는 안 됩니다.
- 운영자만 요청할 수 있어도 대상을 수동 입력하므로 주소와 문의 ID의 원본 확인이 필요합니다. **원본 문의와의 DB 기반 일치 검증은 아직 없습니다.**
- API 키·Bearer·고객 주소·본문을 로그, 저장소 또는 PR 설명에 기록하지 않습니다.
- 이 구현은 이전 `docs/ROADMAP_CONTACT_INQUIRY.md`의 I1~I5/V1 완료 범위와 별개로 사용자가 요청한 **후속 고객 회신 기능**입니다. 기존 문의 접수 검증 결과를 변경하거나 일반 고객 대상 회신 검증을 완료 처리하지 않습니다.
