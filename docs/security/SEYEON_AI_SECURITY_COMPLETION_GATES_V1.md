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

- `supabase/migrations/1630_seyeon_zero_personal_source_pre_model_pin_v1.sql`은 `chat_turn_attempts`에 `seyeon_personal_source_pin_jsonb` 및 저장시각을 추가하며, 사후 불변 Trigger 및 세연 검증 결과의 원본 Pin 일치 Commit Trigger를 둡니다.
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
