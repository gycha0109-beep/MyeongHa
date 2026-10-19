# 공식 Reader S3 출처 정합성 · S4 보호 본문 유출면 인계 v1

- 구분: 기존 `OFFICIAL_READER_PAID_CHAT_INTEGRATION_ROADMAP_20261012_V1.md`의 **S3 / S4**, 별도 승인 마일스톤 아님.
- 상태: **검증 후보 / 출시 금지 / 개인정보 보관 승인 전 / 운영 DB 적용 금지**.
- 기준: S2 Draft [#2301](https://github.com/gycha0109-beep/MyeongHa/pull/2301), 핵심 Reader 잠금 1740~1810. 신규 S3/S4 저장 테이블, 공개/결제 경로, S5 T2 커밋 없음.

## S3: 소유권과 사실성의 엄격한 분리

기존 `apps/api/src/saju-held-source-proof-verifier-v1.ts`는 서명/HMAC·nonce·응답/요청 hash의 **Preview 전송 무결성만** 검증한다. 반환값은 `sourceAuthority: NOT_EVALUATED`, `releaseAuthorization: NOT_EVALUATED`, `canPublish: false`, `canSell: false`이다. `saju-held-source-proof-revision-binding-v1.ts`와 `saju-held-multi-slot-source-proof-v1.ts`의 성공도 출처 진위/명리 의미/상업 공개를 승인하지 않는다. Preview `readingId`를 공식 DB Reading UUID와 동일시하지 않는다.

S3 내부 후보 검사 `apps/api/src/official-reader-s3-source-coverage-preflight-v1.ts`는 **이미 서버/DB가 허가한 공식 Reading 보호 Source**(`character-standard-reading-protected-context.ts`)로부터 다음을 검증한다.

1. 현재 공식 Reading 범위·원본 artifact hash·Saju domain 정합성. AI가 제출한 문자열만으로 출처를 믿지 않는다.
2. 선택 근거 + 동반 근거를 합했을 때 원본의 모든 sourceRef와 원문에서 독립 계산한 contentHash를 **정확히 한 번** 포함한다. 누락·다른 Reading·중복·변조 모두 거부.
3. 모든 원본 필수 Disclosure sourceRef/hash와 모호성 문자열 hash를 보존한다. 모호성 축소·고지 생략 금지.
4. Semantic/Output validation 결과의 필드 형식과 누락 여부를 점검하되, 임의로 작성 가능한 `passed` 필드의 **출처 및 서명 권한은 절대 신뢰하지 않는다**.
5. 구조가 완벽해도 결과는 **HELD, sourceAuthority NOT_EVALUATED, publicDisclosureAuthorized false**. 응답에 원문/해시/개인식별자를 반환하지 않는다. Saju 소유 계약이 없는 현재는 여기서 멈춘다.

**Saju Owner가 제공해야 하는 계약:** 공식 원본 Reading과 발급자/환경/유효 기간이 결속된 근거 Unit ID·내용 hash·선택/동반/공시/모호성 관계; 원본 계산·해석 trace와 버전; Saju 자체 서명/검증 API 및 오용 방지 nonce; Semantic/Output 검증 입력과 결과에 대한 원본/발급자 결속 증거; 위조·교차 Reading·중복·변조·누락에 대한 서명 수준 음성 시험. 기존 Preview HMAC를 재사용해 S3 공식 발급을 선언할 수 없다.

## S4: 실제 유료 원문 유출면과 Owner 승인 대기

| 실제 코드·DB 경로 | 현재 행동 / 위험 | 최종 S4 조치와 인수 조건 |
| --- | --- | --- |
| `apps/api/src/chat-turn-send-http.ts` 및 `seyeon-production-chat-execution-v1.ts` | 일반 Chat HTTP는 완료된 assistantText를 응답에 포함하고 일반 Chat Persistence `persistGenerated`, `persistValidated`, `commitTurn`을 사용 | 유료 해설 경로는 일반 Chat writer와 분리; T2 성공 전 스트리밍/본문 응답/중복 재전송 금지; 세연 일반 대화 변경 금지 |
| 기존 `cmd_commit_chat_turn_v1`, `conversation_messages.body_text` | 일반 대화의 본문이 영구 메시지 기록/재열람 대상. 그대로 유료 원문을 쓰면 환불 뒤 일반 기록으로 재노출 | 안전한 비민감 표시 마커와 별도 보호 본문을 Privacy 승인 후 도입. 현재는 **아예 유료 원문 저장 금지** |
| `supabase/migrations/1280_reader_context_non_memory_runtime_authority.sql` `qry_reader_context_recent_messages_v1` | `conversation_messages.body_text`를 읽어 Reader 최근 대화 맥락으로 공급, `apps/api/src/postgres-reader-context-non-memory.ts`도 이를 `text`로 전달 | 보호 유료 본문은 일반 메시지 본문에 존재하면 안 됨. 새 보호 본문을 컨텍스트에 주입하는 별도 Reader S6 권한 재검증 필수 |
| `apps/api/src/postgres-reader-context-memory.ts`, `1250_reader_context_memory_runtime_authority.sql` | Memory Items와 Grant를 통해 Reader 장기 기억을 다시 제공 | 유료 원문 파생 Memory/요약 자동생성 금지; 보호된 근거만 현재 권한 재검증 후 별도 로드. 환불·철회 후 모델 주입 0 |
| `seyeon-production-chat-execution-v1.ts` | `persistGenerated`, `persistValidated`, Outbox/PostTurnAnalysis, aiExecutionLog 경유 생성 결과의 2차 저장 위험 | 임시시도·검증 로그·Outbox·분석 큐·알림/관측까지 민감 본문 없는 안전 ID만 보관하는지 코드/DB 동시 감사 |
| `official-reader-held-t1-t2-preflight-v1.ts` | T1 허용 → DB 연결 없는 생성 → T2 재검사 전 내용을 버리고 HOLD만 반환 | 이 fail-closed 동작 유지. 향후 실제 T2는 S2 공동 잠금 뒤 S3 공식 서명·S4 승인 보호 본문을 **동일 거래**로 저장/연계 |
| RR-03/04 별도 과거 PR (#1960 / #1974) | 기존 출처 테이블·조회 후보는 공식 서명·현행 유료 권한·보호 본문 전부 보장하지 않는다 | 출처 재료와 보호 본문 분리; 권한 상실 후 재열람/모델 재주입 0, 삭제·복원 격리 및 감사 증거 필요 |

### 미승인 사항 / 소유자별 인계

- **Privacy Owner:** 보호 본문/임시 생성·시도·출처/지문/로그의 개인정보 분류, 보존·삭제·복원 비재노출, Memory/검색/요약/알림 경유 재파생 금지, 신규 테이블 승인. 기존 RR-03 승인 건수를 임의 변경하지 않는다.
- **Chat Owner:** 단일 회원×캐릭터 채팅방 유지, 안전 표시와 원문 조회 분리, 일반 Chat 과거 메시지 보존, 후속 질문 컨텍스트 차단 및 환불 뒤 조회 0.
- **Saju/Character Owner:** Saju 공식 계산과 Character 의미 보존/Output 검증을 독립 서명된 증거로 연결; Preview transport proof 승격 금지.
- **DB/Commerce Owner:** S2 모든 Writer의 잠금 순서와 운영 1400~1450 복구 인수, 실제 T2 동일 거래 원본/Grant/Product/Release/Source 검증; S5 전에는 미구현.
- **Legal/Release Owner:** 실제 사용자 전달 시점·환불/사용고지·유료 배포 심사를 S7/S8에서 별도 수행.

### 지금 구현/검증 가능하고 금지되는 것

S3 비공개 구조 검사는 위조·다른 Reading·고지/동반 근거 누락·hash 변조·중복·미검증 Semantic/Output 부정 시험을 추가한다. **서버가 직접 확인한 Saju Owner 출처 서명이 없으므로 성공은 수락이 아니라 HOLD**다. S4는 현재의 유출면을 명시하고 승인 전 실제 사용자 데이터 보관 테이블을 만들지 않는다. 따라서 S5 유료 답변 최종 저장/공개/기억/지급과 실제 결제·운영 DB 수정은 불가하다.


## S3 후속: 합성 서명 인계 검증 (정식 발행 아님)

- `apps/api/src/official-reader-s3-saju-owner-handoff-rehearsal-v1.ts`는 사주 소유팀의 **실제 발행 계약이 오기 전에** 인수 측의 위조·범위 교차·만료·재생 공격 대응을 합성 자료로 검증하는 비공개 코드를 제공한다.
- 서명 검증 입력은 `synthetic_rehearsal_only` 생애주기·별도 issuer/audience/keyId·별도 서명 HMAC 도메인과 키·한 번만 사용 가능한 nonce·만료 시각이다. **실제 운영 Saju 키나 Preview proof 키는 사용하지 않는다.** 현재 공식 DB 범위의 Subject, Reading, Reader, Bundle, Content Release, 원본 Artifact fingerprint, *정확한 후보 Unit 명세 digest*를 각각 고정한다.
- 기존 `official-reader-s3-source-coverage-preflight-v1.ts`에서 원본 소스의 선택·동반·고지·모호성 정합성에 실패하면 **서명이 형식상 맞아도 차단**한다. 검증 성공도 `held`·`sourceAuthority: NOT_EVALUATED`·`privacyApproval: NOT_EVALUATED`·유료 원문 공개 false이며 API/DB/기억/Outbox에는 연결하지 않는다. 실패·성공 응답 모두 후보/서명/원문/hash/개인식별자를 싣지 않는다.
- `apps/api/src/official-reader-s3-saju-owner-handoff-rehearsal-v1.test.ts`는 교차 회원·Reading·Bundle·Release·원본 hash·위조 서명·변조 근거·만료·중복 nonce·공용 nonce 저장소 장애와 Preview proof 승격을 거부한다.
- **Saju Owner 인계 시 별도 구현·재검토 필요:** 공식 제품 출처 Unit 계약과 실제 발행 API, 공식 승인 issuer·키 관리, Saju 계산/해석 trace 및 Semantic/Output 서명, Product/Revision 결속, 저장·삭제·복구 책임, 운영 환경 비밀 격리. 이 실험용 서명 포맷을 승인된 정식 API로 간주하거나 다른 소유 프로젝트에 강제하지 않는다.
- S4 Privacy의 신규 테이블/삭제/복원 승인 전에는 개인 민감 원문 저장·S5 T2·S6 재열람·S7 전달/공개를 일절 추가하지 않는다.


## 추가 인계: S3 전체 Scope 서명 결속 · S4 전송 객체 격리 (후속)

- S3 합성 서명 인계 검증에서 Subject·Official Reading·Reader·Bundle·Release·Artifact hash 이외에 **현재 Thread ID, Content Revision, Product ID, Product Spec Version, Saju Domain, Reading Contract Version, Product Rule Version, Approved Policy Revision**도 일치해야 한다. 증명 내용 전체를 별도 도메인 키로 다시 서명하더라도 현재 DB가 승인한 범위에서 하나라도 다르면 `blocked`. 같은 서명/nonce를 다른 Product·정책·채팅 Revision에 재사용할 수 없다. **실제 Saju Owner 발행 계약이라고 주장하지 않음.**
- S4 `apps/api/src/official-reader-held-t1-t2-preflight-v1.ts`의 비공개 생성 결과가 `Response`, `Request`, `ReadableStream`, `Blob`, `FormData`일 때 **새 T2 거래도 시작하기 전에 실패**시키고, 외부에는 민감 본문/생성 오류 없이 일반 `FINAL_DISCLOSURE_UNAVAILABLE`만 돌려준다. 그 밖의 결과도 기존처럼 결과/해시를 반환하거나 DB에 저장하지 않으며 T1 확정 후 생성·T2 신규 거래 구조를 보존한다.
- **한계:** 생성 콜백 자체가 외부 네트워크·로그·Outbox·Memory에 쓰는 부작용은 이 객체 검사만으로 식별할 수 없다. 승인된 Privacy Owner의 데이터 분류·삭제/복원/로그 감사, Saju Owner 공식 발행 및 S2 잠금 기반 T2 Writer는 **여전히 없음**. 따라서 이 조치를 S4 완료·유료 개인정보 격리 승인 또는 S5 저장 개시로 해석하면 안 된다.


## S4 보관·삭제·복원 계약 연결 — 현행 정책과 승인 경계

**기존 운영 근거를 정확히 구분:**

- `docs/operations/ACCOUNT_DELETION_FINALIZATION_POLICY_V1.json`의 P0-PR-01은 **2026-09-19 승인된 기존 회원 삭제 계획**이다. 현재 `destructiveRuntimeAuthorized: false`, `authoritativePrivacyReconciliation: false`, `drReady: false`이다. 기존 백업 주기 `P30D` 및 법적 회계 근거 목적 Commerce `P5Y` 보관은 새로운 유료 원문을 영구 보관해도 된다는 의미가 **아니다**.
- 기존 RR-03 Draft [#1960](https://github.com/gycha0109-beep/MyeongHa/pull/1960)에는 `official_reader_assistant_saju_provenance`라는 *출처 이력* 측면의 owner 승인 참조가 있으나, Draft 상태이고 `1720` 번호가 본선 Product migration과 충돌한다. 이 Draft의 출처 데이터·선행 Privacy 승인을 새로운 `유료 답변 원문`의 보관·개인정보 정책으로 승격하지 않는다.
- RR-04 Draft [#1974](https://github.com/gycha0109-beep/MyeongHa/pull/1974)는 RR-03 위의 내부 조회 후보만 제공하며, 실 유료 본문 재열람권/환불 후 차단을 운영에서 보장하는 S6 승인 계약이 아니다.
- `supabase/migrations/1540_saju_source_proof_nonce_claim_authority_v1.sql`의 DB nonce 기록은 **Preview transport proof 재사용 방지 전용**이다. S3 인수 합성 서명 replay key를 이 기존 테이블에 임의로 쓰거나, 이를 Saju 공식 발행권으로 간주하지 않는다.

**Privacy Owner가 신규 유료 본문을 위해 반드시 명시해야 할 사항:**

| 개인 데이터 계열 | 저장 경로(승인 전 없음) | 탈퇴/복원 정책 결론이 필요한 이유 |
| --- | --- | --- |
| 공식 유료 답변의 정확한 원문·내부 청크 | 일반 Chat `conversation_messages.body_text` 금지, 별도 보호 저장소 제안 | 원문 복호화 주체·삭제 순서·다른 사용자/Reader 교차 조회·환불 뒤 차단 |
| 임시 생성·Attempt·검증/모델 출력 | 기존 Chat Attempt/AI 실행 로그·메시지·Outbox에 원문 금지 | 실패·Retry·기록 보존과 삭제 누락 또는 백업을 통한 재노출 |
| Saju Unit·출처·서명·fingerprint | RR-03 sidecar와 신규 원문 자료를 분리 | 근거 원문 해시 및 추론 가능한 PII의 보관 분류, 원본 누락 시 실패 처리 |
| 요약·Memory·검색 색인·후속 질문 맥락 | 현재 세연 일반 Memory/Non-memory 파이프라인에 유료 원문 주입 금지 | 환불·회수 후 모델에 다시 들어가는 파생 콘텐츠 0 |
| 사용자가 보는 일반 Chat 안전 표시 | 민감 본문 대신 별도 권한 확인 후 표시되는 마커만 제안 | 기존 일반 대화는 보존하되 유료 원문은 후속 조회를 포함해 접근 차단 |
| 데이터베이스 백업·복원·삭제 복구 기록 | 현재 P30D 백업/복원·P0-PR-01과 새로운 삭제 그래프 계약 연결 필요 | 탈퇴 후 백업에서 복원돼도 보호 답변이 재노출되지 않음을 실 데이터로 증명 |

**S4 완료 조건과 DB 인수:** Privacy가 위 데이터 계열의 목적/법적 근거/보존 주기/DELETE·ANONYMIZE·RETAIN 분류/복원 뒤 비재노출 책임을 **명시적으로 승인**한 뒤 새 migration 번호와 전용 최소 권한/RLS FORCE를 결정한다. 또한 (1) 일반 Chat 본문 정상 보존, (2) 탈퇴 즉시 원문 조회 0, (3) 환불·Grant 회수 시 재조회·AI 재주입 0, (4) 복원 백업 데이터도 원문 재노출 0, (5) 시도·로그·Outbox·Memory 파생 데이터 누수 0을 PG15/17 실제 DB 및 Chat/Privacy E2E로 확인한다. 보호 원문 T2는 S3 공식 발행과 **동일 거래 S2 공동 잠금**까지 충족해야만 검토 가능하다.

**현재 코드 연결:** `official-reader-held-t1-t2-preflight-v1.ts`는 이제 반환값의 최상위뿐 아니라 중첩된 Response/Request/ReadableStream/Blob/FormData, Buffer, Error, Promise, callback, getter, 순환 참조, 무한 구조를 **T2 이전에** 실패 처리하고 결과를 폐기한다. 이는 민감한 전송 가능 객체의 직접 반출을 줄일 뿐 생성 콜백의 네트워크/로그/Memory 부작용은 차단하지 못한다. Privacy 승인 없이 생성 콜백을 실제 유료 운영에 연결하면 안 된다.


## Saju 공식 발행 실제 소스 확인

2026-10-19 확인: [Saju/main `src/reading/source-reading-proof-readiness.ts`](https://github.com/gycha0109-beep/Saju/blob/main/src/reading/source-reading-proof-readiness.ts)의 `SourceReadingProofReadinessV1`은 Source material의 `snapshotId`, `interpretationRunId`, `registrySnapshotId`, `executionId`, `preparationId`, `selectionId`, `profileRef`, `evidenceBundleHash`, `readingId`, `responseId`, `responseBodyHash`까지 내부 조회할 수 있으나, `proofAuthenticity: NOT_ATTESTED`, `productionInterpretationAuthority: NOT_EVALUATED`, `releaseAuthorization: NOT_EVALUATED`, `canSell: false`를 명시한다. `source_attestation_not_implemented`가 직접 차단 사유다.

[Saju/main `src/reading/source-reading-transport-proof.ts`](https://github.com/gycha0109-beep/Saju/blob/main/src/reading/source-reading-transport-proof.ts)의 서명 객체는 `lifecycle: 'preview'`, `sourceAuthority: NOT_EVALUATED`, `canPublish: false`, `canSell: false`다. 따라서 기존 Source Reading HMAC 서명과 S3 합성 Owner 인계 시험이 모두 통과해도 **공식 의미 증명·원본 발행자 확정·유료 해설 공개 허가의 증거는 아직 없다.**

Saju Owner가 제공할 정식 보완물은 **Preview와 별도**인 운영 원본 발급/검증 계약, 공식 Source material의 식별·해시/서명·nonce/기한/키 교체/발급 주체, 의미/Output 검증 trace의 원본 결속, 정상/불완전/위조/상실 부정 시험, Product/Reader/Release/정책 변경 시 사용금지 규칙이다. MyeongHa는 해당 계약을 제공받기 전까지 `sourceAuthority: NOT_EVALUATED`에서 긍정으로 전환하지 않는다.


## Owner 인계 추적 (2026-10-19)

- **S3 공식 출처 발행:** Saju [#2410](https://github.com/gycha0109-beep/Saju/issues/2410)에 현행 MyeongHa S3 후보·합성 서명 코드의 한계와 Owner source-attested execution/Production 발행/검증/Anti-replay 계약을 인계했다. 열린 이슈의 A/B/C를 충족하기 전까지 Preview proof·합성 rehearsal을 공식 승인으로 승격하지 않는다.
- **S4 보호 원문 개인정보:** MyeongHa [#2318](https://github.com/gycha0109-beep/MyeongHa/issues/2318)에 유료 원문·임시 결과·증명·로그·Memory/검색/알림 파생 자료별 처리 목적, 보존·삭제/복원 및 PostgreSQL 15/17·환불 후 미노출 승인 조건을 분리해 등록했다. P0-PR-01 및 RR-03 Draft의 기존 승인 범위를 넓히지 않는다.
- **S5/T2:** 위 두 Owner 계약과 DB/Commerce S2 공통 잠금 인수를 모두 통과하기 전까지 유료 답변 최종 저장·일반 메시지 본문·공개·결제 활성화 금지. 이 기록은 승인이나 운영 적용이 아니다.


## S3 실제 공식 Reading Source와 근거 후보 비교 연결 (2026-10-19)

- `apps/api/src/official-reader-s3-authoritative-artifact-coverage-v1.ts`는 인가된 내부 `CharacterStandardReadingKnowledgeSourceV1`(실제 DB Resolver 결과만 전제)을 S3 Coverage 검사와 연결하는 비공개 어댑터다. 기존처럼 **클라이언트/모델이 전달한 근거 원본이나 외부 `protectedSegments` 객체**를 소유 근거로 채택하지 않는다.
- Source의 Subject, Reading, Reader, Bundle, Product, Product Spec, Saju Domain, Reading Contract, Official Artifact Response Hash를 현재 내부 Reader Admission Scope와 일치시킨 뒤 `projectOfficialStandardReadingToProtectedCharacterSajuContextV1`을 통해 저장된 `ProductReadingResponse v2` 자체에서 원문/고지/모호성을 추출·해시한다. `delivered_with_fallback` 등 partial Reading을 정식 완전 근거로 승격하지 않는다.
- 추출된 전체 선택/동반/Disclosure/ambiguity ref·hash를 `preflightOfficialReaderS3SourceCoverageV1`에 넘기며 반환은 오직 `held` 또는 `blocked`, Source/Semantic/Output `NOT_EVALUATED`, 유료 생성/공개/판매 false다. 원문·회원 ID·Reading ID·fingerprint는 결과에 포함하지 않는다. 별도 현실 Source → 서명 검증·발급 경계는 아직 없는 상태다.
- 신규 시험은 실제 `ProductReadingResponse v2` 구조로 회원·Reader·Bundle·Product/Spec·Domain·Contract·Reading·원본 hash 불일치와 필수 Disclosure/동반/ambiguity 누락, 보호 원문 변조, partial Reading, 비정상 원본을 부정한다.
- **전제조건/한계:** `source`는 기존 `resolveCharacterStandardReadingArtifactAfterAccessV1` 등 실제 서버 DB 권한 절차가 발급한 자료여야 한다. 일반 브라우저가 보낸 동일 타입 JSON을 안전하다고 판단할 수 없다. 이 어댑터는 서명자 진위·사주 계산 사실성·Semantic Guard·Privacy 승인·S2 유료 답변 T2 원자 저장을 제공하지 않는다. Saju [#2410](https://github.com/gycha0109-beep/Saju/issues/2410)과 Privacy [#2318](https://github.com/gycha0109-beep/MyeongHa/issues/2318)의 선행 승인 경로를 계속 유지한다.


## S3 실제 Saju Preview 서명 ↔ 공식 DB 원문 일치 검증

- `apps/api/src/official-reader-s3-signed-source-artifact-reconciliation-v1.ts`는 [Saju의 기존 서버 전용 Preview 발급기](https://github.com/gycha0109-beep/Saju/blob/main/src/host/source-reading-proof-issuer-http.ts)가 실제 발급한 서명 응답과 DB가 허가한 공식 Reading v2 원본의 내용이 **동일한지** 비교하는 비공개 소비자 연결이다. 인증된 Saju Preview 응답이라고 해도 공식 DB 응답과 다른 실행·다른 해설이면 차단한다.
- 먼저 현행 Reader Admission Scope와 DB Source의 Subject/Reading/Reader/Bundle/Product/Spec/Domain/Contract/원본 hash 및 Source Unit·Disclosure·모호성 누락을 기존 `preflightOfficialReaderS3FromAdmittedArtifactV1`로 검사한다.
- 그다음 기존 `verifySajuHeldSourceProofV1`로 *실제 Saju* Preview 서명, issuer/audience/key, 요청 정규화 hash, 응답 본문 hash, nonce TTL, **다중 인스턴스 공유 DB nonce 원자 claim**을 검증한다. 검증한 signed `verifiedSource.readingId`와 응답의 canonical hash를 DB에 저장된 *정확한* v2 snapshot에서 독립 계산한 hash에 비교한다. 서명이 맞더라도 DB 원문과 다르면 `blocked`로 끝난다.
- **승인 범위를 넘지 않음:** 본 코드는 서버 인가 원본과 Preview signed transport의 바이트 수준 일치만 증명하며, Saju Production 실행 의미/발행자 공식 Source Authority를 증명하지 않는다. 결과는 `held` 또는 `blocked`이며 `sourceAuthority/semanticAuthority/outputAuthority/privacyApproval: NOT_EVALUATED`, `canPublish/canSell: false`; 회원/Reading/원문/증명/해시를 반환하지 않는다. 브라우저 HTTP, DB 보호 원문 저장, 메모리/Outbox와 연결하지 않는다.
- 실제 Saju Owner [#2410](https://github.com/gycha0109-beep/Saju/issues/2410)의 공식 **Production Source attestation**과 Privacy [#2318](https://github.com/gycha0109-beep/MyeongHa/issues/2318)의 유료 원문 분류·보존·삭제·복원 승인 이후 별도 발행·저장 계약이 필요하다. 이 Preview 비교를 S3 공식 발행 완료, S4 승인 또는 S5 T2 저장 권한으로 전환하는 것을 금지한다.


## S3 원문 불일치 시 Preview nonce 무소모 차단

- `official-reader-s3-signed-source-artifact-reconciliation-v1.ts`는 서명 검증 전에 **아직 신뢰하지 않는 Saju 응답 원문**과 DB 승인 공식 Reading 원문이 동일한지를 deterministic canonical hash와 Reading ID로 먼저 대조한다. 내용이 다르면 **공용 PostgreSQL nonce replay ledger를 소모하지 않고** `blocked`를 반환한다.
- 이 사전 비교를 서명이나 권한으로 신뢰하지 않는다. 원문이 일치하는 경우에만 기존 `verifySajuHeldSourceProofV1`의 서명·issuer/audience/key·nonce/TTL·요청 해시·응답 해시·공유 DB nonce 원자 claim을 계속 필수 실행한다.
- 서로 다른 원문을 가진 실제 형식의 signed Preview가 먼저 도착해도 nonce를 소모하지 않고, 이후 올바른 원문이 도착하면 같은 nonce로 단 한 번만 HELD될 수 있는 공격/회복 시험을 추가했다. 결과는 여전히 `sourceAuthority: NOT_EVALUATED`, Privacy 미승인, 유료 공개/저장 OFF다.
- `saju-held-source-proof-verifier-v1.ts`의 실제 PostgreSQL nonce claim 식별자도 종전 `issuer:audience:nonce` 결합 대신 **도메인 버전+정규화 tuple(issuer, audience, keyId, nonce)의 SHA-256**으로 구성한다. `:`을 포함하는 issuer/audience 분리 위치가 달라도 같은 key로 충돌하지 않고, 키 교체 시 replay namespace가 별개다. 이 수정은 운영 발행 권한을 추가하지 않는다.


## S4 신규 개인정보·법률 검토안 — 2026-10-19

- [S4 개인정보 처리·법률/보존/삭제 신규 승인 제안서](OFFICIAL_READER_S4_PRIVACY_LEGAL_POLICY_APPROVAL_PROPOSAL_20261019_V1.md)를 **승인 대기(PROPOSED)** 문서로 첨부합니다. 기존 P0-PR-01 Commerce P5Y·계정 삭제 P30D 및 [RR-03 #1884 승인](https://github.com/gycha0109-beep/MyeongHa/issues/1884#issuecomment-6103479019)은 재승인하지 않으며 **새 유료 원문·임시결과·로그·파생물만** 새 Privacy/Legal 대상으로 분리합니다.
- 국내 2026-10-19 시행 개인정보보호법·전자상거래법·인공지능기본법 및 개인정보위 안내서를 근거로 한 **법률 검토 초안**이며 법률 자문/Privacy Owner 승인 아님. 계약·수탁자·국외 이전·민감정보·14세 미만 정책, 새 보존기간/삭제 SLA, 보호 원문 RLS/FK/backup 재조정 증명 미확정. S4 구현·운영 배포·S5 protected body·public reveal HOLD 유지.
