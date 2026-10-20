# Official Reader S4 보호 원문 저장·환불 삭제·복원 격리 — 설계 착수 v1

- 작성 기준: 2026-10-19 / 명하 `db-authority-core` / S4 범위.
- **제품 정책 정본:** [`P0-PR-02` 공식 Reader 유료 해설 개인정보 결정](../OFFICIAL_READER_S4_PRIVACY_POLICY_DECISION_V1.md) — 독립 문서, 기본 브랜치 정책 색인에서 확인. 정책의 승인 출처는 PR 댓글이 아님.
- **상태:** DESIGN CANDIDATE / PRIVACY & LEGAL TECHNICAL ACCEPTANCE PENDING / NO EXECUTABLE MIGRATION / NO PAID BODY WRITE / PUBLIC OFF.
- 이번 납품은 구조·정합성·삭제/복원 경계 설계다. 기존 Product Owner의 승인 정책을 재승인 요청하지 않으며 운영 DB, 기존 일반 세연 Chat/Commerce Writer, 1720/1730 RR-03/04 Draft, API public 권한을 변경하지 않는다.

## 1. 기존 코드 기반 사실과 해결해야 하는 위험

| 근거 (현행 참조) | 현행 행위/불변식 | S4 새 경계 |
| --- | --- | --- |
| `supabase/migrations/0040_conversation_core.sql` | `conversation_messages`는 `body_text`와 `message_payload_jsonb`, 일반 `chat_turns`·`chat_turn_attempts`를 갖는다. `sender_type='character'`는 Turn/Thread 참여·Bundle FK로 결속됨 | 보호 원문을 `body_text`·`message_payload_jsonb`에 절대 넣지 않는다. 기존 메시지에는 읽기 권한을 전혀 제공하지 않는 **안전한 상태 마커만** 남길 수 있음 |
| `apps/api/src/seyeon-production-chat-execution-v1.ts` | 일반 세연 채팅은 `persistGenerated`, `persistValidated`, `commitTurn`, post-turn/Outbox 경유 | 유료 원문을 일반 생성·검증/Turn/Outbox/AI 실행 로그에 태우지 않는다. Reader 전용 Server API Writer 후보만 검토. 기존 일반 세연 동작은 보존 |
| `apps/api/src/postgres-reader-context-non-memory.ts` 및 Reader Memory 경로 | 일반 메시지 body, 장기 기억을 AI 컨텍스트로 제공 | 안전 마커만 읽게 유지. 보호 원문·해설 유사 요약·유도 가능한 지문/출처를 이 경로로 재주입하지 않음 |
| `apps/api/src/official-reader-held-t1-t2-preflight-v1.ts` | T1 fresh admission, DB 연결 해제 후 사설 생성, T2 fresh admission과 drift 검사, 결과 폐기 및 `held` 반환. **새 T2 잠금/영속화/공개는 구현되지 않음** | 이 HOLD가 기본 동작. 새 T2 Writer 완성·검증 전에는 생성 결과 문자열·로그·stream·provider callback 부작용의 영속화를 금지 |
| `supabase/migrations/1520_account_deletion_finalizer_relationship_runtime_sync.sql` | 최종화 함수는 `standard_reading_reader_access_grants` 등을 앞에서 삭제한 뒤 `conversation_messages`, `chat_turn_attempts`, `chat_turns`, Thread, Birth/Profile을 순서대로 삭제. retained Commerce 별도 | **신규 보호 원문/연결 자료는 자식 행 → Assistant Marker/Turn → Thread/Reading 순서 이전에 명시적으로 삭제**. 기존 함수에 은밀하게 이어 붙이지 않음; 신규 forward-only 정의 및 FK/그래프 인수 필수 |
| 기존 S2 Reader/PortOne 1740~1890 및 로드맵 | 정확한 Reading×Reader S1 lock, 구매 lock, 원래 Receipt/Grant lineage, 취소/결속 경합. 독립 sibling Grant 유지 | 보호 원문 조회 권한은 **Receipt 한 장 또는 과거 bind**가 아니라 현재 동일 Reading×Reader×정확한 Bundle/Release의 검증된 유효 Grant 집합과 일치해야 함. 다른 Receipt 환불이 sibling 권리를 임의 회수하지 않음 |
| RR-03 출처 sidecar Draft #1960 | `official_reader_assistant_saju_provenance` 비공개/탈퇴 DELETE는 그 이력 범위에서 별도 제품 승인이 있음 | 새 원문/청크는 별도 개인 데이터 분류. 출처 이력의 내부 Unit/정규화 hash를 일반 Chat이나 로그에 복제하지 않음. RR-03만으로 최종 Assistant Writer 승인 아님 |

## 2. 목표 데이터 이동 (승인 후 목표, 지금은 HOLD)

```text
인증된 회원·기존 Thread + 선택한 공식 Reading/Reader
       |
       v
T1: 현재 정확한 Grant/Bundle/Release/Reading/회원 조회 → COMMIT
       |
       v
사설 생성: 연결/잠금 없이 결과를 임시 메모리에 보관
       |   외부 공급자·스트리밍·로그·자동 Memory/검색·영속 캐시 OFF
       v
Saju Owner 공식 서명·Semantic/Output/Disclosure 검증
       |   S3 Production authority 전에는 HELD
       v
T2: 새 DB 거래
    ├─ 동일 S2 scope lock + 현재 Grant/Reading/Reader/Product/
    |   Bundle/Release/Thread/Revision/Source/원문 hash 재검증
    ├─ 승인된 새 보호 원문 row + 안전 마커 + 출처/Attempt 포인터
    |   : **하나의 거래에서 전부 확정, 일부 저장 0**
    └─ COMMIT 성공 이후만 별도의 권한 검사로 유료 원문 전달
       |
       v
재열람·후속 질문: 현재 유효 독립 구매권 + 별도 보호 Query 검증
       |   안전 마커만 일반 채팅/컨텍스트에 남김
       └─ 없거나 불명확하면 원문·AI 주입 0
```

