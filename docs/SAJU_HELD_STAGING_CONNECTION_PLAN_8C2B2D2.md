# 8C-2B-2D-2 — 격리 스테이징 연결 계획 및 무권한 검증 계층

Watchtower-Track: saju-bridge

> 구현 범위: MyeongHa server-only, inert configuration. 실제 staging 연결/증빙/실행/인가/배포 아님.
> 기존 Manifest V1 및 Ed25519 Operator Permit V1 구조·서명 바이트 변경 금지.

## 1. 기존 컴포넌트 재사용

- `saju-held-staging-target-manifest-v1.ts`: 기존 Manifest V1, canonical digest 및 Production Auth 차단.
- `saju-held-staging-target-validator-v1.ts` / `saju-held-staging-readiness-v1.ts`: 정적 설정 및 미검증 Claim. 어떤 결과도 권한을 발급하지 않음.
- `saju-held-staging-rehearsal-runner-v1.ts`: 운영 대상 Authority, 승인 원자 소진, Member-only verifier, Birth Revision pin을 주입받는 내부 일회 실행기. **본 작업에서 직접 연결하거나 실행하지 않음**.
- `saju-held-staging-admission-postgres-v1.ts` 및 2D-1: 서명 검증, 공유 PostgreSQL 조건부 1회 UPDATE. **실제 DB 로그인 멤버십 미부여**.
- Saju protected Source Proof process: 전용 loopback listener와 별도 Bearer/HMAC 키. 공개 바인딩 금지.

## 2. 신규 구성요소 및 책임

| 파일 | 책임 |
|---|---|
| `apps/api/src/saju-held-staging-connection-plan-v1.ts` | 기존 Manifest Digest에 결속된 별도 비밀 없는 연결 계획: Staging Auth Origin, Saju Proof Origin, Subject/nonce/Admission DB target ID, 각 login/runtime role, TLS hostname, pinned CA fingerprint |
| `apps/api/src/saju-held-staging-connection-claims-v1.ts` | 독립적으로 검증되지 않은 Auth/DB/Proof 관찰값의 **커버리지**와 일치 여부만 평가. 모든 self-reported PASS가 완비돼도 `COMPLETE_UNTRUSTED`, 실제 `NOT_VERIFIED` |
| `apps/api/src/saju-held-staging-db-tls-target-v1.ts` | 독립 승인 Plan이 형식상 일치할 때만 폐쇄적인 3개 PostgreSQL SSL 설정 생성. X.509 CA fingerprint pin, connection URL hostname·loginRole 일치, sslmode=verify-full 필수, 중복/unsafe query 거부, pg SSL override 방지 |
| `test/saju-held-staging-connection-plan-v1.test.ts` | Manifest/승인계획/SHA drift, Auth/Proof 혼입, DB Role 충돌, 위조 Claim, 민감값 유출 차단 |
| `test/saju-held-staging-db-tls-target-v1.test.ts` | Synthetic X.509 fixture, TLS downgrade, CA mismatch, user/host/SSL query injection, secret sanitizer 검증 |

## 3. 승인·비밀·실접속 경계

1. **Manifest Digest ↔ Connection Plan ↔ 별도 Reviewed Plan**의 일치 여부는 정적 계약 검증이다. Approved Plan 객체의 진짜 독립성/서명은 본 모듈에서 증명하지 않는다.
2. **중요한 남은 공백:** 기존 Operator Permit V1의 Ed25519 서명 바이트는 *Connection Plan Digest 자체*를 포함하지 않는다. 따라서 승인 DB target/CA/로그인 role에 대한 암호학적 승인 결속이 완성됐다고 주장하지 않는다. 실환경 준비 전 Target Authority가 Plan의 운영 승인 provenance 및 Permit 연계를 별도로 검증해야 하며, 필요하면 Permit V2 설계 승인을 받아야 한다.
3. 위 세 DB의 `targetId`, `loginRole`, `runtimeRole`은 충돌할 수 없다. nonce/admission 실행 역할은 기존 계약 상수에만 결속된다. `postgres`, `supabase_admin`, `service_role`, `authenticated`, `anon` 등 특권 주체의 DB role 사용은 차단.
4. 반환된 TLS 설정에는 비밀번호 포함 connectionString 및 PEM CA가 들어간다. 출력/저장/로그/사용자 요청에 포함하거나 운영자에게 공개할 수 없다. 생성만으로 소켓·Pool·CLI·요청·DB transaction을 실행하지 않는다. 반환 `ssl.ca`와 `rejectUnauthorized:true`를 분리하여 PostgreSQL `sslmode`의 node-postgres override를 막는다. 기본 hostname 인증을 우회하는 사용자 지정 `checkServerIdentity`를 쓰지 않는다.
5. 실제 Hostname/TLS peer, 실제 DB cluster, DB `session_user` 및 제한된 역할 멤버십, 네트워크/SSRF 방어·도메인 고정·DNS 재바인딩 대응, 권한 없는 데이터 조회 거부는 **실접속에서 별도 검증해야 한다**.
6. Supabase Member-only Auth 실제 `/auth/v1/user`, Saju HTTPS reverse proxy/TLS 및 Bearer/HMAC, 승인된 Subject/Birth, 키 공급은 후속 실환경 운영 승인 단계. Production Supabase project ref나 Production Calculation 서비스 계정 재사용 금지.
7. 이 단계에서는 신규 `supabase/migrations`, GRANT, operator signer, role membership, env resolver, 노출 route, Secret loader, deploy, external network, 보안 통과를 실행하지 않는다. 테스트 fixture의 인증서·패스워드는 테스트값이며 운영용 아님.

## 4. 테스트와 실패 처리

- Strict exact-field / frozen projection, 3개 DB target/login/runtime role 중복 및 특권 role 거부.
- SHA drift, Manifest Origin/Issuer mismatch, 별도 승인 Plan 변경, Production Auth 재사용, Secret-in-Plan, raw connection URL-in-Plan 차단.
- verify-full 검증, 호스트·계정·CA fingerprint mismatch, PEM 오류, SSL 옵션/인증 회피 차단.
- 관찰값 Claim은 일부 누락 시 INCOMPLETE, 불일치/위조 시 BLOCKED, 완전한 자체 보고도 COMPLETE_UNTRUSTED.
- 모든 보고서는 Secret, 원본 URL/호스트, Subject/Birth, Proof/Approval 서명 바이트를 노출하지 않음.
- 외부 조회·실제 프로브는 없음. Synthetic 성공으로 `stagingConnection=VERIFIED` 또는 `canRunOnce=true`를 반환할 수 없음.

## 5. 단계 종료조건 (코드 전용)

A. 계획·정적 신뢰성 검사·TLS 생성기 및 부정 테스트 구현.
B. TypeScript·기본 CI·SHA 고정 통합 CI PASS.
C. HEAD/BASE 재검증 후 Squash Merge 및 main 포함 여부 재확인.

실환경 진입을 허용하지 않는다. 실제 인증서와 로그인 증명, Auth 프로젝트 분리, 독립 승인 플랜 서명·보관, Connection Plan/Permit cryptographic binding, 배포/키 회전은 8C-2B-2D-3 책임으로 HOLD한다.

```text
stagingAdmission = HOLD
stagingConnection = NOT_VERIFIED
sourceAuthority = NOT_EVALUATED
releaseAuthorization = NOT_EVALUATED
canRunOnce = false
canExecute = false
canPublish = false
canSell = false
```
