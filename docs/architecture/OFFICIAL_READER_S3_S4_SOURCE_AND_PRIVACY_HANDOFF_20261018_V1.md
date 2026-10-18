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
