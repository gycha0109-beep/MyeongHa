# 사주 브릿지 2B-3C-7A — 다중 인스턴스 nonce claim PostgreSQL 어댑터

> Watchtower-Track: saju-bridge
>
> 상태: **서버 내부 DB 연결 어댑터/합성 테스트만 구현. DB Authority·운영 활성화·Release·Commerce: HOLD**.
>
> 연결: Saju #2423 / 명하 #1739, #1746, #1747, #1749 / [MyeongHa #1728](https://github.com/gycha0109-beep/MyeongHa/issues/1728).

## 문제와 경계

- 현재 `verifySajuHeldSourceProofV1`는 인증된 Source envelope의 issuer/audience/nonce에 대응하는 `claimNonceOnce(replayKey, expiresAtMs)`가 실제 **전체 replica에서 원자적**이라는 가정으로만 신뢰할 수 있다.
- 기존 인메모리 `Set`은 테스트용이고 서버를 분산 배포하면 같은 nonce를 각 프로세스에서 한 번씩 수락할 수 있다.
- 2B-3C-7A는 PostgreSQL 단일 INSERT + unique key conflict의 판단을 재사용하는 `createSajuSourceProofPostgresNonceClaimV1`을 추가한다. Subject 데이터를 읽거나 Saju Source 해석 의미를 판정하지 않는다.
- 이 어댑터는 **DB 테이블이나 RLS를 생성하지 않으며** 실제 런타임에 연결하지 않는다. DB 트랙의 유일한 권한 마이그레이션과 SQL 동시성 검증이 완료될 때까지 조회는 무조건 fail-closed이다.

## 사용 경로 (배포 전 예시)

```ts
const claimNonceOnce = createSajuSourceProofPostgresNonceClaimV1({
  pool: trustedServerPostgresPool,
});
const trust = {
  trustedIssuer, expectedAudience, trustedKeyId, keyBytes,
  claimNonceOnce,
};
// trust 객체는 명하 API 서버에서만 생성. 클라이언트 값 금지.
```

이 함수는 `PostgresSubjectPoolV1`의 접속·쿼리·연결 반환 인터페이스만 **구조적으로 재사용**하지만 **Subject transaction이나 해당 RLS 권한을 재사용하지 않는다**. 서버 전용 전역 replay registry에는 Subject identity가 필요하지 않다.

## 원자적 동작

1. 검증기가 준 `issuer:audience:nonce` replayKey와 만료 시각을 자체 검사한다. 만료됐거나 비정상적으로 먼 시각은 차단한다.
2. replayKey 자체는 DB에 저장하지 않고 도메인 분리 SHA-256 64자리 hex digest를 사용한다. 이는 Subject·Birth와 관련된 암호학적 익명화 수단은 아니다.
3. 별도 연결에서 `BEGIN`, `SET LOCAL ROLE myeongha_saju_proof_nonce_runtime`, 아래 SQL, `COMMIT` 후 연결을 반납한다.
4. `INSERT INTO public.saju_source_proof_nonce_claims(replay_key_digest,retained_until) VALUES($1,$2) ON CONFLICT(replay_key_digest) DO NOTHING RETURNING replay_key_digest`.
5. 정확히 한 행이 반환되면 최초 claim, 0행이면 replay/중복으로 거부. 다른 행 수·digest 불일치·연결 또는 역할/DB 장애는 거부.
6. `retained_until`은 signed proof expiry + 30초다. 사용자에게 허가 수명을 추가하는 값이 아니라 **GC 이전 replay 거부 유지**를 위한 보존 상한이다. 실제 proof 만료는 기존 HMAC verifier가 먼저 판정한다.
7. 이 DB 트랜잭션은 Saju HTTP 호출이나 Birth profile 조회 트랜잭션과 결합하지 않는다.

## DB Authority 트랙에 넘길 스키마·운영 검증

- 유일한 DB 마이그레이션에서 `public.saju_source_proof_nonce_claims` 테이블을 만든다. 필수 칼럼: `replay_key_digest text primary key`, `retained_until timestamptz not null`, `created_at timestamptz default clock_timestamp()`. `replay_key_digest`는 소문자 SHA-256 64자리 CHECK.
- `public`에 두는 경우 RLS ENABLE/FORCE 및 최소 권한 정책 필수. `anon`, `authenticated`, 브라우저 토큰, 다른 일반 `myeongha_api_executor` 역할에는 SELECT/INSERT/DELETE 권한을 부여하지 않는다.
- 새 전용 `myeongha_saju_proof_nonce_runtime` NOLOGIN/NOINHERIT/NOBYPASSRLS 역할과 제한된 INSERT 및 필요 SELECT(`RETURNING`) 권한만 부여한다. `SET LOCAL ROLE` 실행에 필요한 회원/DB connection role 연계는 DB Authority에서 검토·승인한다.
- `replay_key_digest`에 DB unique/primary key가 반드시 있어야 `ON CONFLICT DO NOTHING`가 동시 작업에서 원자적으로 하나만 성공한다.
- 정기 삭제는 `retained_until < clock_timestamp()`인 **만료 행에만** 수행한다. 청소 전/후의 동시에 유효한 proof를 삭제해서는 안 된다. 청소 권한은 nonce runtime에 주지 않고 별도 한정된 백그라운드 권한으로 제한한다.
- 실제 PostgreSQL 두 세션 경쟁 검사(동일 digest 1승/1거부, 동시성, RLS 무권한, 실패/재시도, TTL 청소)를 작성·실행해야 한다. JavaScript의 Fake Pool 테스트만으로 PostgreSQL 원자성이 증명됐다고 주장해서는 안 된다.
- 원자적 저장소가 다운되면 출처 증빙을 전부 거부한다. 다른 InMemoryStore 또는 fallback allow 구현 금지.
- DB 고가용성에서 failover·스냅샷 복구로 claim 내역이 유실되지 않는지 운영 환경 별도 검증.

## 승인 및 HOLD

**2B-3C-7A 완료**: 재사용 가능한 DB-port 코드 및 query-level synthetic 테스트, CI 통과.

**2B-3C-7B 미완**: DB Authority migration/실제 DB 역할·권한·동시성 SQL 증빙/정리 정책.

**운영 활성화 미완**: 전용 Saju issuer 배포, Origin/Bearer/HMAC 키 provisioning 및 rotation, 명하 서버 연결, 운영 감사·장애 리허설.

세 항목을 모두 충족해도 Source Meaning, Production Interpretation Authority, Release·Entitlement·Commerce는 별도 승인이 필요하며 `canExecute/canPublish/canSell=false`이다.
