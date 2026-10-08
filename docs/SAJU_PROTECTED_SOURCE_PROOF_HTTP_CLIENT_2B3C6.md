# 명하 사주 브릿지 2B-3C-6 — 보호형 Source Proof HTTP 소비 어댑터

> Watchtower-Track: saju-bridge
>
> **Preview-only / 서버 내부 / HOLD.** 본 단계는 전용 HTTP Client Port와 합성 실패 검증만 구현한다.
> 실제 운영 발급 서비스 배포, 환경변수 배선, 인증된 Public API, 프로덕션 해석 의미권한, Release, Commerce, 신규 DB schema는 활성화하지 않는다.

## 출처 및 계약

- Saju source: [#2423](https://github.com/gycha0109-beep/Saju/pull/2423), `src/host/source-reading-proof-issuer-http.ts`.
- MyeongHa verifier: [#1739](https://github.com/gycha0109-beep/MyeongHa/pull/1739), Subject/Revision: [#1746](https://github.com/gycha0109-beep/MyeongHa/pull/1746), slots: [#1747](https://github.com/gycha0109-beep/MyeongHa/pull/1747).
- MyeongHa `createSajuHeldSourceProofHttpIssuePortV1({ serviceOrigin, serviceBearer, timeoutMs?, fetchImpl? })`는 `SajuHeldSourceProofIssuePortV1`를 구현한다. 호출부는 서버 내부 결속기에 주입하며, 이 모듈은 사용자-facing 라우트를 만들거나 런타임 구성을 로드하지 않는다.

## 제한

1. **요청 경로** 고정: `POST /api/internal/preview/source-readings`. 다른 API를 선택하거나 path/redirect로 우회할 수 없다.
2. **Origin**: 서버 소유의 절대 canonical HTTPS Origin만 허용한다. URL credential/path/query/fragment/HTTP를 거부한다. Fetch redirect는 `manual`, 200 이외 상태(401/409/3xx/5xx 포함)는 증빙 없이 종료한다.
3. **서버 인증**: `Authorization: Bearer <serviceBearer>`. 이 값은 HMAC 서명 키가 아니며, 브라우저·Product/Character·요청 JSON/응답에 노출해서는 안 된다.
4. **JSON 모양**: 전송 요청은 정확히 `{nonce,request}`. 허용 내부 읽기는 `전체 사주`, `연애운`; `targetPersonRef`/추가 request/reading 필드 삽입 거부. nonce는 22~128 ASCII base64url 형식.
5. **크기**: 요청 UTF-8 JSON 16KiB, 응답 streaming 512KiB 상한. 기존 `readBoundedUpstreamJsonTextV1` 사용; `content-length` 또는 stream의 실측 값 초과 시 차단. 사주 proof wrapper가 상한을 넘으면 성공인 척하지 않고 실패한다.
6. **제한 시간**: 기본 15초, 최대 30초. HTTP 요청뿐 아니라 streaming body 소비/JSON decode에도 공통 deadline을 적용한다.
7. **응답**: 200 + `application/json` + `Cache-Control: no-store`인 경우에만 JSON 파싱. 반환값은 **unknown**이며 반드시 기존 `verifySajuHeldSourceProofV1`에서 HMAC/nonce/normalized request hash/response hash/TTL/material 검증을 통과해야 한다. HTTP 200 자체는 무결성 증빙이 아니다.
8. **실패**: 모든 오류는 정형 `SajuHeldSourceProofHttpErrorV1`로 감추며 비밀키·Birth JSON·응답 본문·서비스 토큰을 로그/클라이언트에게 그대로 반환하지 않는다.

## 후속 운영 작업 — HOLD

- Saju proof 전용 서버의 실제 실행 스크립트, 배포 대상·사설 인입·TLS·서비스 인증 확인.
- 명하 런타임만 접근 가능한 Saju Origin/Bearer와 별도 32B+ HMAC 검증 키의 비밀 주입 및 정기 교체. Signer/Verifier에서 issuer/audience/keyId 동일성 검증.
- 여러 인스턴스가 공유하는 `claimNonceOnce(replayKey, expiresAtMs)` **원자적 PostgreSQL/Redis 구현**. 현재 `Set`은 테스트 전용. TTL 만료/경합/스토어 장애를 검증하기 전 실서비스 승인 금지.
- 버전 일치성/사주 실 HMAC fixture E2E, 고부하·장애 테스트, 운영 리소스 경계와 감사 로깅. 비밀값과 raw Birth 자료 기록 금지.
- 공식 Reading 저장/판매가 필요할 경우 Subject/Birth Revision 최종 쓰기 트랜잭션 조건부 검사 및 별도 Production Interpretation Authority/Release/Commerce 승인이 필요하다.

## 완료 판정

- 일반 CI/변경 범위 회귀 + SHA-pinned 통합 CI 통과 후 main 병합 가능.
- 단, 이 작업의 main 병합은 **운영 발급기 활성화, Production Interpretation 승인, 공개 또는 판매 가능 판정을 의미하지 않는다.**
