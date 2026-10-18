# 세연 G0 — 동의 취소·재승인·파생 Context·Reveal 보안 계약 후보 v1

Watchtower-Track: security

> **상태: PROPOSED / SECURITY-SAFE DEFAULT 검증 중.**
> 본 문서는 S2 개발/검증에 적용할 **거부 우선 기본 계약**을 명시한다. Security, DB Authority, Character의 공동 승인 및 운영 서비스의 동시 트랜잭션/HTTP 연결 증거가 없으므로 **G0 APPROVED, G2/G3 PASS, public/paid ON으로 표시하지 않는다**.
> 기준: [AI 보안 로드맵 v2](../operations/SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V2_20261016.md), [G0~G6 원장](SEYEON_AI_SECURITY_COMPLETION_GATES_V1.md), [#1843](https://github.com/gycha0109-beep/MyeongHa/issues/1843), [#1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866).

> **2026-10-18 Product Owner 선택 승인:** 기억 저장/캐릭터별 공유는 사용자 선택권 유지, 철회 후 새로운 사용·미송출 공개 차단, 이미 실제 송출된 바이트 회수 불가, 과거 대화 보존과 개인기억 재사용·재공개/삭제를 분리하는 제품 방향은 [결정문](SEYEON_PRODUCT_OWNER_MEMORY_REVOKE_HISTORY_DECISION_20261018.md)으로 승인되었습니다. **이 문서의 G0-D1~D5 기술 계약 및 Security/DB/Character/API Owner 서명은 여전히 미완료**이며 G0 상태는 PROPOSED, 양수 개인기록 Reveal은 HOLD입니다.

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
