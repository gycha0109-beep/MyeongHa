# 세연 G0 — 동의 취소·재승인·파생 Context·Reveal 보안 계약 후보 v1

Watchtower-Track: security

> **상태: PROPOSED / SECURITY-SAFE DEFAULT 검증 중.**
> 본 문서는 S2 개발/검증에 적용할 **거부 우선 기본 계약**을 명시한다. Security, DB Authority, Character의 공동 승인 및 운영 서비스의 동시 트랜잭션/HTTP 연결 증거가 없으므로 **G0 APPROVED, G2/G3 PASS, public/paid ON으로 표시하지 않는다**.
> 기준: [AI 보안 실행 로드맵 v3](SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V3_20261107.md), [G0~G6 원장](SEYEON_AI_SECURITY_COMPLETION_GATES_V1.md), [#1843](https://github.com/gycha0109-beep/MyeongHa/issues/1843), [#1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866).

> **2026-10-18 Product Owner 선택 승인:** 기억 저장/캐릭터별 공유는 사용자 선택권 유지, 철회 후 새로운 사용·미송출 공개 차단, 이미 실제 송출된 바이트 회수 불가, 과거 대화 보존과 개인기억 재사용·재공개/삭제를 분리하는 제품 방향은 [결정문](SEYEON_PRODUCT_OWNER_MEMORY_REVOKE_HISTORY_DECISION_20261018.md)으로 승인되었습니다. **이 문서의 G0-D1~D5 기술 계약 및 Security/DB/Character/API Owner 서명은 여전히 미완료**이며 G0 상태는 PROPOSED, 양수 개인기록 Reveal은 HOLD입니다.

## S0 실행 범위 기술 계약 — v3 기준 보완 제안 (2026-11-07)

> **판정: G0 S0 기술 계약 초안 / 사용자 기술 확정 대기.** 아래는 [현재 실행 로드맵 v3](SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V3_20261107.md)의 S0에만 적용할 검토 대상입니다. 기존 S2·과거 대화·Replay 전체 범위의 승인이나 G0 PASS가 아닙니다. 단일 개발 프로젝트의 최종 내부 승인권자는 사용자 1인이며, 아래 D1~D5를 별도 조직·담당자에게 회람하거나 서명을 요구하지 않습니다. 본 초안 병합은 운영 DB/ACL/Role/Secret 설치·출처 활성화·유료 Provider 호출·트래픽 배포 승인이 아닙니다.

**입력·출력 경계:** 현재 인증 Member의 단일 Thread/Turn/Attempt에서 승인된 **원본 `memory / conversation_recall / v1` 1건**과 **그 요청의 원본 User 메시지 1건**만 사용해 최초 비스트리밍 응답 1회 생성. User 메시지는 별도 장기 Memory 또는 새 Grant가 아닙니다. 다중 Memory, Life Fact, 과거 User/Assistant 본문, Relationship, Reader, History, Replay, 재생성, 후속 Worker 재공개, Streaming 및 0건 우회는 S0에서 **OUT_OF_SCOPE + FAIL_CLOSED**입니다. 제외된 출처가 실제 모델 입력에 섞이면 전체 요청을 HOLD하며 일부만 제거해 진행하지 않습니다.

| G0 기술 결정 | 이번 S0에서 확인할 정확한 규칙 | 완료를 증명할 자료 / 남은 판정 |
| --- | --- | --- |
| **D1 원본 사용 권한·재동의** | 서버가 Subject/Character/Thread/Turn/Attempt, 원본 Record ID·Grant ID·type/schema, 원본 DB digest·투영 digest·최종 모델 선택 집합, DB에 저장된 현재 User 메시지 ID·본문 digest를 **Provider 전에 하나의 불변 Attempt Pin**으로 결속. 철회/변경된 기존 Grant는 재동의 뒤에도 재사용 금지; 새 Grant라면 새 Attempt. | 기존 `16-g1-model-recent-source-pin.sql` → `17-g1-positive-combined-model-source-pin.sql`, 원본 Pin/Commit 코드와 정확한 DB 설치·권한·양수 Pin 실행 증거 필요. |
| **D2 Commit·최초 공개 경계** | G2는 정확한 원본 Grant/Record와 현재 상태·digest를 잠근 **같은 DB 트랜잭션**에서만 Commit. G3는 권한 재검사 후 정확한 최초 JSON 응답에 결속된 256-bit 수신 증명의 해시 및 issuance를 **먼저 DB 확정**하고, 그 뒤에만 비스트리밍 HTTP 본문을 반환. DB Commit 실패·불명·철회 선행은 보호 본문 공개 0바이트. | 동일 원본 G1 Pin → G2 Commit → G3 issuer/실제 Cloudflare Worker 송출·receipt/ACK, 독립 PG 세션에서 revoke 경쟁 검증. Node/Fetch 생성 사실만으로 실제 네트워크 전달 PASS 금지. |
| **D3 파생·이력 차단** | 현재 User 메시지 외의 과거 Assistant/User 텍스트·관계·Reader·인용/캐시·재생 본문은 S0 모델 입력과 공개 경로 모두 제외. 파생 출처가 확인되지 않으면 `NO_PERSONAL`로 간주하거나 모델을 호출하지 않음. | 기존 입력 선택·최종 모델 Context seal·History/Replay HOLD 확인. 광범위한 파생 lineage 구현은 **S0 종료 선행 작업이 아님**. |
| **D4 철회 완료의 의미** | 미확정 수신(issued but not received)이면 철회 의도를 기록하고 새 사용을 즉시 차단하되 **HTTP 202 pending**; 완료 ACK가 아님. 정확한 응답 전체 수신에 결속된 증명으로 원본 Attempt의 receipt가 확인되고 나서 철회 확정하면 **HTTP 200 committed**. 이미 송출된 바이트 회수 약속 금지. 응답/receipt 영구 유실 시 철회가 pending 상태로 남을 수 있으며 timeout을 완료로 취급하지 않음. | [기존 S0 수신 장벽 계약](SEYEON_S0_HTTP_RECEIPT_BARRIER_V1_20261025.md) 재사용. 다른 Grant·Attempt의 ACK, 불명확한 COMMIT, HTTP/Worker 장애·취소 경쟁을 실제 대상으로 확인해야 함. |
| **D5 재시도·정산 분리** | receipt 증명은 **원본 수신 확인만 허가**하며 새 출처 사용·모델 호출·Replay·철회 생성 권한이 아님. ACK 중복/유실 및 Commerce 장애로 기존 수신 확정을 되돌리거나 정산 성공을 추정하지 않음. 일반 고객은 원본 G1 Pin 이후 모델 전에 크레딧 예약, 실제 receipt 이후에만 멱등 정산. | 기존 G4/G5 전용 Commerce 연결 및 receipt 정산 재사용; 실제 별도 LOGIN/Hyperdrive/권한과 실패 복구 증거 필요. |

**현행 설치 격차(읽기 전용 증거, 활성화 아님):** 운영 DB에 원본 양수 Memory Pin·Commit·issuer·receipt/철회 함수는 존재하지만, 결합 Pin 전제인 `seyeon_recent_source_pin_jsonb` 컬럼과 위 `16`·`17`의 private 함수는 미설치로 확인되었습니다. 정확한 Source Registry 행은 등록돼 있으나 `enabled=false, writable_enabled=false`. G5 Commerce 전용 LOGIN/Hyperdrive도 미구성입니다. `positiveMemoryFirstReplyApproved=false`, `creditBilling.productionMounted=false`, `HOLD_FORWARD_STOPPED`를 유지합니다. 변경 전 [증거 원장 #1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866)의 최신 운영 대조를 다시 사용합니다.

**종료 판정 분리:** D1~D5의 기술 선택을 사용자가 명시적으로 확정해야만 G0 계약 승인 후보를 닫을 수 있습니다. **그 기술 승인조차 G1 운영 SQL 적용이나 일반 유료/공개 서비스의 실행 승인은 아닙니다.** G1/G4/G2/G3의 실제 환경 동작, G5 동일 Scope 통합 검증, G6 제한 smoke·복구·운영 승인 증거는 각각 별도로 완료해야 합니다. 기술 계약 미승인 또는 증거 부족 시 G0~G6는 HOLD이며 `ROADMAP_COMPLETE` 선언 금지입니다.

---

## 1. 누가 무엇을 사용할 수 있는가

| 범위 | 권한의 근거 | 취소/변경 시 개발 기본값 | 승인되지 않은 우회 |
| --- | --- | --- | --- |
| 개인 Memory/Life Fact | DB에서 조회한 **exact** `subjectId, characterId, recordKind, recordId, grantId, recordType, schemaVersion` 및 원본/투영 digest. 서버 모델 최종 사용 집합을 Attempt에 먼저 불변 저장 | 현재 Grant/Record 또는 Pin이 변경되면 해당 Attempt의 개인기록 사용/Commit/공개 HOLD | 유저 프롬프트, 모델 설명, `sourceRef` 텍스트, 같은 Record의 다른 Grant ID |
| 새 동의 Grant 발급 | **새 독립 Grant ID**와 새 입력·Attempt에 대한 별도 서버 인가 | 옛 Grant로 생성된 내용의 Commit/Reveal/replay를 새 Grant로 자동 허가하지 않음 | Grant 교체로 과거 Attempt 소급 재활성화 |
| Record 취소·내용 변경·Supersede | 원본 Record ID와 상태, `recordType/schemaVersion/rawDigest` | 같던 Grant ID라도 원본 내용·스키마가 바뀌면 HOLD. 변경 후 새 Attempt로 재실행 필요 | 의미상 비슷한 요약이나 동일한 표시용 이름으로 매칭 |
| 이전 AI 답변·사용자 메시지·Relationship Event·Reader 지식 | 출처가 연쇄적으로 추적되는 별도 Derived Source lineage 및 현재 권한 | provenance 결속이 없는 파생/과거 Context가 참조되면 자동 NO_PERSONAL 판정 금지, HOLD | 검색 기록/과거 요약/재생 텍스트를 권한 없는 재학습·공개 근거로 사용 |
| 0건 Context | 정확한 최종 모델 집합과 Projector 후보/승인 관측 모두 일치하는 서버 생성 0건 증명 | 누락·비배열·잔류 양수 후보·미확인 과거 유래는 HOLD. 단순 `retrievedMemories=[]`만으로 공개 권한이 생기지 않음 | 0건 표식만 보고 G2/G3 권한 통과 |

실 DB에서 활성 Grant 목록을 조회했다는 사실은 **그 시점만의 증거**다. 데이터베이스 오류, 역할 분리 실패, 다른 사용자의 Context 혼입, 중복·모호한 Grant 모두 HOLD한다.

## 2. 시간 경계(Linearization) — 승인 후보

| 시점 | 필수 동작 | Revoke/재승인 경쟁 시 |
| --- | --- | --- |
| **Pre-Model** | 최종 모델 입력의 exact personal/derived lineage를 서버가 확인하고 원본 DB에 Attempt 단위 불변 Pin을 **먼저 커밋**. 불명 출처면 Provider 호출 0회 | Pin 이전 동의 취소면 생성 중단. 조회 시점 Grant만으로 이후 단계를 허용하지 않음 |
| **Atomic Commit** | 실제 `cmd_commit_seyeon_chat_turn_runtime_v2`와 **동일 트랜잭션**에서 해당 Grant/Record를 잠근 채 현재 상태 및 digest 재검증하고 Commit | Revoke가 먼저 확정되면 Commit HOLD. Commit 잠금이 먼저 확보되면 Revoke는 그 잠금 이후 처리; 분리 SELECT 허용 안 함 |
| **Controlled Reveal** | HTTP 최초 응답과 `committed_replay`마다 현재 Grant/Record와 모든 파생 출처를 별도로 검증. 권한 결정과 반환 바이트 간 취소 경합 선형화 필요 | 유효한 현재 동의만으로 과거의 취소 Grant가 부활하지 않음. 불명/취소 시 Unauthorized 응답 내용 **0바이트** |
| **Streaming** | 개인기록 기반 응답은 초기 정책으로 **비스트리밍(OFF) 제안**. 이미 전송된 바이트는 회수 불가하므로 streaming 무제한 승인 금지 | 전송 시점 선형화(락·토큰/epoch 등)는 DB+API Owner가 승인할 때까지 HOLD |
| **Worker / 재시도** | 백그라운드 요약, 관계 반영, 캐시, 재실행에서도 별도 현재 Grant 확인. Model/output 문자열을 DB 권한 증거로 사용 금지 | Retry/replay가 기존 Grant를 복원하지 않도록 독립적으로 판정 |

## 3. 이번 PR에서 실제 검증하는 범위 (S2-A)

- 기존 **Shadow-only** `evaluateSeyeonPersonalRecordPublicationShadowV1` 에서 서버가 이전에 만든 `personalRecordProjectionCandidates`의 **exact ID, projection digest**를 검증하고, 현재 DB Read에서 `recordType/schemaVersion/rawDigest`를 다시 산출해 동일성 검증.
- **Grant 취소** → 원래 Grant가 없으면 양수 결과는 HOLD. **같은 Record에 새 Grant** → 기존 Grant를 구제하지 않음. **중복 현재 Grant/Record** → 모호해서 HOLD.
- 동일 Grant의 Record payload/schema가 바뀌면 **`CHANGED_RECORD_CONTENT` HOLD**. 이전 AI/사용자 메시지나 관계 유래가 있고 이를 원본 Grant로 연결할 수 없다면 **`UNVERIFIABLE_DERIVED_CONTEXT` HOLD**.
- 원본에 후보가 있거나 ADMITTED가 남았지만 호출 측이 `retrievedMemories=[]`로 속이는 모순이 있다면 `NO_PERSONAL_RECORDS`를 절대 부여하지 않는다. 합법적 실제 0건에서는 **추가 원자 검증에만 적격**으로 표시할 수 있으며, `permitsPublication=false`는 항상 불변.
- 합성 테스트는 **before_commit / before_reveal** 양쪽 시점에서 실행한다. 모델/API 유료 호출, Production DB 쓰기 없이 완료한다.
- 이 Shadow 검사는 **원자적으로 Commit을 승인하지 않고 HTTP 응답을 공개하지 않는다.** 반드시 S3(G1), S4(G2), S5(G3)의 DB/HTTP 실제 경로가 후속으로 필요하다.

## 4. G0 공동 승인 전 미해결 설계 결정

| 결정 번호 | 후보 기본값 | 최종 확정권자 / 필요한 증거 |
| --- | --- | --- |
| G0-D1 | **exact Grant ID**, Record content digest, Character+Subject+Thread+Attempt 결속. 동일 기록 재승인도 새 Attempt 요구 | DB/Security/Character — 원본 DB Pin 스키마 및 모델 최종 집합 검증 |
| G0-D2 | 모든 개인기록 기반 공개와 재생 전에 현재 원래 Grant ID를 검증. 파생 출처 확인 실패 시 HOLD | API/DB/Security — HTTP 최초 공개+재생, 이중 PG 세션 revoke 경쟁 |
| G0-D3 | 과거 Assistant/User 텍스트·Relationship Event·Reader Knowledge는 모델 원문 직접 Memory만으로 출처 확인하지 않음. provenance 없는 것 HOLD | Character/Reader/Security — 어떤 파생 자료에 어떤 lineage를 붙일지, 기존 메시지 소급 처리 |
| G0-D4 | 개인정보 기반 응답의 Streaming OFF | Product/API/Security — 응답 공개의 최종 취소 선형화와 취소 완료 응답 규약 |
| G0-D5 | 취소 이후 캐시·Worker·재시도·사용량 정산에서 AI 공개로 다시 이어지는 경로 분리 | Character/DB/API — 삭제·취소/Worker 우회·비용 재시도·크래시 테스트 |

## 5. 승인 및 종료 판정

- 본 후보 **구현·테스트**는 `S2-A_SHADOW_VERIFIED`라고 보고 가능하지만, **G0 APPROVED**나 실제 유저 응답의 `G3 PASS`는 아니다.
- G0 승인에는 각 결정의 Owner, 선택된 규칙, 버전, 개발·테스트 증거, 정책 변경에 대한 명시적 승인 기록이 필요하다.
- S3 → S4 → S5 → S6 → S7 순으로 DB Pin/동시 잠금/최초 공개 및 과거 Replay 우회가 실제 서비스 코드에서 0건 재현된 후 G5를 판정한다.
- `SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1=[]`, 공개 Route OFF, 운영 DB 1520–1720 21개 미적용, `authorizedForProduction=false`, `drReady=false`, paid/public OFF, Production writes=0 유지.