T1·S3·T2 각 검사가 동일 원본/Scope를 pin해야 한다. `Response`·`ReadableStream` 등 전송 객체 구조 검사는 생성 콜백의 **실제 외부 부작용을 막는 통제 수단이 아님**. 생성 runner에서 HTTP/vendor client/로그·trace sink 주입 자체를 제거하거나 별도 엄격 감사가 필요하다.

## 3. 새 보호 저장소: 후보 테이블/관계 명세 (DDL 미실행)

테이블명은 아직 **설계 후보**: `official_reader_paid_answer_bodies`. 기존 보호 provenance 테이블·구독 메모리·Commerce 증빙과 병합하지 않는다.

| 후보 컬럼/관계 | 제안 필드·제약 | 누출/삭제/정합성 근거 |
| --- | --- | --- |
| 식별 | `id UUID`, `subject_id UUID`, `thread_id UUID`, `turn_id UUID`, `attempt_id UUID`, `safe_message_id UUID` | 정확한 **같은** 회원×Thread×Turn×최종 Assistant Message를 가리키도록 *복합 FK 후보*. User가 supplied한 UUID로 선택 불가. DELETE 시 원문이 먼저 소멸해야 함 |
| 공식 Reading | `official_reading_id UUID`, `reader_character_id TEXT`, `reading_contract_version`, `official_artifact_response_hash` | 서버가 승인한 공식 원본/Reader만 저장. 일반 Chat ID로 권리 인정 금지 |
| Product/Character | `product_id UUID`, `product_spec_version`, `content_release_id UUID`, `reader_content_bundle_id TEXT/UUID(실제 참조 타입 결정 필요)`, `content_revision` | DB 실 타입/FK 확인 전 DDL 확정 금지. 정책 변동은 원본 해설 오염·권리 자동 승격으로 취급 금지 |
| 구매권 출처 | `originating_entitlement_grant_id UUID`, 검증된 `purchase_intent_id`/Receipt 연계 참조 후보 | 원문 생성에 사용한 **원본 Grant 증빙**과 **현재 조회 허용 Grant 집합**을 구별. 생성 Grant가 환불돼도 별도 독립 유효 Grant의 처리 규칙을 제품 범위에 맞춰 검토. 다른 Bundle이면 차단 |
| 승인된 출처 | `source_attestation_ref`, `source_response_hash`, `semantic_guard_version`, `output_guard_version` (서버 검증 참조) | Saju #2410 실제 Production 발행 권한과 서명/위변조 검사 필수. 사용자/LLM 작성 `passed:true`는 근거 아님. 구체 영속 컬럼은 Privacy 승인 데이터 분류 후 확정 |
| 보호 본문 | `encrypted_body BYTEA` 또는 DB 외부 원문 금지 범위의 `body_ciphertext` 후보, `encryption_scheme_version`, `key_ref` | 평문 DB/로그/비인가 역할 금지. **키 보관/파기 권한 설계 미확정**: 암호화 제안만으로 개인정보 파기·복원 비노출을 증명하지 못함. 외부 KMS를 신규 업체로 자동 도입하지 않음 |
| 상태·시각 | `created_at`, `committed_at`, `deleted_at`, `deletion_reason`, `deletion_requested_at` 후보 | 원문 조회허가는 row 상태값만으로 반환 금지. 삭제 시 원문/키 삭제와 비민감 tombstone 증거를 분리. 원문 컬럼을 null만 하는 방식도 backup 처리와 연결 필요 |
| 무결성 | `unique (subject_id, turn_id, attempt_id)` 등 **후보**, 개인 식별 가능한 평문 해시 대신 keyed/verifier 증명 | Retry/Replay는 동일 불변 scope+원문+Guard/Source만 idempotent. 기존 Attempt/Message와 Row 일부만 commit 불가 |

### Row/권한 설계의 차단 요건

1. 신규 protected table과 조회 함수는 **RLS ENABLE + FORCE**, `PUBLIC`/`anon`/`authenticated`/`service_role`의 임의 SELECT/EXECUTE 차단, 내부 역할 allowlist와 trusted Subject 문맥 검증. `SECURITY DEFINER`만으로 사용자 ID/인증을 인정하지 않음.
2. 전용 원문 조회 Query는 `subject_id`, `thread_id`, `official_reading_id`, `reader_character_id`, `bundle`, `release`, `product`와 최신 Grant 상태·만료·정책을 **같은 현재 DB 스냅샷/동시성 규약**으로 검증. 공개용 일반 `conversation_messages` SQL 조회로 우회 불가.
3. 다른 독립 Grant가 남아 있으면 정확한 동일 범위의 유효권만 인정. 다른 Reading·Reader·Bundle이면 반드시 0. 독립 유효 Grant 간 `exact-one bundle` 모호성은 차단.
4. 새 schema가 `subject_id`에 FK를 더하면 P0-PR-01 기존 **승인된 그래프 fingerprint/분류를 몰래 수정하지 않음**. 최종 확정된 그래프/DELETE 순서와 populated-row 회귀를 versioned delta로 인수.
5. 본문·source Unit·생년월일·질문·비밀키·암호문까지 분석/오류/PG NOTICE/디버그 로그·Outbox payload로 유출 금지. 키 관리/봉투암호화 방식과 키 손실·복원/파기 경계는 Security/DB 검토 항목.
6. `deleted` 또는 `tombstoned` 상태만 표기하고 ciphertext를 그대로 남겨두는 구현은 **본 DB 24h 파기 목표 달성으로 판정하지 않음**. 원문/키 실제 파기 실증 필요.

