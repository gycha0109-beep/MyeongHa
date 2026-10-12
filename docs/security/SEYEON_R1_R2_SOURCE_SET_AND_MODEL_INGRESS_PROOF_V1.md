# 세연 R1 / R2 — 격리 SourceSet·실제 모델 입력 경계 증거 v1

> Watchtower-Track: security
>
> 상태: **OFFLINE / OWNER POLICY OPEN**, 2026-10-12. [Draft PR #1985](https://github.com/gycha0109-beep/MyeongHa/pull/1985), [G0 D03/G1 Blueprint](./SEYEON_G0_D03_G1_POSITIVE_PIN_DB_BLUEPRINT_V1_PROPOSED.md), [R0~R8 로드맵](../operations/SEYEON_G0_D03_G1_TO_G6_IMPLEMENTATION_ROADMAP_V1.md).
>
> 이 검증은 운영 DB 권한, SRC-25 Memory 타입 등록, G1 실제 Pin, G2 실제 Commit, G3 Reveal/History, paid Provider 실행을 승인하지 않습니다.

## R1 — 실제 폐기 PostgreSQL 기반 Parent/Edge 증거

**목적:** 기존 실제 Attempt 1건과 원본 Memory 2건/Grant 2건의 *테스트 데이터*에서 새 SourceSet 부모·출처 간선이 0/1/N 및 원본 Grant 취소/변경을 구분하는지 확인. 2건 허용은 **R1 확장 shape 실험일 뿐 S0 운영 허가가 아닙니다**.

| 객체 | 시험 구현 | Authority 의존성 |
| --- | --- | --- |
| 원본 기반 | 기존 test/db/seyeon_positive_grant_attempt_bound_candidate_v1.sql | auth.users→subjects→conversation_threads→chat_turns/attempts, memory_items, record_access_grants |
| Parent | 신규 source_sets_r1 | attempt_id PK + Subject/Thread/Turn, character='seyeon', version, source_count, 선택 digest; 비신뢰 selected digest는 접근 증명 아님 |
| Edges | 신규 source_edges_r1 | (attempt_id,ordinal) PK, original memory+Grant FK, type/schema, granted_at, PostgreSQL content_jsonb raw digest; 중복 Memory/Grant UNIQUE |
| Owner Port 후보 | 신규 pin_source_set_r1, SECURITY DEFINER | authenticated canonical Subject context, active Subject/Thread/Attempt, 기존 1640 zero Pin 부재, exact Grant+Memory FOR SHARE, 1~2개 child/immutable replay |
| 최소권한 | API executor의 parent/edge 직접 DML·SELECT 거부 | pin 함수 EXECUTE만; public/anon/authenticated/service_role 권한 없음 |
| 경합 | 기존 별도 실제 PG 2-session revoke/commit_race 증거 | 본 R1 Parent/Edge는 임의 가정으로 실제 v2 Commit을 호출하지 않음 |

**부정/긍정 사례:** empty array 거부, 정상 한 Record/두 Record, 같은 Attempt의 다른 SourceSet·Ordinal·선택 digest 거부, 다른 Grant/Turn/Attempt 거부, duplicate ID 거부, API 직접 DML 거부, 원본 Grant revoke+새 Grant 발급 이후 재사용 거부, Memory payload 변경 감지, test-only zero+positive XOR 거부. 직접 table 조회는 test-runner owner로만 하며 API executor의 직접 SELECT를 추가하지 않습니다. 시험 준비 중 검증 SQL이 잘못된 역할로 읽는 문제를 확인하여 **ACL은 그대로 유지하고 테스트 검증 위치만 수정**했습니다.

**경계:** ① post-Pin Provider 문맥 전체의 전달 바이트는 아직 불변 보호하지 않습니다. ② Parent/Edge 구조는 real Chat Commit/Outbox를 발행하지 않습니다. ③ src25 실제 schema allowlist 미승인; 테스트 fixture shared_detail/memory-v1은 서비스 허가 아님. ④ N>2 혼합 Memory+Life Fact 및 실제 PG15↔17 Upgrade Golden은 아직 포함되지 않습니다. ⑤ XOR test는 기존 1640 zero field 충돌 거부만 확인하며 생산 트리거의 positive Commit 분기는 여전히 없음.

## R2 — 현재 native model/request 경로 실제 코드 점검

| 순서 | source/경계/실제 함수 | 전달되는 범위·시간 | 현재 G0 양수 단계 이관 리스크 |
| --- | --- | --- | --- |
| 1 | production-seyeon-chat-runtime-v1.ts에서 verifiedEvidence→canonical Subject / AI governed cost / pinned Bundle | Authenticated Subject, Server config, mode | 공개 route OFF 유지; User JSON에서 Grant/SourceSet을 만들면 안 됨 |
| 2 | postgres-seyeon-production-context-read-v1.ts → 1480 personal record / relationship history / recent reader-context messages | 원본 DB Grant+Record, History, 이전 User/Assistant | 이전 메시지는 **부모 출처 Grant/Attempt lineage 없음**. Direct Memory 조회 허가와 별개 |
| 3 | composeSeyeonProductionContextV1() | relationship event replay, projected record, max cap/sort, admissions | SOURCE_CANDIDATE≠final model input. Unsupported Schema 및 Relation/Previous assistant HOLD |
| 4 | runSeyeonProductionChatExecutionV1()→ exactModel selector→ markContextReady (1640 zero-only) | before ANY model stage, zero-only | 양수 SourceSet Provider 선행 Pin Owner RPC 아직 없음. 1640 validated→committed positive를 막음 |
| 5 | resolveTurnGovernance() 및 createSeyeonProductionGovernanceV1() | server-owned relationship/Integrity/Disclosure config, default denyPrivateSourceRetrieval() | **기본 Native Production retriever는 []**. 별도 ResolveGovernance seam/미래 Reader/Saju는 아직 전체 검증이 아니며 추가 source authority가 필요 |
| 6 | runCharacterGovernedPreflightV1()→integrity_classification, disclosure_classification | **Pin 이후** current user text를 Provider에 전송; 반환 Integrity claims/Disclosure decision | classification은 자기 자신으로 Record/Grant 권한을 발급하지 않음. Preflight 이후 새로운 verified fact/Private source가 들어갈 수 있음 |
| 7 | runSeyeonCharacterTurnV2()→relationshipSemantics.resolve→assembleSeyeonRuntimeContextV2() | **Preflight 이후** integrity decisions, retrieved private sources, Relationship semantics를 모델 Context에 결합 | 기존 G1-B1 selected source set만으로 실제 final Provider Context의 closure/digest 완결 보장 불가 |
| 8 | buildSeyeonTurnInterpreterRequestV2()→generate() | context.recentConversation, retrievedMemories, disclosure, integrity, Bible, policy 전체 | Reader/History/관계 출처가 섞이면 현재 S0는 Provider 이전 HOLD. 공개 Bible 버전은 별도 Content authority |
| 9 | buildSeyeonRendererRequestV2()→generate() | rendererPacket.memoryEvidence/recentConversation/disclosure/interpretation, private refs | Interpretation 이후 추가된 출처 참조를 새 허가로 보지 않고 재검증 |
| 10 | buildSeyeonSemanticReviewRequestV2()→generate() | rendererPacket+rendererDraft+utteranceHash | Renderer의 **원문 자연어 자체는 검증된 provenance가 아님**; 우회/파생 출처 검사 미완결 |
| 11 | persistGenerated/Validated→ cmd_commit_seyeon_chat_turn_runtime_v2 | Chat Commit+post-turn outbox, 1640 zero pin guard | 원본 exact positive Grant 같은 트랜잭션 잠금 미완료 |
| 12 | post-turn analysis / worker / HTTP first/replay/history | approved Message/Outbox 이후 파생 작업/재조회 | Worker·Reader·Saju/relationship 결과는 원본 Grant closure 전이 및 G3 Owner 현재권한 재확인 필요 |

### 실행 가능한 R2 감사 후보

- **코드:** apps/api/src/seyeon-offline-r2-provider-ingress-audit-v1.ts.
- **테스트:** test/seyeon-offline-r2-provider-ingress-audit-v1.test.ts.
- **관측:** 실제 buildSeyeonTurnInterpreterRequestV2/buildSeyeonRendererRequestV2/buildSeyeonSemanticReviewRequestV2가 생성한 **요청 객체**에서 사용자 메시지 1개 + 직접 Memory 1개, 빈 과거 History/Relationship/Disclosure/verified integrity가 유지되는지 검사합니다. classifier 두 종류는 current user only 필드를 허용.
- **거부:** 첫 Pin 이후 past User/Assistant 삽입, Memory/Grant 변경·추가, 새 private retrieved Source, 새 Relationship Semantics, preflight verified Fact, forged history refs/renderer private refs, 알 수 없는 Provider purpose. delegate가 호출되기 전에 실패해야 합니다.
- **반환:** observed_synthetic_only / permitsProductionProvider=false / permitsProductionReveal=false. 실제 요청 JSON fingerprint는 로그 원문이 아니라 테스트 비교용 비밀키 없는 sha256이며 **DB 승인/서명/실행 허가가 아닙니다**. 
- **증명 불가:** 임의 문자열(역사 사실의 자연어 패러프레이즈) 속 출처 자동 증명, 공개 Bible bundle 서명/버전, Word-piece 내부 지식, dynamic external tool, Reader/Saju 엔타이틀먼트, post-turn worker 저장/전파 권한, 데이터 보존/삭제, 실제 HTTP Reveal의 Revoke 시점. 이 검증기는 Runtime Composition에 설치되어 있지 않습니다.

## 자체 재검토·남은 리스크

1. **R1 ACL:** Direct table SELECT가 필요한 내부 시험을 API executor로 실행하면 설계상 당연히 거부합니다. Test runner Owner 검증으로만 시행하며 executor 권한을 늘리지 않습니다.
2. **R1 Digest:** DB raw content hash와 Node canonical envelope hash가 서로 다릅니다. selectedSourcesDigest는 통합 인증/권한이 아님.
3. **R2 타이밍:** 1640 Pin은 Preflight 모델 호출보다 먼저 생성되지만, Interpreter로 보내는 최종 Context는 **Preflight 이후**에 완성됩니다. 따라서 S0 positive 활성화하려면 모든 Provider 역할에 걸친 stage-specific sealed input / entire transitive closure 정책을 DB Owner+Character가 승인해야 합니다.
4. **R2 확장:** Default Production private retriever=[]라는 관측을 Reader/Saju/Relationship future data 없음이라고 일반화하면 안 됩니다. 직접 private retrieval이 없는 경로도 이전 Assistant/관계 이벤트에 파생 민감 출처가 남습니다.
5. **미실행:** Production G1/G2/G3/paid AI/공개 Route 및 SQL migration 변경 없음. 새로운 CI workflow 없음.

### 단계 판정 기준

- **R1 test-only PASS:** 정확한 HEAD의 기존 db-authority-core CI에서 격리 Parent/Edge SQL과 기존 real PG/Node 검사 성공 시만 표기.
- **R2 structured audit PASS:** 정확한 HEAD에서 세연 담당 typecheck + 새 테스트 + affected tests 성공 시만 표기.
- **R2 Full Closure / 운영 G1:** **NOT COMPLETE / G0 Owner HOLD**. Input 요청 텍스트 출처·Reader/Saju·Worker·전문 request sealing·D03 Codec 승인은 여전히 외부 결정/추가 구현 필요.

종료 판정: R1/R2의 제한된 격리·구조 관측까지만 B. G0/G1 positive·G2·G3의 운영 전환은 C(Owner 계약/실제 원자 RPC/외부 운영 lineage 필요).
