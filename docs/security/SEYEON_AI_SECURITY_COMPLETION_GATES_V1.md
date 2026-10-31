> **2026-10-16 실행 우선순위:** [개정 로드맵 v2](../operations/SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V2_20261016.md). 이 문서는 G0~G6 판정·권한 계약의 정본이며, 로드맵은 S1 개인정보 0건 후보 방어부터 G1/G2/G3 실제 서비스 연결을 진행한다. R2-G 역사 실행자 조사는 위험 수용으로 종료했지만, 운영 배포·DR·paid/public 승인은 별개다.

# 명하 세연 AI 보안 트랙 — 완료 판정·증거 계약 v1

Watchtower-Track: security
상위 종료 원장: [#1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866)
P0 Memory Grant/Commit/Reveal: [#1843](https://github.com/gycha0109-beep/MyeongHa/issues/1843)
Reader 구매 기반 권한: [#1827](https://github.com/gycha0109-beep/MyeongHa/issues/1827)
AI 경량 보안 정책 평가: [#1816](https://github.com/gycha0109-beep/MyeongHa/issues/1816)
플랫폼 전반 감사: [#1529](https://github.com/gycha0109-beep/MyeongHa/issues/1529)

## 판정 정의

- **A / 구현 완료**: 실제 Production Code + PostgreSQL owner 함수 + HTTP/Replay 경로까지 보호가 연결되어, 더는 Shadow/Candidate-only가 아니다. G0/G1/G2/G3/G4 구현 필수.
- **B / 보안 검증 완료**: 실제 PostgreSQL **독립 2세션**, 정확한 Production RPC, 무효 Grant/경쟁/격리/중단/재시도/우회 비용을 테스트하고 G5 통과.
- **C / 운영 승인 완료**: 별도 운영 승인, 통제된 스모크, 예산·보안 관측/롤백/증거 정리 후 G6 통과.
- **트랙 종료**: 승인된 활성화 Scope에 A+B+C를 모두 충족한 뒤 종료. 구현 PR 병합이나 단위·모의·정적·Shadow 테스트만으로 종료 금지.

## 게이트 원장 (2026-10-10 시작 상태)

| Gate | 구현/검증 입구 | PASS 증거 | 책임 | 현재 |
| --- | --- | --- | --- | --- |
| G0 권한·공개 계약 | 정확한 출처 범위, 취소 효력, 모델 입력/과거 Context, Streaming/Revoke linearization 선택 | DB/Character/Security 간 버전 있는 계약·Owner 승인·테스트 시나리오 | Security + DB + Character | **PROPOSED**, 미승인 |
| G1 모델 전 영속 Pin | 실제 전달되는 Memory/Life Fact의 `recordId,grantId,kind,type,schema,content digest` 및 canonical Subject/Thread/Turn/Attempt | 모델 이전 DB 불변 Pin, 누락/0건/미지원 별도, 실패 시 Provider 0회; 원문 비노출 | Character + DB | **HOLD** |
| G2 DB Atomic Commit | 운영 `cmd_commit_seyeon_chat_turn_runtime_v2`와 같은 PG 트랜잭션에서 원본 Pin+현재 Record/Grant lock·상태·digest 검증 | 실제 함수, forward-only migration, executor ACL, Commit-v-Revoke 독립 2세션 테스트 | DB Authority | **HOLD** |
| G3 Reveal/Replay | Controlled HTTP 응답 및 `committed_replay`, 과거 대화/후속 worker의 current authorization | Revoke 이후 Unauthorized 텍스트 0, replay 우회 0, 사고 시 HOLD, streaming 안전계약 | API + Security | **HOLD** |
| G4 AI Governor | 서버 승인 비용/모델/역할 계약, 레거시 DB EXECUTE·Provider 우회 제거 | 독립 DB 세션 예산 경합, 중복 정산·크래시·direct RPC 차단·운영 정책 | Character + DB + Security | **IN PROGRESS / HOLD** |
| G5 통합 검증 | 실제 DB·HTTP·AI 제어 경로, 정확한 HEAD CI·Governance·전체 Integration | 권한/유출/무단 유료 호출 핵심 0, PostgreSQL 2세션 race 모두 PASS | Security + QA | **HOLD** |
| G6 운영 승인 | 제한적 synthetic + 내부 smoke, privacy-safe 관측·경보·복구·권한/배포 승인 | 승인자·범위·증거 URL·본번 main sha·rollback 기준·잔여 위험 명시 | Integration Owner | **HOLD** |

> **S2 G0 정책 초안**: [동의 취소·재승인·과거 대화 출처·Reveal 선형화 후보 v1](SEYEON_G0_REVOKE_REGRANT_REVEAL_POLICY_CANDIDATE_V1.md). Shadow-only 검증은 결함 재현 및 설계 증거이며 G0 승인/G2 원자 Commit/G3 HTTP 공개 PASS가 아니다.

## G0 결정이 필요한 구체적 권한 계약

### 1. 정확히 모델에 들어가는 데이터

현재 `qry_seyeon_production_personal_record_context_v1`는 active exact Grant를 통해 **원본 DB 기록**을 돌려주고, `personalMemories`는 인가된 `recordType/schemaVersion`의 Projector로 **투영**합니다. `personalRecordAdmissions`에 `ADMITTED`가 있다는 사실은 모델 사용 증거가 아닙니다. `maxPersonalRecords` 및 최종 `buildSeyeonRuntimeContextV2`의 relevance 기반 재정렬·상한 때문에 Projector를 통과해도 모델에서는 제외될 수 있습니다.

- 영속 Pin 대상 = **모델 프롬프트에 실제 포함된 투영 개인기록 집합**. 단순 SELECT 결과 전체 또는 Projector의 ADMITTED 전체가 아님.
- 원천 출처 = DB 조회에서 얻은 exact `recordId/grantId/subjectId/characterId` + `recordType/schemaVersion` + raw JSONB canonical digest.
- 모델 투영 = `memoryId/sourceRef/summary/claimKind/relevance/salience`의 정형 digest. 원본·투영 digest는 용도가 다름.
- 유저 텍스트, 모델 출력, `sourceRef` 문자열을 권한의 원천으로 사용 금지. HMAC/DB 서명/불변 컬럼 등 위조 방지는 DB Owner가 승인해야 하며 **무키 SHA만으로 신뢰성을 주장 금지**.
- `UNSUPPORTED_SCHEMA`는 미사용 대상이며 0건 증명에 포함시켜서는 안 됨. 다만 누락/미확인 결과를 0건으로 변환하면 안 됨.
- **모델 호출 전에** PIN DB Commit이 완료되어야 함. 현재 #1858의 0건 Proof는 호출 전 생성하고 Output Guard에서 영속화하므로 G1 미완료.

### 2. 권한 취소·경쟁

- `readPersonalRecords`의 active 권한은 *조회 시점*의 사실이지 Commit/Reveal에 영구적인 허가가 아님.
- 기존 Grant ID를 취소하고 동일 Record에 신규 Grant를 발행해도 옛 Attempt는 구원되지 않음.
- 동일 DB 트랜잭션 내 현재 Grant 및 Record의 lock, 상태·정확한 digest·Subject/Character/Thread 검증을 완료한 뒤 Commit한다. 별도 트랜잭션 SELECT-before-COMMIT 금지.
- Reveal/Replayed text는 당시 Commit 성공과 독립하여 현재 권한을 재검증한다.
- Streaming은 이미 전송한 bytes를 회수 불가. 개인기록 사용 응답 Streaming은 초기 승인에서 **OFF 권고(미확정)**. 최종 authorization/전송 시점과 revoke 경쟁 선형화 정의는 Owner 서명 전까지 HOLD.

### 3. 파생 Context/과거 메시지

개인 기록 원문이 현재 조회되지 않아도 과거 Assistant 답변·Relationship Event·Reader Knowledge를 통해 민감한 유래가 다시 모델에 들어갈 수 있다. 현재 `retrievedMemories.kind`의 직접 Personal-only 차단은 이를 포괄적으로 보증하지 않는다. 데이터 유형별 파생 출처 전파/권한 상속/리다이렉션 규칙을 승인하고 소급 정보공개 리스크를 검증한다.

## 작업 분리 / PR 산출물

1. **G0 기록 및 G1-A Source Candidate**: Context Projector에서 DB 원천 Record/Grant/Projection digest sidecar만 생성. 이는 `maxRetrievedMemories`의 최종 프롬프트 사용 집합이 아니며 Pin/권한 승인 아님. Positive personal Projector는 계속 미활성. Security PR.
2. **G1-B Authority Owner**: 최종 모델 입력 집합 식별 및 서버 생성 exact Proof, 필수 DB Pin before Provider. DB-owner 최소권한·불변 DB 경로. Security/Character/DB 공동 승인.
3. **G2 Owner PR**: 운영 `cmd_commit_seyeon_chat_turn_runtime_v2`와 직접 연결, forward-only SQL, RLS/Role+Revocation Race. 후보 함수만 구현한 PR은 G2 FAIL.
4. **G3 API PR**: reveal/replay와 worker 출력 전 current rights 및 streaming 정책. 장기 저장된 과거 대화도 범위 포함.
5. **G4 Governor 트랙**: D3B2B, D4, D5 완료. 별도 비용 예산 승격과 보안 프롬프트 V2 4-cell 실험(#1816)은 **운영 V1 유지 시 필수 완료 의존성 아님**.
6. **G5/G6**: 정확한 HEAD PR CI → full Integration → squash → post-main CI, 실제 Postgres+HTTP 보안 시험 → 통제 운영 승인.

## 필수 테스트 매트릭스

- 정상 0건·Memory 1건·Life Fact 1건·혼합 여러 건·상한 초과·정렬 변경.
- Pin 누락/유실/조작/Attempt 교차/Subject·Reader·Character·Thread mismatch·Schema/Content 변경.
- 기존 Grant revoke 직후/모델 도중/Commit 전후/Reveal 직전/Replay 직전.
- 기존 Grant 취소 후 새로운 Grant로 재승인, Record 자체 revoke, supersede, 다중 Grant 중복/모호.
- 실제 PostgreSQL **두 개 독립 Session** Commit↔Revoke, Reveal↔Revoke, lock timeout, DB unavailable, crash/retry, idempotency.
- 과거 사용자/캐릭터 메시지·Relationship Event·Reader/Saju 지식 통한 우회, 프롬프트/툴 인젝션.
- Governor direct Provider/legacy RPC, 재시도, 동시 예산 경쟁 및 중복 정산.
- 모든 핵심 비인가 공개/무단 상태변경/예산 우회 = **0회**. Mock-only/Static-only/Shadow-only = 증거 보조일 뿐 최종 PASS 아님.

## G1-B1 — 최종 모델 입력 선택 집합 결속 (부분 구현)

- `packages/domain/src/seyeon-runtime-context-v2.ts`의 `selectSeyeonRuntimeRetrievedMemoriesV2`를 Context 최종 조립과 보안 출처 검증이 공용으로 사용하도록 분리했습니다. 동일한 normalize/relevance/salience/memoryId 정렬/상한을 사용합니다.
- `apps/api/src/seyeon-exact-model-personal-source-selection-v1.ts`는 G1-A 서버 소유 후보와 **최종 선택된 Memory/Life Fact**의 정확한 projection digest 및 exact Grant/Record를 대응시킵니다. 누락·위조·중복·사용 시점 불일치는 모두 HOLD. 선택되지 않은 후보는 정확한 모델 입력 증명의 Record 목록에서 제외됩니다.
- 실제 `runSeyeonProductionChatExecutionV1`의 Provider 실행 이전에 검증을 호출합니다. #1852 positive 개인기록 입력 HOLD는 유지하며 `persistedBeforeModel:false`, `permitsAtomicCommit:false`, `permitsHttpReveal:false`입니다.
- **G1-B1은 G1 완료가 아닙니다.** 실제 Attempt의 DB 선행 영속 Pin은 미구현이고, 이전 채팅·Disclosure 등 간접 개인기록은 아직 모델 입력 출처가 귀속되지 않았습니다. Source candidate는 서버 내부 앱 스냅샷으로만 존재하며, digest는 무키 SHA-256으로 권한 서명이 아닙니다. DB Owner가 허용하지 않은 긍정 Projector/Route는 계속 비활성화합니다.

## G1-B2 — 다음 필요 작업

1. 서버가 모델에 실제 투입한 최종 Context의 **전체 출처**와 모델 Preflight 전 시점 결속 규칙을 Character/DB/Security가 공동 승인합니다. 현재 정확한 선택은 retrievedMemories에 한정되며 Preflight 공개 검색과 과거 텍스트를 별도 검토해야 합니다.
2. forward-only DB Authority migration을 통해 `subjectId/threadId/turnId/attemptId`에 정확한 `recordId/grantId/type/schema/rawDigest/projectionDigest` + 빈 집합의 별도 상태를 모델 호출 전에 불변 저장합니다. 서버 호출 실패·DB 오류 시 Provider 호출 0회.
3. 저장된 원본 Pin을 DB Owner 보호 하에 Commit/Reveal 함수가 읽도록 연결하고 실제 PostgreSQL 경합으로 검증합니다. 클라이언트/모델 전달 증명을 DB 권한으로 간주 금지.

## G1-B2 / 0건 경로 선행 DB Pin (구현, 양수 HOLD)

- `supabase/migrations/1640_seyeon_zero_personal_source_pre_model_pin_v1.sql`은 `chat_turn_attempts`에 `seyeon_personal_source_pin_jsonb` 및 저장시각을 추가하며, 사후 불변 Trigger 및 세연 검증 결과의 원본 Pin 일치 Commit Trigger를 둡니다.
- `cmd_mark_seyeon_chat_context_ready_pinned_v1(subject,turn,attempt,sourceProof)`가 **서버 생성 0건 Proof**와 **최종 선택된 Memory/Life Fact가 0건임을 보여주는 Selection**을 엄격히 검증한 뒤, 하나의 DB 트랜잭션에서 Pin 영속 저장과 `context_ready`로 전이합니다.
- 이전 3인자 `cmd_mark_seyeon_chat_context_ready_runtime_v1`에서 `myeongha_api_executor`의 EXECUTE를 회수했습니다. 신규 함수는 NOLOGIN runtime owner가 실행하고 공개 DB 역할은 호출할 수 없습니다. 새 함수의 API 직접 DML 권한 부여는 없습니다.
- 실행 경로에서 positive 개인기록 사전 HOLD + 정확한 final 모델 선택 검증 후 **선행 Pin 저장 성공**이 확인돼야 `resolveTurnGovernance` 및 유료 Provider 경로로 진입할 수 있습니다. 실패 시 모델/AI 호출 이전 종료.
- 출력 검증의 `personalRecordProvenance`와 DB Pin 원본이 Commit 시점에 같아야 하며, 이미 존재하는 과거 Attempt/타 Product는 소급 Pin하지 않습니다.
- **G1 완료 판정 금지:** 이 Pin은 **0건 제한**입니다. DB가 무키 해시를 서명/승인으로 인정하지 않으며 실제 모델의 과거 메시지·Relationship·공개 검색·Preflight에서 파생 개인정보까지 포함하는 전체 출처 증명이 아닙니다. 별도 exact Grant/record 양수 Pin, same-transaction Grant Commit, HTTP Reveal/replay는 G1 후속 및 G2/G3에서 HOLD입니다.
- 검증은 실제 PostgreSQL `test/db/seyeon_zero_personal_source_pre_model_pin_v1.sql`을 사용해 scope/ACL/Replay/immutability를 확인합니다. 클라우드 과금 모델 실행 없음.

## 운영 불변

- `SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1 = []`, `routeMounted:false`, 기본 `WRITE_DARK`.
- 실모델 유료 호출, 비용 예산 시딩, V2 보안 프롬프트 기본값 변경, 공개 Route 활성화는 별도 승인 전 금지.
- 별도 신규 CI Workflow 금지. Watchtower-Track 정확히 표기. 기존 CI/Integration 재사용.
- #1827 Reader 구매 권한과 #1529 플랫폼 OWASP 재감사는 Scope 분리하되 Reader/Saju 공개를 연결하기 전 관련 게이트 필수.

## 종료 기록 포맷

각 Gate: `{gate, scope, owner, PR, exact_head_sha, merge_sha, CI_run_url, postgres_run_url, negative_tests, permissions_audit, open_holds, approval, final_state}`.
증거가 없으면 `HOLD`, 운영에서 검증할 수 없으면 별도 리스크 승인 없이는 PASS 금지.

## 2026-10-30 — UC-06/UC-07 Planner 주도 Memory 제안 복구 (운영 비활성)

**설계 정본**: `Usecase_re_reviewed_v2` UC-06/UC-07 및 `MyeongHa_Character_System_Architecture_C1`의 Planner / Gate / Renderer 분리. 캐릭터가 필요한 현재 Life Fact를 질문하고, 답변에서 기억할 사실을 인식하면 Dialogue Planner/Character Runtime이 **pending Memory/Life Fact Proposal**을 만든다. 사용자는 다음 네 가지 중 하나를 명시적으로 결정한다.

1. `session_only` — 이 대화에서만; 장기 저장 및 Grant 없음.
2. `character_only:seyeon` — 세연만 기억; 해당 Memory/Life Fact + 명시적 Character Grant.
3. `current_characters` — 승인 시점의 현재 캐릭터들에게 각각 명시적 Grant (대상은 서버에서 결정).
4. `discard` — 기록하지 않음; 장기 저장 및 Grant 없음.

이것은 사용자가 과거 User Message를 선택해 원문 전체를 `summary`로 기록하는 기능이 아니다. 원문 Message는 서버가 권한 확인을 마친 **출처 증빙**에만 사용할 수 있다. 원문을 직접 Memory로 만드는 수동 Producer PR #2759는 설계 위반으로 **병합 없이 종료**한다.

- `chat-room-read-contract.js`는 서버가 세연 **캐릭터 답변**에 결속시킨 `memoryProposal`의 정확한 6필드 `sourceAuthority:'server_dialogue_planner'`, `characterId:'seyeon'`, `proposalId`, `proposalKind`, `proposalState:'pending'`, `summary`만 통과시킨다. User Message에 달린 제안, 이전 `memoryProposalOffer`, 위조 ID·스키마·상태·Character는 거부한다.
- `seyeon-private-memory-review-view.js`는 **메시지 저장 버튼이 없고**, 서버의 기억 제안 내용과 네 가지 선택지를 보여준다. 내용은 DOM `textContent`만 사용하고 브라우저가 사실을 추출/수정하지 않는다.
- `seyeon-private-memory-review-client.js`는 원본 사용자 메시지로 Proposal을 생성하는 POST가 없다. 서버가 발행한 Proposal ID에 대해서만 `POST /api/memory/proposals/:id/decision`으로 사용자의 명시적 `choice.mode`를 전달한다. 임의 `summary`, 원문, Grant ID, 공유 대상 목록을 전송하지 않는다. 동일 Proposal의 불명확한 결과는 자동 재요청하지 않는다.
- `session_only`/`discard`는 영속 기록·Grant 0을, `character_only`/`current_characters`는 명시적 결정과 서버의 일치하는 결과를 요구한다. Member/세션 변경/응답 불일치 시 HOLD.
- **운영 구현 미완료**: 서버 Planner Proposal 생성, 응답 결속, DB Atomic Scope Decision API는 아직 연결되지 않았고 `/decision`은 미마운트다. 기존 `chat-read-http.ts`의 세연 History metadata-only HOLD는 그대로이므로 위 UI는 운영에 표시되지 않는다. 유료 AI/원문 Reveal/Projector/운영 DB·ACL을 켜지 않았다.

**종료 조건**: Planner의 서버 생성 사실 제안과 원문 출처 증명, UC-07 네 선택의 실제 DB/Session 처리, 동의·철회/Revocation·Replay·두 세션 경쟁 검증, 운영 G0~G6 승인 증거가 충족되어야 한다. 현재 UI staging/CI가 PASS여도 S0 운영 PASS나 전체 AI 보안 완료를 의미하지 않는다. `HOLD_FORWARD_STOPPED` 유지.

### UC-07 서버 결정 경로 구현 (S0 격리 / 운영 미마운트)

- `seyeon-planner-memory-decision-v1.ts`는 기존 `packages/domain/src/memory-resolution.ts`를 재사용하여 UX 네 선택을 `session_only`, `accept_long_term + character_only`, `accept_long_term + current_characters`, `reject`로 매핑한다. 공유 대상은 브라우저가 제출하지 않고 DB가 읽은 현 캐릭터 집합만 사용한다.
- `seyeon-planner-memory-decision-http-v1.ts`는 **회원 인증, 본인 Subject DB 트랜잭션, 정확한 1개 선택, 내부 pending 제안 읽기/잠금, 단일 트랜잭션 결정, 결과 검증**을 구현한다. 클라이언트 Summary·원문·Grant ID·대상 캐릭터 목록 입력은 금지한다. 승인 callback이나 검증 가능한 DB 구현이 없으면 503이다.
- `10-planner-memory-decision-source.sql` / `postgres-seyeon-planner-memory-decision-source-v1.ts`는 S0 단독 세연 대화의 **확정된 세연 Character Message**에 연결된 `proposal_dedupe_key='seyeon-dialogue-planner:v1'` pending Proposal만 원본 테이블에서 잠금 검증한다. 원본·제안 Summary를 반환하지 않으며, 사용자의 수동 UserMessage Proposal을 Planner 제안으로 인정하지 않는다. 기본 API 역할은 신규 RPC를 실행할 수 없다. 격리 PG17 합성 테스트에서만 제한된 권한을 임시 허용한다.
- `seyeon-planner-memory-decision-commit-v1.ts`는 **S0 Memory 한 건, 세연 Grant 한 건**에 한하여 기존 비공개 수락 Owner RPC와 명시 Grant Owner RPC를 같은 DB 트랜잭션에서 차례로 실행한다. `current_characters`도 DB 현재 집합이 세연 단독일 때만 이 경로로 처리한다.
- **아직 구현/승인되지 않은 부분을 지원한다고 간주하지 않는다.** `session_only`/`discard`의 비영구 처리는 S0 격리 DB Owner 명령으로 구현했으나 운영 및 전체 개인정보 보존 계약(SRC-05)은 미완료이다. `current_characters`의 실제 다중 캐릭터 Grant, Life Fact persistence, 실제 대화 Post-turn Worker의 Planner 추출 실행 연결, 최종 캐릭터 메시지와 pending 제안의 G3 공개 권한 연결은 여전히 HOLD다.
- `production-seyeon-planner-memory-decision-runtime-v1.ts`는 실제 Production identity verifier/DB pool/소유 DB adapter를 조립하지만 **public router 미마운트, admission 기본 DENY, 승인 없는 운영 실행 불가** 상태다.
- 새 S0 격리 SQL은 `supabase/migrations`에 추가하지 않았고 실제 운영 DB·ACL·registry·모델/Worker는 변경하지 않았다. G0~G6 및 SRC-25 승인 전 `HOLD_FORWARD_STOPPED`를 유지한다.

### UC-06 서버 Planner 후보 생성 → pending Proposal (S0 격리 구현 / 운영 HOLD)

- `seyeon-planner-memory-proposal-extractor-v1.ts`: 기존 `SeyeonStructuredProviderPortV2`의 별도 `memory_proposal_extraction` 목적을 선언한다. 모델은 대화에 적합한 **한 가지 사용자 진술 후보** 또는 `none`만 제안하며, 짧은 3인칭 사실 `summary`와 실제 사용자 발언에서 연속으로 인용한 `userEvidenceQuote`를 반환해야 한다. 근거가 일치하지 않거나 원문 전체를 기억으로 복사하려 하면 거부한다. 모델 출력은 사실/승인 권위가 아니다.
- `seyeon-post-turn-planner-memory-proposal-v1.ts`: 독립 서버 Post-turn 호출 함수. 모델+DB 명령을 수행하려면 **신뢰된 서버 내부 승인 callback**이 필요하며 기본 DENY. 승인 시에도 Member 검증/DB 트랜잭션 및 출처 재검증을 거쳐 **pending Proposal만** 만든다. 매 Subject/Turn에 대해 재시도해도 고정되는 서버 Proposal UUID를 사용한다. Post-turn Worker와 Production 조립부에 **호출 포트는 결속**됐으나 기존 OFF-only 원본 출처 계약 및 기본 모델·DB DENY 때문에 운영에서 실행되지 않는다.
- `11-planner-memory-proposal-producer.sql` 및 `postgres-seyeon-planner-memory-proposal-producer-v1.ts`: S0 DB Owner의 `cmd_create_pending_seyeon_planner_memory_v1`가 확정된 세연의 Character 답변, 정확히 같은 Turn의 User Message, 원문에 실제 포함된 짧은 증거 인용을 재검증해 `memory_proposals(status=pending)`만 생성한다. `memory_items`·`life_facts`·`record_access_grants` 자동 생성 **0건**. 한 Turn당 하나, 리플레이에 다른 사실/ID를 끼워넣으면 거부한다.
- `seyeon_private.planner_memory_proposal_sources_v1` DB Owner 전용 출처 테이블에서 **진짜 소유 함수가 생성한 제안**과 User/Assistant 메시지 및 Turn을 바인딩한다. `10-planner-memory-decision-source.sql`이 이 출처를 확인해야만 UC-07 승인 검토가 가능하다. `proposal_dedupe_key` 문구를 수동 INSERT한 것만으로는 위조할 수 없다. 일반 API·Member·Guest·service role에는 테이블/생성 RPC 직접 접근을 열지 않는다.
- PostgreSQL 17 격리 합성 테스트는 이제 원래의 직접 `memory_proposals` INSERT 대신 DB Owner Producer를 호출하여 **제안 → 승인 전 Memory 0건 → 본인 승인 후 Memory/Grant 각 1건**, 동일 제안 재시도/근거 없는 사용자 메시지/출처 없는 가짜 Planner 행 거부를 검증한다.
- **운영 미완료**: Post-turn Worker 호출 포트는 구현됐지만 **기존 OFF-only DB 출처 Gate가 개인정보 Claim 자체를 차단**하므로 실제 유료/실사용자 자동 후보 생성·공개는 여전히 실행 불가. 기존 AI Governor의 별도 purpose 예산 승인, 개인정보 보존기간/제안 폐기, G3 현재 접근권한에 의한 제안 렌더링, G0~G6 검증/승인이 필요하다. 현재 `HOLD_FORWARD_STOPPED`; 새 SQL은 운영 Migration에 포함되지 않으며 DB ACL/공용 Router/유료 호출을 활성화하지 않는다.

### UC-07 비영구 선택 2가지 S0 DB Owner 결정 (운영 HOLD)

- `12-planner-memory-non-durable-decision.sql`의 `seyeon_private.cmd_resolve_pending_seyeon_planner_non_durable_v1`는 DB Owner가 확인한 **진짜 pending Planner 제안**에 대해서만 `session_only` / `discard` 결정이 가능하다. 동일 Subject/Turn의 원본 캐릭터·사용자 메시지와 Owner 발급 출처가 일치해야 한다.
- `session_only`는 장기 Memory/Grant 없이 제안 상태를 `expired`로 확정하고 `proposed_value_jsonb={}`로 지운다. 원래 대화 자체는 기존 채팅 Session/History 계약을 따른다. `discard`는 `rejected`로 확정하고 같은 방식으로 후보 내용을 지운다.
- `postgres-seyeon-planner-non-durable-decision-v1.ts` 및 `commitSeyeonPlannerMemoryDecisionS0V1`는 기존 Character-only 수락·Grant Owner 경로와 함께 네 가지 UX 선택을 하나의 DB 트랜잭션 결정 분기로 연결한다. 복수 캐릭터와 Life Fact 수락은 여전히 명시적으로 HOLD한다.
- 합성 PostgreSQL 17 테스트에서 두 선택의 **제안 내용 삭제, 새 Memory 0건, Grant 0건, Replay 차단**을 검증하도록 추가했다. 일반 API EXECUTE는 기본 DENY, Producer/Decision/RPC는 운영 Migration 및 공용 Router에 마운트하지 않았다.
- `session_only`의 현 대화 Context 반영과 정책적 보존기간/TTL, 과거 G3 권한 검증, 실제 Renderer/UI 공개와 실제 Post-turn Worker 자동 실행은 미완료이다. 테스트 GREEN만으로 구현 전체 또는 운영 승인 완료라고 간주하지 않는다.


## Worklog — Security / Character Memory UC-06·UC-07

> 작성 규칙 (2026-10-30부터 적용): 각 실제 작업 단위가 끝날 때마다 **작업 내용·변경 파일·커밋·확인한 CI 결과·미완료/차단**을 이 문서에 누적한다. CI의 대상 SHA와 실행 완료 여부를 구분하고, 아직 실운영에 연결되지 않은 코드를 '완료'로 표시하지 않는다. 최신 기록을 아래쪽에 추가한다.

### 2026-10-30 · W01 · Post-turn 자동 제안 연결 착수

- **확인:** PR [#2761](https://github.com/gycha0109-beep/MyeongHa/pull/2761)의 최신 작업 HEAD `87b73ea44a7731ff3d476d33b2d3caa1c5d09ea8`. 사용자는 이전 GREEN을 알렸으나 확인된 가장 최근 PR-run은 `93ee6595`에서 CI RED 이후의 실행이며, 현재 HEAD의 전체 GREEN을 확인하지 못했다. `main` 변경으로 PR이 `dirty` 상태임을 확인.
- **작업 목표:** 실제 `seyeon-post-turn-analysis-worker-v1.ts`의 committed User/Character claim과 S0 Planner Producer 사이에 서버 소유 결속을 추가. 사용자 클릭·원문 전체 저장·무승인 영구 기록을 새로 만들지 않음.
- **보안 전제:** 기존 Production Post-turn은 DB Owner가 검증한 OFF 정리만 허용하고, 개인 텍스트·Provider 요청은 기본 HOLD. G0~G6, 운영 개인정보·유료 호출은 변경하지 않음.
- **미완료:** Worker 결속·테스트·충돌 해소·새 HEAD CI 및 승인 결과.


### 2026-10-30 · W02 · Post-turn Worker 제안 포트 결속

- **구현:** `seyeon-post-turn-analysis-worker-v1.ts`에 `SeyeonPostTurnPlannerMemoryPortV1`을 추가. **DB claim과 snapshot 원문 결속 검증 후**, OFF·checkpoint 재처리가 아닌 새로운 클레임에만 `propose()`를 호출한다. 응답은 `none` 또는 정확한 pending UUID/재생 여부만 허용하고 다른 반환은 HOLD한다.
- **서버 조립:** `seyeon-post-turn-planner-memory-port-v1.ts`가 기존 `runSeyeonPostTurnPlannerMemoryV1`을 신뢰된 Subject 증빙/DB pool/provider에 연결. `production-seyeon-post-turn-worker-runtime-v1.ts`에서 포트를 구성해 Worker에 전달한다.
- **커밋:** `b1ae10fb` (worker), `05c6f3fc` (adapter), `a0b6b147` (runtime).
- **보안·활성화:** 실제 Production Worker는 기존 `enforceCurrentSourceAuthority=true`가 **OFF-only cleanup**만 허용하여 private claim 이전에 반환/차단한다. Planner 모델/DB 승인 callback도 부여하지 않아 호출 경로는 운영에서 계속 **DENY**다. 이를 실서비스 자동 제안 활성화로 주장하지 않는다.
- **검증/다음:** 경로·권한 회귀 테스트와 새 HEAD CI 필요. G0/G4 승인·Model 원문 접근 근거·새 purpose 예산 및 G3 응답 결속 HOLD.


### 2026-10-30 · W03 · Post-turn 결속 검증 및 차단 회귀 테스트

- **구현/검증 코드:** `test/seyeon-post-turn-source-authority-hold.test.ts`에서 기존 Production `OFF` 정리/원문 차단 시 Planner 호출 0회·private claim 0회를 검증. `test/seyeon-post-turn-planner-memory-port-v1.test.ts`에서 snapshot/claim/체크포인트/모델 추출 순서, Owner 생산 경로, Member 검증, G0/G4 미승인 시 Provider·DB 호출 0회를 검증.
- **커밋:** `757c3b07`, 테스트 구조 수정 `55065664`, `81798f05`.
- **현재 상태:** 신규 HEAD에서 완결된 CI 결과 **아직 미확인**. 기존 Production OFF-only 정책, 기본 DENY, 운영 ACL 미변경.
- **후속:** 최신 `main`이 S0 `14-g0-relationship-event-original-lineage.sql`을 추가하여 `plan.mjs`가 충돌한 상황. 타 트랙 작업을 보존하는 병합과 정확한 SHA 기반 CI 재검증이 필요.


### 2026-10-30 · W04 · 합성 Claim 실행 검증 / 최신 main 병합

- **구현:** `test/seyeon-post-turn-planner-memory-worker-v1.test.ts`에서 검증된 Claim의 정확한 User/Assistant 원문만 후보 포트에 전달, `OFF`·완료 체크포인트에서는 호출 0회, Assistant snapshot 불일치 및 가짜 제안 응답은 관계 분석 및 체크포인트 이전 HOLD를 확인하는 합성 테스트를 추가.
- **main 병합:** `bed9b1fe`은 최신 `main`의 보안 G0 관계 이벤트 출처 `14-g0-relationship-event-original-lineage.sql`과 기타 기존 트랙 변경을 보존하면서 `plan.mjs`에 10·11·12 Planner SQL을 함께 기록하는 병합 커밋이다. 병합 시 새 `main`의 사주·레코드 트랙 코드를 덮어쓰지 않았으며, PR은 병합 가능으로 복구.
- **커밋:** `bed9b1fe`(main 통합), `6e6ca7a1`(합성 Worker 흐름 테스트).
- **CI:** 작업 HEAD `6e6ca7a140eea2b5bc58ebad49b06328cd6a7e4d`에서 CI/Web/Governance가 실행 대기·진행 중으로 확인됨. 성공 판정하지 않음. [PR 검사](https://github.com/gycha0109-beep/MyeongHa/pull/2761/checks).
- **잔여:** 실제 Production Post-turn은 Owner 출처 Gate가 OFF-only로 개인 원문을 읽지 않는다. 현 상태의 포트 결속은 운영 활성화가 아니며, G0/G4 원천 승인·budget·G3 UI 후속 권한 계약·G5/G6 승인 후에만 개인 기록을 사용할 수 있다.


### 2026-10-31 · W05 · CI RED TypeScript 오류 수정 및 재시도

- **실패 증거:** PR [#2761](https://github.com/gycha0109-beep/MyeongHa/pull/2761/checks)의 HEAD `5433f2a662cd0047c4e046d014198e9f7fb06a9d` 검사. `Governance` / `Web PR Domain Gates` **GREEN**; `CI` [41027186530](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41027186530) **RED**. `Work Track · security` (job `123968237399`)에서 TypeScript `TS7031`, `TS2379` 확인.
- **원인:** `seyeon-post-turn-planner-memory-port-v1.ts`의 `propose({committedTurn})` 인수에 명시적 타입이 없어 암시적 any 발생. `test/seyeon-post-turn-planner-memory-port-v1.test.ts`의 선택 필드 `values`가 `undefined`일 때도 객체에 포함되어 엄격한 optional property 규칙 위반. PostgreSQL 17 종속 검사 역시 동일한 컴파일 오류에 의해 테스트를 시작하지 못해 RED로 전파됨. 해당 검사에는 추가로 `saju-abuse-admission-attack-e2e` / `saju-official-records-http-e2e` 실패가 기록됐지만, 로그상 이들의 공통 선행 원인은 컴파일 실패이며 별도 DB 기능 결함으로 단정하지 않는다.
- **수정:** 포트 인수에 기존 `SeyeonPostTurnPlannerMemoryPortV1['propose']`의 정확한 인수 타입을 지정. 테스트 기록에는 `values`가 존재할 때만 필드를 넣어 `exactOptionalPropertyTypes`를 준수. 변경 범위는 두 TypeScript 파일뿐, 보안 권한/SQL/운영 DB 미변경.
- **커밋:** `906ff336187b45fbbe4f9a09d9a4ffc5de05d9ce`(포트), `e576b03de78df5d987c9b9c08a29636c9418fd75`(테스트).
- **미완료/다음:** 수정된 Worklog 포함 최종 HEAD의 CI·PostgreSQL 17 결과는 별도 확인해야 한다. 실제 유료 Provider 및 운영 Memory 공개는 G0/G3/G4/G6 권한·예산 증빙 전까지 `HOLD_FORWARD_STOPPED`.