## 4. 기존 일반 Chat 안전 마커 (원문 아님)

- 동일 캐릭터 일반 Thread는 유지. `conversation_messages`가 `body_text` 또는 `message_payload_jsonb`로 원문을 보관하지 않도록 **비민감 마커**(`유료 해설 기록이 있습니다. 현재 구매권이 유효할 때만 열람할 수 있습니다.`)와 표시 가능한 상태 enum/서버 발급 opaque ID만 저장하는 모델 제안.
- 마커의 `content_hash`, `message_payload_jsonb`, thread/turn/attempt metadata에 원문 암호문·원문 hash·Saju Source Unit·Birth 조각·요약을 넣지 않는다. 마커만 본 일반 Chat 조회로 유료 해설을 재구성할 수 없어야 한다.
- 마커 생성과 보호 Row·출처 증명은 **T2 동일 거래**로 확정. 보호 Row만 있거나 Marker만 살아 있는 부분 commit 0. 실패/timeout 후 재시도는 같은 original Turn/Attempt/Scope를 재확인하고 다른 원문 자동 대체 금지.
- 탈퇴 시 마커는 기존 Chat DELETE 정책을 따른다. 환불·권한 회수 후에는 비민감 마커가 일반 대화 이력에 남을 수 있으나 **열기/복원/모델 재주입은 현재권한 0으로 차단**.

## 5. 권리 회수·삭제 상태·24시간 목표

| 사건 | 즉시(동기) | 뒤따르는 파기 | 별개 보존 |
| --- | --- | --- | --- |
| 원래 Receipt 전액 취소, 해당 권리 0 | 검증된 Commerce 효과와 S2 잠금 확정 시 **새 원문 조회/모델 컨텍스트/추가 생성 0** | 마지막 유효 권리 소멸 시 protected row/key 파기 예약; 본 DB 실제 파기 완료 **24h 목표** | P5Y Commerce Receipt/Event/Grant/Entitlement는 원문 없이 보관 |
| 같은 scope에 sibling Grant 생존 | **정확한 scope와 Bundle**로 남은 권리 재판정. 상충 Bundle·Source라면 차단 | 최종 원문 권리 소멸 때 파기. 다른 Receipt만 취소됐다고 모든 원문 제거하지 않음 | 독립 결제 증빙 무변경 |
| Grant 만료/탈퇴/삭제 요청 | 조회와 모델 재주입 즉시 0. 탈퇴 시 회원 자체 비활성 | AccountDeletion Finalizer가 **원문 자식 행을 기존 Assistant Message/Turn/Thread/Reading 삭제 이전**에 제거하고 삭제 그래프 검증 | 필요한 최소 Commerce 증빙만 분리 |
| 외부 생성 callback 실패/T2 실패/경합 롤백 | 후보 결과의 외부 공개 0, 원문 DB/로그/검색 0 | 생성 시도 비영속 기본. 이미 생긴 임시 메모리 버퍼 폐기 | 비민감 장애 카운트/trace만 운영 상한 내 기록 |
| DB Worker 지연/실패 | 권리 확인 경로에서 계속 fail-closed, cleanup 재시도·알람 | 경고·재시도·dead-letter/실패 원인 **원문 없이** 추적. 24h 초과 시 사고 에스컬레이션 | 삭제 미완료를 '완료'로 표시 금지 |

파기 자체가 법정 청약철회 권리나 환불/분쟁 심사를 변경하지 않는다. **삭제 24h 목표는 본 DB**만 가리키며, 백업은 아래 복원 비재노출을 별도로 증명해야 한다.

## 6. P30D 백업·복원에서의 재노출 방지

- 새 유료 해설 원문의 삭제/회수 이력은 **복원 대상 Primary DB 외부의 보호된 Privacy Ledger**에 연결할 수 있어야 한다. 기존 계정 삭제 원장에 적용 대상 event/읽기 폐기 키를 검토하되 현재 스키마가 그 타입을 지원한다고 가정하지 않는다.
- DB 복원 직후 **Reader paid-read API/Chat Context/Outbox/Analytics 모든 원문 접근을 OFF**로 시작한다. 복원된 시점 이후의 회원 삭제/Grant revoke/콘텐츠 삭제/키 파기 이벤트를 검증해 적용한 뒤에만 개별 재개를 판정한다.
- 검증할 수 있는 최신 privacy ledger가 없거나 누락·변조·복원 시각 불명·키 재활성화 위험이 있으면 **계속 OFF**; backup restore successful 또는 P30D 시간 경과만으로 서비스 가능 PASS 금지.
- 백업 내 ciphertext가 남아 있어도 접근 가능한 key가 복원·재사용되면 유출될 수 있으므로 **키 생애주기·backup 분리·wipe 실증**이 필요. 새 KMS 공급업체/외부 수탁을 임의 추가하지 않는다.
- **실제 격리 PostgreSQL 복원 테스트:** 복원 이전에 제공된 Row→환불/탈퇴/삭제→옛 백업 restore→tombstone replay→새 재열람/후속 모델 주입 0, 일반 Chat 안전 마커/Commerce 법정 증빙은 승인 범위에서만 유지.

## 7. 최소 권한·비노출 공격 표 (PG15/PG17 실제 시험 전제)

