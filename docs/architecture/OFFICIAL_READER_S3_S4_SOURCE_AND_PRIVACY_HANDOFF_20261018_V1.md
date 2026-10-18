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
