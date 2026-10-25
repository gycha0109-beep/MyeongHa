# 세연 AI 보안 운영 적용 재개 — 2026-10-25

Watchtower-Track: security

## 목표와 실행 권한

사용자의 “운영 적용까지 밀어”, “작업 재개” 지시로 기존 S0의 운영 적용을 진행한다. 운영 실행 승인을 다시 요청하지 않는다. 적용 범위는 현재 Member/Turn의 원본 `conversation_recall/v1` Memory 1건과 최초 비스트리밍 답변이다. 새 기억 추가 UI, History/Replay/Reader, 다중 Memory/Life Fact는 범위 밖이다.

완료 조건은 대상 DB/권한/비용 설정, 실제 대상 transport에서 철회와 미송출 답변의 순서 보장, 제한 운영 smoke 및 복구 증거다. 기존 Node 실모델 E2E나 이번 복원 성공만으로 DEPLOYED로 판정하지 않는다.

## 현재 기준점

- 작업 브랜치: `codex/ai-security-production-rollout-20261024`.
- 재개 후 최신 main으로 fast-forward: `dc52b80cbbd9523d985117a02d87d38e74020dae`.
- 원래 서비스 체크아웃의 사용자 변경은 보존했다.
- 실제 운영 Worker: `myeongha`, URL `https://myeongha.gycha0109.workers.dev`.
- 조회한 활성 배포: `58476751-fc92-4de0-9d35-3b91e4347c50`, version `16e4b572-6190-482b-81fe-596bad3c0fe2` 100%, 생성 `2026-10-24T18:58:19.534578Z`. 배포 버전 메타데이터만으로 Git SHA 일치를 주장하지 않는다.
- 운영 Supabase: `cnsfpcdiyofqvhpcegfc`; 최신 migration version `20261024141330`.

운영 카탈로그를 읽기 전용으로 확인했다. `seyeon_private`, `seyeon_positive_source_type_registry_v1`, S0의 positive G1 Pin/G2 Commit/G3 v3 Reveal 함수는 모두 없다. 별도 비용 DB LOGIN `myeongha_seyeon_governed_login`도 없다. 이번 실행에서 DDL/DML/ACL/secret/traffic 변경은 하지 않았다.

## 실제 운영 백업과 격리 복원

