# S0 실제 DB·서버 구현 묶음

Watchtower-Track: security

2026-10-25: 사용자의 자체 설계·운영 적용 지시에 따라 [HTTP 수신 증명 장벽](../../../docs/security/SEYEON_S0_HTTP_RECEIPT_BARRIER_V1_20261025.md)을 추가했다. 원본 G3 검증은 Node/Fetch의 단일 private authority를 공유한다. Fetch는 Attempt에 issuance를 COMMIT한 뒤 응답하며, 미확정 송출은 철회 완료를 차단한다. Grant intent는 새 source 사용을 즉시 막는다. `05`/`06`이 receipt·source guard 및 terminal metadata의 좁은 예외를 설치한다. 새 개인정보 table은 없다.

현재 `plan.mjs`의 v2는 installer의 능력과 default-closed ACL만 표현한다. 과거 v1 source snapshot의 `NOT_GRANTED`를 현재 사용자 실행 승인 부재로 해석하지 않는다. 운영 실행 권한과 실제 환경 검증은 [운영 기록](../../../docs/operations/SEYEON_AI_SECURITY_PRODUCTION_ROLLOUT_20261025.md)에 남긴다.

현재 [S0 실행 로드맵 v3](../../../docs/security/SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V3_20261107.md)의 첫 제품 범위는 **검증된 Member의 `conversation_recall/v1` 원본 Memory 1건 + 같은 Turn의 현재 User 원본 메시지 1건 + 최초 비스트리밍 Cloudflare Worker 답변 1회**다. 과거 메시지·Replay·Reader·Relationship·다중 Memory·Streaming은 제외하고 HOLD한다. 운영 Source Registry는 비어 있지 않으며 해당 타입 행 1개가 `enabled=false, writable_enabled=false`로 등록돼 있다. 기존 Positive RPC의 API 실행 권한과 원본 결합 G1 Pin의 설치·사용 승인은 다르다. 이 디렉터리는 `supabase/migrations`에 포함되지 않아 main 병합만으로 운영 DB에 적용되지 않는다.

`plan.mjs`가 설치 순서의 단일 목록과 각 SQL의 LF/UTF-8 SHA-256, 중단 SQL의 digest를 출력한다. 해시는 파일 결속이며 기술 승인·서명이 아니다. 원본 초안은 #2422, 철회 명령은 기존 R17이며, 이 묶음에서 실제 SQL 계약·권한 결함을 해결한 실행본을 사용한다. 과거 Draft 전체를 재병합하지 않는다.

순서: R17 private revoke → private source locks → G1 source Pin → G2 same-transaction Commit → private accept → G3 locked first Reveal. 실제 RLS runtime owner의 source SELECT 권한을 유지하고, row lock은 본문/DML을 반환하지 않는 private 명령이 수행한다. API는 이 잠금 명령을 직접 호출할 수 없다.

```powershell
node scripts/operations/seyeon-security-s0/plan.mjs
```

`install-isolated.mjs`는 지정된 loopback scratch DB/CI PG17만 허용하며 remote URL 또는 production admission 옵션이 없다. CI는 기존 postgres17 suite의 `seyeon-security-s0-real-path-pg17` 사례를 실행한다. 테스트가 만든 합성 type 등록·실행 권한은 disposable DB 밖에 적용되지 않는다.

중단 산출물 `stop-positive-use.sql`은 데이터를 삭제하지 않고 Model/Writable registry와 positive API EXECUTE를 회수하며, 별도 허용 후 실행 가능해지는 결합 원본 Pin용 `public.cmd_pin_seyeon_positive_model_context_sources_v1` 호출 권한도 회수한다. 기존 사용자의 동의 철회와 이미 발행된 답변의 수신 확인 권한은 보존한다. 운영 적용은 별도 DB/DR·Scope·예산·transport 승인 후 담당자가 검토한 목록으로 수행한다.

`apps/api/src/production-seyeon-first-memory-node-runtime-v1.ts`는 **기존 Node 전용 실행/격리 검증용 경로**다. 현재 S0 운영 대상은 `cloudflare/myeongha-worker.mjs`의 최초 비스트리밍 HTTP 경로와 `apps/api/src/production-seyeon-chat-runtime-v1.ts` 및 G1 결합 Pin adapter다. 최초 모델 응답은 `positiveMemoryFirstReplyApproved=false`로 차단돼 있으며 `creditBilling.productionMounted=false`다. Node 송출 검증이나 Fetch Response 생성만으로 Worker 브라우저 수신·철회 경합을 PASS로 판정하거나 Node sender를 Worker에 붙이지 않는다.