| 시험 | 성공 조건 |
| --- | --- |
| Subject A로 B의 Reading/Reader/Thread/Answer 조회 | row 수 0 또는 동일한 안전 거부; body/PII/존재 여부 추측 누출 0 |
| 인증 없이 `SELECT`/`INSERT`/`UPDATE` 보호 테이블, public RPC 직접 호출 | `PUBLIC`/일반 사용자/범용 service-role 차단. 권한 있는 내부 역할만 trusted context |
| 정확한 Grant 신규 발급↔Reader bind↔PortOne cancel↔paid T2 동시 | S1/구매 lock 순서 공통, stale Grant/Receipt/Bundle/Release 원문 공개 0, 서로 독립 sibling 권리 훼손 0 |
| T2 source/semantic/outbound validation 후 환불 선점 | 원문·마커·출처 attempt 일부 commit 0, 조기 HTTP/chunk 0 |
| T2 commit 성공 후 HTTP 전달 실패·Retry | 원본 Turn/Attempt/Body/Proof 불변. 중복 생성·다른 원문 덮어쓰기 0; 매 전달 시 현재권 재검증 |
| Account Delete populated row, FK cycle, tombstone 재생 | 보호 row 완전 파기, 일반 Chat 기존 DELETE, P5Y Commerce만 보존, 복원 뒤 재노출 0 |
| Outbox/AI execution logs/error stack/Memory/non-memory/vector/search/notification | 원문·청크·복원 가능한 요약·암호문·민감 해시 0 |
| PostgreSQL 15/17 schema/ACL / RLS / catalog / Graph fingerprint | 이력 정본 변경 없이 신규 테이블·전용 권한·삭제 그래프 versioned delta/실데이터 E2E PASS |
| 삭제 Worker Crash/retry 및 DB 장애/복원 | 즉시 접근 0 유지, 24h 목표 관측·원문 없는 경보, 중복 요청 idempotent, 백업 복원 재활성 0 |

## 8. 책임·순서와 이번 작업의 범위

1. **이번 설계 완료 대상:** 승인된 `P0-PR-02` 정책 → 데이터 영역/권한/삭제/복원/로그 범위 매핑, 후보 DB Row와 안전 마커, 권리 상실/형제 Grant 예외, 인수 시험 표를 문서화.
2. **다음 구현:** DB 소유자가 실제 읽기·쓰기를 분리한 SQL 테이블 후보의 정확한 FK/subject graph·key management와 삭제 finalizer/복원 원장을 설계한 후, **비활성 migration/격리 합성 테스트**로 계약을 검증. 기존 migration 1520/Reader 1220 등을 직접 수정하지 않는다. Approval된 신규 P0-PR-02를 재승인 요청하지 않는다.
3. **미승인·금지:** Privacy #2318 실데이터/법무 인수, Saju #2410 운영 출처, S5 T2, S6 조회, S7 고지·결제, S8 출시가 완료되지 않았으므로 **Production DB migration/실제 보호 원문 저장·외부 모델 송신/공개는 하지 않는다**.
4. **정본/가이드 참조 순서:** `docs/MASTER_SPEC_INDEX.md` → `docs/P0_DECISION_REGISTER.md`(`P0-PR-02`) → `docs/OFFICIAL_READER_S4_PRIVACY_POLICY_DECISION_V1.md` → 이 S4 설계 → [S0~S8 로드맵](OFFICIAL_READER_PAID_CHAT_INTEGRATION_ROADMAP_20261012_V1.md). PR 댓글/이슈는 구현 증빙으로만 참조.

**현재 설계 판정: 자료 구조/권한/삭제/복원 경계 DESIGN CANDIDATE 완성, 실행 가능한 DB/암호화/복원 운영 권한은 확보되지 않음.**


## 9. 실제 DB 참조 기반 일회용 구조 시험 (2026-10-20)

- `test/db/official_reader_s4_protected_storage_design.sql`은 실제 공식 Reading·Reader·Entitlement Grant 테스트 자료와 FK를 연결한 **격리 PostgreSQL 전용** 시험입니다. `supabase/migrations/`와 운영 Writer·HTTP는 변경하지 않습니다. 생성한 `official_reader_s4_fixture` 스키마는 테스트 DB와 함께 폐기됩니다.
- FORCE RLS·ACL 무허가, 출처 Grant의 Subject×Reading×Reader×Bundle 일치, B2 독립 Grant의 정확한 조회, B3 다른 Bundle 동시 유효 시 조회 0, 다른 Bundle 회수 시 B2 보존, 마지막 Grant 철회 직후 조회 0 및 합성 바이트의 물리 DELETE를 검사합니다. PostgreSQL 15/17 CI에 동일 테스트 케이스를 등록했습니다.
- 이는 **설계 시나리오 검증**이지 최종 유료 원문 Writer/데이터 암호화·실제 Chat Message/Turn FK·Semantic/Output proof·전체 RLS/삭제 Worker·백업 복원 완료가 아닙니다. 외부 전송·실데이터 저장·운영 DB 적용·공개는 계속 금지됩니다.


## 10. 실제 Chat Thread/Turn/Attempt·안전 마커 결속 및 삭제 순서 시험 (2026-10-20)

