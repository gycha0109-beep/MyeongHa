# D3e25 — Production Supabase Auth API 키 최소 권한 경계 (2026-10-15)

**상태: Draft / HOLD. 운영 키 조회·변경·회전·배포·결제 없음.**

## 1. 현재 확인한 사실

- 사용자가 제공한 Vercel 화면에서 `MYEONGHA_SUPABASE_API_KEY` 변수 **이름과 Production 적용 여부**를 확인했다. 실제 **키 값 및 권한 등급은 모른다**. 사용자에게 키 복사나 화면 노출을 요청하지 않는다.
- `api/me.ts` 및 다수 사용자 API는 `parseProductionUserDataRuntimeConfigV1(process.env)`로 런타임을 구성한다.
- `production-request-identity-verifier.ts`는 멤버 JWT를 `SupabaseMemberIdentityEvidenceVerifierV1`로 전달한다.
- `supabase-member-identity-verifier.ts`는 명하의 고정 Supabase 프로젝트 `/auth/v1/user`에 `apikey: MYEONGHA_SUPABASE_API_KEY`, `Authorization: Bearer <사용자의 세션 토큰>`으로 GET 요청을 한다.
- 관리자용 API 키는 회원 신원 검증에 필요하지 않다. 기존 설정 검증기는 키 길이만 확인해 서비스 역할 키와 비밀 키도 허용할 수 있었다.
- 추가 점검으로 `supabase-auth-http.ts`의 별도 로그인 프록시도 `MYEONGHA_SUPABASE_API_KEY`를 길이만 보고 허용한다는 것을 확인했다. 이 프록시는 비밀번호 로그인, 회원가입, 갱신, 소셜 인증 완료, 로그아웃 요청에서 Supabase Auth API의 `apikey` 헤더로 보낸다. 따라서 회원 신원 검증기뿐 아니라 **모든 이 로그인 경로**도 같은 공개용 API 키 계약을 적용해야 한다.
- Supabase 공식 가이드: <https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys>. 공개용(`sb_publishable_`) 또는 기존 일반 `anon` 키는 낮은 권한, `sb_secret_` 및 기존 `service_role` 키는 관리자급으로 취급한다. 인증받은 **사용자 JWT는 애플리케이션 API 키와 별도**이며 Authorization 헤더에 그대로 전달한다.

## 2. 제안한 안전장치 (Draft에서만)

- `apps/api/src/supabase-auth-api-key-least-privilege.ts`의 순수 로컬 판정은 키 원문을 출력하지 않는다.
- `sb_publishable_` 키를 허용한다. 기존 JWT 기반 `anon` 키는 하위 호환성 차원에서만 허용한다. JWT claim은 **로컬 분류 힌트**일 뿐 서명을 검증한 결과가 아니다. Supabase 서버가 진짜 키와 사용자 세션을 검증한다.
- `sb_secret_`, 기존 JWT `service_role`, 알 수 없는 형식·빈값·임의 문자열은 모두 **거부한다**. 값은 오류 메시지·로그에 출력하지 않는다.
- `production-user-data-runtime-config.ts`·`supabase-member-identity-verifier.ts`와 별도의 `supabase-auth-http.ts` 로그인 프록시 **세 경로 모두**에서 검증해 우회 호출을 차단한다.
- 신규 단위 시험은 일반 키 허용, 비밀/관리자 키 거부, 위조/알 수 없는 형식 거부, 오류 문자열의 비밀값 미포함, 별도 회원 토큰과 앱 API 키 구분을 검증한다.
- 기존 회원 인증·로그인 프록시·결제 서버 경로·상태 확인 단위 시험, 생산용 설정 시험, `db-authority-core`의 장기 구매·이용권 회귀 시험을 그대로 재실행한다. 종전 임의의 길이만 충족하던 테스트용 문자열은 **가짜 `sb_publishable_` 형식**으로 통일한다. 모든 테스트는 가짜 키와 합성 회원만 사용하며 운영 키를 읽지 않는다.

## 3. 배포 전 반드시 남겨야 할 HOLD

1. 실제 Production `MYEONGHA_SUPABASE_API_KEY`가 `sb_publishable_`인지 레거시 `anon`인지 **승인된 배포 내부 로컬 진단으로 권한 등급만** 확인한다. 불확실하면 운영 반영 금지. 실제 키 값은 채팅·PR·CI 로그·문서로 유출시키지 않는다.
2. 다른 운영 경로(로그인, 프로필, 채팅, 게스트, 워커, 상거래)에 관리자 키가 필요한지 서비스별 용도를 별도 점검한다. 이 경로는 회원 로그인 확인만을 대상으로 한다.
3. 실제 `MYEONGHA_DATABASE_URL`의 사용자 및 TLS 설정, 실제 배포 런타임, Supabase Data API 노출, 관리자/공용 역할의 7개 상거래 테이블 직접 쓰기 권한은 별도 점검이 필요하다. 이번 안전장치가 해당 위험을 해결한 것으로 표시하지 않는다.
4. Vercel 환경변수 목록 API는 연결 도구에서 403이었으므로 기계적으로 권한을 재검증하지 않았다. 소유자 화면으로 **변수 이름·적용 환경 및 일반 DB 계정명 `myeongha_runtime`**만 확정한 상태다.
5. `SUPABASE_DB_PASSWORD`는 원래 Vercel에 없었고, 잘못된 안내로 임시 추가했다가 사용자가 삭제했다. 기존 운영 비밀번호가 배치돼 있었다는 결론은 **철회**. GitHub Actions의 승인된 DB 관리 비밀과 Vercel 앱의 변수는 다르다.

**운영 계정·키 교체, 결제/환불, 운영 DB ACL·RLS, Production 병합·배포는 변경하지 않았다. 사용자에게 이번 단계의 추가 조치를 요청하지 않는다.**