Private accept와 revoke의 Production factory도 기존 server-owned 승인 callback을 전달할 수 있다. 현재 배포 caller는 전달하지 않으므로 기본 DENY다. 사용자 JSON·header·env flag로 승인할 수 없다.

DB 최초 설치·타입 계약·운영 역할 부여·동일 백업 복원·실제 외부 transport V/R/S/ACK 및 유료/공개 승인은 이 브랜치가 대신하지 않는다. History/Replay/Reader/Worker/다중 Memory·Life Fact의 미확정 파생 공개는 계속 차단한다.

## 2026-11-08 운영 G1 원본 연결 설치 성공 — Source Registry 비활성 유지

- **현재 상태(아래 과거 실패·보류 기록에 우선):** 기존 사용자 승인 범위의 G1 원본 연결 SQL `16-g1-model-recent-source-pin.sql` → `17-g1-positive-combined-model-source-pin.sql`를 실제 명하 Supabase `cnsfpcdiyofqvhpcegfc` PostgreSQL17에 **하나의 트랜잭션**으로 적용했다. 소스 버전은 기존 security PR #3120의 `0738eea27c07e6467505c8eecdb8b91cee4d69c8`, 설치 SQL blob SHA는 `76f852d13d74bc28e452c2c4b2ea4780514af2f5` 및 `886c9b5774fbfed5bfb7997dd3b3ea3e7c672679`. 원본 파일의 `BEGIN/COMMIT`과 중복 임시 멤버십 설정만 단일 설치 트랜잭션 외피로 합쳤으며, W141에서 검증한 함수 소유자 `SET LOCAL ROLE`을 유지했다.
- **운영 변경 범위:** 기존 `chat_turn_attempts` 최근 원본 Pin JSONB 컬럼·변경 불가 트리거·현재 회원 원본 잠금 정책/열 권한, private 최근 원본 Pin 함수 1개, private 결합 원본 Pin 함수 1개, public 합성 owner RPC 1개를 설치했다. `myeongha_api_executor`에는 오직 `public.cmd_pin_seyeon_positive_model_context_sources_v1` (정확히 16개 인자)의 `EXECUTE`만 신규 허용했다. private 함수 2개는 해당 서버 계정에서 직접 호출 불가이며 `anon`, `authenticated`, `service_role`도 public 합성 RPC를 실행할 수 없다.
- **운영 독립 검증 결과:** 별도 읽기 전용 `pg_proc/pg_namespace/pg_roles` 카탈로그 검사에서 위 함수 3개가 전부 `myeongha_seyeon_chat_runtime_owner` 소유 `SECURITY DEFINER`임을 확인. public RPC 16인자·최근 private 7인자·결합 private 16인자 정확히 일치. 최근 출처 Pin 컬럼 1개, immutable 트리거 1개, 원본 잠금 정책 1개. `Owner`는 NOLOGIN으로 유지하고 불필요한 public/private 스키마 CREATE 및 관리자 `SET ROLE` 허용이 남지 않았다. 운영 migration frontier `20261105075227` 그대로, Source Registry 활성 원본 **0**, 원본 타입 등록행 **1**(OFF). 이 검증은 **실제 회원 승인 원본의 결합 Pin 성공/유료 AI 응답/HTTP 송출 PASS가 아니다**.
- **원본 백업·사전 CI:** 실운영 암호화 [백업 #42415093056](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42415093056) SUCCESS, 같은 백업의 [격리 복원 #42416383688](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42416383688) SUCCESS. W141 정확한 HEAD `0738eea27c07e6467505c8eecdb8b91cee4d69c8`의 [CI #42474860198](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42474860198), [Governance #42474860203](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42474860203), [Web Gates #42474860167](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42474860167) 전부 SUCCESS.
- **다음 Gate:** 실사용 원본 `conversation_recall/v1` 한 건에 대한 사용자 동의·유효 Grant, 현재 User 원본 메시지의 실제 모델 입력 전 영속 Pin 경로 검증은 미완료. 이어 G4 일반 고객 크레딧 사전 예약·정산, G2 Commit, G3 실제 Cloudflare Worker 송출/receipt, G5 통합·G6 제한 운영 검증이 필요하다. `HOLD_FORWARD_STOPPED`, `positiveMemoryFirstReplyApproved=false`, `creditBilling.productionMounted=false` 유지. 이번 승인은 Registry 활성화·Provider 유료 호출·실서비스 공개로 확장되지 않는다. 사고 시 기존 `stop-positive-use.sql`의 결합 owner RPC 실행권 회수 및 기존 사용자 철회/ACK 보존 절차를 사용한다.

## 2026-11-08 G1 운영 설치 재시도 — 잠금 해제, 함수 소유자 권한 문제 수정

- 이전 W140 `idle in transaction` 충돌은 재조회 시 사라졌다. 운영 PostgreSQL `cnsfpcdiyofqvhpcegfc`의 migration `20261105075227`, 등록된 활성 모델 원본 0, 새 G1 함수/컬럼 미설치, 설치자 Owner SET 권한 원상 유지(false)를 재확인했다.
- 기존 단일 SQL 거래로 16→17 설치를 재시도했지만 이번에는 `42501 permission denied for function pin_model_recent_sources_v1`로 취소됐다. 원인은 함수 OWNER를 NOLOGIN 역할로 이전한 뒤 관리자 `postgres`가 OWNER 권한을 상속하지 않는 운영 역할 모델에서 `REVOKE EXECUTE`를 수행하려 했기 때문이다. **운영 트랜잭션은 롤백됐고 재조회에서 새 함수/컬럼 없음, Owner SET=false, Registry OFF**를 확인했다. 이 오류는 기존 모델 원본 사용 활성화나 과금 실패가 아니다.
- 기존 `16-g1-model-recent-source-pin.sql`, `17-g1-positive-combined-model-source-pin.sql`의 **원 함수 ACL 회수 3곳**에 한해서 해당 NOLOGIN OWNER 역할로 `SET LOCAL ROLE` → 정확한 `REVOKE ALL` → `RESET ROLE` 경계를 추가했다. API 역할/익명 역할 허용은 확대하지 않는다. 기존 PRIVATE 결합 함수의 직접 API 실행 차단·public owner wrapper만 별도 최소 EXECUTE·Registry OFF를 유지한다.
- 이번 수정의 정확한 HEAD CI가 PostgreSQL17 격리 설치·API 보안 경로를 통과하기 전에는 실제 운영 DB에 다시 적용하지 않는다. 이전에 확인한 최신 [암호화 백업 #42415093056](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42415093056) 및 [격리 복원 #42416383688](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42416383688)의 성공 증거를 유지한다. 사용자 운영 G1 설치·최소 실행 권한 승인은 이미 있으므로 재승인 요청하지 않는다. Source Registry ON, G4 과금/유료 호출, G3 송출 공개는 금지 상태다.

## 2026-11-08 운영 G1 승인 설치 — 최신 백업 복원 통과 후 DB 잠금 대기

- **최신 복원 선행 조건 통과:** 암호화 운영 백업 [#42415093056](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42415093056) SUCCESS, 산출물 `myeongha-postgres-20261107T211732Z`(artifact ID `13591083526`, 보존 기한 2026-12-07T21:20:39Z). 동일 백업의 첫 격리 복원 [#42416185560](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42416185560)은 복원·구조비교·가상 개인정보 복구가 성공했지만 incident reference를 백업 종료 이전으로 입력해 증거 포장 단계에서 실패했다. 기준 시각만 수정해 **같은 백업**으로 재실행한 [#42416383688](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42416383688)은 격리 복원·구조 비교·가상 개인정보 복구·증거 생성 모두 **SUCCESS**(증거 artifact `13591363096`). 앞선 실패를 복원 실패로 오기하지 않는다.
- **운영 적용 시도 및 안전한 취소:** 운영 Supabase `cnsfpcdiyofqvhpcegfc`의 migration frontier `20261105075227`, 241개, 기존 함수·원본 타입 OFF 상태를 읽기로 재확인. 승인된 `16-g1-model-recent-source-pin.sql` 및 `17-g1-positive-combined-model-source-pin.sql`를 **단일 트랜잭션**에 넣고, 기존 관리자 `postgres`→NOLOGIN owner 역할의 멤버십이 `SET FALSE`로 설정된 상태를 보존하도록 `SET TRUE` 임시 전환·`SET FALSE` 복귀를 구성했다. 이 전환은 사전에 `BEGIN/ROLLBACK`으로 시험했고 영속 역할 변경이 없음을 확인했다. 실행은 PostgreSQL `55P03 lock_timeout`으로 실패했으며 거래 전체가 취소됐다. **16/17 함수·최근 출처 Pin 컬럼이 미설치이고 역할 SET 권한이 원래대로 false, Source Registry ON 0건**인 것을 사후 읽기 검증했다. 따라서 **운영 설치 완료나 실제 원본 Pin 성공은 아니다**.
- **발견한 원인:** 외부 Supavisor 연결의 `idle in transaction` 상태가 `public.chat_turn_attempts`·`public.conversation_messages`에 `AccessShareLock`을 보유하여 구조 변경용 잠금과 충돌했다. 해당 세션 PID는 관측 시점 `3035490`이고 세션 식별은 일시적일 수 있다. 사용자 트래픽/다른 작업의 연결일 수 있어 강제 종료·잠금 해제·무제한 timeout 상향을 실행하지 않았다.
- **다음 진행:** 해당 세션이 **자연 종료된 뒤** 잠금이 해제됐는지 확인 → 같은 승인·정확한 16→17 SQL, 단일 롤백 가능 트랜잭션과 한정된 lock timeout으로 재적용 → public 결합 명령만 회원 실행 계정에 실행 허용 → 공개/내부 함수 ACL 및 OFF Registry·기존 회수·ACK 보존을 검증. D1~D5 제품 승인, G4 과금, Source Registry ON, G3 공개·배포는 범위 밖이다. 트랙은 `security`로 유지하고 운영/DR 별도 트랙 작업은 만들지 않는다.

## 2026-11-08 운영 G1 설치 승인 및 현재 보류 사유

- **승인됨:** 사용자가 운영 명하 Supabase `cnsfpcdiyofqvhpcegfc`에 검증된 G1 원본 연결용 `16-g1-model-recent-source-pin.sql` → `17-g1-positive-combined-model-source-pin.sql` 설치 및 `myeongha_api_executor`에 정확한 public 통합 RPC `cmd_pin_seyeon_positive_model_context_sources_v1(uuid,uuid,uuid,uuid,uuid,jsonb,text,uuid,uuid,text,text,text,text,text,text,text)`만 EXECUTE 허용하는 **좁은 운영 DB 변경**을 명시 승인했다. 이 승인은 Source Registry 활성화, G4 유료 모델/크레딧, G3 HTTP 송출·공개 활성화가 아니다.
- **완료한 사전 확인:** 해당 프로젝트는 PostgreSQL 17 및 실제 대상 역할이 존재한다. 원본 두 SQL과 새 함수/컬럼은 아직 미설치이며 Source Registry의 활성 타입은 0개다. PR #3120 정확한 HEAD `caa4b78f8b9e311751db0659f3e0f4d3bc418dfa`의 CI #42408891382, Governance #42408891242, Web Gates #42408891276은 모두 SUCCESS다.
- **적용 전 필수 보류(2026-11-08 갱신):** 운영 Supabase 조직은 무료 플랜이다. 과거 W138의 '2026-10-24 백업만 확인' 문구는 **최신 증거를 누락한 기록**으로 정정한다. 2026-11-07 [백업 #42309503582](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42309503582)의 성공/암호화 artifact와 [격리 복원 #42375717923](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42375717923), [후속 복원 #42405467038](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42405467038)의 성공 기록을 발견했다. 운영 최신 변경분 포함을 확인하려고 **기존** `production-postgres-backup.yml`의 읽기 전용 암호화 백업을 [#42415093056](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42415093056)으로 새로 요청했다. 현재 이 실행의 최종 성공/새 암호화 artifact 및 그 artifact의 격리 복원은 아직 미확정이다. **새 백업·복원과 정확한 운영 카탈로그/마이그레이션 시점 대조가 완료되기 전에는 승인된 운영 DDL/ACL도 실행하지 않는다.** 사용자 설치 승인은 유지한다.
- **이어 할 기존 순서:** 최신 운영 DB 복구 가능 백업 및 격리 복원을 확보·확인 → 사전 카탈로그/원본 digest 재검사 → 승인한 SQL 16→17 적용 → public 정확한 함수에만 `GRANT EXECUTE ... TO myeongha_api_executor` → 함수 소유권/권한·원본 타입 OFF 확인 및 비공개 G1 접근 검증. 기존 `stop-positive-use.sql`은 결합 RPC의 API 실행 권한도 회수하며 철회·ACK는 유지한다.
- **주의:** 현재 실제 `myeongha_api_executor`는 `seyeon_private` 스키마 USAGE가 이미 있다. 이전 격리 테스트에서 사용하는 '스키마 전체 USAGE 없음' 조건은 그대로 운영 실측값으로 대체하지 않는다. 기존 사용 권한을 임의로 회수하거나 private 결합 함수에 직접 실행권을 부여하지 않는다. 실제 DB 변경·기능 활성화와 혼동하지 않는다.

## 2026-11-07 S0 운영 설치 전 확인 (읽기 전용 현황, 승인 아님)

- 대상 명하 운영 PostgreSQL 카탈로그 대조에서 `seyeon_private.pin_model_recent_sources_v1`와 `seyeon_private.pin_positive_model_context_sources_v1`가 **미설치**, `public.chat_turn_attempts.seyeon_recent_source_pin_jsonb`가 **없음**을 확인했다. 코드에는 이미 `16-g1-model-recent-source-pin.sql` → `17-g1-positive-combined-model-source-pin.sql` 순서의 격리 설치 정의가 있으므로 새 스키마를 임의 생성하거나 API/공용 역할에 실행 권한을 넓히지 않는다.
- **2026-11-08 호출 경로 수정(소스 전용):** 기존 서버가 private 결합 함수를 일반 회원 DB 실행 계정에서 직접 호출하던 결함을 수정했다. `17-g1-positive-combined-model-source-pin.sql`에 `public.cmd_pin_seyeon_positive_model_context_sources_v1` 서버 전용 소유자 명령을 추가하고, 서버 어댑터는 이 명령만 호출한다. 내부 함수는 일반 API 계정에서 계속 실행 불가이며 **새 public 명령도 설치 직후 실행 권한을 부여하지 않는다**. 격리 설치 검사는 두 함수가 모두 기본 차단인지 확인한다. 이 호출 경로 보정은 운영 DB 설치·권한 변경·기억 사용/모델/과금/답변 공개 활성화가 아니다. 향후 정확한 계정에 필요한 함수 실행 권한을 부여하는 실제 운영 변경은 적용 범위와 안전 검증을 확인한 후 별도 처리한다.

- 현재 Source Registry의 `memory/conversation_recall/v1` 행은 존재하지만 `enabled=false, writable_enabled=false`다. G4/G5 전용 `myeongha_seyeon_g5_commerce_login`도 운영 DB에 없다. 실제 모델 전 Pin, 전용 Commerce Hyperdrive·TLS·자격증명, 고객 크레딧 예약·receipt 정산과 Worker 송출 검증은 미완료다.
- **실행 순서:** 기존 [G0 S0 기술 계약 후보](../../../docs/security/SEYEON_G0_REVOKE_REGRANT_REVEAL_POLICY_CANDIDATE_V1.md)의 사용자 기술 승인 → **별도의 명시적 운영 SQL/권한 적용 승인** → 대상 환경·백업·복구 확인 → 기존 16·17 설치 및 G1 실제 Pin 증명 → 로드맵 G4/G2/G3/G5/G6. G0 계약 승인만으로 DB 적용·Source Registry ON·유료 모델·배포를 승인했다고 처리하지 않는다.
- 운영 DB DDL/DML/Role/ACL/Secret, Provider 호출, Projector 등록·활성화, 공개·유료 트래픽 변경은 **수행하지 않았다**. `HOLD_FORWARD_STOPPED`, `positiveMemoryFirstReplyApproved=false`, `creditBilling.productionMounted=false` 및 최종 G0~G6 0/7 HOLD 유지. 이 README 정리는 운영 설치 스크립트를 실행하는 작업이 아니다.

## 2026-10-27 Owner Admin 응답 권한 복구 후보

`owner-chat-receipt-acl-restore-v1.sql`은 이 디렉터리에서 별도로 설치한 원본 S0 보호 함수 중 현재 API 실행 역할에 누락된 **정확한 3개 EXECUTE 권한**만 복구하는 운영용 SQL이다. 원본 source 타입을 활성화하거나 개인정보 접근 승인, 결제·유료 크레딧 사용, 일반 회원 채팅을 개방하지 않는다. 신규 PostgreSQL CI의 공용 `supabase/migrations`에는 포함하지 않는다.

실행 전 원본 함수 소유자·설정·권한·중단된 source registry를 확인한다. 운영 Supabase의 제한된 `postgres`는 기존 관리형 권한을 그대로 두고, 일시적으로 함수 소유자 역할을 부여받아 실행한 뒤 동일 트랜잭션에서 **자신이 추가한 역할 부여만 회수**한다. 별도 CI용 PostgreSQL 슈퍼유저는 운영 전용 역할 관계를 요구하지 않는다. 모든 사후 조건이 만족되지 않으면 트랜잭션이 실패한다.

2026-10-27 운영 DB 확인 기준: 관리자 등록 1건, 해당 관리자의 사용 승인된 세연 원본 `conversation_recall/v1` 기억 0건 및 활성 Grant 0건, 활성 Positive source 타입 0건. 따라서 권한 복구만으로 첫 AI 채팅 성공을 주장하지 않는다. 별도의 원본 기억/사용자 공유 동의·source admission·Governor·실제 브라우저 수신 검증이 필요하다. 운영 반영 전 PR 검사 및 독립적인 설치 이력과 복구 계획을 확인한다.

## S0 본인 기억 철회 상태 조회

`07-member-withdrawal-status.sql`은 RLS가 숨기는 미완료 철회 intent를 소유자 본인에게만 `active / withdrawal_pending / not_granted` 상태로 반환하는 읽기 전용 최소 권한 함수입니다. 원본 기억 본문·Grant ID·철회 시각은 반환하지 않습니다. `myeongha_api_executor`에게 이 조회 함수 EXECUTE만 부여하며 DML·모델·공개 권한을 추가하지 않습니다.

기존 S0 설치 묶음 뒤에 적용합니다. 병합만으로 운영 DB에 자동 설치되지 않으며, 실제 운영 DB 적용 전 대상 ACL·PG17 경합·운영 승인 증거가 필요합니다. 미설치 서버의 일반 GET 결과가 false여도 철회 완료를 추정하지 않고 `unknown`으로 처리합니다.

## G3 과거 세연 참가 대화 이력 — 읽기 전용 차단 보강

`08-historical-thread-presence.sql`은 현재 `left_at is null` 참가자 및 현 번들만 보는 `qry_chat_thread_runtime_binding_v1`만으로는 알 수 없는 과거 `seyeon` 참가 이력을, **인증된 Subject와 원본 Thread 소유권을 검증한 뒤**, 정확히 하나의 boolean으로 보고합니다. 본문·원본 기억·메시지/Grant/참가자 식별자는 반환하지 않습니다. 기존 `myeongha_api_executor`에게 해당 읽기 함수 EXECUTE만 허용하며 일반 `anon/authenticated/service_role` 호출은 불허합니다.

일반 Chat GET은 함수가 설치되면 **요청 페이지의 stream SQL을 실행하기 전에** 이 이력을 검증하여 과거 세연이 있으면 메시지·Relationship 전체를 `SEYEON_HISTORY_REVEAL_HOLD`로 차단합니다. 현재 참가자가 세연인 경우 기존 single-room metadata shell / mixed-thread 전체 HOLD를 유지합니다.

`main` 병합만으로 운영 DB 함수가 적용되지는 않습니다. 미설치 DB에서는 기존 페이지 단위 보호를 유지하나 전체 이력 안전성의 증거는 **아직 없으며 G3 HOLD**입니다. 함수 배포, 복구, 실제 두 세션 검증 및 이전 구성에 존재했던 별도 파생 기록 추적 없이 G3 전체 PASS라고 판정할 수 없습니다. 현재 설치 묶음은 disposable DB 전용이며 개인정보 공개 권한을 추가하지 않습니다.


## S0 원본 기억의 세연 전용 Grant — 격리 구현, 운영 비활성

`09-owned-original-memory-grant.sql`은 **기존에 승인·등록된** `conversation_recall/v1` 기억 1건에 대해 별도의 회원 선택 `character_only:seyeon`을 DB Owner가 검증해 새 Grant 1건을 원자적으로 발행하는 제한형 명령입니다. DB 원장에 있는 `accepted` 제안, 원본 Turn·Message, 내용 일치·미철회 상태, 현재 권한 및 쓰기 허용 레지스트리를 재확인합니다. 단순 개인 보관 승인으로 세연 공유가 암묵적으로 생성되지 않으며 기존 철회 대기 Grant도 다시 사용할 수 없습니다.

이 SQL은 현재 `plan.mjs`의 **격리 설치 목록에만** 추가됩니다. API 역할에는 `EXECUTE`를 부여하지 않고, 공개 HTTP route·모델 호출·운영 원본 사용을 활성화하지 않습니다. 배포 대상 운영 DB나 자동 migration으로 적용하지 않습니다. 실제 회원의 명시적 선택을 전달하는 정식 소비자·SRC-25 출처 및 DB 승인·복구 근거가 준비되기 전에는 운영에 설치하지 않습니다.