- 격리 PostgreSQL에서 기존 `conversation_threads`, `conversation_thread_characters`, `chat_turns`, `chat_turn_attempts`, `conversation_messages`에 **합성 한 세트**를 만들고 원문 후보 테이블과 **복합 FK**를 연결했습니다. 메시지에는 `유료 해설 기록이 있습니다.`만 저장하고 `message_payload_jsonb=null`로 고정합니다.
- 위조된 Attempt·Marker UUID 및 다른 Reader 출처 Grant는 FK/Scope trigger로 거부. `Reader×Bundle×참여자`, `Subject×Thread×Turn×Attempt`와 시스템 안전 마커까지 관계적으로 결속합니다.
- 부모 `conversation_messages`를 보호 행보다 먼저 삭제하면 FK가 차단되고, **보호 행→안전 마커→Attempt→Turn→참여자→Thread** 순서로 제거하면 합성 개인 데이터가 남지 않는지 검증합니다. 이는 현행 AccountDeletion 최종화 함수에 향후 반영할 **자식 우선 삭제 계약**이며 실제 운영 finalizer 변경 또는 개인정보 정본 그래프 인수로 간주하지 않습니다.
- 실제 T2 성공 커밋 및 Chat `state='committed'`/AI 생성·검증 포인터, 단일 유료 권한 Writer·암호화, 개인정보 24시간 삭제 Worker·P30D 백업 복구는 아직 실행하지 않았습니다. 현재 합성 Chat Attempt는 `running`, Turn은 `received`이며 **운영 전 상태를 모사하지 않습니다**.

## 11. 최신 Receipt·안전 마커 동시 재검증의 격리 시험 (2026-10-20)

- 기존 PostgreSQL 15·17 합성 보호 저장소의 읽기 후보에 **정확한 구매 Grant와 원본 Receipt의 현재 `verified` 상태**, active 회원, 원래 Thread·Turn·Reader 참여자, **본문이 없는 안전한 상태 마커**를 함께 요구했습니다.
- 보호 Row의 복합 FK가 맞더라도 다른 일반 메시지를 안전 마커로 대체하면 거절합니다. 환불된 Receipt 아래에 Grant 상태가 오래된 `active`로 남은 합성 상태에서도 결과는 0건이며, 변경은 시험 트랜잭션에서 롤백합니다.
- **격리 시험용 후보일 뿐 운영 조회 구현이 아닙니다.** 실제 보호 DB/암호화, 삭제 Worker·백업 복원, 모델 재주입 보호 API, Saju Production 출처, 최종 유료 T2 저장, 공개·운영 적용은 계속 HOLD입니다. 기존 migration과 개인정보 정책 정본은 변경하지 않습니다.

## 12. AccountDeletion·이전 백업 재노출의 독립 합성 복원 시험 (2026-10-20)

- `test/db/official_reader_s4_logical_restore_deletion_rehearsal.sh`는 기존 일회용 보호 테이블·정확한 Chat 복합 FK를 재사용해 PostgreSQL `\\copy`로 **보호 데이터의 실제 합성 bytea 행을 로컬 파일에 내보냈다가 다시 적재**합니다. 보존 당시 Reader 구매권·안전 마커가 유효한 상태를 만든 다음, 백업 외부에 존재하는 **테스트 전용 삭제 원장과 복원 차단 상태**를 기록하고 본 DB 후보 원문을 물리 DELETE합니다.
- 오래된 파일로 원문 후보를 두 번 복원하고도 복원 차단 상태/삭제 원장 미존재·원장 epoch 지연·원장 재대조/삭제 tombstone 각각에서 **보호 조회 결과 0**, 이후 tombstone 재생으로 원문 후보 **물리 삭제 0행 잔존**을 검사합니다. 보유 중인 Commerce 증빙을 삭제하지 않은 채 `보호 원문 → 안전 마커 → Attempt → Turn → 참여자 → Thread` 자식 우선 순서를 확인합니다.
- 기존 S4 보호 조회 함수에 **시험 전용 백업 외부 원장 JOIN**을 추가했습니다. 이는 운영 원장이나 서비스 가능 전환의 권한을 부여하지 않고, `\\copy` 행 단위 논리 백업 연습일 뿐 **실제 P30D 전체 백업/PITR·KMS 키 파기·운영 AccountDeletion Worker 실행 및 법무/Privacy 인수가 아닙니다**. PostgreSQL 15·17 기존 S4 CI에 통합하며 기존 승인 정책과 운영 migration 무변경입니다.

## 13. Reader 결속 부모 FK와 1520 계정 삭제 순서 (2026-10-20)

- 기존 1520 최종화 함수는 가장 먼저 `standard_reading_reader_access_grants`를 DELETE하고, 이후 `conversation_messages`·Attempt·Turn을 지웁니다. S4 최초 합성 저장소의 Reader 출처 trigger는 INSERT 시에만 검사하므로 이 부모 DELETE를 구조적으로 막지 못했습니다.
- 격리 S4 후보에 `originating_grant_id → standard_reading_reader_access_grants(entitlement_grant_id)` 실제 FK를 추가했습니다. **보호 행이 존재하는 동안 1520의 첫 Reader-access DELETE 및 Chat Marker DELETE가 둘 다 차단**되고, 보호 행을 물리 삭제해야 관계 부모를 삭제할 수 있는지를 PG15/17과 오래된 행 복원 시험에서 확인합니다.
- **현행 1520은 보호 테이블 도입 후 그대로 쓸 수 없습니다.** 앞으로 개인정보 기술 인수 후 별도 forward-only 정의에서 보호 자식 DELETE → Reader-access·Chat·Reading 부모 순서로 실제 finalizer를 연결해야 하며 기존 1520, 운영 migration, Policy 정본·graph fingerprint는 이번 변경에서 수정하지 않습니다.

## 14. 순방향 DB 최종화 접점 계약 — 비운영 실행 표본 (2026-10-20)

