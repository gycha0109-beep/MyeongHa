# 로컬 명하 인증 테스트

로컬 인증은 운영 Supabase와 분리된 임시 GoTrue DB와 임시 명하 앱 DB를 Docker로 실행합니다. 두 DB는 컨테이너 메모리 파일시스템에만 저장되며, 종료할 때 데이터와 생성된 인증 비밀값을 함께 제거합니다. 브라우저에는 공개용 로컬 API 키만 Worker 설정으로 전달됩니다.

## 실행 및 확인

저장소 루트에서 다음 명령을 실행합니다.

```powershell
npm run start:auth:local
```

화면은 `http://127.0.0.1:8787/auth.html`에서 열립니다. Worker는 기존 `cloudflare/myeongha-worker.mjs`와 기존 인증·게스트 처리 경로를 그대로 사용합니다. GoTrue는 `127.0.0.1:15432`, 앱 DB는 `127.0.0.1:15433`에만 공개됩니다. 실행 중 별도 터미널에서 실제 HTTP 흐름을 확인하려면 다음을 실행합니다.

```powershell
npm run verify:auth:local-http
```

이 검증은 임의 생성한 `example.invalid` 계정만 사용하고, 회원가입, 게스트 재사용과 회원 전환, 로그아웃, 이메일 재로그인, 토큰 갱신, 재로그아웃을 실제 로컬 HTTP 요청으로 확인합니다. 종료할 때 `Ctrl+C`를 누르면 로컬 DB 컨테이너와 임시 자격증명이 제거됩니다. 터미널이 중단 신호를 전달하지 않는 경우 다른 터미널에서 `npm run stop:auth:local`을 실행하면 같은 로컬 스택만 정리할 수 있습니다.

기존 8787 포트가 사용 중이면 스크립트는 해당 프로세스를 종료하지 않고 중단합니다. 사용 중인 로컬 앱을 확인하고 직접 종료한 뒤 다시 실행해야 합니다.

## 구글·카카오 로컬 자격증명

기본 실행은 두 제공자를 비활성화합니다. 로컬 테스트용 OAuth 앱의 ID와 비밀값이 이미 준비되어 있을 때만 실행 프로세스의 환경변수에 다음 쌍을 설정할 수 있습니다.

- Google: `MYEONGHA_LOCAL_GOOGLE_CLIENT_ID`, `MYEONGHA_LOCAL_GOOGLE_CLIENT_SECRET`
- Kakao: `MYEONGHA_LOCAL_KAKAO_CLIENT_ID`, `MYEONGHA_LOCAL_KAKAO_CLIENT_SECRET`

시작 스크립트는 각 쌍이 모두 있을 때만 해당 GoTrue 제공자를 켭니다. 자격증명은 임시 Compose 환경 파일로만 전달되고 콘솔이나 저장소에는 기록되지 않습니다. OAuth 앱에서 다음 주소를 허용해야 합니다.

- 서비스 콜백: `http://127.0.0.1:15432/callback` (독립 실행 GoTrue의 직접 콜백 경로)
- 명하 복귀 주소: `http://127.0.0.1:8787/auth.html?social=callback`
- Google의 허용 JavaScript 원본: `http://127.0.0.1:8787`

구글은 OAuth 클라이언트의 승인된 리디렉션 URI에 서비스 콜백을 추가해야 합니다. 카카오는 앱 설정의 카카오 로그인 Redirect URI에 같은 서비스 콜백을 추가하고 카카오 로그인을 활성화해야 합니다. [Supabase Google 설정](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)과 [Supabase Kakao 설정](https://supabase.com/docs/guides/auth/social-sign-in/auth-kakao)을 참고합니다.

## 네이버

현재 네이버 구현은 기존 명하의 암호화된 OAuth 브리지와 운영 Supabase callback을 사용합니다. 운영 callback을 로컬 GoTrue에 임의로 돌리거나 운영 OAuth 설정을 복사하지 않도록 로컬에서는 비활성 상태로 유지합니다. 네이버를 실제 로컬 OAuth로 검증하려면 로컬 GoTrue에 `custom:naver` 제공자(authorization, token, userinfo URL)와 별도 네이버 개발 앱 자격증명을 등록하고, 네이버 앱에 로컬 명하 callback을 승인해야 합니다. 이 별도 설정을 제공받기 전까지는 로그인 시작이 실패하도록 차단합니다.

운영 Supabase 사용자나 결제 데이터는 이 로컬 실행 경로에서 읽거나 변경하지 않습니다.
