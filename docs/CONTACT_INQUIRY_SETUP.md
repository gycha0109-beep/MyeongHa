# 명하 문의 접수 운영 설정

마이페이지의 **문의** 링크는 `/contact.html`로 이동합니다. 접수 API는 `POST /api/contact`이며 기존 `/api/me` Vercel Function의 내부 분기로 연결하므로 신규 Function을 소비하지 않습니다.

## 수신 및 발송

- 수신처: GitHub 연결 Gmail **gycha0109@gmail.com** (기본값).
- `RESEND_API_KEY`: Resend 발송용 API 키. Vercel의 서버 전용 환경 변수로 등록합니다.
- `CONTACT_FROM_EMAIL`: Resend에서 인증된 발신 도메인의 이메일 주소. 예: `MyeongHa Support <support@example.com>`. 실제 보유 및 인증 도메인으로 변경합니다.
- `CONTACT_TO_EMAIL`: 필요할 경우에만 수신처를 변경하는 서버 환경 변수. 설정하지 않으면 위 Gmail로 전송합니다.

Gmail과 GitHub 또는 ChatGPT를 연동했다는 사실만으로 웹사이트에 Gmail 발송 권한이 생기지는 않습니다. 문의 메일은 Resend API를 통해 발송되고 Gmail은 수신함으로 사용됩니다. 설정 전에는 API가 503을 반환하며 접수 완료를 표시하지 않습니다.

## 기본 보호

활성 회원 또는 게스트 세션이 확인된 요청만 접수합니다. 동일 출처 검사, 입력 필드·본문 크기 제한, 비밀 필드(honeypot)와 Resend의 요청 식별자 기반 중복 발송 방지를 적용합니다. 문의 내용은 별도의 제품 DB 테이블에 저장하지 않습니다.

세션 확인 및 발송 설정이 완료되면 **실제 접수 및 수신 테스트**를 한 번 수행해야 합니다. 기존 기능과 별개로 대량 악용 방지가 필요해지면 공유형 rate limit / CAPTCHA를 별도로 구성합니다.