- `test/db/official_reader_s4_finalizer_forward_contract.sql`은 **DB 격리 테스트 전용** `official_reader_s4_fixture.rehearse_account_delete_child_first_v1(subject_id)`를 생성합니다. PostgreSQL 15·17의 실제 1520 최종화 `pg_get_functiondef`에서 기존 보호 원문 분류가 없고 **Preflight → Reader-access 부모 DELETE → Chat DELETE** 순서임을 먼저 확인하고, 출처 보호 자식 행을 먼저 삭제한 후 부모 Reader-access 삭제가 허용되는지를 **BEGIN/ROLLBACK**으로 시험합니다. 독립 Subject와 Commerce 보존도 검사합니다.
- 향후 승인 후 신규 forward-only `internal_finalize_account_deletion_db_v1(uuid,uuid,text)` **동일 시그니처 재정의** 시 삽입해야 할 정확한 위치: `Subject FOR UPDATE → Job FOR UPDATE → 현재 Outbox lease FOR UPDATE → 최신 DB preflight 성공 → account-deletion trigger context 설정 → 기존 FK cycle break / 기타 개인 데이터 준비 → [새 protected child DELETE] → 기존 standard_reading_reader_access_grants DELETE → Reading / Chat / Profile 자식 삭제 → Commerce P5Y RETAIN → Subject deleted / deferred constraints immediate`. 이미 최종화된 replay는 원문 삭제 재수행/그랜트 재발급 없이 기존 멱등 반환을 유지해야 합니다.
- 신규 Child DELETE는 **같은 DB 트랜잭션** 내부에서만 시행합니다. 실패/Worker crash/lease 상실 전 전체 롤백·즉시 비노출을 기본으로 하며, 계정별 삭제 tombstone과 복원 시 차단 여부는 별도 백업 외부 Privacy Ledger/현행 복구 계약에서 인수합니다. 단순 `DELETE` 계획으로 실제 Worker·호스팅 Auth 삭제 완료, 24시간 물리 삭제 SLA, KMS/키 파기, P30D 복원을 주장하지 않습니다.
- 이 후보 함수는 실제 `internal_finalize...`의 소유권, SECURITY DEFINER, lease·Member 검사, 계정 삭제 Job 상태, 전체 FK 순환 삭제를 **수행하지 않습니다**. 테스트 schema 외에는 **실행 migration/운영 변경이 없으며**, 실제 SQL 함수 교체는 Privacy/Legal #2318 기술 인수와 운영 복구 승인 후 별도 검토 대상입니다.

## 15. 계정 삭제 중간 장애의 보호 행·접근 결속 원자 롤백 (2026-10-20)

- `test/db/official_reader_s4_finalizer_forward_contract.sql`에 **보호 자식 DELETE → Reader-access 부모 DELETE 실행 직후** 테스트 전용 SQLSTATE로 늦은 Worker 장애를 발생시키는 PL/pgSQL 예외 하위 거래를 추가합니다. 예외 처리 시 PostgreSQL이 양쪽 DELETE를 모두 롤백했는지, Commerce 증빙을 보존했는지 실데이터 구조 기반 합성행으로 검사한 다음, 동일 함수의 재시도를 BEGIN/ROLLBACK으로 성공 검증합니다.
- 오류·강제 재시도 상황에서 **실제 계정 삭제 서비스 완료를 표시할 수 없음**을 인수 조건으로 유지합니다. 이 테스트는 일반 Worker lease/heartbeat, Supabase Auth 삭제, 비동기 장애 복구, 외부 Privacy Ledger 및 24시간·P30D 운영 인수가 아닙니다.

## 16. 실제 Worker 완료 단계와 외부 복원 원장 대비 격리 검증 (2026-10-20)

- 기존 `runClaimedAccountDeletionWorkerV1`는 **DB 최종화 → Auth 삭제 → 완료 ACK** 순서를 쓰며, DB 최종화가 예외를 던지면 Auth/ACK를 **호출하지 않습니다**. 기존 Worker 오케스트레이션 테스트에 S4 보호 자식 FK가 DB 최종화를 막는 *합성 실패*를 주입하고, 미완료 상태 유지·재시도 시 동일 DB Finalizer 재실행·Auth/ACK 각 1회만 처리함을 추가 검증합니다. 실제 Worker 실행 코드는 변경하지 않습니다.
- 외부 `official_reader_s4_ledger_fixture`에 **테스트 전용** `protected_cleanup_ready_for_completion_v1(subject)`를 추가해, 독립 삭제 Tombstone + 복원 epoch 대조 + 해당 Subject 보호 행 0개가 모두 확인돼야 보호 데이터 측 완료 *준비*를 인정합니다. 이전 백업 복원/원장 누락/epoch 지연/다른 Subject는 DENY. 삭제 후 같은 구버전 백업 재적재 시 즉시 DENY→재파기 후 준비 복귀를 검증합니다.
- **중요:** 이것은 전체 계정 삭제 완료 승인을 내리는 함수가 아니며, 일반 Chat·Auth·Commerce·Worker lease·Privacy Ledger 운영 소유자를 대신하지 않습니다. 현행 `internal_complete_account_deletion_v1`와 실제 Worker에 새 게이트를 연결하지 않았으므로, 운영용 강제 증명·재노출 차단 인수는 계속 HOLD입니다.


## 17. 현행 1190 완료 승인 함수와 복원 차단 상태 연계 표본 (2026-10-20)

