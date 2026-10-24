# AI 보안 구현 배치 — 2026-10-24

Watchtower-Track: security

기준: `main@1fce280a` → `codex/ai-security-implementation-20261024`.
실행 순서의 정본은 [실행 로드맵 §62](SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V2_20261016.md#62-2026-10-24-구현-우선-실행-큐와-현재-종료-경계)다.

## 구현 결과

- 실제 Preview Worker가 encoded Chat/legacy rewrite marker를 API·정적 자산보다 먼저 기존 deny-only 분류기로 처리한다. 과거 단독 보안 함수와 현재 Worker 사이의 누락된 호출을 연결했다. 공개 Chat·개인정보 조회·Provider 호출을 허용하는 경로는 추가하지 않았다.
- 원본 Memory 1건의 첫 응답용 Node HTTP ingress를 추가했다. Member/정확한 body/동일 socket 검증 후 기존 G1→모델→G2 runtime과 현재 Grant의 G3 잠금 조회·송출을 연결한다. 일반 응답 본문은 DB 원본에서만 가져온다. Node handler는 미마운트다.
- 기존 zero ingress와 새 positive ingress는 동일 입력·인증·중단·고정 오류 경로를 사용한다. 기존 zero export와 동작은 유지했다. client가 어느 경로를 실행할지 선택하는 mode/flag를 추가하지 않았다.
- G2 준비 검사의 잘못된 7-UUID 시그니처를 실제 8-UUID+JSONB+3-text와 일치시켰다. 현재 실행 Role의 EXECUTE도 확인한다. 실제 권한 부여/정책 변경은 없다.
- 로드맵은 구현 90%/검증 10%의 작업 배분으로 갱신했다. 보안 완료율 또는 G0~G6의 90% PASS를 의미하지 않는다.

## 현재 검증 증거

환경: Windows/Node `v24.14.0`, Vitest `4.1.11`, 저장소 lockfile로 `npm ci --ignore-scripts --no-audit --no-fund` 수행. 신규 의존성/lockfile 변경 없음.

| 실행 | 결과 | 입증 범위 |
| --- | --- | --- |
| `npx vitest run test/seyeon-first-positive-memory-direct-node-http-ingress-v1.test.ts test/seyeon-first-positive-memory-node-delivery-v1.test.ts test/seyeon-first-zero-direct-node-http-ingress-v1.test.ts test/seyeon-first-zero-node-turn-delivery-v1.test.ts test/seyeon-node-original-grant-send-boundary-v1.test.ts` | **64/64 PASS** | 실제 loopback socket + 합성 DB/runtime. 준비 확인→runtime→원본 조회→finish→COMMIT 순서, revoked 원문 비공개, 인증/요청 거부 및 실패 비노출 |
| `npx vitest run test/cloudflare-preview-cd.test.mjs test/seyeon-cloudflare-ops-router-handoff-offline-v1.test.ts test/seyeon-cloudflare-protected-chat-route-guard-v1.test.ts` | **101/101 PASS** | Worker fetch 함수 직접 실행, 합성 ASSETS/Auth; alias의 503 및 Auth/Provider/ASSETS 0회, 일반 정적 자산 비간섭 |
| `npm run typecheck` | **PASS** | root 및 api-client/web/mobile workspace 타입 검사 |
| `npm run build` | **PASS** | 저장소 TypeScript build |

Cloudflare 변경 검토 시 [공식 best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), [Fetch handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/) 및 임시 폴더에 받은 `@cloudflare/workers-types@5.20261023.1`을 확인했다. 저장소에 해당 패키지를 설치/추가하지 않았다.

최종 코드 한 번 재검토: 새 Critical/High·권한 우회·본문 노출 발견 없음. 실제 DB/외부 transport의 권한 증명으로 해석하지 않는다. GitHub exact-head CI/Full Integration과 병합·배포 상태는 이 로컬 증거와 별도다.

## Architecture Check

- Docs updated: yes — 실행 로드맵 §62와 본 기록.
- Ghost-code risk: findings — positive Node handler는 G0/SRC-25/DB/transport 승인 전 미마운트이며 배포 기능으로 계산하지 않는다. Worker alias 분류기는 실제 entrypoint caller에 연결되어 있다.
- 새 도메인 category/클라이언트 mode/fallback/별도 normalization 없음. 기존 zero/positive 경로는 공통 Node ingress를 공유한다. 기존 Governor·Pin·Commit·locked send를 재사용하고 새 inference/workflow/DDL/RLS/EXECUTE를 만들지 않았다.

## 잔여 게이트와 상태

**로컬 구현 경계 VERIFIED / 운영 종단 IMPLEMENTED_UNVERIFIED / 트랙 종료 HOLD.**

1. G0/SRC-25: 실제 type/schema/projector와 original+derived 출처 폐쇄 및 취소/송출 계약의 기술 판정 필요.
2. 기존 SQL Draft #2422의 G1/G2/G3 및 private accept·원본 Message/Outbox/Registry 후보는 미적용. 운영 Owner/EXECUTE/DDL 변경 승인과 PG 2세션 race·Role·DR을 이 작업이 대체하지 않는다.
3. G0-D04: Node finish는 외부 Vercel/Cloudflare/브라우저 S/ACK 증거가 아니다. 직접 Node handler를 Fetch/proxy에 연결하지 않았다. History/Replay/Worker 공개는 기존 HOLD.
4. G4~G6: 실제 예산·운영 DB/DR·승인된 배포 transport·최종 제한 smoke가 필요하다. 유료 호출/공개/운영 데이터 변경/production 배포는 실행하지 않았다.

사용자 AGENTS.md의 승인 경계에 따라 main 병합·DB schema/migration/ACL·인증/개인정보 정책·production 배포/traffic은 별도 명시 승인 대상이다. 기존 다른 작업 변경은 이 배치에 포함하지 않는다.


## 후속 브랜치 구현 (사용자 병합 지시 반영)

사용자가 브랜치에서 로드맵 구현을 묶어서 완료한 뒤 병합하도록 지시했다. 이 PR의 main 병합 재승인은 요청하지 않는다. 앞 절의 main 승인 대기 표기는 이전 시점 기록이며 현재 실행 기준은 [로드맵 §63](SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V2_20261016.md#63-2026-10-24-브랜치-구현을-묶어서-완료-후-병합)이다.

- `production-seyeon-first-memory-node-runtime-v1.ts`: 기존 verified Member/ordinary pool, source-owner 승인, ENFORCE/native role Governor/분리 cost DB, 실제 Chat 실행과 첫 원본 잠금 송출의 Production composition. DB/Source/비용 승인이 없으면 provider credential resolution 이전 차단.
- 기존 private accept·revoke factory가 server-owned 승인 callback을 실제 HTTP handler까지 전달. 현재 배포 caller/default는 DENY를 유지. `production-seyeon-chat-runtime-v1.ts`는 명시 승인된 초기 단일 codec을 사용하는 경로에서도 ENFORCE를 요구한다.
- 기존 SQL Draft의 실행본을 `scripts/operations/seyeon-security-s0`에 정리. 넓은 source UPDATE/RLS 권한을 추가하지 않고 private lock-only owner 함수로 실제 RLS row lock 결함 해결. G2 TS/SQL은 원본 UserMessage를 포함하는 8 UUID 계약. SQL/Node codec의 UTF-16 길이 계약 일치.
- `plan.mjs`의 단일 설치 목록으로 LF/UTF-8 digest와 forward-only stop 산출. [고정 source plan](SEYEON_AI_SECURITY_S0_SOURCE_PLAN_20261024.json)의 해시는 파일 결속이며 승인 서명이 아니다. SQL은 자동 migration 디렉터리에 없고 운영 DB에 미적용.
- 기존 PG17 CI suite의 `seyeon-security-s0-real-path-pg17`에 실제 production-table/기존 TS port/Node socket 경로 연결. 신규 Workflow 없음. source 변경이 PG17을 빠뜨리지 않도록 기존 두 router에 직접 dependency 추가.

### 실제 실패·수정 및 검증

- 로컬 PostgreSQL은 18.6만 설치되어 있어 별도 loopback transient instance를 생성했다. PG17 판정은 이 결과로 대체하지 않고 기존 CI의 **실제 17** 사례를 필수로 둔다. Docker daemon 없음은 코드 실패로 분류하지 않는다.
- 기존 PG17 harness와 같은 Birth 0860 격리 제외를 사용했다. 최초 전체 적용은 기존 managed-creator membership 보호에서 중단되어 이 기존 전용 제외 경로로 전환했다. 운영 migration이나 골든을 수정하지 않았다.
- Source owner의 SELECT-only 역할에서 `FOR SHARE` 권한 오류/UPDATE RLS로 인한 0행 거부를 실제로 재현. source table에 UPDATE 정책을 주지 않고 private lock-only RPC로 수정 후 actual Pin/Commit/Reveal 통과.
- 초기 합성 fixture의 필수 timestamp/dedupe/unique content hash 누락을 보완. 런타임 권한 검사나 수락 기준을 약화하지 않음.
- 기존 v2가 이미 원본 UserMessage 불일치를 차단함을 실 SQL로 확인해, 중복 deferred Outbox barrier를 추가하지 않았다. 기존 `seyeon_post_turn_user_message_mismatch`와 전체 rollback을 재사용한다.
- 최종 격리 PG18 preliminary **6/6 PASS**: 실제 G1 Pin → v2 Commit+Outbox → 실제 loopback HTTP 첫 송출 1회/재사용 거부 → private Memory 0-Grant 저장 및 UTF-16 음성; revoked original Grant+regrant 차단; 독립 2세션 lock-wait; abort rollback; 기존 legacy v2 원본 Snapshot 거부; stop 후 데이터/consent withdrawal 보존.
- server composition 기본 차단 직접 테스트 **2/2 PASS**, 관련 기존 직접 회귀 및 타입 검사/빌드 PASS. 최종 exact-head PG17/전체 CI/Integration·병합 증거는 PR에 기록한다. 이전 SHA의 CI 결과를 새 코드에 재사용하지 않는다.

**상태 구분:** 브랜치의 S0 구현을 검증 후 병합한다. 운영 G0/SRC-25·DB/ACL·동일 백업 DR·target transport V/R/S/ACK·G6 및 공개/유료 승인은 미실행이며, G0~G6 전체 운영 트랙 종료로 표시하지 않는다. History/Replay/Worker/Reader 및 다중 source는 미승인 차단을 유지한다.


### 새 HEAD CI의 PG17 의존성 준비 수정

`aa172196`의 [CI #40022132645](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40022132645)에서 유일한 원인 실패는 `DB dependency · postgres17`의 신규 S0 사례가 SQL 테스트 시작 전에 `ERR_MODULE_NOT_FOUND: pg`로 종료된 것이다. expected=lockfile의 pg/Vitest로 실제 PG17 S0 실행, observed=기존 SQL-only DB job에 node_modules 없음, runtime=Ubuntu/Node24/PostgreSQL17.6, stage=case install runner import, classification=CI dependency setup. 재현은 해당 job의 `node scripts/ci/run-db-track.mjs postgres17`.

기존 `ci-db-track.yml`의 PG17에만 `npm ci --ignore-scripts --no-audit --no-fund` 단계를 넣고 단일 기존 case runner를 유지한다. 새 Workflow/패키지/DB 검사 완화 없음. 동일 HEAD의 Governance/Web/전체 코드 회귀·authority core와 나머지 DB suite는 SUCCESS였으나 이전 HEAD CI 실패를 PASS로 기록하지 않는다. 변경 후 새 HEAD에서 PG17 및 필수 CI/Integration을 확인한다.
