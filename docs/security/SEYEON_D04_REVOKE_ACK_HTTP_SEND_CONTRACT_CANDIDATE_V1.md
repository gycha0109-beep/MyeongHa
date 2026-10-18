# 세연 D-04 — 동의 철회 ACK / 최초 HTTP 송출 기술 계약 후보 v1 (R9)

Watchtower-Track: security

> **PROPOSED — Security / API / DB Authority 기술 서명 전 미승인.**
>
> 상위 제품 결정: [2026-10-18 Product Owner 승인](SEYEON_PRODUCT_OWNER_MEMORY_REVOKE_HISTORY_DECISION_20261018.md)
>
> 연계: [G0 후보](SEYEON_G0_REVOKE_REGRANT_REVEAL_POLICY_CANDIDATE_V1.md), [G0~G6 완료 계약](SEYEON_AI_SECURITY_COMPLETION_GATES_V1.md), [보안 로드맵](../operations/SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V2_20261016.md), [원장 #1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866).

## 1. 용어와 오해하면 안 되는 지점

| 기호 | 뜻 | 주의 |
| --- | --- | --- |
| P | 정확한 original Record/Grant+파생 출처가 **실제 모델에 포함되기 전에** DB에 불변 Pin | 로그인이나 이전 DB 조회만으로 권한이 생기지 않는다 |
| C | 같은 DB 트랜잭션에서 original Record/Grant 재확인·잠금 후 답변 Commit | Commit은 HTTP 송출 허가가 아니다 |
| V | HTTP 최초 공개/Replay/History/Worker **각 공개 시점**의 현재 original Grant/Record/lineage 승인 | 오래된 캐시/재발급된 다른 Grant는 인정하지 않는다 |
| R | 사용자의 original Grant 철회 DB Commit | R 직후에도 HTTP 버퍼에는 예전 응답이 남을 수 있다 |
| S | 답변 바이트를 신뢰 가능한 **실제 HTTP 송신 경계에 인계**한 사건 | \`new Response\`, \`Response.json\`, DB READ COMMIT은 S가 아니다. Node/Proxy/Edge 경계 구분 필요 |
| ACK | 서버가 철회 완료를 사용자에게 확인해 준 사건 | ACK가 R보다 빠르면 안 되며, 송신자가 아직 가지고 있는 미송출 응답도 고려해야 한다 |

제품 승인에 따른 목표: **철회 확정 이후 새로운 개인기억 사용·새 공개 차단, 처리 중 생성/송출 중단 시도, 이미 실제 송출한 바이트의 사후 도착 가능성은 명시**. 여기서 이미 송출했는지 아닌지는 추측이 아니라 송신 경계의 증거로 판별해야 한다.

## 2. 실증된 실패 순서

\`\`\`
DB에서 원본 Grant 확인 및 답변 READ COMMIT  (V)
       ↓
Node/Web Response 생성, 앱/Proxy 버퍼 보관
       ↓
original Grant 철회 COMMIT                  (R)
       ↓
철회 완료 응답                            (ACK)
       ↓
이전의 버퍼를 HTTP socket으로 실제 송신        (S)
\`\`\`

- **실패**: V→R→ACK→S에서 과거 DB 조회 성공을 재사용해 송출하면 제품이 승인한 미송출 답변 차단을 어긴다.
- **R8**: 순수 합성 127.0.0.1 HTTP Server에서 V와 S가 별개임을 실증.
- **R9**: 실제 격리 PostgreSQL original Grant/Record + original Attempt/Commit에 대한 권한 읽기가 성공한 뒤 original Grant를 실제 DB 트랜잭션에서 철회하고, 동일 테스트에서 HTTP 송출을 보류하는 경합을 실증. 정상 Production POST는 현재 G3 HOLD여서 503/no-store·본문 비노출·Runtime 0회. 별도 **고의로 취약한 합성 서버**는 이미 읽은 바이트가 철회 뒤 유출될 수 있음을 입증.
- **이것은 G3 positive 최초 공개, 실제 Vercel/Edge/Proxy 송출 동기화, R/S 분산 원자성을 입증하지 않는다.**

## 3. 제안 기술 계약 — ACK와 송출을 혼동하지 않기

1. **강한 원본 인증**: original Grant ID와 original Record, current content digest/버전, Subject/Character/Thread/Turn/Attempt/derived lineage가 원본 DB Authority에서 검증되어야 한다. 새 Grant로 이전 Attempt 구제 불가.
2. **출처 선행 Pin**: 모델 실제 최종 사용 목록과 파생 출처를 G1 DB에 사전 불변 저장. 불명·권한 오류면 Provider 호출 0회.
3. **동시 Commit**: G2의 실제 \`cmd_commit_seyeon_chat_turn_runtime_v2\` 같은 트랜잭션에서 원본 Grant/Record 잠금 검증. 다른 세션에서 철회가 먼저 Commit하면 Commit 불가.
4. **별도 공개 권한**: 최초 HTTP 응답뿐 아니라 \`committed_replay\`, History GET, Worker, 캐시 조회에서도 V를 수행. 원본이나 파생 출처를 검증할 수 없으면 공개 금지.
5. **송신 안전성**: 앱 서버 내 단순 V 후 \`Response\` 반환 방식으로는 충분하지 않다. **V와 실제 S의 경합**, 철회 API의 R→ACK, 발송 주체가 소유한 버퍼 폐기/중단에 대한 명시적 송신 경계가 필요하다. 구현 대안은 (a) 신뢰 가능한 송신자가 직렬화하는 서버 소유 per-Grant/epoch+send lease/fence, (b) 추가 HTTP/Proxy acknowledgment 계약이다. **이 대안들은 현재 확정된 구현이나 보안 보장이 아니다.** DB Lock을 V에서 해제한 직후 클라이언트에 보내는 단순 방식은 금지 후보.
6. **ACK 정의**: 철회 R은 영속 확인돼야 한다. ACK 전에 미송출 공개를 금지시키는 방식과 outstanding send 취소/완료의 관측 가능한 기준을 DB/API/Security가 공동 확정한다. 송출 완료 통지는 클라이언트 수신/화면 표시를 뜻하지 않는다. ACK가 영구 데이터 삭제를 뜻하지도 않는다.
7. **스트리밍 OFF**: 개인정보/파생 기억 응답 최초 출시에서 스트리밍하지 않는다. 비스트리밍도 위 경합이 자동 해결되는 것은 아니다.
8. **사고 시 HOLD**: epoch/fence 누락, 네트워크 중단 후 재시도, Proxy buffering, DB 불능, worker 재전송, 취소 중 새 권한 발급 등 상태가 불명확하면 보호 본문 송출 금지.
9. **기억 철회 ≠ 과거 대화 일괄 삭제**: 저장된 사용자의 과거 대화는 별도로 관리하되, 권한이 철회된 개인기억을 새 AI 모델·요약·Replay/History 공개에 활용하는 것은 금지. 명시적 삭제 요청과 법적 삭제 의무는 별도 시행.

## 4. 증거 확장·수락 조건 (아직 불충족)

| 검증 | 기대 | 현재 |
| --- | --- | --- |
| 실제 원본 DB Grant 철회 후 현재 조회·History 거부 | 철회 전 사용 가능, 후 새 조회·재사용 0 | R5~R7 disposable PG 증거 |
| 실제 원본 DB READ→철회 COMMIT→로컬 소켓 송출 보류 | Production 503/no-store·본문 0, unsafe synthetic leak 양쪽 입증 | R9 코드/CI 대기 |
| 철회 vs V/C/S 별도 독립 PostgreSQL 세션 | revoke-first·commit-first 잠금 순서/격리/timeout/재부여 | R1~R5 격리 증거는 있지만 실 Production G2 아님 |
| **실제 승인된 positive 최초 HTTP 송출**과 취소·Proxy/Worker 재시도 | ACK 이후 미송출 보호 본문 0; 기송출 바이트에 관한 한계 명시 | **미구현/HOLD** |
| Owner + 운영 완료 | Security/API/DB/Character 계약 서명, exact CI+Integration, main/DB/DR, G5/G6 | **미승인/HOLD** |

## 5. 변경할 수 없는 운영 안전 상태

- \`SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1=[]\`
- \`routeMounted=false\`, 공개/유료 호출 OFF, 실제 Provider 호출 0
- Production DB DDL/DML/migration/ACL/history 변경 0
- 기술 \`G0=PROPOSED\`, \`G1 positive/G2/G3/G5/G6=HOLD\`, \`authorizedForProduction=false\`, \`drReady=false\`
- 이번 격리 R9 테스트가 성공해도 실제 positive 공개 권한이나 Owner 서명으로 자동 승격하지 않는다.