- S4 격리 스키마에 `attempt_guarded_completion_ack_v1(subject,job,owner)`를 추가했습니다. 백업 외부 삭제 tombstone·epoch 대조·보호 원문 0개가 충족되지 않으면 완료 요청을 **현행 1190 함수 호출 전에 거부**하며, 조건 충족 시에는 실제 `internal_complete_account_deletion_v1`에 모든 최종 승인을 위임합니다. SQL 소스 드리프트 검사는 기존 함수의 Subject/Job/Outbox/호스팅 Auth/임대 검사를 확인합니다.
- 과거 보호 데이터 재복원 및 재삭제 전후에 격리 요청을 실행해, 외부 원장 거부와 실제 1190의 삭제 Job 부재 거부를 구별합니다. 이는 유효한 실제 Worker 임대로 운영 완료를 실행했다는 증거가 아닙니다. **시험 전용 함수만 생성**하며 기존 DB 함수, Auth Worker, Privacy Ledger, 실제 삭제 그래프는 변경하지 않고 인수 전 HOLD를 유지합니다.


## 18. 이미 완료된 작업 재호출과 오래된 백업 복원의 경합 (2026-10-20)

- `test/db/official_reader_s4_completed_replay_restore_contract.sql`은 S4의 **두 번째 구백업 복원 직후**, PostgreSQL 테스트 전용 트랜잭션에 해당 회원의 `subjects.status='deleted'`, `data_deletion_jobs.status='completed'`, `outbox_events.status='processed'` 등 정본 1190의 완료 재호출 조건을 **합성**합니다. 이는 실제 Worker의 최종화를 수행한 것이 아닙니다.
- 원문 후보 행이 복원되어 있으면 `attempt_guarded_completion_ack_v1`이 **기존 1190 완료 함수 호출 이전에 거부**하고, deleted Subject라면 읽기 후보도 0건입니다. 같은 트랜잭션 안에서 복원된 원문 후보를 물리 삭제한 후에는 정본 1190의 `completed=true,replayed=true` 경로로 위임해야 하며, Job 완료·Outbox 처리 시각을 변경해서는 안 됩니다.
- 트랜잭션 전체를 ROLLBACK한 후에는 합성 완료 Job·Outbox·deleted 상태가 남지 않고 원래 구백업 보호 행이 다시 존재해 외부 tombstone으로 차단되는지 검사합니다. 운영 DB·실제 Worker·1190 함수·개인정보 복원 인수에는 변경이 없으며, **실제 완료된 계정과 PITR 데이터의 운용 차단 증명은 HOLD**입니다.


## 19. 복원 원장 버전 경합과 Worker 완료 승인 단계 재시도 (2026-10-20)

- 완료 상태의 Subject·Job·Outbox를 **ROLLBACK 전용 합성 트랜잭션**에 갖춘 상태에서 복원된 보호 원문을 다시 파기한 후에도, 외부 원장의 `required_epoch`을 증가시키고 `reconciled_epoch`를 뒤처지게 하면 보호 데이터 전용 완료 게이트가 정본 1190 완료 재호출을 거부해야 합니다. 대조 epoch까지 올라온 뒤에만 정본 함수의 `completed=true,replayed=true`에 위임하고 완료 시각·Outbox 처리 시각을 유지합니다.
- `account-deletion-worker-orchestration.test.ts`는 `completion_ack_required`에서 보호 원문 재복원 또는 삭제 원장 대조 지연으로 완료 Port가 오류를 던지는 상황을 모의합니다. DB Finalizer·호스팅 Auth 재실행 없이 완료 상태를 보류하다가 차단 원인 해소 이후 ACK를 한 번 확정하고, 이미 `completed`이면 추가 부작용이 없음을 검사합니다.
- 단위시험의 차단 Port는 **운영에 연결되지 않은 모형**이며, S4 전체 기술·법무 인수 전 실제 Worker·1190 실행 함수 수정, 외부 원장 배포, 유료 원문 복원·삭제는 모두 HOLD입니다. 이미 완료된 작업에서 보호 원문 재노출 방지는 별도 read-side tombstone/fence가 독립적으로 보장해야 합니다.


## 20. 복원 원장 네트워크 장애·완료 ACK 응답 유실·Worker 소유권 (2026-10-20)

- 실제 오케스트레이터 `runClaimedAccountDeletionWorkerV1` 단위시험에서 외부 복원 원장의 조회가 실패하면 완료 ACK 포트가 예외를 던지고 기존 `completion_ack_required` 상태를 유지하도록 모의합니다. 조회가 회복된 다음 정본 1190 완료 거래는 **커밋했지만 네트워크 응답이 유실**된 상황을 재현하면 Worker 호출자는 즉시 성공을 추정하지 않고 오류를 반환해야 하며, 다음 재개는 DB에 저장된 `completed`를 읽어 완료 ACK·Auth 삭제·DB 최종화를 **재실행하지 않아야 합니다**.
- 별도 PostgreSQL 테스트에서 구백업 원문을 물리 파기하고 외부 tombstone/epoch 대조를 완료한 뒤에도, **다른 Worker 소유자**로 정본 완료 재호출을 하면 `account deletion completion replay state is inconsistent` 거부가 나와야 합니다. 올바른 소유자만 정본 1190 멱등 반환을 받아 Job/Outbox 완료 시간을 보존합니다.
- 둘 다 **실제 외부 원장 호출이나 운영 ACK 전환이 아닌 격리 계약**입니다. 원장 대조와 1190 승인 사이의 분산 원자성, lease 경쟁 및 이미 완료된 작업의 read-side 복원 차단은 기술·법무 인수와 운영 복구 설계에서 구현해야 합니다. 기존 User/Auth/Commerce 실서비스·Prod DB·삭제 Worker 구현은 이번 범위에서 바꾸지 않습니다.


