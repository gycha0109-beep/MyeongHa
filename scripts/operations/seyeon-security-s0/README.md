# S0 실제 DB·서버 구현 묶음

Watchtower-Track: security

2026-10-25: 사용자의 자체 설계·운영 적용 지시에 따라 [HTTP 수신 증명 장벽](../../../docs/security/SEYEON_S0_HTTP_RECEIPT_BARRIER_V1_20261025.md)을 추가했다. 원본 G3 검증은 Node/Fetch의 단일 private authority를 공유한다. Fetch는 Attempt에 issuance를 COMMIT한 뒤 응답하며, 미확정 송출은 철회 완료를 차단한다. Grant intent는 새 source 사용을 즉시 막는다. `05`/`06`이 receipt·source guard 및 terminal metadata의 좁은 예외를 설치한다. 새 개인정보 table은 없다.

현재 `plan.mjs`의 v2는 installer의 능력과 default-closed ACL만 표현한다. 과거 v1 source snapshot의 `NOT_GRANTED`를 현재 사용자 실행 승인 부재로 해석하지 않는다. 운영 실행 권한과 실제 환경 검증은 [운영 기록](../../../docs/operations/SEYEON_AI_SECURITY_PRODUCTION_ROLLOUT_20261025.md)에 남긴다.

G0의 기존 초기 범위인 **원본 Memory 1건 / `conversation_recall/v1` / first direct Node reply**를 구현한다. Source registry는 비어 있고 Positive API EXECUTE는 부여하지 않는다. 이 디렉터리는 `supabase/migrations`에 포함되지 않아 main 병합만으로 운영 DB에 적용되지 않는다.

`plan.mjs`가 설치 순서의 단일 목록과 각 SQL의 LF/UTF-8 SHA-256, 중단 SQL의 digest를 출력한다. 해시는 파일 결속이며 기술 승인·서명이 아니다. 원본 초안은 #2422, 철회 명령은 기존 R17이며, 이 묶음에서 실제 SQL 계약·권한 결함을 해결한 실행본을 사용한다. 과거 Draft 전체를 재병합하지 않는다.

순서: R17 private revoke → private source locks → G1 source Pin → G2 same-transaction Commit → private accept → G3 locked first Reveal. 실제 RLS runtime owner의 source SELECT 권한을 유지하고, row lock은 본문/DML을 반환하지 않는 private 명령이 수행한다. API는 이 잠금 명령을 직접 호출할 수 없다.

```powershell
node scripts/operations/seyeon-security-s0/plan.mjs
```

`install-isolated.mjs`는 지정된 loopback scratch DB/CI PG17만 허용하며 remote URL 또는 production admission 옵션이 없다. CI는 기존 postgres17 suite의 `seyeon-security-s0-real-path-pg17` 사례를 실행한다. 테스트가 만든 합성 type 등록·실행 권한은 disposable DB 밖에 적용되지 않는다.

중단 산출물 `stop-positive-use.sql`은 데이터를 삭제하지 않고 Model/Writable registry 및 positive API EXECUTE만 회수한다. 기존 사용자의 동의 철회 권한은 보존한다. 운영 적용은 별도 DB/DR·Scope·예산·transport 승인 후 담당자가 검토한 목록으로 수행한다.

서버 조립은 `production-seyeon-first-memory-node-runtime-v1.ts`이다. 기존 verified Member, G1/G2/G3 readiness, 원본 codec, ENFORCE Governor/별도 비용 DB, 기존 Chat 실행 및 동일 Node socket 잠금 송출을 연결한다. 서버 승인 callback과 비용 정책이 없으면 credential resolution 전에 차단한다. 기존 Vercel/Workers Fetch에 positive Node sender를 붙이지 않는다.

Private accept와 revoke의 Production factory도 기존 server-owned 승인 callback을 전달할 수 있다. 현재 배포 caller는 전달하지 않으므로 기본 DENY다. 사용자 JSON·header·env flag로 승인할 수 없다.

DB 최초 설치·타입 계약·운영 역할 부여·동일 백업 복원·실제 외부 transport V/R/S/ACK 및 유료/공개 승인은 이 브랜치가 대신하지 않는다. History/Replay/Reader/Worker/다중 Memory·Life Fact의 미확정 파생 공개는 계속 차단한다.

## 2026-10-27 Owner Admin 응답 권한 복구 후보

`owner-chat-receipt-acl-restore-v1.sql`은 이 디렉터리에서 별도로 설치한 원본 S0 보호 함수 중 현재 API 실행 역할에 누락된 **정확한 3개 EXECUTE 권한**만 복구하는 운영용 SQL이다. 원본 source 타입을 활성화하거나 개인정보 접근 승인, 결제·유료 크레딧 사용, 일반 회원 채팅을 개방하지 않는다. 신규 PostgreSQL CI의 공용 `supabase/migrations`에는 포함하지 않는다.

실행 전 원본 함수 소유자·설정·권한·중단된 source registry를 확인한다. 운영 Supabase의 제한된 `postgres`는 기존 관리형 권한을 그대로 두고, 일시적으로 함수 소유자 역할을 부여받아 실행한 뒤 동일 트랜잭션에서 **자신이 추가한 역할 부여만 회수**한다. 별도 CI용 PostgreSQL 슈퍼유저는 운영 전용 역할 관계를 요구하지 않는다. 모든 사후 조건이 만족되지 않으면 트랜잭션이 실패한다.

2026-10-27 운영 DB 확인 기준: 관리자 등록 1건, 해당 관리자의 사용 승인된 세연 원본 `conversation_recall/v1` 기억 0건 및 활성 Grant 0건, 활성 Positive source 타입 0건. 따라서 권한 복구만으로 첫 AI 채팅 성공을 주장하지 않는다. 별도의 원본 기억/사용자 공유 동의·source admission·Governor·실제 브라우저 수신 검증이 필요하다. 운영 반영 전 PR 검사 및 독립적인 설치 이력과 복구 계획을 확인한다.

## S0 본인 기억 철회 상태 조회

`07-member-withdrawal-status.sql`은 RLS가 숨기는 미완료 철회 intent를 소유자 본인에게만 `active / withdrawal_pending / not_granted` 상태로 반환하는 읽기 전용 최소 권한 함수입니다. 원본 기억 본문·Grant ID·철회 시각은 반환하지 않습니다. `myeongha_api_executor`에게 이 조회 함수 EXECUTE만 부여하며 DML·모델·공개 권한을 추가하지 않습니다.

기존 S0 설치 묶음 뒤에 적용합니다. 병합만으로 운영 DB에 자동 설치되지 않으며, 실제 운영 DB 적용 전 대상 ACL·PG17 경합·운영 승인 증거가 필요합니다. 미설치 서버의 일반 GET 결과가 false여도 철회 완료를 추정하지 않고 `unknown`으로 처리합니다.
