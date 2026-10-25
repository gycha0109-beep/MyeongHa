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

## 2026-10-26: 통합 브랜치 운영 명령 (미활성화)

1. `install-production-default-closed.mjs`: **최종 main, 깨끗한 HEAD, 동일 HEAD PostgreSQL 17 복원 리허설 증거**가 일치하는 경우에만 원자적 S0 설치. 설치 후 Registry는 비어 있고 API positive EXECUTE는 금지됩니다.
2. `configure-seyeon-security-s0-credentials.mjs`: 설치 이후 독립 비용 DB LOGIN/Provider 시크릿을 로컬 보호 경로에 생성합니다. 기존 DB 비밀번호나 Provider 토큰을 저장소에 넣지 않습니다.
3. `configure-production-cost-default-off.mjs`: 해당 UTC일 글로벌·개인 예산을 **명시적으로** 지정합니다. 이미 다른 정책·예산이 존재하면 덮어쓰지 않습니다. 모델은 비활성으로 둡니다.
4. `activate-production-s0-after-evidence.mjs`: 최종 main·복원 리허설·SRC-25 승인·G0-D04·G1/G2·G3·G5 실제 파일 해시 검증 후에만 한 원자 트랜잭션으로 S0 소스와 API/모델 권한을 열 수 있습니다. 역사 조회·Replay·Writer 권한은 열지 않습니다. 이 명령을 구현했다고 운영 승인으로 취급하지 않습니다.
5. `emergency-stop-production-s0.mjs`: 운영 중 새 모델 사용·S0 소스·G1/G2를 차단하고 권한을 재검증합니다. 기존 receipt ACK와 사용자의 철회 권한은 이전과 동일하게 유지합니다. 비상 중단 자체는 사용자의 철회를 완료했다고 주장하지 않습니다.

**현황:** 위 명령은 단일 브랜치에 구현되었으나 현재 승인된 릴리스 증거·운영 DB 설치·Cloudflare Provider 배포·사용자 인증 G5/G6 smoke가 완료되지 않았습니다. 운영 S0는 HOLD입니다. 기능별 PR/CI는 실행하지 않고 최종 완료 후 한 번의 통합 단계로 넘깁니다.
