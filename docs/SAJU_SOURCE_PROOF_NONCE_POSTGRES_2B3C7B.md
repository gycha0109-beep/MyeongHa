# 명하 2B-3C-7B — Saju Source Proof Replay Nonce DB Authority

> Watchtower-Track: saju-bridge
>
> 완료 범위: PostgreSQL 권한 마이그레이션 + 실제 두 DB 세션 경쟁 + RLS/TTL 청소 권한 검증.
> Production Interpretation · 공개 · Character · Commerce · 판매 · 운영 호출은 HOLD.

## 1. Authority

- 선행 어댑터: [PR #1752](https://github.com/gycha0109-beep/MyeongHa/pull/1752).
- 고정 테이블: `public.saju_source_proof_nonce_claims`.
- 필드: `replay_key_digest text PRIMARY KEY`, `retained_until timestamptz`, `created_at timestamptz`.
- 원본 issuer/audience/nonce, Source proof payload, Subject, Birth Revision, 서비스 Bearer, HMAC key는 DB에 저장하지 않는다.
- 앱 서버는 도메인 분리 SHA-256 digest에 대해 한 번의 `INSERT ... ON CONFLICT DO NOTHING RETURNING`을 수행한다. 최초 INSERT만 성공, 동시/재시도 요청은 0행을 반환한다.
- SQL INSERT 보존 상한은 호출 시점 ~165초 이내. 어댑터는 실제 Source proof expiry +30초를 `retained_until`으로 고정한다.

## 2. DB 권한

- `myeongha_saju_proof_nonce_runtime`: NOLOGIN/NOINHERIT/NOBYPASSRLS. `SELECT (replay_key_digest)`, `INSERT(replay_key_digest,retained_until)`만 허용.
- `myeongha_saju_proof_nonce_gc`: 별도 NOLOGIN 역할. 만료된 행의 `SELECT` 및 `DELETE`만 허용.
- `FORCE ROW LEVEL SECURITY`, 별도 INSERT/SELECT/DELETE RLS 정책.
- `anon`, `authenticated`, `service_role`, `myeongha_api_executor`에 테이블 접근 권한을 부여하지 않는다.
- 클라이언트 JWT나 Subject DB transaction에 새 권한을 연결하지 않는다. 별도로 인증된 신뢰 서버 DB 연결만 전용 runtime 역할을 `SET LOCAL ROLE`할 수 있어야 한다.
- 해당 `SET ROLE`을 수행할 **실제 배포 로그인 주체**의 membership 및 최소 권한 검토는 운영/DB 트랙이 별도로 결정한다. 이 마이그레이션은 일반 API role과 자동 연결하지 않는다.

## 3. 검증

- 새 마이그레이션 `1540_saju_source_proof_nonce_claim_authority_v1.sql`.
- `test/db/saju_source_proof_nonce_claim_concurrency.sh`: PostgreSQL 실 연결에서 최초/재사용 INSERT, 2개 연결 동시 경쟁, 클라이언트 접근 차단, DB constraint, runtime의 DELETE 차단, GC의 만료행만 삭제, 비만료행 보존 등을 검증.
- `test/db/run_authority_core.sh` 연결 및 기존 catalog snapshot 갱신(변경 내용 검토 후).
- 서버 어댑터의 Fake Pool 테스트는 이 검증을 대체하지 않는다. CI PostgreSQL 15 및 기존 통합 CI의 PostgreSQL 17 레인이 통과해야 한다.

## 4. 운영 단계에 남는 게이트

1. 실제 명하 백엔드의 DB 서비스 계정이 전용 NOLOGIN role로 전환할 수 있게 최소권한 membership provisioning(승인 필요).
2. `claimNonceOnce`를 서버 trust 객체의 유일한 저장소로 연결. 프로세스별 in-memory fallback 금지.
3. 신뢰된 Saju issuer의 독립적 보호 호스트 배포, 내부 통신 TLS, 서비스 Bearer 및 32바이트 이상 전용 HMAC 키 분리, keyId/issuer/audience/key rotation.
4. 스테이징 실제 HMAC 정상/재시도/경합/중단/키 교체/DB 장애 테스트. DB failover 후 claim 보존, cleanup 스케줄 승인(이 PR에서 예약하지 않음).
5. 운영 감사에서 비밀·출생정보·nonce 원문 미기록. 만료 레지스트리만 별도 정리.
6. official Reading 저장, Production interpretation meaning, 공개/판매 및 Commerce Entitlement는 **별도 Authority 검토 없이는 전부 불허**.

## 5. 종료 조건

- A: 스키마·역할·RLS의 fail-closed 실행 확인
- B: 실제 PostgreSQL 두 세션 경쟁에서 **정확히 한 개의 INSERT만 성공**
- C: 기존 DB 코어/일반/통합 CI 통과, 최신 기준 SHA 고정 PR 병합
- D: Production 배포 준비 확인은 **이 PR 범위 외**

코드가 병합되어도 운영 연결이 자동 실행되지 않으며, Source provenance 운반 성공이 의미·상품 승인을 뜻하지 않는다.