## 21. 복원 원장 대조·완료 ACK 사이의 실제 트랜잭션 경합 (2026-10-20)

- 기존 시험 전용 `attempt_guarded_completion_ack_v1`은 삭제 원장 버전을 조회만 하고 바로 정본 1190에 위임하여 **조회 직후 복원 epoch 갱신**과 교차할 위험이 있었습니다. 이번에는 `recovery_fence singleton FOR UPDATE`를 **완료 전 확인부터 거래 종료까지** 보유하도록 격리 후보를 고쳤습니다. 보호 `bytea` 복원/변경도 같은 행을 선점하는 BEFORE INSERT/UPDATE 트리거를 추가했습니다. 원장 행 부재 시에는 실패합니다.
- 새 실 DB 2연결 시험은 **합성 completed Subject/Job/Outbox를 만들어 정본 1190 완료 재호출까지 성공한 첫 거래가 원장 행 잠금을 유지**하는 중에, 두 번째 거래의 `required_epoch` 증가와 구백업 `\\copy` 재주입이 모두 `lock_timeout`으로 차단되는지를 PostgreSQL 15·17에서 확인합니다. 첫 거래는 전체 ROLLBACK, 이후 원장 epoch 변경은 가능하되 미대조 상태의 완료 위임은 DENY해야 합니다. 읽기 재노출은 독립 tombstone과 serving fence가 계속 차단합니다.
- **운영 배포 전 남은 필수 조건:** 복원 작업자·외부 원장 소유자·완료 Worker가 동일한 분산 잠금/트랜잭션 프로토콜을 실제로 공유해야 합니다. 현재 시험 트리거는 격리 DB 백업 행 복원만 직렬화하며 외부 백업 시스템의 PITR 전체 교체, 실제 복원 프로세스의 서비스 비노출·원장 확정, 완료 ACK 후 복원 방지에 자동 적용되지 않습니다. 운영 함수·Worker·마이그레이션은 여전히 미변경, Privacy/Legal #2318까지 HOLD입니다.


## 22. 실제 복원 시스템·완료 Worker 공동 잠금 인계 계약 (2026-10-20)

**잠금 대상·소유:** 기존 PostgreSQL의 `official_reader_s4_ledger_fixture.recovery_fence`는 **격리 시험용 동일 DB 미러 행**이며 실제 백업 외부 Privacy Ledger 또는 PITR 전체 복원을 보호하지 않습니다. 운영 책임자는 개인정보 삭제 Owner, 실제 복원 Owner, 삭제 Worker의 합의된 **강한 일관성의 독립 fencing authority** 및 토큰 발급·검증 방식이 필요합니다. 최소 인계 식별자는 `subjectId / deletionTombstoneId / backupGeneration / restoreId / requiredEpoch / reconciledEpoch / fenceToken / writerLeaseOwner`이며, 로그인/Auth·원문·유료 결제 증빙이나 복원된 원문 자체를 외부 원장에 복제해서는 안 됩니다.

**역할별 순서:**

1. **복원 시작 Owner:** 서비스 노출을 먼저 차단(별도 read-side tombstone/fence), 독립 Authority에 `requiredEpoch` 단조 증가와 새 `restoreId/fenceToken`을 확정한 뒤에만 오래된 스냅샷 적재를 시작합니다. DB 복원으로 미러 잠금이 되살아날 수 있으므로 독립 원장 상태가 항상 우선합니다.
2. **복원 정리 Owner:** 구백업 보호 원문을 tombstone 범위로 재파기하고, 삭제된 Subject의 Reader 결속·원문 참조·Chat 자식까지 검증한 다음 같은 `restoreId/fenceToken` 아래 `reconciledEpoch >= requiredEpoch`를 확정합니다. 복원 세대가 바뀌었거나 토큰이 만료되면 실패 닫힘으로 다시 검사합니다.
3. **완료 Worker:** 실제 1190 완료 승인과 별도 외부 원장 점검이 **서로 다른 거래**임을 전제로, 인계된 `fenceToken/backupGeneration`이 여전히 현재인지 원자적 보호 구간에서 확인해야 합니다. 미확인·통신 실패·epoch 변경·보호 행 재생성 시 완료 ACK는 불가하며, DB Job/Outbox/Auth/lease 정본 검증을 절대로 대체하지 않습니다. 완료 응답 유실은 저장된 `completed`부터 재개하고, 복원 요청은 완료된 뒤에도 외부 read fence를 유지합니다.
4. **복원 후 조회 Owner:** 과거 유료 내용을 표시하기 직전에도 독립 삭제 tombstone·현재 세대를 확인하고 안전 마커만 보존합니다. **완료 승인 성공 ≠ 과거 백업 안전**이므로 조회 측 차단은 완료 Worker가 재실행되지 않아도 독립적으로 유지돼야 합니다.

**기술 인수 전 필수 장애 시험:** 복원 선점→완료 ACK 대기 후 거절, 완료 ACK 선점→복원 epoch 갱신 대기, 재복원·원장 유실·오래된 토큰·PITR 복구 후 미러 역행·Worker 임대 상실·응답 유실·동시에 두 복원 소유자 경합. 이 중 이번 격리 PostgreSQL 15·17은 **두 방향의 미러 행 잠금 경쟁**을 확인하고, 실제 외부 원장·PITR·KMS·분산 토큰의 강한 원자성은 검증하지 않습니다. PRIVACY/LEGAL #2318 기술 인수 전에 정본 SQL·실서비스 Worker·운영 복원 도구는 변경하지 않습니다.