- [백업 #40104377484](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40104377484): SUCCESS, source SHA `9d2aac82b708688006ece056a6126017be343173`, 완료 `2026-10-24T14:54:47Z`.
- [첫 복원 #40104704604](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40104704604): FAILURE. expected=`watchtower_track=ops`, observed=`security`, runtime=GitHub Actions/Supabase PG17 container, stage=`Require operations Watchtower attribution`, classification=dispatch input. SQL 복원 시작 전 실패이며 DB 복원 결함으로 분류하지 않는다.
- [수정한 복원 #40130586169](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40130586169): SUCCESS. `ops` 입력으로 동일 백업을 GitHub Actions loopback Supabase PostgreSQL 17.6에 복원했다. workflow 실행 SHA는 위 최신 main이다.
- 복원 시작/완료 `2026-10-24T20:37:49Z` / `20:37:53Z`. 4초는 격리 SQL 복원·검사 구간이며 전체 사고 RTO가 아니다.
- 백업 migration frontier `20261024141330`은 현재 운영 조회값과 일치한다. 기존 세연 함수 11개와 RLS/ACL 6개, 초기 version/name snapshot 6개 복원 증거가 통과했다. 이 결과는 아직 설치되지 않은 S0 SQL의 복원·설치 검증이 아니다.
- 공개 JSON 증거 artifact `12574772780`, 이름 `postgres-isolated-restore-drill-40130586169`. 로컬 사본은 `artifacts/seyeon-production-rollout-20261025/restore/`에 보존했다. 암호화 백업을 로컬에서 복호화하거나 운영 사용자 데이터를 출력하지 않았다.

**복구 한계:** 증거의 `provider_managed_data_full_restore=false`, `supabase_managed_migration_ledger_fully_restored=false`, `privacy_reconciliation=not_exercised_by_this_workflow`, `dr_ready=false`를 유지한다. Hosted Auth/Storage 전체 복구 및 실제 운영 개인정보 원장 replay를 검증한 실행이 아니다. 기존 격리 synthetic privacy reconciliation 성공과 구분한다.

재현:

```powershell
gh workflow run postgres-isolated-restore-drill.yml --ref main -f backup_run_id=40104377484 -f incident_reference_utc=2026-10-24T20:36:57Z -f watchtower_track=ops
```

## 실제 공개 Worker의 제한 smoke

실제 HTTPS 응답을 읽었고 credential이나 실제 Member 데이터를 사용하지 않았다. 모든 응답은 JSON, `Cache-Control: no-store`, HTML fallback 없음이었다.

| 요청 | 관찰 |
| --- | --- |
| `GET /api/health` | 200, `status=ok` |
| `POST /api/chat/00000000-0000-4000-8000-000000000001/turns`, `{}` | 401 `AUTH_REQUIRED` |
| `GET /api/chat/00000000-0000-4000-8000-000000000001/messages` | 503 `SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE` |
| `POST /api%2Fchat/00000000-0000-4000-8000-000000000001/turns` | 같은 503 |
| `POST /api/%2563hat/00000000-0000-4000-8000-000000000001/turns` | 같은 503 |
| `POST /api/me?__route=chat` | 503 `API_NOT_ACTIVATED_ON_PREVIEW` |

이는 비인증 공개 경계 확인이다. Hosted Member 로그인, 기억 생성·Grant, positive 답변, 실 운영 모델/비용 정산은 검증하지 않았다.

## 운영 적용을 막는 구체적 결손

현재 main의 `cloudflare/myeongha-worker.mjs`는 `preview-worker.mjs`의 Fetch fence를 재사용한다. 반면 S0 positive 구현의 `seyeon-first-positive-memory-node-http-ingress-v1.ts`는 동일 `IncomingMessage`/`ServerResponse`와 DB 잠금 송출을 요구하며 `vercelFetchSupported=false`, `proxyHandoffProven=false`다. 현재 배포 Fetch adapter에는 이 consumer가 없다. 직접 HTTPS composition도 loopback-only/zero-source이고 public positive host가 아니다.

[D-04 계약](../security/SEYEON_G0_D04_HTTP_TRANSPORT_REVOKE_CONTRACT_PROPOSAL_20261018.md)은 Node `finish`, Fetch `Response` 반환, stream 완료 또는 client ACK 하나를 실제 Cloudflare 송출 증거로 대체하지 못하도록 정한다. 최신 [종료 원장 #1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866)은 OPEN이며 G0 기술 판정은 아직 미완료다. [SRC-25](../source-authority-gaps/SRC-25_PERSONAL_RECORD_TYPE_SCHEMA_REGISTRY.md)도 운영 타입 등록을 승인하지 않았다. 사용자 운영 실행 승인과 별개로 실제 기술 검토자의 판정을 대신 작성하지 않는다.

따라서 현재 상태는 **운영 활성화 HOLD**다. S0 SQL만 운영에 설치하거나 양수 registry/EXECUTE를 먼저 열어도 실제 송출 경로 결손을 해결하지 못한다. 미사용 운영 객체·자격증명을 선행 생성하지 않았다. 다음 필수 작업은 **기존 D-04의 Security/API/DB 기술 판정으로 실제 Cloudflare 송출·철회 경계를 확정하는 것**이다. 그 경계의 consumer 구현·경합 증거 이후에만 기존 S0 설치/별도 비용 LOGIN·예산/제한 운영 smoke를 순서대로 진행한다. 제품 정책을 더 약하게 바꾸거나 현재 차단을 제거하는 승인으로 해석하지 않는다.

과거 `SEYEON_AI_SECURITY_S0_SOURCE_PLAN_20261024.json`의 `productionAuthorization=NOT_GRANTED`는 당시 source plan의 기록이며 현재 사용자의 운영 실행 권한 부재를 뜻하지 않는다. 파일 digest나 과거 기록을 G0 기술 승인으로 바꾸지도 않는다.

Architecture Check: 문서와 실행 증거만 추가했다. runtime/API/DB/권한/정책 변경 없음. Ghost-code risk는 현재 Node positive 구현에 운영 Fetch consumer가 없는 것으로 명시하며, 배포 완료로 세지 않는다.

## 후속 지시와 실행 전환

위 항목은 최초 재개 시점의 기록이다. 이후 사용자가 “자체적으로 설계 해서 진행하도록” 지시했으므로 기술 설계 대기를 [HTTP 수신 증명 장벽 구현](../security/SEYEON_S0_HTTP_RECEIPT_BARRIER_V1_20261025.md)으로 전환했다. 실제 원본 검증 authority를 공유하는 Fetch consumer와 durable issuance/receipt·withdrawal intent·DB invalidation guard를 작성했다. 직접 회귀 38 PASS, 관련 회귀 734 PASS/72 SKIP, root typecheck·웹/Worker dry-run build를 실행했다. 복원본 S0 리허설과 운영 설치·활성화 증거는 실행 후 추가한다.

이후 조회한 새 운영 백업 #40131259663은 SUCCESS, source SHA `dc52b80c`, 생성 `2026-10-24T20:46:03Z`다. 최신 main에는 #2573의 native Member Auth와 #2574의 Cloudflare 관측이 추가되었으므로 해당 변경을 보존해서 합친다. 만료된 로컬 관리 API 토큰이나 다른 조직에 로그인된 브라우저를 승인/운영 권한으로 사용하지 않았다. 기존 인증된 Supabase CLI와 명시적 CA를 확인한 직접 PostgreSQL 연결은 해당 프로젝트에 접근 가능하다.

## 통합 검증 추가

최신 main `eea60444`의 단일 Worker Auth/DB/Saju 라우팅·관측·버전 표식을 보존했다. 새 S0의 정확한 POST 경로만 기존 HOLD 앞에서 별도 admission을 받고, alias/query/기존 History·Replay는 HOLD를 유지한다. 기존 HMAC IP 기반 Cloudflare limiter를 재사용하여 receipt 추측 요청도 DB 연결 전에 제한한다. emergency hold는 새 모델 사용을 막고 이미 발행된 receipt/철회는 보존한다. 결속 증명·atomic installer DB 11/11, 통합 후 직접 회귀 51/51, 활성 gate를 mock한 라우팅/요청 제한/긴급 중단 3/3, root typecheck·build와 Worker dry-run PASS다. 실제 운영 gate는 아직 false다.

## 복원본의 설치 관리자 권한 차이

2026-10-25 복원 #40195629381은 실제 S0 installer 단계에서 `42501 permission denied to grant role myeongha_seyeon_chat_runtime_owner`로 실패했다. SQL bundle은 atomic rollback됐고 운영은 변경하지 않았다. 기대값은 운영 postgres의 역할 ADMIN 권한이며 관측값은 portable restore의 해당 권한 부재다.

운영 `pg_auth_members`를 다시 읽었다. postgres는 NOSUPERUSER이며, `supabase_admin`이 부여한 runtime-owner edge는 ADMIN=true, INHERIT=false, SET=false다. `run-production-postgres-strict-dump.sh`는 provider-managed postgres를 수신자로 하는 GRANT를 의도적으로 제외한다. 따라서 이 edge 부재는 S0 source SQL 결함이 아닌 portable backup 범위 차이다.

범위를 선택적 S0 리허설의 설치 관리자 사전 조건으로만 확장한다. 실제 조회한 metadata snapshot을 저장하고 고정 loopback Actions 서비스의 runtime-owner edge 하나만 현재 운영과 동일하게 구성한다. postgres 슈퍼유저화, application API 권한 확대, 원본 G1/G2/G3 약화 또는 운영 DDL은 하지 않는다. evidence는 이 edge가 encrypted backup에서 복구된 것으로 표시하지 않으며 full DR=false를 유지한다. 원본 SQL digest는 바뀌지 않는다. 재현은 기존 restore workflow의 `seyeon_security_s0_rehearsal=true`다.
