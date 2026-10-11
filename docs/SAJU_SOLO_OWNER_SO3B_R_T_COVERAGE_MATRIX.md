# SO-3B R01–R14 / T01–T40 출처·검증 추적표 (운영 미검증)

Watchtower-Track: saju-bridge

> 이 문서는 **검증 계획/범위 추적**이며 운영 evidence receipt가 아니다. `T01–T40`는 이 문서에서 정의한 SO-3B 검증 추적 ID다. 다른 문서의 기존 T01–T40과 **동일 테스트 ID·통합 coverage임을 주장하지 않는다**. 각 테스트 상태는 실제 CI 성공을 확인하기 전에는 `IMPLEMENTED_UNVERIFIED_RUN`이며, 미래 운영 항목은 `FUTURE_REQUIRED`다.

## R01–R14 원본 런북 정합성

| R | 원본 03A sourceKind | SO-3B 연관 검증/요구 | 운영 상태 |
|---|---|---|---|
| R01 | ROOT_CUSTODY | 독립 Root SPKI pin/비반출·정책 검증, T09–T10, T20 | NOT_VERIFIED |
| R02 | REGISTRY_ROLLBACK_LEDGER | 외부 high-water·revision floor·철회/복원, T19–T20, T32 | NOT_VERIFIED |
| R03 | OPERATOR_APPROVAL_LEDGER | Owner 행동 인증·purpose-bound Permit V2, T05–T09, T29 | NOT_VERIFIED |
| R04 | CHALLENGE_LEDGER | 별도 원장·일회 소비/replay/partial COMMIT, T13, T18, T30–T31 | NOT_VERIFIED |
| R05 | AUTH_MANAGEMENT_PLANE | 독립 Auth project/Member-only·Production 분리, T33 | NOT_VERIFIED |
| R06 | SUBJECT_DB_TLS_PROBE | Subject cluster/TLS/CA/DNS SAN·제한 로그인, T34 | NOT_VERIFIED |
| R07 | SUBJECT_DB_PRIVILEGE_PROBE | DB session_user·ACL·RLS/GRANT 확인, T35 | NOT_VERIFIED |
| R08 | NONCE_DB_ISOLATION_PROBE | 독립 Nonce DB 권한/경합, T36 | NOT_VERIFIED |
| R09 | ADMISSION_DB_ISOLATION_PROBE | 독립 Admission V2 제한 소비, T19, T31, T36 | NOT_VERIFIED |
| R10 | PROOF_INGRESS_PROBE | HTTPS ingress/TLS peer/DNS/SSRF, T37 | NOT_VERIFIED |
| R11 | PROOF_KEY_CUSTODY | Bearer/HMAC Secret 분리·rotation·TTL, T38 | NOT_VERIFIED |
| R12 | DEPLOYMENT_ATTESTATION | MyeongHa/Saju SHA/Manifest/Plan 고정, T15–T17, T39 | NOT_VERIFIED |
| R13 | TEST_MEMBER_ACCESS_PROBE | 폐기형 Member/Birth 및 접근 격리, T40 | NOT_VERIFIED |
| R14 | ROLLBACK_DRILL_RECORD | revoke/복원/키 분실·Owner 수동 recovery·감사, T21–T23, T32 | NOT_VERIFIED |

SourceKind·reference ID·로그 링크의 존재만으로 실제 출처 인증, 다른 사람 승인, durable custody를 인정하지 않는다.

## T01–T40 (SO-3B 고유 검사 추적)

