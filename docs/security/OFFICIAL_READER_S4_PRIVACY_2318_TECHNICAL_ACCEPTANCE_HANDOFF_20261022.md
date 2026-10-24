# Official Reader S4 / Privacy #2318 — 기술·법률 인수 경계 및 DB·Reader 인계 (2026-10-22)

Watchtower-Track: security. **기존 공식 Reader S0–S8 로드맵의 S4 범위**이며 신규 Privacy 구현 트랙·제품 정책·보관 구조·승인 단계가 아니다.

- 기준 이슈: [Privacy #2318](https://github.com/gycha0109-beep/MyeongHa/issues/2318) (OPEN).
- **이미 승인된 제품 정책:** [P0-PR-02](../OFFICIAL_READER_S4_PRIVACY_POLICY_DECISION_V1.md), 2026-10-19, D1/D2/D3/D5/D6. D4는 신규 외부 원문 처리업체 **미도입 진술**이지 기존 외부 인프라 감사를 생략하거나 원문 외부 전송을 승인한 것이 아니다. **재승인 요청 없음.**
- [기존 공식 Reader 로드맵](../architecture/OFFICIAL_READER_PAID_CHAT_INTEGRATION_ROADMAP_20261012_V1.md), [P0-PR-01 기존 회원 삭제 정본](../operations/ACCOUNT_DELETION_FINALIZATION_POLICY_V1.json), [LEGAL-002 초안](../LEGAL_002_PRIVACY_POLICY_DRAFT_KO.md)은 변경하지 않는다.
- **인수 판단: SECURITY TECHNICAL HANDOFF RECORDED / DB+READER ACCEPTANCE PENDING / LEGAL PENDING / PUBLIC AND PAID STORAGE OFF.** 이 문서·CI·Draft 코드의 존재를 법률 또는 운영 승인으로 해석하지 않는다.

## 1. 이미 존재하는 차단과 아직 부족한 운영 증거

| 경계 | 현재 존재하는 코드·증거 | 아직 인수되지 않은 내용 |
| --- | --- | --- |
| T1 → 비공개 생성 → T2 | **main** `apps/api/src/official-reader-held-t1-t2-preflight-v1.ts`는 매 단계 재인가·권한 drift 실패 시 비공개 생성 본문 대신 `held` 또는 일반화된 오류만 반환. 관련 합성 테스트 존재 | callback의 로그·외부 AI 호출·임시 캐시·Outbox **부작용 자체**까지 차단했다는 증거가 아님. 이 HOLD를 유료 S5 최종 COMMIT 승인으로 간주 금지 |
| S2 환불·회수 권한 | [DB Draft #2301](https://github.com/gycha0109-beep/MyeongHa/pull/2301) S1 공동 잠금, 검증된 구매/회수 경로, S5 후보 및 관련 PostgreSQL 격리 시험 | 모든 실제 Writer/Provider 디스패처, 마지막 독립 유효 구매권/Bundle·Release 판정 및 환불–T2 경합의 **운영 원자성** 별도 수락 |
| S4 보호 저장 및 안전 마커 | #2301의 `official-reader-private-paid-answer-commit-v1.ts`, 보호 암호문 DB 후보와 안전 표시, `official-reader-node-offprimary-privacy-store-v1.ts` | 새로운 DB/FK/Subject 삭제 그래프의 최종 Owner 서명, FORCE RLS·역할 ACL과 **실행 환경의 분리·키 내구성**. 일반 `conversation_messages.body_text`, payload, Attempt, 로그, Outbox에 전문·부분·복원 가능한 요약 0의 실제 경로별 증거 |
| S6 비공개 재조회 | #2301의 `official-reader-private-paid-answer-reread-v1.ts`, `official-reader-private-privacy-ledger-v1.ts`, `official-reader-node-offprimary-privacy-read-v1.ts`는 현재 Grant/독립 삭제 원장·복원 epoch 조건의 실패 닫힘 후보 | 실제 Owner가 서명한 최신 독립 원장/키 파기·복원 증빙, S1 잠금 뒤 현행 Subject×Reading×Reader×Bundle×Release와 현재 Privacy Lease를 **모든 재조회/후속 질문**에 통합했다는 실증 |
| 회수 뒤 물리 파기 | #2301의 `2050`–`2100` SQL, `official-reader-private-revocation-purge-worker-v1.ts`, `run-official-reader-privacy-purge-worker.mjs`가 enqueue→임대→DB purge→키 폐기→원장 ACK를 후보로 구현 | 워커 운영 설정은 **registered-disabled**. 본 DB의 24시간 파기 **내부 목표**를 실제 사건 시각→비가역 삭제/키 폐기/실패 재시도로 입증하지 못함. 즉시 조회 차단과 24시간 물리 파기는 별도 기준 |
| 탈퇴 및 복원 | #2301의 `1990`, `2010`, `2030`, `2040`, `2080`, `2200`–`2240` SQL 및 `official-reader-private-restore-reconciliation-v1.ts` / 외부 tombstone 후보 | **P30D** 실 백업 복원, 독립 삭제 원장·복원 세대·키 tombstone 재적용 뒤 서비스 재개 전 비재노출, PITR/restore 경합·실제 DB 15/17 populated-row/RLS/ACL Owner 수락 없음. 코드의 `restoreCompletionApproved=false`, `ordinaryRestoreConsumersEnabled=false`를 강제로 변경 금지 |
| 기존 개인정보 정본 | P0-PR-01은 `destructiveRuntimeAuthorized=false`, `authoritativePrivacyReconciliation=false`, `drReady=false` | 보호 원문 신규 분류로 기존 삭제 그래프 fingerprint, Commerce **P5Y**, RR-03 출처 DELETE 계약을 자동 확장하거나 백업 **P30D**를 줄일 수 없음 |

위 구현 중 #2301은 **Draft·미병합**, 보호 저장/원격 제공/운영 DB 적용을 인수한 것이 아니다. 이 표는 코드 경로 확인 결과이며 실제 사용 중인 외부 처리업체·운영 배포 데이터 흐름의 실증이 아니다.

## 2. 보호 데이터가 유입될 수 있는 실제 경로별 차단 기준

| 실제 경로/데이터 | DB·권한 소유자에 대한 요구 | Reader·Chat·Security 소유자에 대한 요구 |
| --- | --- | --- |
| 최종 유료 본문/청크/임시 생성/재시도 | 최종 T2 이전 영속 저장 0, 커밋 후 보호 암호문·키 참조만 비공개; 정확한 original Grant·Saju Source·Reading×Reader·Bundle/Release·현재 Purchase 결속 | T1/T2 사이 API/stream/로그/일반 Chat/analytics/미승인 Provider로 출력 0; raw generator callback·trace sink 부작용 검사 |
| 일반 Chat `conversation_messages.body_text`·`message_payload_jsonb`, `chat_turn_attempts` | 유료 원문·발췌·복원 가능한 hash/Source Unit 불허. S5 안전 **SYSTEM 마커**의 진위 및 Turn/Message FK를 같은 거래로 검증 | 동일 회원×캐릭터 채팅방 유지, 환불 후 비민감 표시만 허용. 일반 History·Search에서 보호 원문 참조를 해독하지 않음 |
| Reader 최근 메시지 | `1280_reader_context_non_memory_runtime_authority.sql`의 `qry_reader_context_recent_messages_v1`가 일반 body_text를 읽음. 보호 원문이 이 컬럼에 존재하지 않아야 함 | `apps/api/src/postgres-reader-context-non-memory.ts`와 모델 context builder에서 보호 SYSTEM 마커를 본문/요약으로 확대하지 않음 |
| 장기 Memory·검색·요약/임베딩 | `1250_reader_context_memory_runtime_authority.sql` 및 `apps/api/src/postgres-reader-context-memory.ts`가 memory items / grant를 조회. 보호 원문/요약을 해당 저장소에 자동 생성 금지 | 원문·부분·재구성 가능한 파생물을 일반 Memory·embedding·search·summary·recommendation에 넣지 않음. 향후 별도 보호 검색이 있다면 매 조회 최신 Grant/Privacy Lease 후 모델 주입 |
| `ai_execution_logs`, Outbox, PostTurnAnalysis, 에러/관측, 큐·알림 | 원문·선택 출처/키·질문·PII가 DB와 이벤트 payload에 남지 않음을 실제 row와 restore 검사로 증명. 외부 로그 전송 인벤토리 | 예외 메시지·trace/span·도구 호출·프롬프트·시도 실패/재시도에서 유료 텍스트 제외. **원문 없는 일반 운영 로그 상한 90일**의 수집·보유·삭제 실제 설정 확인 |
| 환불·철회·만료·탈퇴 | 검증된 Entitlement 변경이 조회보다 우선; 마지막 같은 범위 유효 Grant 소멸 시 큐 등록/물리 삭제, sibling right 정확 재판정. Commerce P5Y 증빙과 원문 분리 | 현재 권한 상실 즉시 **새** 유료 원문 생성·조회·재전송·AI 재주입 0. 과거 ACK/캐시/재생 성공이 현행 권리 아님. 이미 사용자 단말에 전달된 사본 원격 회수는 주장하지 않음 |
| 백업·격리 복원 | 복원 시작부터 서비스 비노출, 독립 외부 tombstone/restore epoch 판정, 보호 원문/키·Reader child·일반 파생물 대조 후 승인 Owner만 재개 | 일반 Chat/Memory/Search/Summary/Reader History·모델 입력은 **복원 인수 완료 전 OFF**. `2200`/ `2230`의 `ordinary_memory`, `ordinary_memory_proposal`, `ordinary_life_fact`, `ordinary_chat_outbox` 잔존 시 owner-authorized disposition 이전 자동 정리/공개 금지 |

## 3. 기존 DB·권한 및 Reader에 전달하는 수락 증거

**DB·권한 Owner — #2301·#2318:** (1) 신규 보호 Schema/FK와 정확한 Subject 삭제 그래프 버전/처분/ACL 승인; (2) PostgreSQL **15/17 populated-row** cross-Subject/Reading/Reader 접근 0, 환불·만료·sibling Grant 두 방향 race, S5 T2 rollback/retry/부분 확정 0; (3) 같은 사건 기준 즉시 read deny와 24시간 본 DB 물리 파기·key destruction 및 작업 재시도/멱등성 별도 계측; (4) 외부 백업 독립 삭제/키 authority의 실제 저장·권한·장애·마운트/내구성 및 복원 전 epoch/tombstone 재대조, 최신 P30D 사후 권한 재노출 0; (5) 서비스 재개 전 미정리 Memory/Proposal/Life Fact/Outbox 처분을 기존 승인된 삭제 흐름으로 입증. 실패 시 공개 HOLD, 처리 대상 변경은 별도 기술 승인.

**Reader·Chat·Character/Memory Owner:** (1) 사용 중인 유료 Writer/History/Search/Context/Output/UI 경로의 **실제 호출 목록과 Source→Sink** 증빙; (2) 안전 마커 외 일반 메시지 유료 본문 0, 모델·장기 기억·검색/요약·Outbox/로그 자동 2차 유입 0; (3) 환불/권한 철회 직후 현재 S1+Grant/Privacy Lease 실패 시 새 응답·후속 프롬프트·재생 0; (4) 재열람 S6와 S7 전달 준비/클라이언트 ACK가 실제 사용자 수신과 동일하지 않음을 구분. 검증·권한 없는 보호 본문 전송을 승인하지 않음.

**Security 기존 소유 범위:** 외부 AI/API·로그·호스팅/스토리지·PG 등 **실제 원문 도달 경로**를 별도 사실관계로 조사, 목적·국가·보관·재사용·계약·데이터 경유 여부를 인수 자료로 제공. 사용자의 '신규 업체 없음' 진술을 모든 외부 인프라 부재로 확대하지 않음. 추가 외부 문의·서비스 호출·운영 개인정보 접근은 수행하지 않음.

## 4. 법률 최종 인수 — 아직 PENDING

[LEGAL-002](../LEGAL_002_PRIVACY_POLICY_DRAFT_KO.md)의 PRV-01~10과 P0-PR-02 기준으로 처리 목적/항목/근거, 민감정보·아동 처리, 제3자 제공 vs 위탁 vs 국외 이전 및 실제 리전·수탁자, 24시간 내부 파기 목표와 법정 삭제 의무의 분리, P5Y 결제 증빙의 적법한 범위, 90일 일반 로그의 내용·목적·삭제, P30D 백업 복구, 생성형 AI 고지·개인정보 권리 행사 UI/신원 검증·철회·환불/분쟁 고지를 **실제 배포 데이터 흐름과 문구**에 대조하고 법률 책임자가 별도 서명해야 한다. 초안·CI·기술 차단 성공을 법률 적합성 확정이라고 기록하지 않는다. 외부업체나 기관 문의는 수행하지 않았다.

## 5. 이관 결론 및 운영 불변

- **기술적으로 부분 해소:** 기존 Draft에는 접근 차단·보호 암호문·삭제 큐·복원 격리 **후보 코드**가 이미 있다. 본 인계는 누락되기 쉬운 경로와 수락 증거를 연결하지만 **실제 Privacy 기술 인수 PASS가 아니다**.
- **별도 기술 승인 필요:** 보호 테이블/키/복원 authority의 실운영 지배권 및 정확한 DB Role/ACL/FK·deletion graph; PG15/17 populated-row, 환불–조회/최종 T2/삭제/복원 동시성; 원문 없는 로그·Reader 모델 재주입 0의 서비스 경로 증명.
- **별도 법률 승인 필요:** P0-PR-02의 D6 및 LEGAL-002 PRV-01~10 처리방침·권리행사·수탁/국외 이전·민감/아동·소비자 고지 최종 서명.
- **변경 금지:** 기존 로드맵·제품 승인·P0-PR-01 P5Y/P30D·RR-03 기존 범위 무변경. 실 개인정보/DB migration/삭제/복원·새 보관 구조·외부 업체 문의·실결제/유료 Writer/Provider 전송/공개 없음. #2318 **OPEN**, #2301 **Draft**, S5/S6/S7·S8 HOLD.