| ID | 구현 또는 요구 시나리오 | 책임/상태 |
|---|---|---|
| T01 | 모든 주장 일치해도 신뢰·Runner 전부 미승격 | `provider-readiness-v1.test.ts` / IMPLEMENTED_UNVERIFIED_RUN |
| T02 | version 변조 | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T03 | credential extra field 주입 | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T04 | 필수 역할 누락 | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T05 | 중복/역할 대체 | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T06 | principal 공유 | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T07 | security domain 공유 | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T08 | 인간 소유자 사칭 | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T09 | Signer/Attestor 키 purpose 혼용 | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T10 | Root key export 가능 주장 | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T11 | Runner 권한 삽입 | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T12 | Owner portal의 Root private key 접근 | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T13 | Challenge 발행/소비 겸용 권한 | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T14 | profile credential 삽입 | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T15 | 다른 환경 ID | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T16 | Manifest digest drift | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T17 | Saju commit SHA drift | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T18 | Permit 교체/replay된 scope | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T19 | 서로 동일한 witness reference | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T20 | 외부 high-water 참조 누락 | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T21 | trusted clock 참조 누락 | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T22 | 계획 retention 부적합 | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T23 | 증분 예산 0 초과 | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T24 | witness credential field 주입 | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T25 | getter/symbol/inheritance/array/invalid 객체 | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T26 | expected scope 위조·오염 | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T27 | 참조·신뢰 시각 IAM 미증명과 자동 재시도 거부 | 동일 테스트 / IMPLEMENTED_UNVERIFIED_RUN |
| T28 | 실제 workload IAM principal / token binding | **FUTURE_REQUIRED** / 운영 P1~P2 승인 |
| T29 | Owner passkey 이벤트·의도·서명 서비스 scope 결속 | **FUTURE_REQUIRED** / 운영 P2 승인 |
| T30 | Challenge 원장 unknown COMMIT/일회 소비 durable 재조회 | **FUTURE_REQUIRED** / 운영 P2 승인 |
| T31 | Admission과 Challenge 부분 COMMIT 독립 감사·복구 | **FUTURE_REQUIRED** / 운영 P2/P3 승인 |
| T32 | Root revoke·high-water 외부 restore rewind 및 WORM 감사 | **FUTURE_REQUIRED** / 운영 P2/P4 승인 |
| T33 | Auth project/member-only 별도 관리 평면 관찰 | **FUTURE_REQUIRED** / 운영 P2 승인 |
| T34 | Subject 독립 TLS peer/CA/DNS SAN | **FUTURE_REQUIRED** / 운영 P2 승인 |
| T35 | Subject 제한 LOGIN/role membership/RLS | **FUTURE_REQUIRED** / 운영 P2 승인 |
| T36 | Nonce/Admission 3DB 독립 서버·권한·경합 | **FUTURE_REQUIRED** / 운영 P2 승인 |
| T37 | Saju HTTPS/loopback/TLS/SSRF | **FUTURE_REQUIRED** / 운영 P2 승인 |
| T38 | Bearer/HMAC 목적·rotation·Secret isolation | **FUTURE_REQUIRED** / 운영 P2 승인 |
| T39 | 두 저장소 릴리스 commit digest 서명된 배포 확인 | **FUTURE_REQUIRED** / 운영 P2 승인 |
| T40 | 폐기형 Member/Birth 접근 분리·실험 후 폐기 | **FUTURE_REQUIRED** / 운영 P3 승인 |

`IMPLEMENTED_UNVERIFIED_RUN`은 **테스트 코드 작성**만 뜻한다. 특정 SHA의 CI 로그가 PASS인 경우에만 코드 범위 상태를 PASS로 기록하며 운영 열의 R01~R14는 절대 자동으로 PASS로 바꾸지 않는다. 향후 기존 3-03~3-04 테스트들과 번호/시나리오 충돌 없이 고유 식별자를 정리하는 별도 인수 검토가 필요하다.

## 다음 종료 기준

1. P0 코드·부정테스트 CI PASS, exact HEAD full Integration PASS, squash 및 main 포함.
2. R01–R14 `NOT_VERIFIED` 유지, T28–T40 `FUTURE_REQUIRED` 유지.
3. 운영 IAM/Root/KMS/인증·Audit/WORM/Reader/Runner/Commerce/유료 리소스 사용 0.
