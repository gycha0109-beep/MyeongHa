# 세연 AI 보안 트랙 — 구현 현황·목적·엔드포인트·종료 조건

Watchtower-Track: security

> **2026-11-08 트랙 복구 기준:** 이 문서의 정본 트랙은 **세연 AI 보안 `security`**입니다. 정본 보안 이력은 **W129 / PR #3106 (병합 완료) → W130 트랙 복구 → W131 미설치 권한 선행 차단 → W132 승인 재사용·CI 검증** 순서입니다. `ops`의 Phase 8~13·DR, PR #3105/#3112/#3113/#3115, 운영 WORKLOG는 **AI 보안 후속 단계가 아닙니다**. 작업·자동화·이관은 이 문서 → [S0 로드맵 v3](SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V3_20261107.md) → [G0~G6 완료 계약](SEYEON_AI_SECURITY_COMPLETION_GATES_V1.md) 순으로 보안 트랙을 확인하고, 서로 다른 트랙의 마지막 답변·커밋·CI로 작업 대상을 바꾸지 않습니다.

> 최초 작성: 2026-10-30 · 실행 기준 갱신: 2026-11-07

- **상태:** `HOLD_FORWARD_STOPPED` / S0 제품 미완료. 소스 구현·PR CI 통과는 운영 DB 적용, 실제 HTTP 송출, 서비스 공개 또는 G0~G6 완료와 다르다.
- **현재 출시 범위:** 2026-10-25에 확정된 S0 — 현재 Member/Turn의 원본 `conversation_recall/v1` Memory 1건 + 현재 User 메시지 1건 + 최초 비스트리밍 답변 1회. 일반 고객 크레딧·비용 정산과 receipt/철회 경계까지 포함한다.
- **S0 제외:** 새 Memory UI, History/Replay, Reader, Relationship/과거 대화의 모델 재사용, 다중 Memory/Life Fact, Streaming. 이 경로는 활성화하지 않고 계속 HOLD한다.
- **최신 실행 순서:** [세연 AI 보안 실행 로드맵 v3](SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V3_20261107.md). 기존 구현을 재사용하고 실제로 끊긴 연결만 마무리한다.
- **완료 증거 정본:** [G0~G6 완료·증거 계약](SEYEON_AI_SECURITY_COMPLETION_GATES_V1.md), [상위 원장 #1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866). G0~G6는 엄격한 합격 기준이며, `0/7`은 개발량/전체 진척률이 아니다.
- **기준 main:** `1609aa879aa63120072b4d21b35f4c469dc650ed`. W121은 [PR #3089](https://github.com/gycha0109-beep/MyeongHa/pull/3089)로 병합되었고, PostgreSQL 15/17 권한 검증 호환성 수정과 전체 Integration 증거를 보유한다.
- **주의:** 이 문서·로드맵 병합은 운영 DB/ACL/Secret 변경, 유료 Provider 호출, 공개 Route 활성화 또는 배포 승인이 아니다.

## 1. 무엇을 완성하려는가 — 최종 엔드포인트(종료점)

> 이 절과 다음 G0~G6 표는 장기 보안 아키텍처의 전체 위험·구현 인벤토리다. **현재 S0 출시 범위는 이 전체 인벤토리와 동일하지 않으며**, 원본 Memory 1건·현재 User 메시지 1건·최초 비스트리밍 답변으로 제한한다. S0에서 제외된 과거 대화/Relationship/Reader/Replay/Streaming은 구현하거나 공개하지 않고 계속 HOLD한다. 실행 기준은 [로드맵 v3](SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V3_20261107.md)다.

기존에 사용자와 세연 사이에서 허용한 기억이 **현재도 동일한 원본 Grant로 허용되는 경우에만** 모델 입력과 공개에 쓰이도록 한다. 생성된 답변·과거 User 텍스트·관계 이벤트·Reader 자료가 다시 컨텍스트로 들어올 때도 원본까지 역추적하고, 출처 미상·철회·재승인·Record 수정·DB 오류는 **부분 필터링 없이 HOLD**한다.

목표 실행 순서는 다음과 같다.

1. 인증한 Member의 canonical Subject·Thread·현재 Turn/Attempt 및 **최종 모델에 실제 포함되는 원본/파생 출처 집합**을 서버에서 식별한다.
2. 모델 호출 **이전**에 DB Owner가 정확한 원본 Record ID·Grant ID·type/schema·원본/투영 digest·최종 컨텍스트 digest를 Attempt에 불변 Pin하고, 출처가 없는 0건도 별도로 입증한다.
3. 모델 실행 후 **실제 채팅 Commit과 동일 PostgreSQL 트랜잭션**에서 같은 원본 Grant/Record를 잠그고, 현재 권한·digest를 재확인한다.
4. 최초 HTTP 응답과 모든 Replay/History/Worker 재사용 시점에 현재 원본 및 전체 파생 lineage를 다시 검증하며, 철회 경쟁 시 비인가 답변 바이트 **0**을 보장한다. 이미 송출한 바이트는 소급 회수할 수 없으며 수신/철회 순서를 확정해야 한다.
5. 비용·Provider·사용자 크레딧을 서버의 원자 승인·정산 경로에 연결하고, 실DB 독립 세션·실 HTTP 전송·운영 롤백/관측을 증명한다.

**종료 정의:** G0~G4의 실제 운영 구현(A), G5 실DB/HTTP/경합 통합 검증(B), G6 제한 운영·증거·복구 및 최종 승인(C)을 **동일한 허용 Scope**에서 모두 충족해야 종료다. PR 병합, source-only SQL, unit test GREEN, 정적 분석만으로 종료하지 않는다.

## 2. 게이트별 현재 실제 범위

| 게이트 | 이미 존재하는 핵심 구현 | 아직 완성되지 않은 종료 조건 | 판정 |
| --- | --- | --- | --- |
| **G0 출처/취소 계약** | 사용자 선택·철회 제품 방향 결정. 원본 Memory 1건의 Attempt Pin과 exact Grant 검증. **#2768**에서 원본 → committed Assistant 파생 메시지의 현재 권한 추적을 DB 소스로 구현 | 과거 User·Relationship Event·Reader knowledge의 출처 계보 전체, G0-D1~D5 기술 계약 최종화, 기존 레코드 소급 처리 정책 | **PROPOSED / 부분 구현** |
| **G1 모델 이전 Pin** | 0건 DB 선행 Pin·불변 트리거와 실제 선택 집합 검사. S0 최초 Memory 1건 positive G1 소스 코드 | 승인된 type/schema/projector의 운영 범위와 **전체** 모델 입력(파생·preflight 포함) 선행 Pin/권한 증거 | **부분 구현 / HOLD** |
| **G2 동일 트랜잭션 Commit** | S0의 원본 Grant 잠금·digest 재검증 및 `cmd_commit_seyeon_chat_turn_runtime_v2` 연결 소스 | 전체 출처 계약 적용, 운영 실제 함수/ACL, 독립 세션 revoke/commit 최종 증거 | **부분 구현 / HOLD** |
| **G3 공개·재사용** | 첫 응답 receipt/withdrawal 소스, 과거 세연 방의 history HOLD, 후속 Worker/Outbox 현재 권한 없는 재사용 HOLD. #2768 DB 원본 → 과거 Assistant 조회 연결 | 전체 Replay·History·Reader·Relationship·Worker의 **현재 원본 권한**을 허용/거부로 실제 판정, 실 HTTP/취소 경쟁·운영 전송 증거 | **부분 구현 / HOLD** |
| **G4 비용 Governor** | DB 비용 정책·원자 승인/원장 및 제한된 Owner용 Provider 경로. 코드상 `modelUseEnabled:true`이나 실제 운영 사용권은 DB/Owner/credit 조건과 별개 | 일반 유료 고객의 크레딧 예약→수신 증명→정산 실제 운영 연결. `creditBilling.productionMounted:false` | **부분 구현 / HOLD** |
| **G5 전체 실증** | #2768 이전 HEAD의 기존 CI, S0 합성/격리 PostgreSQL 테스트 GREEN | **최종 HEAD** full Integration, 운영 RPC/두 세션·HTTP 실증·무단 비용/유출 0 증명 | **HOLD** |
| **G6 운영 종료** | 기존 백업/격리 복원·forward stop 및 제한된 운영 관측 증거 | 실제 승인 Scope·main/deploy SHA·실환경 관측/롤백/DR 증거 및 미해결 위험 정리 | **HOLD** |

진척률 퍼센트는 확인 가능한 종료 증거가 없어 산정하지 않는다. G0·G1·G2·G3가 모두 부분 구현이라는 사실은 각각의 게이트 통과를 뜻하지 않는다.

## 3. 현재 구현된 외부 HTTP 엔드포인트 — **코드 라우팅과 운영 허용을 구분**

| Method + Path | 용도/코드 연결 | 현재 경계 |
| --- | --- | --- |
| `POST /api/chat` | 기존 단일 캐릭터 대화방 생성 | Worker의 기존 인증 API 분기. **모델 생성 허가와 별개** |
| `POST /api/chat/:threadId/turns` | 원본 Memory 기반 첫 AI 답변: 인증 → G1 Pin → Governor → G2 Commit → G3 DB 발행/receipt | `cloudflare/myeongha-worker.mjs`에 exact-path 분기 존재. `SEYEON_SECURITY_S0_PRODUCTION_V1.modelUseEnabled`와 Member/Owner credit exemption·DB owner/registry/ACL 전부 필요. **운영은 HOLD_FORWARD_STOPPED**, 범용 paid/public 채팅 승인 아님 |
| `POST /api/chat/delivery-receipts/:attemptId` | **이미 발행된** 최초 응답의 소유 receipt 증명/ACK; 응답 원문을 재노출하지 않음 | Worker 분기 및 `handleSeyeonPositiveReplyReceiptV1`. 새 Model/Grant 발급 경로 아님. 철회 처리에 필요한 진행 중 receipt 계약은 보존 |
| `POST /api/memories/:memoryItemId/grants/seyeon/revoke` | 원본 Memory 동의 철회 요청·대기/ACK | Worker의 정확한 withdrawal 경로, `handleSeyeonMemoryGrantRevokeRequestV1` 관련 구현. 실제 성공은 현재 Owner ACL/인증/전송 증거가 필요. 새 생성/공개 허가가 아님 |
| `GET /api/chat/:threadId` | 기존 인증 방 조회·메타데이터 및 메시지/관계 이력 | `chat-read-http.ts`가 세연 포함 여부/과거 참가 이력 판정 실패 시 **503 SEYEON_HISTORY_REVEAL_HOLD**. 정상 운영 history 공개 PASS 미확정 |
| `GET /api/memories/:memoryItemId/grants/seyeon` | 동의 상태 조회 전용 | `seyeon-member-memory-grant-status-http-v1.ts` 구현. 현재 public Worker에서 이 exact route의 실제 활성화는 별도 확인 필요. 기록 본문 반환/Grant 생성 없음 |
| `POST /api/memories/:memoryItemId/grants/seyeon` | 사용자 명시 동의에 의한 **새** 원본 Grant 발급 | `seyeon-owned-original-memory-grant-http-v1.ts`에 handler 존재하나 `publicRouteMounted:false`. 운영 공개 endpoint로 계산 금지 |
| `POST /api/memory/proposals/:id/accept` | 비공개/선택 동의 Memory 제안 수락 | `seyeon-private-memory-proposal-accept-http-v1.ts`는 **UNMOUNTED**. 운영 경로로 계산 금지 |

*HTTP path가 코드에 적혀 있다는 사실은 실환경의 DB Owner ACL·Member Auth·배포 Worker 버전·수신 증명을 입증하지 않는다.* 특히 현재 Node `handleSeyeonFirstPositiveMemoryDirectNodeHttpV1`는 `productionRouteMounted:false`·`proxyHandoffProven:false`로 **별도 source-only 구성**이며, 이를 Cloudflare 최종 송출 기능으로 중복 계산하지 않는다.

## 4. 내부 DB 권한 엔드포인트 — 직접 RPC와 운영 적용 상태

| DB RPC / 코드 위치 | 구체적 책임 | 설치·활성 범위 |
| --- | --- | --- |
| `public.cmd_mark_seyeon_chat_context_ready_pinned_v1` (1640) | 0건 출처 증명의 **모델 전** 불변 Attempt Pin | 기존 0건 경로; positive 전체 허가 아님 |
| `public.cmd_mark_seyeon_positive_context_ready_pinned_v1` (`01-source-pin.sql`) | 최초 Memory 1건의 exact Grant·원본 digest·선택 결과를 Attempt에 Pin | S0 source/제한 설치 이력; 현재 forward stop 및 registry/EXECUTE 상태로 실제 positive 사용 HOLD |
| `public.cmd_commit_seyeon_positive_chat_turn_v1` (`02-atomic-commit.sql`) | validated Attempt·원래 사용자 메시지·원본 Pin 확인 뒤 실제 `cmd_commit_seyeon_chat_turn_runtime_v2` 호출 | S0 source/실DB 합성 검증; 범용 Commit 승인 아님 |
| `public.cmd_issue_seyeon_positive_first_reply_v1` · `seyeon_private.cmd_ack_seyeon_positive_reply_v1` (`04/05`) | DB 원본 Grant를 잠근 최초 응답 발행과 내구성 있는 수신 증명 | 신규 사용 차단과 이미 발행된 receipt/철회를 분리 |
| `seyeon_private.lock_original_memory_grant_v1` (`00`) | **정확한 기존 Grant ID**와 Memory를 잠가 현재 권한 확인 | API login의 임의 직접 호출을 허용하지 않음 |
| **`seyeon_private.assert_current_original_assistant_lineage_v1(uuid,uuid,uuid)`** (`13`) | **#2768:** 확정 Turn/Attempt/Assistant → G1 positiveProof/validated provenance → 같은 원본 Grant와 현재 registry/Memory type·schema·digest·철회 상태 검증 | **신규** S0 소스. 자동 production migration 아님 |
| **`public.qry_seyeon_g0_current_source_recent_messages_v1(uuid,uuid,uuid,integer)`** (`13`) | **#2768:** 현재 DB 원본 User와 검증된 과거 세연 Assistant만 전체 후보 검증 후 읽기. 과거 User/system, 무출처·취소 Grant가 하나라도 있으면 **전체 거부**, 일부 제거 후 계속 진행 금지 | `postgres-seyeon-production-context-read-v1.ts`의 실제 PostgreSQL 조회 호출로 연결. **S0 격리 설치 계획에 포함**, 운영 적용·실배포 증거 없음 |
| `public.cmd_enqueue_seyeon_relationship_sync_v1` / `public.cmd_claim_seyeon_relationship_sync_v1` (`1470`, `12`) | 관계 이벤트 적재·선점. Node 어댑터와 DB direct RPC는 현재 권한 증거 완성 전 HOLD | `12` ACL 회수는 **소스 후보**, 운영 적용 확인 전 직접 DB RPC 닫힘을 추정 금지 |

**#2768 정확한 변경 목록:** `scripts/operations/seyeon-security-s0/13-g0-current-original-lineage-context.sql`, `scripts/operations/seyeon-security-s0/plan.mjs`, `apps/api/src/seyeon-production-context-read-v1.ts`, `apps/api/src/seyeon-production-context-v1.ts`, `apps/api/src/postgres-seyeon-production-context-read-v1.ts` 및 기존 정합성 테스트 두 파일. 격리 설치 묶음에 `13`을 넣은 것은 테스트 실행에 필요한 DB 함수 설치이며 **운영 SQL 자동 설치가 아니다**.

## 5. S0 범위의 남은 작업 — 기존 구현을 완성하는 순서

1. **G0 범위 계약 마감:** 현재 Member + 원본 `conversation_recall/v1` Memory 1건 + 현재 User 메시지 1건 + 최초 비스트리밍 답변만 허용한다. 과거 대화/Relationship/Reader/Replay/Streaming은 S0에서 제외하고 계속 HOLD한다. 철회·재승인·Record 변경·전송 순서의 남은 기술 계약만 마감한다.
2. **G1 양수 Pin 연결 확인:** 기존 0건 Pin, 단일 Memory+현재 User 결합 Pin SQL/서버 adapter를 재사용한다. 모델 호출 전에 정확한 source set이 불변 저장되는지 실제 S0 실행 경로에서 확인하고, 누락/오류 시 Provider 0회를 보장한다. 새 출처 유형을 추가하지 않는다.
3. **G4 Governor·고객 크레딧:** W115~W121 코드를 재작성하지 않는다. W121의 전용 실행 역할 검사를 운영 자격증명/TLS/DB에서 확인하고, 일반 고객의 예약→최초 응답 receipt/ACK→정산을 Runtime에 연결한다. 현재 `creditBilling.productionMounted=false`를 증거 없이 ON으로 바꾸지 않는다.
4. **G2 원자 Commit:** 기존 `cmd_commit_seyeon_chat_turn_runtime_v2`와 S0 Commit 경로를 사용한다. G1 Pin과 현재 원본 Grant/Record를 같은 DB 트랜잭션에서 잠그고 검증하며, 별도 SELECT-before-COMMIT 경로를 허용하지 않는다.
5. **G3 최초 HTTP 공개:** 실제 Cloudflare Worker transport에서 최초 비스트리밍 답변·receipt/ACK·철회 경합을 끝까지 증명한다. Node 응답 완료나 Fetch Response 생성만으로 실제 브라우저 송출을 추정하지 않는다. History/Replay/Worker 후속 공개는 계속 HOLD한다.
6. **G5 통합 검증:** 기존 PostgreSQL 15/17, S0 E2E, Worker/HTTP, db-authority-core, 전체 Integration을 재사용한다. 정확한 S0 경로에서 빠진 DB 독립 2세션 경쟁·HTTP·비용 증거만 보충한다. 새 CI Workflow를 만들지 않는다.
7. **G6 제한 운영:** 사용자 승인된 범위에서 제한 smoke, 안전 로그/알림, forward stop, receipt/철회 보존, 복구/롤백, 배포 SHA를 확인하고 증거를 묶는다.

**우선순위 규칙:** 기존 코드와 통과한 검증을 다시 만들거나 반복하지 않는다. 실제 S0 실행을 막는 결손만 수정한다. S0 밖의 기능·출처 유형·광역 보안 재감사를 새 선행 조건으로 끌어오지 않는다. 제외 경로는 구현 대신 차단 상태를 유지한다.
## 6. S0 증거와 현재 블로커

- **기준 main:** `1609aa879aa63120072b4d21b35f4c469dc650ed`. W121의 권한 검사·PostgreSQL 15/17 호환성 수정은 [PR #3089](https://github.com/gycha0109-beep/MyeongHa/pull/3089)로 병합됐고 전체 Integration 성공 증거가 있다.
- **실제 S0 운영 장애 기록:** 2026-10-26 첫 hosted 시도는 `governed_preflight`에서 HTTP 503으로 종료되어 Provider 호출·receipt 발급이 0건이었다. 후속 시도는 `response_headers` 단계에서 HTTP status가 확인되지 않아 DB Governor 진입 전에 중단됐다. 2026-11-01 첫 답변 경계 복구 문서도 실제 모델 실행→HTTP 응답→receipt ACK→비용 기록의 성공 증거는 아직 없다고 명시한다.
- **G0/G1:** S0 제품 범위는 고정했지만, 철회·재승인·실제 Worker 전송 순서의 기술 계약과 대상 DB에서 positive Memory 1건의 모델 전 Pin 성공 증거가 남아 있다. 전체 SRC-25 타입 레지스트리나 모든 파생 출처 승인은 S0 선행 조건으로 확장하지 않는다.
- **G2/G3:** 기존 원자 Commit·최초 공개·receipt/철회 코드와 SQL은 재사용한다. 실제 대상 Cloudflare Worker의 최초 비스트리밍 응답, receipt/ACK, Commit·Reveal 취소 경쟁을 끝까지 통과한 증거가 남아 있다. History/Replay/후속 Worker 공개는 S0에서 계속 HOLD한다.
- **G4:** W115~W121은 구현·병합됐지만 `creditBilling.productionMounted=false`다. 운영 전용 LOGIN/Secret/TLS 연결과 일반 고객의 예약→receipt→정산 Runtime 장착이 남아 있다. Owner Admin 면제 smoke는 일반 고객 크레딧 완료 증거가 아니다.
- **G5/G6:** 기존 격리 PostgreSQL/CI 증거는 재사용한다. S0 전체 요청의 실제 DB 독립 세션·HTTP 경합 검증, 제한 운영 smoke·안전 관측·forward stop/복구 및 최종 승인 증거가 남아 있다.
- **장기 후속 범위:** 과거 대화/Relationship/Reader/Replay/다중 Memory/Life Fact/Streaming의 전체 출처 계보는 S0 출시를 막는 현재 작업으로 취급하지 않는다. 해당 경로는 비활성/HOLD로 유지한다.
- **운영 경계:** 이 로드맵 PR은 문서만 변경한다. Production DB/ACL/Role/Secret, Provider, 공개 Route, credit billing, 배포/트래픽 변경은 수행하지 않았다. 최종 운영 활성화는 별도 사용자 승인과 G6 증거가 필요하다.

> **현재 결론:** `W121_MERGED / S0_IMPLEMENTATION_PARTIAL / PRODUCTION_HOLD / SECURITY_TRACK_OPEN`. G0~G6의 완료 수를 개발량이나 전체 진척률로 표시하지 않는다.
## 7. Worklog — 작업 단위 누적 기록

> 기록 규칙: 이후 Security 트랙 개발 PR마다 **작업일·목적·변경한 실제 경로·정확한 PR/HEAD·CI/Integration·남은 범위·운영 상태**를 이 섹션에 누적한다. 문서 작성 시점의 검사는 확정된 결과만 적으며, 이후 검사 결과를 성공으로 추정하지 않는다. 과거 항목은 후속 작업에서 덮어쓰지 않는다.

### 2026-10-30 / W01 — 원본 Memory → 과거 Assistant 현재 권한 (PR #2768)

- **목적/구현:** `13-g0-current-original-lineage-context.sql`의 `assert_current_original_assistant_lineage_v1`과 `qry_seyeon_g0_current_source_recent_messages_v1`을 Production PostgreSQL context read adapter에 연결. 원본 Grant/Record의 동일 ID·현재 권한·digest를 확인하고 이력이 미확인되면 전체 HOLD.
- **증거:** [PR #2768](https://github.com/gycha0109-beep/MyeongHa/pull/2768) HEAD `cc50687ca6cd3d3d726262040561c4a129ff1011`, [CI #41018439519](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41018439519) PASS, [Integration #41018652610](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41018652610) PASS, 병합 `80268c01913d33bf6a68f1d230a7f4766aeca4e3`.
- **남은 것:** 과거 User·Relationship·Reader와 다중 파생의 원본 권한. 운영 SQL 적용/공개 승인 없음.

### 2026-10-30 / W02 — 관계 이벤트 → 원본 Assistant 출처 (PR #2773)

- **목적/구현:** `14-g0-relationship-event-original-lineage.sql` 추가. 관계 이벤트의 DB 원본 Message FK를 통해 committed Se-yeon Assistant 및 최초 Memory/Grant 현재 권한을 확인한 뒤 기존 관계 이력을 반환. `postgres-seyeon-production-context-read-v1.ts` 실제 Relationship 읽기 RPC 교체.
- **증거:** [PR #2773](https://github.com/gycha0109-beep/MyeongHa/pull/2773) HEAD `99c691e0e2df2212bd0726ad45ee63fd30073ab1`, [CI #41020615655](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41020615655) PASS, [Integration #41022018630](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41022018630) PASS, 병합 `1800d2ed927b35bd84b75d0c76114e8f32493f77`.
- **남은 것:** 단일 Assistant 이외의 원본 유형, 다중 메시지, Reader 교차 출처. SQL은 S0 격리 설치 전용이고 운영에 자동 반영되지 않음.

### 2026-10-30 / W03 — 과거 User 원본·다중 관계 출처 및 충돌 정리 (PR #2779 → #2781)

- **목적/구현:** `15-g0-original-member-user-message.sql` 신규: 동일 Member Subject/Thread의 DB 원본 User 메시지 및 확정 Turn 식별. `13`의 과거 User 조회, `14`의 전체 source_message FK 순회에 연결. Assistant는 여전히 정확한 기존 원본 Grant 검증 필요; World/server/미확인 출처는 HOLD.
- **충돌 정리:** [#2779](https://github.com/gycha0109-beep/MyeongHa/pull/2779)은 선행 #2773 squash 병합 후 `main` 재타깃에서 Git `dirty` 발생. 동일 구현을 이미 병합된 `main`에 다시 적용해 [#2781](https://github.com/gycha0109-beep/MyeongHa/pull/2781)로 대체. #2779는 **미병합 종료**.
- **증거:** 대체 PR #2781 문서 편집 전 HEAD `e8c1d8486529f77e325314b69277d6b8d5677c01`의 Web/Governance PASS; [CI #41025182088](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41025182088)는 이 기록 작성 시 DB 작업 미종결. 문서 커밋에 따른 최종 HEAD 검사/Integration·병합은 별도 확정한다.
- **중요한 한계:** DB 원본 User 입력이라는 증거는 복사·인용된 다른 개인정보의 Grant를 대체하지 않는다. G1 양수 모델 사용은 `seyeon-production-chat-execution-v1.ts`에서 **원본 Memory 1건·past history/Relationship 0건**으로 계속 제한. Reader/공식 Reading 아티팩트는 별도 Character/상품/구매 권한 경로이고, 세연의 현재 context 조립에 직접 Reader 데이터 유입은 확인되지 않았으므로 임의 긍정 교차 공개를 만들지 않음.
- **남은 것/다음:** #2781 최종 HEAD CI/Integration/병합, 실제 모델에 사용되는 **전체 원본·파생 출처의 G1 선행 영속 Pin**, G2/G3 현권한 재검증, Reader 교차 인용 계약, G4 일반 크레딧 종단, G5/G6. **운영 `HOLD_FORWARD_STOPPED` 유지**, 운영 DDL/ACL/Provider·traffic 변경 없음.


### 2026-10-30 / W04 — 최종 모델 최근 메시지 출처 집합 G1 결속 (PR #2784)

- **목적/핵심 본체:** 기존 G1 선택기에 빠져 있던 *모델에 실제 남는* 현재 DB User 및 과거 User·Assistant 메시지 집합을 조립기와 동일한 tail-cap/정규화 규칙으로 선별. `selectedCurrentUserSource`, `selectedUnpinnedRecentSources`, 선택 메시지 digest를 `selectedModelSourceCensusDigest`의 일부로 결속. 단순 원본 이력 전체나 AI가 만든 sourceRef를 모델 사용 증거로 간주하지 않음.
- **실제 코드:** `packages/domain/src/seyeon-runtime-context-v2.ts`의 공용 `selectSeyeonRuntimeRecentMessagesV2`, `apps/api/src/seyeon-exact-model-personal-source-selection-v1.ts`의 G1 모델 출처 목록, `apps/api/src/seyeon-production-chat-execution-v1.ts`의 DB receive 원본 User ID 전달. 기존 R19 격리 positive Pin 후보에서 새로운 미영속 최근 출처가 전부 0개인지 검증하도록 계약·기존 테스트를 갱신.
- **PR/CI:** 최초 [#2784](https://github.com/gycha0109-beep/MyeongHa/pull/2784)는 #2781 squash 병합 후 W01~W03 문서 충돌로 미병합 종료. **동일 구현 + W04를 최신 main에 재적용한 [#2786](https://github.com/gycha0109-beep/MyeongHa/pull/2786)**에서 최종 HEAD 검증 진행. 최초 HEAD `0e7a125758da01a629a06dc9b8c450df08fbb5f6`의 [CI #41027327633](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41027327633)은 R19 기존 fixture 새 필드 누락으로 FAILED. R19 기능·권한은 완화하지 않고 `694b125`/`5f65ccf`에서 수정했으며, [새 PR 체크](https://github.com/gycha0109-beep/MyeongHa/pull/2784/checks) 및 후속 Integration은 **결과 확인 전 PASS 아님**. 문서 커밋에 따른 최신 HEAD는 별도 확인 필요.
- **완료로 계산하지 않는 것:** 이 목록은 **서버 계산 출처 census이며 DB Owner 서명·불변 Attempt Pin이 아니다**(`persistedBeforeModel:false`). 본 S0 긍정 모델은 기존대로 Memory 1건·이전 메시지/Relationship 0건만 허용. 복사·재인용 간접 출처, Reader 교차 원본, 전체 G1 Pin·G2/G3·일반 credit 및 G5/G6 모두 미완료. 운영 DDL·ACL·Provider·Cloudflare 변경 없음; `HOLD_FORWARD_STOPPED` 유지.
- **다음 구현:** 정확한 최종 모델 사용 집합의 **원본·파생 lineage를 DB Owner가 모델 이전 Attempt에 불변 저장하고**, G2 원자 Commit/HTTP 공개 시 **현재 원래 Grant ID**로 재검증하는 핵심 연결. 기존 전체 검증 완료 시점까지 positive 범위 확대 금지.


### 2026-10-31 / W05 — G1 모델 최근 메시지 DB 원본·불변 Pin 소스 (PR #2789)

- **목적/구현:** #2786 모델 선택 집합의 후속 G1 source-only 경로. PostgreSQL `seyeon_private.pin_model_recent_sources_v1`이 현재 User 및 과거 User/Assistant의 실제 DB message/committed lineage를 동일 Member/Thread에서 재검증하고, 정확한 메시지 순서·원본 content hash·본문 SHA-256·서버 선정 digest를 기존 Attempt의 신규 전용 칼럼에 보관한다. 저장된 값을 수정하지 못하도록 immutable trigger를 추가한다.
- **변경 파일:** `scripts/operations/seyeon-security-s0/16-g1-model-recent-source-pin.sql`, `scripts/operations/seyeon-security-s0/plan.mjs`, `apps/api/src/seyeon-g1-model-recent-source-db-pin-v1.ts`, 이 Worklog 문서. 기존 positiveProof 또는 G2/G3 contract는 변경하지 않음.
- **검사/전제:** [PR #2789](https://github.com/gycha0109-beep/MyeongHa/pull/2789) 최초 구현 HEAD `4a942f389a42b58396c213113d258cb898f6a6c5` 기준, #2786을 기반으로 한 신규 소스 후속 단위이며 DB Owner 전용 함수에 public/API 실행 GRANT가 없다. 모델 송출 경로 연결·동시 보관 계약·실DB 무결성/CI/Integration은 검증 및 추가 구현이 필요하다. SQL 설치 목록 추가는 S0 격리 설치 계획 전용이며 운영 Migration이 아니다.
- **기존 PR #2786 상태:** HEAD `37a6114` 기준 CI/Governance/Web PASS, 별도 Web Auth Browser Regression 실패 (Records Guest 401 처리). [브라우저 검사 재실행](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41028133827) 요청, 독립 판정 전 완료 추정 금지.
- **남은 것/다음:** #2786 필수 CI/Integration 병합, G1 실제 모델 전 호출 경로에 전용 원본 Pin 결합 및 G2/G3 출처 계약 확대, Reader/인용 출처, 일반 credit 및 G5/G6 운영 실증. 기존 Memory 1건·과거/관계 0건 production positive 제한 해제 금지.
- **운영 상태:** `HOLD_FORWARD_STOPPED`. 운영 DB·ACL·Provider·HTTP 공개·credit 변경 없음.


### 2026-10-31 / W06 — G1 출처 증명에 모델 실제 본문·DB 원본 동일성 결속 (PR #2789 후속)

- **목적/구현:** 최초 G1 recent-source DB Pin 소스의 검증을 강화. 서버는 기존 모델 Context와 동일한 최근 메시지 선택 규칙을 재실행하여 원래 선택된 각 messageId·role·본문과 digest를 대조한다. DB 소스 함수는 Caller가 전달한 모델 본문과 DB의 실제 비삭제 원문을 같은 권한 트랜잭션에서 정확히 비교한 뒤에만 원본 메시지 증명서를 Attempt에 불변 저장한다. DB 반환 증명서의 각 메시지 ID/role/본문 digest도 서버에서 검사한다. 본문 문자열은 Pin 증명서에 보관하지 않는다.
- **변경 파일:** `apps/api/src/seyeon-g1-model-recent-source-db-pin-v1.ts`, `scripts/operations/seyeon-security-s0/16-g1-model-recent-source-pin.sql`, 이 Worklog. 기존 1건 Memory 양수 권한 및 G2/G3/운영 ACL은 확대하지 않았다.
- **검사 실패 및 수정:** [PR #2789 기본 CI](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41178482988)에서 신규 어댑터의 TypeScript nullable 타입 오류가 확인되어 후속 코드에서 수정했다. 동일 CI의 PostgreSQL suite에 포함된 `saju-abuse-admission-attack-e2e`, `saju-official-records-http-e2e` 실패는 신규 Pin 직접 실패로 확인되지 않았으므로 이 작업의 PASS로 추정하지 않는다. 후속 HEAD CI 결과는 실행 후 별도 확정한다.
- **계속 미완료:** 이 함수는 S0 소스/어댑터이며 실제 모델 호출 Runner에 아직 연결되지 않았다. DB 설치·원본 Pin과 기존 personal positiveProof의 원자적 결합·G2 Commit·G3 공개 시점 검증·실DB 실증도 완료가 아니다. [#2786](https://github.com/gycha0109-beep/MyeongHa/pull/2786) 선행 브라우저 테스트 실패는 별도 유지.
- **다음:** 검증된 후속 CI를 확인하고 모델 호출 전 서버 실행 경로에 하나의 DB-Owner 승인된 Pin으로 실제 연결. 운영 `HOLD_FORWARD_STOPPED` 유지.


### 2026-10-31 / W07 — G1 Pin 신규 TypeScript 컴파일 실패 수정 (PR #2789)

- **목적/구현:** [CI #41183956482](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41183956482)의 `Work Track · security`에서 신규 최근 메시지 Pin 어댑터의 nullable/unknown 정적 타입 흐름이 실패했다. 식별·메시지·DB 영수증 실패 분기를 명시적 예외 종료로 변경하여 타입 검증이 실패 구간 뒤의 객체를 잘못 nullable로 유지하지 않도록 수정했다. 기존 원본 검증·DB 본문 정확 대조·HOLD 조건은 완화하지 않았다.
- **변경 파일:** `apps/api/src/seyeon-g1-model-recent-source-db-pin-v1.ts`, 이 Worklog. 해당 컴파일 수정의 최종 HEAD CI 결과는 후속 실행으로 확인할 때까지 PASS가 아니다.
- **다음/미완료:** #2789 신규 HEAD CI 확인과 G1 Pin 실제 모델 호출 경로 연결, 기존 #2786의 별도 Guest 전환 브라우저 실패 정리. 운영 `HOLD_FORWARD_STOPPED` 유지.


### 2026-10-31 / W08 — G1 현재 User·원본 Memory 단일 트랜잭션 결합 Pin 소스 (PR #2789)

- **목적/구현:** 새 `17-g1-positive-combined-model-source-pin.sql`에서 한 번의 DB owner 호출 안에 (1) 모델에 선택된 현재 User DB 원본·실제 본문·source census 불변 Pin, (2) 기존 정확한 Memory Record/Grant 원본·type/schema·payload digest 양수 Pin과 Chat `context_ready` 전이를 결합했다. 두 단계 중 하나라도 실패하면 같은 PostgreSQL 트랜잭션 전체가 롤백된다.
- **승인 Scope:** 기존 S0 그대로 **양수 원본 Memory 1건·현재 User 메시지 1건**만 지원한다. 과거 User/Assistant, Relationship, Reader, 다중 Records는 이 결합 함수에서 허용하지 않는다. 모델 호출·G2/G3·사용자 비용 경로의 Production activation도 없다.
- **실제 파일:** `scripts/operations/seyeon-security-s0/17-g1-positive-combined-model-source-pin.sql`, `scripts/operations/seyeon-security-s0/plan.mjs`, Worklog 문서. S0 격리 설치 소스로만 등록하고 API/일반 역할에 직접 EXECUTE를 부여하지 않았다.
- **미완료/다음:** G1 결합 SQL을 서버의 검증된 원본 선택/모델 전 호출 경로에 연결하고, 실제 PostgreSQL 격리 실증 및 G2 동일 결합 출처 재확인까지 완료해야 한다. 별도 설치·운영 승인과 G5/G6 증거는 아직 없다. 운영 `HOLD_FORWARD_STOPPED` 유지.


### 2026-10-31 / W09 — G1 단일 트랜잭션 Pin의 실제 서버 모델 이전 경로 연결 (PR #2789)

- **목적/구현:** 실제 `runSeyeonProductionChatExecutionV1`의 양수 Memory 1건 분기에서 모델 Provider 호출 이전에 DB Owner 결합 G1 Pin을 수행하도록 호출 경로를 추가했다. `seyeon-production-transactional-ports-v1.ts`가 기존 검증된 Subject Runner와 원본 권한 DB 트랜잭션을 이용해 `pinSeyeonG1CombinedModelSourcesV1`를 호출한다. 현재 User 메시지·선택 목록·모델 컨텍스트 digest는 서버에서만 조립한다.
- **변경 파일:** `apps/api/src/seyeon-g1-positive-combined-source-port-v1.ts`, `apps/api/src/seyeon-production-chat-execution-v1.ts`, `apps/api/src/seyeon-production-transactional-ports-v1.ts`, `apps/api/src/production-seyeon-chat-runtime-v1.ts`, 이 Worklog.
- **보안 경계:** 기존 양수 1 Memory 제한·과거 메시지/관계 0건 및 기존 positive G2/G3 HOLD를 해제하지 않았다. 현재 Production DB에 신규 결합 RPC/ACL을 설치·허가하지 않았고 S0 소스가 API EXECUTE를 부여하지 않으므로 새 호출 경로가 실제 Production 모델 사용을 열지 않는다. 독립 단위 테스트에서 사용하는 기존 주입 Port의 동작도 변경하지 않는다.
- **검증/미완료:** 선행 HEAD `e6b1de1a`의 [CI #41184237655](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41184237655)에서 security TypeScript 작업 검사는 PASS, PostgreSQL 전체 검사는 당시 진행 중. 이번 연결 HEAD의 검증 결과는 별도로 확인하며 실행·통합·병합·실DB 실증 전 G1 완료 아님.
- **다음:** 신규 소스의 TypeScript/CI 및 격리 PostgreSQL 동작 확인, G2 Commit에서 최근 메시지 Pin과 현재 원본 Grant를 같은 증명으로 검증, G3 재공개까지 연결. 운영 `HOLD_FORWARD_STOPPED` 유지.


### 2026-10-31 / W10 — G2 동일 Commit에서 G1 현재 User 원본 재검증 (PR #2789)

- **목적/구현:** `02-atomic-commit.sql`의 기존 실제 `validated → committed` 트리거에 G1 최근 메시지 불변 증명서가 존재하는 경우 동일 PostgreSQL Commit 트랜잭션에서 Member/Thread/Attempt·User 메시지 ID와 본문 원본 digest·content_hash를 다시 대조하도록 연결했다. 사용자 메시지 삭제/변경 또는 타 Subject/Thread 원본 변경이면 DB Commit 자체를 거부한다.
- **하위 호환:** 예전 S0 설치 단위에는 신규 Attempt 칼럼이 없을 수 있어 `to_jsonb(old)` 기반으로 선택적으로 검증한다. 기존 zero-proof 승인 범위와 legacy positive source 체크를 바꾸지 않고, 신규 결합 Pin 존재 시 추가 원본 검증을 실시한다.
- **변경 파일:** `scripts/operations/seyeon-security-s0/02-atomic-commit.sql`, 이 Worklog. 별도 운영 DDL·ACL/Provider 활성화는 실행하지 않았다.
- **현재 한계/다음:** G2의 원본 Memory 현재 Grant 재검증과 신규 User 출처 검증은 소스 경로로 연결했지만, Reader/관계·과거 메시지 전체 출처와 G3 최초/Replay 공개 재검증, 실제 PostgreSQL 경합 테스트, Production 적용은 미완료. 최종 HEAD의 검사는 결과 확인 전 PASS로 계산하지 않는다. 운영 `HOLD_FORWARD_STOPPED` 유지.


### 2026-10-31 / W11 — #2786 CI Guest 401 브라우저 시나리오 정합성 수정

- **문제:** 선행 [PR #2786](https://github.com/gycha0109-beep/MyeongHa/pull/2786) 브라우저 검사 [#41028133827](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41028133827)가 2회 실패. `records-guest-401` 시나리오는 `/api/memories`에만 401을 주도록 설정됐지만, 실제 Records 화면은 해당 상황에서 `/api/me`, `/api/life-record`, `/api/readings`를 호출하므로 Guest 무효화가 발생하지 않았다.
- **구현:** `scripts/verify-web-auth-rejected-bearer-browser.mjs`의 해당 시나리오에서 Records가 실제 요청하는 `/api/life-record`에 권위 있는 401 응답을 반환하도록 최소 수정. 화면의 인증·실패 처리 로직이나 서버 정책은 변경하지 않았다.
- **검증/남은 것:** 신규 #2786 HEAD의 브라우저 CI/Integration을 확인하기 전 성공 판정하지 않음. #2789의 후속 G1 소스/Worklog W05~W10은 별도 누적 브랜치에 있으며, 이 수정은 #2786 후속 브랜치로 통합해 W11을 단일 기록에 보존해야 한다.
- **운영:** `HOLD_FORWARD_STOPPED`, 운영 Provider·DB·ACL·HTTP 공개 변경 없음.


### 2026-10-31 / W12 — #2786 선행 변경과 #2789 누적 보안 구현 합류

- **목적/구현:** 선행 #2786의 Guest 401 테스트 경로 수정 커밋 `089d243d`를 #2789 후속 브랜치에 병합했다. 동일 보고서가 양쪽 브랜치에서 편집되어 발생한 Git 충돌은 #2789 쪽 W01~W11 전체 누적 원문을 유지하는 방식으로 해결했다. 브라우저 테스트 소스는 선행 브랜치의 수정본을 그대로 유지한다.
- **증거/상태:** #2786 및 #2789 각 HEAD의 새 CI·전체 Integration 결과는 확인 전 PASS로 간주하지 않는다. 두 PR은 여전히 코드 소스 단계이며 병합·배포를 운영 승인으로 보지 않는다.
- **미완료:** G1/G2 실제 PostgreSQL 격리 실행 증거, G3 최초/재공개·전출처 검증, G4 크레딧·G5/G6 운영 종료. `HOLD_FORWARD_STOPPED` 유지.


### 2026-10-31 / W13 — #2789 RED 보정: G2 JSON null과 G1 검증 테스트 정합성

- **원인/증거:** [#2789 CI #41185261913](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41185261913)에서 security 단위 검사 2건은 구형 문자열 `await input.positivePersonalSourcePort.pinBeforeModel({`의 존재를 요구하여 새 결합 호출 경로를 인식하지 못했다. PostgreSQL S0 e2e 9건은 기존 Attempt에 신규 출처 칼럼 값이 없는 경우 `to_jsonb(old)->'seyeon_recent_source_pin_jsonb'`가 SQL NULL이 아닌 JSON `null`로 해석되어 G2의 추가 출처 검증이 잘못 실행된 것이 직접 원인이다.
- **수정:** `02-atomic-commit.sql`에서 JSON `null`을 SQL NULL로 정규화하여 기존 S0 양수 Grant/원본 검사와 공개 경로를 유지하고, 신규 모델 출처 증명이 실제 존재하는 경우에만 추가 User 출처 검증을 적용한다. 두 단위 검사는 새 결합 Pin 및 기존 주입 Pin 분기 모두 모델/거버넌스 호출 이전에 있는지 확인하도록 갱신했다.
- **변경 파일:** `scripts/operations/seyeon-security-s0/02-atomic-commit.sql`, `test/seyeon-attempt-zero-personal-proof-v1.test.ts`, `test/seyeon-exact-model-personal-source-selection-v1.test.ts`, 본 Worklog.
- **재검증 범위:** 수정 전 오류는 S0 실DB e2e 9건 및 security 테스트 2건. 로컬 의존 패키지 중 Vitest 실행 파일이 없어 로컬 직접 재검증은 수행되지 못했다. 후속 커밋의 CI 및 PostgreSQL 격리 검사 결과가 성공할 때만 PASS로 보고한다. #2786의 브라우저/보안 기본 검사는 PASS 확인되었으나 PR 병합 상태는 여전히 별도 확인 필요.
- **운영:** `HOLD_FORWARD_STOPPED`; Production DB/ACL/Provider/Reveal 경로 활성화 없음.


### 2026-10-31 / W14 — G3 최초 공개의 현재 User 원본·G1 최근 출처 재검증 (후속 PR)

- **목적/구현:** G1 최근 출처 증명이 실제 Attempt에 있는 경우, 기존 `seyeon_private.lock_positive_first_memory_reply_v1`이 최초 답변의 비공개 텍스트를 읽거나 발행하기 **전에 동일 PostgreSQL 잠금 트랜잭션에서** 원본 User 메시지의 exact Member·Thread·Turn·Attempt·ID, 내용 해시 및 UTF-8 본문 SHA-256을 재조회해 검증하도록 수정했다. 인증 원본 메시지가 삭제/교체/변경되었거나 출처 증명이 부정확하면 기존처럼 빈 응답(공개 거부)으로 종료한다.
- **변경 파일:** `scripts/operations/seyeon-security-s0/04-locked-reveal.sql`, `test/seyeon-security-s0-postgres.e2e.test.ts`, 본 Worklog.
- **호환 및 범위:** 선행 S0의 Memory 1건·현재 User 메시지 1건 원본 Grant/G2/G3 제한은 그대로 유지한다. 기존 S0에서 선택적 최근 출처 증명이 없는 Attempt는 종전 Memory 원본 검증을 유지하고, 새로운 출처 증명이 존재하면 추가 검사를 실시한다. 테스트용 `seyeon_private` 호출 허용은 이름이 제한된 일회성 격리 테스트 DB 안에서만 부여되며 **설치 기본값과 운영 권한은 불변**이다. Replay·History·Worker·Reader의 신규 공개 경로는 열지 않았다.
- **격리 검증:** 실제 PostgreSQL S0 fixture에 모델 User 1건의 DB 출처 증명을 사전 저장해 최초 공개 후 재공개가 차단되는 사례를 추가했다. 소스 검사와 CI/격리 PostgreSQL의 후속 결과는 성공 확인 전 완료로 주장하지 않는다.
- **선행 및 남은 것:** #2789는 초록 검사 후 #2786 브랜치에 병합됐다. #2786은 새 HEAD에서 GitHub security/PostgreSQL/browser 검사는 통과했으나 Cloudflare Workers 빌드는 인증 실패로 차단돼 있고 main 병합이 아직 미완료다. G0 전체 출처 G1/G2/G3, Replay/History, G4 크레딧, G5/G6 운영 실증은 계속 미완료다. **운영 `HOLD_FORWARD_STOPPED` 유지.**


### 2026-10-31 / W15 — G3 증명서 누락 필드 거부 강화 및 #2800 CI 라우팅 보정

- **수정:** G3 최초 공개 DB 함수가 신규 `selectedModelSourceCensusDigest` / `selectedModelMessageDigest` / `dbBodySha256`의 정규식 검증 중 **NULL도 명확히 거부**하도록 변경했다. 값이 누락된 경우에도 PostgreSQL 3값 논리 때문에 검사 분기가 미실행되지 않게 `IS DISTINCT FROM TRUE`를 적용했다. 정상적인 구형 S0는 별도 경로로 유지한다.
- **PR/CI:** G3 후속 [#2800](https://github.com/gycha0109-beep/MyeongHa/pull/2800), 첫 HEAD `26117357`. 최초 PR 본문에 보안 트랙 식별 문자열의 실제 줄바꿈이 적용되지 않아 `Work Track · unattributed`가 실행됐다. PR 본문을 `Watchtower-Track: security` 독립 줄로 수정했으며, 본 W15 커밋에 따른 CI 재실행에서 보안 분류·PostgreSQL 검증을 확인해야 한다.
- **검증/미완료:** #2800 최초 HEAD PostgreSQL 검사 진행 중이므로 아직 PASS로 주장하지 않는다. 새로운 코드·설치 계획은 여전히 S0 disposable source only, 운영 DB/ACL/Provider/HTTP 공개·History·Replay HOLD 해제 없음. 운영 `HOLD_FORWARD_STOPPED` 유지.


### 2026-10-31 / W16 — #2786 통합 CI RED: G1 출처 행잠금 권한 보정 및 재검증

- **RED 증거:** [통합 CI #41189513938](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41189513938)의 PostgreSQL 17 job 1건 실패. 신규 `test/seyeon-security-s0-postgres.e2e.test.ts`의 실제 G1 원본 메시지 Pin→G3 최초 공개 시나리오에서 `seyeon_private.pin_model_recent_sources_v1`의 `SELECT ... FOR SHARE OF m`가 `permission denied for table conversation_messages`로 실패. 기존 12개 S0 사례 통과, 다른 security/browser/Governance/Web job PASS.
- **원인/조치:** PostgreSQL 17의 행잠금 `FOR SHARE`는 SELECT뿐 아니라 대상 테이블 중 최소 한 컬럼의 UPDATE 권한을 요구한다. 기존 `myeongha_seyeon_chat_runtime_owner`(NOLOGIN)에는 대화 메시지 SELECT/INSERT만 허용돼 있었다. S0 격리 설치 SQL `16-g1-model-recent-source-pin.sql`에서 **오직 NOLOGIN Owner에 `conversation_messages.redacted_at` 단일 컬럼 UPDATE 권한**을 추가하여 행잠금이 가능하도록 했다. 이 Owner의 실제 행 UPDATE는 기존 subject-scope RLS에 UPDATE 정책이 없어 계속 거부된다. API/anon/authenticated/service_role에 새 권한이나 공개 실행 경로는 부여하지 않는다.
- **변경 파일:** `scripts/operations/seyeon-security-s0/16-g1-model-recent-source-pin.sql`, 본 Worklog. 추가로 [#2786](https://github.com/gycha0109-beep/MyeongHa/pull/2786) HEAD의 필수 CI 재검증 결과를 확인해야 하며, 이 수정의 PASS를 선인정하지 않는다.
- **외부 별도 실패:** Cloudflare Workers 빌드 실패는 기존 Invalid access token 문제로 분리, 운영 인증 토큰을 수정하거나 공개 빌드를 강제하지 않는다. `HOLD_FORWARD_STOPPED` 유지.


### 2026-10-31 / W17 — G1 행잠금 RED 재보정: PostgreSQL UPDATE RLS 선택 조건

- **검사 근거:** [#2786 통합 CI #41190357843](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41190357843)에서 S0 실제 DB 테스트 13개 중 12개 PASS, 신규 G1→G3 최초 공개 시나리오만 `seyeon_private.pin_model_recent_sources_v1`의 `G1 recent source ordering or DB origin invalid`로 실패. 이전 W16 후 `permission denied`는 해결됐으나 `SELECT ... FOR SHARE`의 원본 행 선택이 실패했다.
- **원인/조치:** PostgreSQL 17 `SELECT FOR SHARE`는 SELECT 권한 외에 **UPDATE 행 보안 정책의 USING**도 통과해야 한다. `myeongha_seyeon_chat_runtime_owner`는 기존 subject-scoped SELECT RLS만 있고 UPDATE 정책이 없어 해당 원본 행이 숨겨졌다. 격리 SQL `16-g1-model-recent-source-pin.sql`에 **해당 NOLOGIN 소유자만** 현재 Subject의 행을 잠글 수 있는 UPDATE 정책을 추가했고 `WITH CHECK(false)`로 실제 UPDATE(동일 값 쓰기 포함)를 모두 거부한다. W16의 컬럼 한정 권한과 결합해서 행잠금만 가능하며 API/일반 역할 권한 및 public 실행 범위는 확대하지 않는다.
- **변경 파일:** `scripts/operations/seyeon-security-s0/16-g1-model-recent-source-pin.sql`, 본 Worklog.
- **후속 검증/운영:** 이번 수정 HEAD의 S0 격리 PostgreSQL·security·browser CI 재실행 결과는 성공 확인 전 PASS로 추정하지 않는다. Cloudflare Workers 빌드는 이전 인증 토큰 실패와 별개로 다룬다. 운영 DB/ACL/Provider/HTTP 공개 변경 없음; `HOLD_FORWARD_STOPPED` 유지.

### 2026-10-31 / W18 — #2786 Cloudflare Workers Builds 인증 RED 보정과 단독 재시도

- **증거:** [Cloudflare 빌드 3d3a382b-1e34-40ff-b521-860d165ad1b2](https://dash.cloudflare.com/410d3f82ed3ccc66609a2b698803859b/workers/services/view/myeongha/production/builds/3d3a382b-1e34-40ff-b521-860d165ad1b2)는 대상 HEAD `4864e397a1303b812bbdb0755f581c45fda539e9`에서 `npm run build:web` 성공 후 `npx wrangler preview`의 API 인증 오류 `10000`, `Invalid access token 9109`로 RED 확정.
- **원인 및 변경:** 동일 Worker의 다른 보안 브랜치 프리뷰 빌드가 새 토큰 `Workers Builds - 2026-10-31 16:30`으로 성공한 것을 확인했다. #2786 전용 빌드 트리거 `4ac94015-8944-4b39-847a-679856c679e4`의 `build_token_uuid`만 새 토큰 `75190e92-211a-45fc-86e5-21d08753da41`로 갱신했다. Branch filter·빌드·Preview 명령·운영 배포 설정은 변경하지 않았다.
- **재시도:** Cloudflare API에서 동일 HEAD로 빌드 `294a573a-d5e8-467e-a95e-1b68e7cd96c9`를 수동 생성했으며 최초 상태 `queued`를 확인했다. 최종 성공·GitHub PR check 갱신은 아직 확정하지 않는다.
- **남은 범위/운영:** #2786 GitHub PostgreSQL/Security/Browser 검증과 새로운 Cloudflare 빌드 결과, main 병합 확인 필요. 운영 `HOLD_FORWARD_STOPPED` 유지; Production DB/ACL/Provider/public Reveal 활성화 없음.

### 2026-10-31 / W19 — #2786 브라우저 검사 2/2 401·403 응답 경로 정합성 수정

- **RED 증거:** [GitHub Actions #41204675103, job #124547233944](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41204675103/job/124547233944)에서 확인 단계 `Verify multiple signup confirmation Guest handoffs`가 실패. 앞선 7개 handoff 시나리오는 PASS. 실패한 `records-life-401` 상황에서 브라우저의 실제 첫 Records 요청은 `/api/readings`였고, 테스트 서버는 이를 200으로 응답했다. 이후 `/api/life-record`가 호출되지 않아 원본 Member 인증 거부가 발생하지 않았으며 Member 세션이 남아 테스트가 실패했다.
- **구현:** `scripts/verify-web-auth-rejected-bearer-browser.mjs` 테스트 서버의 `/api/readings` 응답을 실제 첫 요청 순서와 일치시켰다. `records-life-401` Member 및 `records-guest-401` Guest에는 401, `records-life-403` Member에는 403을 반환한다. 기존 `/api/life-record`의 해당 사례 응답은 유지해 경로 순서 변화도 수용한다. 브라우저의 원래 401 무효화·403 유지에 대한 검증 기준을 완화하지 않았다.
- **변경 파일:** `scripts/verify-web-auth-rejected-bearer-browser.mjs`, 동일 Worklog. `node --check` 및 `git diff --check` 확인; 브라우저/CI PASS 여부는 새로운 HEAD 검사가 끝난 뒤 판정한다.
- **진행 및 운영:** #2786의 다른 CI와 Cloudflare Workers 빌드는 별도 판정; 이번 수정을 이유로 다른 트랙 검사를 취소하거나 운영 Production DB/ACL/Provider/HTTP 공개를 활성화하지 않는다. `HOLD_FORWARD_STOPPED` 유지.


### 2026-10-31 / W20 — #2786 최신 main 합류·브라우저 검사 충돌 해결

- **목적:** W19 브라우저 검사 수정 HEAD `030cea09cc8ff6593fcc99d63c1e44d1d094c195`가 최신 main의 다른 Records Guest 인증 시험 수정(#2796)과 동일 파일에서 충돌해 PR 상태가 DIRTY로 바뀐 것을 해소한다.
- **구현:** 최신 origin/main (`d9e25eee`) 합류 과정의 단일 충돌 `scripts/verify-web-auth-rejected-bearer-browser.mjs`를 직접 해결했다. main의 `/api/readings` Guest 거부 경로·추적 정보·미사용 mock API 제거를 유지하고, 첫 실요청인 `/api/readings`에 Member 401 및 Member 403 검사만 추가했다. 원래 무효화(401)/세션 유지(403) 검증 내용은 변경하지 않았다.
- **변경:** 최신 main과의 Git 통합 커밋 및 이 Worklog. 기존 보안 G1/G2/G3 소스는 그대로 보존하고 운영 범위는 넓히지 않았다.
- **검증/미완료:** 병합 파일 `node --check` 및 `git diff --check` 시행; 새 HEAD GitHub Browser/DB/Security와 Cloudflare 검사 결과는 실행 후 확인 전까지 PASS 아님. `HOLD_FORWARD_STOPPED` 유지.

### 2026-10-31 / W21 — #2786 PostgreSQL 17 역사 참여자 테스트의 중복 식별자 보정

- **실패 증거:** [CI #41205332272, postgres17 job #124549180802](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41205332272/job/124549180802). 기존 G1/G2/G3 실제 PostgreSQL 테스트 `test/seyeon-security-s0-postgres.e2e.test.ts`의 13건은 모두 PASS. 다음 `test/seyeon-security-s0-history-presence.e2e.test.ts`의 3건 중 1건이 `conversation_thread_characters_pkey` 중복(`a8150000-0000-4000-8000-000000000013`)으로 중단됐다.
- **수정:** 동일 임시 PostgreSQL 17 DB에서 앞선 G1 최초 공개 사례가 이미 사용한 `uuid(15,13)`과 역사 참여자 테스트의 Yeoul 조인 ID가 충돌했다. 역사 참여자 테스트에만 전용 미사용 `uuid(15,913)`을 부여했다. 참여자 이탈·교체, 타 Member 접근 차단, 실제 메시지 열람 HOLD 검증 로직은 그대로 유지한다.
- **변경 파일:** `test/seyeon-security-s0-history-presence.e2e.test.ts`, 본 Worklog. `git diff --check` 확인. 신규 HEAD의 CI 완료 전까지 해당 검사 PASS 판정 없음.
- **재실행 및 운영:** 해당 PR에 푸시해 자동 CI로 재검증하며, 무관한 다른 CI 진행 상태는 보안 구현 중단 사유로 삼지 않는다. 운영 DB/Provider/ACL/HTTP 공개 변경 없음. `HOLD_FORWARD_STOPPED` 유지.
### 2026-10-31 / W22 — G3 과거 세연 참여 이력의 DB 트랜잭션 잠금 (소스 후속 PR)

- **목적/구현:** 기존 `qry_seyeon_thread_ever_involved_v1`은 읽기 시점의 이전/현재 참여자 정보를 검증했지만, 그 검사와 해당 HTTP 트랜잭션의 후속 기록 조회 사이에서 새로운 참여자가 연결되는 경쟁을 동기화하지 않았다. SQL definer 함수의 Thread Owner/Subject 확인에 `FOR UPDATE` 잠금을 적용하고 함수의 속성을 VOLATILE로 변경하여 같은 Thread에 새로운 Character 참여자를 FK로 연결하려는 세션의 KEY SHARE와 충돌하도록 했다. 잠금은 동일 읽기 트랜잭션 종료까지 유지된다.
- **테스트:** 기존 disposable PostgreSQL 17 `test/seyeon-security-s0-history-presence.e2e.test.ts`에 **독립 DB 연결 두 개**로 검사 트랜잭션이 Thread를 잠그는 동안 경쟁 연결의 `FOR KEY SHARE`가 lock_timeout으로 거부되고, 원래 트랜잭션 종료 후 획득 가능함을 확인하는 사례를 추가했다. 과거 세연 참여 시 기존 HTTP History HOLD 및 타 사용자 404 검증은 그대로 유지한다.
- **수정 파일:** `scripts/operations/seyeon-security-s0/08-historical-thread-presence.sql`, `test/seyeon-security-s0-history-presence.e2e.test.ts`, 동일 Worklog. S0 격리 설치 소스만 수정하며 Production migration/DB/Provider/ACL/Reader 및 본문 공개 범위를 변경하지 않는다.
- **CI/한계:** `git diff --check` 확인. 새 HEAD CI와 PostgreSQL 경합 검사는 실행 후 결과 확인 전까지 PASS가 아니다. 이 잠금은 Character join FK 경쟁을 보호하는 G3 부분 구현일 뿐, 모든 Message/Grant 동시 변경 및 Replay 최초 공개를 승인하지 않는다. `HOLD_FORWARD_STOPPED` 유지.
### 2026-11-01 / W23 — G3 과거 참여자 수정 경합 잠금 추가 (PR 후속)

- **목적 및 구현:** #2809(W22)의 소유 Thread `FOR UPDATE`가 새로운 Character 참여자 `INSERT`와 충돌하는 반면, 기존 `conversation_thread_characters`의 `character_id` 또는 `left_at`를 바꾸는 `UPDATE`는 Thread FK 잠금을 다시 얻지 않을 수 있다. 동일 S0 역사 참여자 권한 함수(`08-historical-thread-presence.sql`)에서 **해당 Thread의 기존 참여자 전체를 `FOR SHARE`로 잠근 후** `ever_involved`를 계산하도록 추가했다. 참여자의 현재·과거 Character 변경은 다음 DB 읽기 트랜잭션까지 대기하며, History 본문 공개 허가로 사용하지 않는다.
- **격리 검사:** `test/seyeon-security-s0-history-presence.e2e.test.ts`에 실제 PostgreSQL 17 연결 2개로 같은 Thread의 기존 Se-yeon 참여자 `UPDATE`가 원본 권한 읽기 종료 전에는 lock timeout으로 거부되고 종료 후에는 행 잠금을 얻는 시나리오를 추가했다. 기존 W22 신규 참여자 FK 잠금/원본 이력/타 Member 차단 검사는 보존한다.
- **변경 파일:** `scripts/operations/seyeon-security-s0/08-historical-thread-presence.sql`, `test/seyeon-security-s0-history-presence.e2e.test.ts`, 동일 Worklog. 운영 DB·ACL·Provider·Reader·HTTP 공개 설정을 변경하지 않고 S0 격리 검증 소스만 수정한다.
- **검증 및 남은 과제:** PostgreSQL 17 잠금 의미는 현재 공식 문서의 `FOR SHARE` 대 `FOR NO KEY UPDATE` 충돌 관계와 일치한다. `git diff --check` 확인 후 후속 CI에서 실제 성공 확인 필요. 이 잠금은 기존 참여자 변경/신규 참여자 동시성을 제한하는 G3 부분 구현으로, 권한 취소·과거 Replay·출처 원본 전체에 대한 종료 증거는 아니다. 운영 `HOLD_FORWARD_STOPPED` 유지.
### 2026-11-01 / W24 — G3 Node 첫 응답 경로에서 Committed Replay 사전 차단

- **목적/구현:** 실제 운영 HTTP의 `committed_replay` 재공개 HOLD는 이미 존재하지만, 격리된 Node 직접 소켓 전송 `deliverSeyeonCommittedFirstZeroNodeTurnV1`이 `replayed=true` 메타데이터만 표시하고 DB에 원본 답변을 다시 읽게 요청할 수 있었다. 새 G3 source-only 방어는 `execution.disposition=committed_replay` 또는 `committedTurn.replayed=true` 중 **하나라도 참이면** DB의 잠금 원문 조회 전에 소켓을 닫고 명시적 `REPLAY_HOLD` 오류를 반환한다. 이는 승인된 첫 응답 동작만 유지하며 새로운 Replay 승인은 생성하지 않는다.
- **변경 파일:** `apps/api/src/seyeon-first-zero-node-turn-delivery-v1.ts`, `test/seyeon-first-zero-node-turn-delivery-v1.test.ts`, 동일 Worklog. 기존 Node 서버 응답 metadata와 Vercel Fetch / HTTP의 HOLD 정책은 그대로 유지한다.
- **검증:** 기존 Node 전송 격리 단위 테스트에 (1) Replay 실행 disposition, (2) 실제 Commit 영수증 replay 플래그 두 사례를 추가했다. 두 경우 준비 DB 조회 이후 보호된 원본 답변을 읽는 SQL을 호출하지 않고 Response body를 비우며 소켓을 종료하는지 검증한다. 정적 diff 검사 확인; 새 HEAD CI로 테스트·타입·통합 결과를 확인하기 전 PASS라고 주장하지 않는다.
- **선행/남은 작업:** 선행 #2809·#2812는 #2786 브랜치에 통합됐고 그 통합 HEAD의 필수 검사 GREEN 확인. #2786은 auto-merge 설정에도 `main` 병합 BLOCKED로 남아 있다. 아직 Reader 과거 본문·일반 Replay 권한·Proxy/Streaming·다중 원본·G4/G5/G6 승인/운영 종료는 HOLD. `HOLD_FORWARD_STOPPED` 유지.
### 2026-11-01 / W25 — #2814 RED 보정: Replay 사전 차단 이후 타입·테스트 정합성

- **실패/근거:** [#2814 CI #41214905363](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41214905363) 보안 작업이 TypeScript 컴파일 오류 2건으로 RED: Replay 여부를 먼저 차단하여 실행 결과가 `executed`로 좁혀졌음에도 그 아래 metadata에서 `committed_replay`를 다시 비교해 TS2367 발생. 단위 테스트 성공 응답 기대값에서 fixture 인수 외부의 `override` 변수를 참조해 TS2304 발생.
- **보정:** Node 전달 경계에서 사전 검증을 통과한 처음 응답의 `replayed:false`를 명시적으로 생성하고, 성공 응답 단위 테스트도 고정 `false`를 기대한다. 사전 `REPLAY_HOLD` 거부 조건이나 새 격리 테스트 두 건을 완화·삭제하지 않았다.
- **변경 파일:** `apps/api/src/seyeon-first-zero-node-turn-delivery-v1.ts`, `test/seyeon-first-zero-node-turn-delivery-v1.test.ts`, 누적 Worklog. `git diff --check` 통과; 수정 HEAD CI 결과는 추후 확인 전 PASS 아님.
- **운영:** G3 Replay 공개는 계속 금지이며 Production DB/ACL/Provider/Streaming/HTTP 경로 변경 없음. `HOLD_FORWARD_STOPPED` 유지.
### 2026-11-01 / W26 — G1 모델 선택 User 메시지 Digest DB 원문 재계산 (source-only)

- **발견:** `seyeon_private.pin_model_recent_sources_v1`은 모델이 선택한 `selectedModelMessageDigest`가 `sha256:v1:` 형태인지만 검사했고, 해당 값이 DB에서 잠근 정확한 User/Assistant 원문과 일치하는지는 검증하지 않았다. API 측 상관관계 검사가 있더라도 PostgreSQL Owner가 해당 원문 Digest를 독립 검증해야 하므로 G1 불변 증명 수준에 공백이 있었다.
- **구현:** 기존 `scripts/operations/seyeon-security-s0/16-g1-model-recent-source-pin.sql`의 잠긴 원본 `messageId`, 모델 role, DB `body_text`를 서버 `canonicalJson({messageId,role,text})`와 동일한 정렬 키 순서/UTF-8 JSON 문자열로 재조립하고 SHA-256을 직접 계산한다. 전달된 해시와 불일치하면 `seyeon_g1_recent_model_digest_mismatch`로 원자 트랜잭션에서 거부하며, Attempt Pin 저장과 뒤따르는 모델/Commit은 진행하지 않는다. 원문은 추가로 반환하거나 로그에 남기지 않는다.
- **격리 검증:** 기존 PostgreSQL 17 S0 실제 original Pin/Commit/Reveal 테스트에 64자리 형식은 정상이나 내용이 위조된 digest를 전달하는 부정 사례를 추가했다. 실패 시 Attempt의 G1 최근 Pin·positive Pin 및 생성된 Character 메시지가 없음을 확인한다. 정상 원문 해시를 통과시키는 기존 first Reveal/Replay 검사도 유지한다.
- **변경 범위:** 격리 SQL `16-g1-model-recent-source-pin.sql`, `test/seyeon-security-s0-postgres.e2e.test.ts`, 이 단일 Worklog. 운영 DB/ACL/Provider/공개 API·Reader·History/Replay 활성화 없음. `installerMayActivateProduction=false`, `git diff --check` 확인. CI에서 PostgreSQL 실제 해시 일치·거부를 검증하기 전까지 PASS 판정하지 않는다.
- **선행·남은 것:** #2814는 GREEN 후 #2786 브랜치에 병합됐다. #2786 main 자동 병합은 아직 BLOCKED이며 공식 G0~G6 종료 게이트는 통과한 상태가 아니다. 모델 전체 출처 Census의 DB 강제 서명, 다중 Memory/Life Fact/파생 이력, 운영 G2/G3/G4·G5/G6는 계속 미완료. `HOLD_FORWARD_STOPPED` 유지.
### 2026-11-01 / W27 — G1 실제 Chat 실행의 Memory-only Pin 우회 제거 (Provider 사전 차단)

- **선행:** [#2820](https://github.com/gycha0109-beep/MyeongHa/pull/2820)의 PostgreSQL 17, 보안·Governance·Web·Cloudflare CI GREEN을 확인한 뒤 기존 #2786 부모 브랜치에 squash 병합했다(merge SHA `6ac6a3fad457e703e134036ec81828b354e67401`). 부모의 main 병합은 여전히 BLOCKED, auto-merge는 설정된 상태다.
- **발견:** `runSeyeonProductionChatExecutionV1`의 1-Memory positive 실행은 combinedSourcePinPort가 없으면 구형 `positivePersonalSourcePort.pinBeforeModel`을 호출할 수 있었다. 그러면 Memory 원본 Pin만 남고 실제 모델 입력의 현재 User 원본을 DB Attempt에 함께 고정하지 않은 채 Provider 쪽으로 진행할 가능성이 있었다.
- **구현:** positive 1-Memory 분기에서 `positivePersonalSourcePort`와 `combinedSourcePinPort`를 모두 필수로 하며, **동일 트랜잭션의 Memory+현재 User 결합 Pin** 하나만 호출하도록 legacy fallback을 삭제했다. 두 출처의 결합 DB Pin을 사용할 수 없는 경우 기존 `SeyeonProductionChatExecutionErrorV1`로 Provider 진입 전에 차단한다. 현재 운영 Projector 기본 비활성, 0-Personal 흐름, 일반 Replay/History HOLD는 유지한다.
- **회귀 기준:** `test/seyeon-attempt-zero-personal-proof-v1.test.ts`와 `test/seyeon-exact-model-personal-source-selection-v1.test.ts`의 기존 Provider 이전 보안 순서 검증을 결합 Pin 필수·legacy 경로 부재 기준으로 갱신했다. `git diff --check` PASS. 로컬 worktree에는 vitest/typescript 설치본이 없어 CI에서 실행·타입 통과 확인해야 한다.
- **변경 범위:** `apps/api/src/seyeon-production-chat-execution-v1.ts`, 두 기존 테스트, 본 Worklog. 운영 DB/ACL/Provider/Reader/HTTP Route 설정은 변경하지 않는다. `HOLD_FORWARD_STOPPED` 유지. 전체 G0~G6 종료 판정 아님.
### 2026-11-01 / W28 — G2 원자 확정 시 현재 User DB 출처 Pin 필수화 (source-only)

- **선행 통합:** PR #2822 `403fc1a1`은 Security/Governance/Web/Cloudflare 필수 CI GREEN 후 부모 #2786 브랜치에 squash 병합(`a443d34983eac7c71eceeaf163a16c980b327647`). #2786는 main 자동 병합 설정 중이나 아직 BLOCKED.
- **발견:** `scripts/operations/seyeon-security-s0/02-atomic-commit.sql`의 실제 `validated -> committed` 전환 Trigger는 positive Memory Pin만 있고 `seyeon_recent_source_pin_jsonb`가 NULL인 경우 원본 User 재검증을 건너뛸 수 있었다. 상위 실행 경로의 G1 결합 Pin 필수 정책만으로는 독립 SQL/레거시 호출의 G2 보호가 완전하지 않았다.
- **구현:** positive Memory Commit 분기에 현재 User 원본 G1 Pin을 의무화했다. 없으면 `seyeon_positive_g2_recent_source_pin_required`로 해당 Commit 트랜잭션을 실패시키고, 기존 SQL trigger의 동일 DB 트랜잭션 안에서 User 본문·원본 해시/Grant/Memory 정합성 검사와 assistant/outbox 원자성을 유지한다. 0건 비개인정보 Commit·다른 앱 운영 함수·공개 범위 변경 없음.
- **PostgreSQL 검증:** 기존 S0 disposable PostgreSQL 17 통합 테스트의 positive 정상 fixture는 최근 User 원본을 G1으로 먼저 고정하도록 갱신했다. 신규 부정 케이스는 구형 Memory-only Pin을 강제로 생성해 G2 Commit 거부 및 validated Attempt 상태 유지와 assistant 메시지 생성 0건을 검증한다. CI 통과 전 결과 PASS 아님.
- **변경:** `02-atomic-commit.sql`, `test/seyeon-security-s0-postgres.e2e.test.ts`, 누적 보안 Worklog. `git diff --check`와 `plan.mjs`의 `installerMayActivateProduction=false` 확인. Production DB/ACL/Provider/HTTP/Reader 활성화 없음. `HOLD_FORWARD_STOPPED` 유지.

### 2026-11-01 / W29 — G3 내부 Node 송신 함수의 Replay 직접 호출 차단 (source-only)

- **독립 작업:** G2 최근 User Pin 필수화 #2823의 PostgreSQL 17 CI가 실행 중이어서 별도의 G3 전송 경계를 구현했다. 부모는 CI GREEN으로 확인된 #2786 통합 HEAD `a443d34983eac7c71eceeaf163a16c980b327647`이며 운영 병합·활성화는 별도다.
- **발견:** 상위 `deliverSeyeonCommittedFirstZeroNodeTurnV1`은 이미 `committed_replay`와 `commit.replayed=true`를 차단하지만, 재사용 가능한 하위 `sendSeyeonNodeOriginalGrantResponseV1`은 전달 받은 `chatResponseMetadata.replayed=true`를 단순 출력 메타데이터로 취급했다. 직접 호출 시 DB 원문 조회 경로가 실행될 가능성이 있어 소켓 경계 자체에도 Replay 인가 차단이 필요했다.
- **구현:** Node 응답 송신 전 메타데이터가 유효하더라도 `replayed=true`이면 `SeyeonNodeOriginalGrantSendBoundaryErrorV1`을 발생시키고 소켓을 파기한다. DB 원본 읽기 callback/Provider 호출/본문 송신은 실행되지 않는다. 0건·정상 최초 응답·권한 없음 503 동작 및 비스트리밍 유지. 기존 HTTP/Reader·Provider/ACL/DB 설정 변경 없음.
- **검증:** 실 Node 송신 경계 단위 테스트에 `replayed=true` 시 소켓 파기와 DB 읽기 0회를 검증하는 케이스를 추가하고, 기존 권한 없음 503 검사는 처음 요청인 `replayed=false`에 대한 거부로 유지했다. `git diff --check` 확인. 새 CI GREEN 전까지 결과 PASS는 미확정.
- **범위:** G3 source-only 후보, 실 Production Route 공개하지 않음; 전체 개인기록/과거 Replay 승인하지 않음. `HOLD_FORWARD_STOPPED` 유지.

### 2026-11-01 / W30 — G3 최초 공개에 원본 User G1 Pin 필수화 (source-only)

- **선행:** #2823(PostgreSQL 17/보안/Governance GREEN)을 부모 #2786에 squash 병합(`8f9d36ff92d113bc437740d72893989c712b1a3d`). #2824는 W28/W29 동일 Worklog의 충돌을 해소하고 병합 커밋 `f92ea00f`를 별도 PR HEAD로 재검증 중이다.
- **발견:** 실제 G3 최초 공개 SQL(`04-locked-reveal.sql`)의 original User G1 최근 출처 증명은 검증 로직이 있어도 Pin이 없는 옛 Memory-only Attempt를 그대로 통과시키는 선택적 분기였다. G1 모델 전 결합 Pin 및 G2 Commit 필수 정책과 달라 오래된 응답을 최초 공개하는 별도 통로가 남아 있었다.
- **수정:** 동일 G3 PostgreSQL owner 함수가 기결 Commit·Attempt를 잠근 이후 `seyeon_recent_source_pin_jsonb`가 NULL이면 보호된 Assistant 본문/Grant를 조회하기 전에 아무 행도 반환하지 않고 HOLD한다. Pin이 존재하면 원래와 동일한 `messageId`/Subject/Thread/Turn/Attempt 및 현재 DB 원문 해시 검증을 적용한다. 실제 운영 Migration·API ACL·Provider 호출·공개 Route·스트리밍을 활성화하지 않는다.
- **검증 범위:** 기존 S0 PostgreSQL 17 실제 결합 User Pin + 첫 Reveal 통합 테스트를 보존하고 `git diff --check`, `plan.mjs installerMayActivateProduction=false` 확인. 레거시 과거 Commit fixture를 신규 운영 데이터로 변조하지 않으며, 신선한 HEAD CI 결과 전까지 전체 PASS라고 주장하지 않는다.
- **남은 것:** G0 전체 출처/Streaming 권한 계약, G1 다중 기록/파생 출처, G2/G3 실제 운영 배포 승격, G4 일반 크레딧 결제 종단, G5/G6 최종 검증·승인. `HOLD_FORWARD_STOPPED` 유지.

### 2026-11-01 / W31 — #2786 db-authority-core R24 재전송 테스트 정책 정합화

- **실패 근거:** [GitHub Actions #41223846354 / db-authority-core #124603850941](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41223846354/job/124603850941). disposable PostgreSQL R5 테스트 16건 중 15건 통과, `R24 real G2 committed receipt to Node G3` 1건이 `UND_ERR_SOCKET`으로 RED. 레거시 R24 테스트가 valid Grant의 `committed_replay` 원문 재전송 HTTP 200을 기대했으나, 통합된 G3 Node 송신 경계 W29는 replay=true에 소켓을 즉시 닫도록 강화되어 충돌했다.
- **조치:** `test/seyeon-r5-current-reveal-disposable.test.ts`의 R24 통합 검증을 **처음 응답 200** 및 **replay는 처음/Grant 취소·다른 Grant 재발급 이후 모두 연결 종료·HTTP 본문 없음·보호된 DB connect 0회**로 정합화. Replay 예외의 구체적인 차단 메시지와 파기된 Node socket을 확인한다. 오래된 200 replay 승인이나 503 응답을 가정하지 않는다. 다른 실제 DB R5 revoke/regrant 및 첫 응답 원자 확정 테스트 유지.
- **변경 파일/검증:** R24 통합 테스트와 이 단일 보안 Worklog만 변경. `git diff --check` 확인. 실제 db-authority-core 재실행 CI 확인 전에는 PASS라고 표시하지 않는다.
- **운영:** Production DB/ACL/Provider/공개 응답/기존 G3 전송 방어 코드 변경 없음. `HOLD_FORWARD_STOPPED` 유지, 전체 G0~G6 종료 판정 아님.
### 2026-11-01 / W32 — G4 첫 Memory 회원 크레딧 예약 권한 결합 및 Provider 사전 HOLD (source-only)

- **선행 상태:** PR #2786 HEAD `70b5e768`에서 db-authority-core 포함 필수 보안/PostgreSQL17/Browser/Governance/Web/Cloudflare CI 전부 GREEN 확인. 자동 병합은 설정되었지만 `main` 병합은 GitHub에서 BLOCKED.
- **실제 G4 공백:** `commerce-chat-credit-gate-v1` / `postgres-chat-credit-candidate-v1` / `commerce-chat-credit-delivery-ack-candidate-v1`의 10크레딧 원자 예약·전달 ACK 정산 후보가 있지만, 세연의 첫 Memory 모델 입구는 그 예약을 필수로 요구하지 않았다. 서버 Governor의 모델 비용 원장만으로 고객 채팅 크레딧 권한을 대신할 수 없다.
- **구현:** `seyeon-g4-first-memory-credit-admission-v1.ts` 후보를 추가. 기존 검증된 Member 증거를 하나의 PostgreSQL Subject 트랜잭션에서 canonical Subject로 변환하고, 같은 트랜잭션의 DB Owner Admin 권한 함수와 기존 private 10-credit reserve 포트를 순서대로 호출한다. DB 확인된 Owner Admin의 chatCreditExempt만 예약을 생략한다. 부족·충돌·기확정 Replay·권한 불일치·Guest·위조 exemption은 모델 입장 권한으로 변환하지 않고 ROLLBACK한다. 별도 HTTP 공개나 API EXECUTE는 없다.
- **실행 연결:** `production-seyeon-first-memory-node-runtime-v1.ts`에서 사용자가 승인한 Memory/Governor 자격만으로 모델 설정을 읽을 수 없도록 `creditBilling.productionMounted`를 추가로 검사하고, 해당 권한이 승인·장착되기 전에는 Provider credential 읽기 전에 HOLD한다. 향후 실제 정산 종단이 연결된 경우에만 현재 User/Thread/ClientTurn 기준 예약 함수가 모델 호출 전 수행될 후보 결합이다. `creditBilling.productionMounted=false` 고정 유지, **실제 예약/결제 실행·공개 모델 호출은 활성화하지 않음**.
- **테스트:** `test/seyeon-g4-first-memory-credit-admission-v1.test.ts`로 canonical Member/원자 예약/Owner exemption/부족·충돌·기확정·Guest·위조 권한 거부/트랜잭션 종료를 검증. 기존 첫 Memory 노드 실행 검증에는 승인 콜백이 true여도 크레딧 정산이 장착되지 않으면 Provider 키 읽기 없이 HOLD하는 사례를 추가. `git diff --check` 확인. 로컬 워크트리는 vitest/tsc 실행파일이 없어 새 PR CI 결과를 기다려야 한다.
- **미완료:** 원본 응답 전달 ACK와 예약 정산/실패 해제의 실제 종단·운영 DB 역할/권한·일반 결제 크레딧 배포는 여전히 별도 필요. 본 구현은 G4 종료 판정·Provider/결제 운영 활성화가 아니다. `HOLD_FORWARD_STOPPED` 유지.
### 2026-11-01 / W33 — G4 같은 예약의 중복 Provider 입장 차단 (#2833 보강)

- **발견/보정:** 결제 트랙의 `reserveChatReplyCreditsV1`은 DB 원자 반환 `reserved`와 `already_reserved`를 공통 `reservation`으로 정규화한다. 이를 새 Provider 입장 권한으로 무조건 수용하면 동일 ClientTurn 재시도로 중복 유료 AI 호출이 가능하다.
- **구현:** G4 첫 Memory 예약 후보가 기존 서버 검증·원자 예약 함수를 그대로 이용하면서 DB 원본 결과가 **새로운 `reserved`** 인 경우에만 첫 모델 입장을 인정한다. `already_reserved`는 기존 예약/기확정 Turn의 조회·전달 경로에서 별도 처리되어야 하며, 신규 Provider 호출은 `SEYEON_G4_CREDIT_ADMISSION_HOLD`로 거부하고 해당 후보 트랜잭션을 ROLLBACK한다.
- **검증:** G4 후보 단위 검증에 재예약 경합의 `already_reserved`를 거부 사례로 추가. 새 커밋 CI GREEN 전에는 테스트 통과를 추정하지 않는다. 결제/AI 실제 Production 권한은 변경하지 않았으며 `creditBilling.productionMounted=false`, `HOLD_FORWARD_STOPPED` 유지.
### 2026-11-01 / W34 — G4 첫 Memory 예약에 원본 Turn 연계 및 전달/미전달 정산 후보 연결

- **선행:** #2786 HEAD `af6c220f1a323d5a48ac8d7702d3dd5700ac011b` 필수 CI(db-authority-core·PostgreSQL 17·Work Track·Governance·Web·Auth Browser·Cloudflare 등) GREEN 확인. #2786는 main 병합 BLOCKED, auto-merge 설정 유지. 운영 `HOLD_FORWARD_STOPPED`.
- **발견:** #2833의 신규 10-credit Admission은 canonical Member/Thread/ClientTurn에 대해 DB 원자 예약 후 `reservationId`를 반환하지만, 최초 AI 전달 후 고객 크레딧 정산·확정 미전달 환불을 같은 원본 예약에 묶은 세연 전용 내부 연결부가 없었다. 기존 결제 트랙은 독립된 `internal_cmd_chat_credit_ack_delivered_proven_v2`와 `releaseFailedChatCreditsCandidateV1`의 DB 검증 계약을 제공하며 HTTP ACK는 아직 미장착.
- **구현:** `seyeon-g4-first-memory-credit-admission-v1.ts`의 성공 신규 예약에 canonical Subject/Thread/ClientTurn 세 식별자를 명시적으로 포함한다. 신규 `seyeon-g4-first-memory-credit-reconciliation-v1.ts`는 서버가 보유하는 해당 예약과 별도로 검증된 Member identity를 새 PostgreSQL Subject 트랜잭션에서 교차 검증한 뒤 (1) **confirmed_delivered**는 정확한 committed Turn+Assistant 및 S0 positive delivery receipt를 DB가 증명한 경우에만 기존 private 10-credit ACK/settlement 함수를 호출하거나 (2) **definitive_undelivered**는 원본 ChatTurn에 commit/delivery가 전혀 없고 DB의 terminal failed state 증명이 있는 경우에만 기존 private reservation release 함수를 호출한다. 소켓 `finish`, LLM 완료, 클라이언트 boolean, 일반 네트워크 오류만으로는 정산/환불하지 않는다. 커밋/출처가 맞지 않으면 ROLLBACK한다.
- **테스트/검증:** 기존 G4 예약 테스트 성공 결과에 Thread/ClientTurn 일치 검사를 추가하고, 새 격리 트랜잭션 테스트에 실제 함수 호출 인자, DB 거부 시 rollback, 미전달 증명 없이는 refund 없음, Member·Subject·예약·assistant 변조 거부를 추가했다. `git diff --check` 검사. 로컬 worktree에 node_modules가 없어 실제 Vitest/PG 검사는 신규 HEAD CI로 확인하며 GREEN 전까지 통과 선언하지 않는다.
- **출시 차단/남은 것:** 소스 후보와 기존 내부 결제 함수 조립에만 해당한다. 정산 API EXECUTE·HTTP route·실제 결제 크레딧 사용자 지갑·Node→고객 수신 ACK·독립 PostgreSQL 증명까지 G4 운영 승격은 미완료. 후보 `productionMounted:false`, 세연 `creditBilling.productionMounted:false`, Producer/Worker/공개 API·DB migration 변경 없음. `HOLD_FORWARD_STOPPED` 지속.
### 2026-11-01 / W35 — G4 원본 전달 ACK·환불 DB 권한 실증 (격리 PostgreSQL)

- **선행:** PR #2834의 GitGuardian·Work Track·Governance·Web·Cloudflare/CI 필수 검사 GREEN 확인 후 부모 #2786에 squash 병합(`5d34e2029a095798cce71efd2525521d14df7458`). 단, #2834 개별 PR에서 `db-authority-core`는 SKIPPED였으므로 실제 PostgreSQL PASS는 주장하지 않았다. 부모 #2786의 `main` 자동 병합은 여전히 BLOCKED.
- **구현:** 기존 `test/db/run_authority_core.sh`의 격리 Commerce Credit Candidate 하위 실행기 `test/db/candidates/chat_credit_private_ledger_v1.sh`에서, 기존 후보 DDL·회귀 확인 후 **이름이 고정된 `myeongha_commerce_credit_candidate_test` / CI=true / PGHOST=localhost** 조건에 한해 기존 미배포 private ACK V2 SQL(`20261027125500_chat_credit_delivered_ack_private_v1.sql`)을 격리 DB에만 설치하고 새 SQL 증명 테스트를 실행하도록 확장했다. Production Migration 파일·운영 DB·실제 크레딧 RPC EXECUTE는 변경하지 않는다.
- **신규 PG 테스트:** `test/db/candidates/chat_credit_g4_original_delivery_reconciliation_v1_test.sql`은 임시 Member/Thread/Turn/크레딧 예약을 하나의 ROLLBACK 트랜잭션으로 생성하고 (1) 새 예약 1건만 허용, 동일 ClientTurn의 `already_reserved` 반환과 10크레딧 중복 차감 방지, (2) 미확정/미전달 답변이나 허위 reservationId로 private ACK V2 정산 시도 시 실패 및 예약 유지, (3) 미확정 진행 중인 Turn은 환불 근거가 될 수 없고, **최종 failed_final + 결제 없는 Turn**만 환불 적격, (4) 동일 예약 두 번 해제 시 잔액 정확히 복원, 해제 후 늦은 ACK 정산 거부, (5) API executor/authenticated/service_role의 private ACK V2 EXECUTE 없음 검증을 수행한다.
- **검증:** `git diff --check` 및 CI 라우팅에서 `test/db/` 변경은 `db-authority-core` 실행 대상으로 확인. 사용자 PC에서는 Docker Linux Engine이 비활성 상태이므로 로컬 실증을 수행하거나 운영 DB를 건드리지 않았다. 새 HEAD의 실제 PostgreSQL CI 성공 전까지 PASS 판정하지 않는다.
- **남은 것:** G4 정식 전달 ACK 수신자/내부 권한 배포, 실제 긍정 전송→정산 성공 실 DB 경로, 불확정 장애에서 예약 장기 보류/복구, 전반적인 DB·HTTP·Provider 서비스 연결 및 G5/G6 완료 게이트. G0~G6 완료 판정 아님, `HOLD_FORWARD_STOPPED` 유지.
### 2026-11-01 / W36 — G4 미전달 환불 동시성 잠금 순서 정합화 (source-only)

- **선행:** PR #2838 `db-authority-core`를 포함한 필수 CI GREEN 확인 후 #2786에 squash 통합(`f09517b756e60df19cf3da9967b84eee08a253b3`). 해당 HEAD의 전체 통합 CI는 재실행 중이며 `CI Integration Verify` 요구사항이 충족되기 전에는 `main` 자동 병합이 차단된다.
- **발견:** `reconcileSeyeonG4FirstMemoryCreditsV1`의 최종 실패 환불 경로는 기존 `releaseFailedChatCreditsCandidateV1`의 Turn `FOR SHARE`를 먼저 수행한 후 DB finalize에서 Subject/Reservation을 `FOR UPDATE`한다. 반면 private Delivery ACK V2의 잠금 순서는 Subject → Reservation → Turn이므로 동시 ACK/환불 경합 시 잠금 순서 역전 위험이 있었다.
- **수정:** 내부 G4 Candidate의 환불 경로는 정산할 exact canonical Member `subjects`를 `FOR UPDATE`하고, 원본 `reservationId` + 동일 Subject/Thread/ClientTurn + 정확히 10크레딧 및 현재 `reserved` 상태를 `FOR UPDATE`로 잠근 **후에만** terminal failed/no-delivery Turn 증명을 수행한다. 예약이 없거나 소유자/상태가 달라지면 즉시 HOLD 및 트랜잭션 롤백하고 환불 SQL을 호출하지 않는다. 성공 ACK 쪽 DB 기존 잠금 순서는 변경하지 않는다.
- **검증:** `test/seyeon-g4-first-memory-credit-reconciliation-v1.test.ts`에서 Subject → Reservation → Turn 증명 → Finalize 순서를 검사하고, 기존 예약이 없을 때 본문 확인/환불 0회와 rollback을 검증한다. `git diff --check` 확인, 새 PR CI 실행 전 GREEN 판정 아님.
- **권한/출시:** 실행 SQL은 여전히 private 후보로, `myeongha_api_executor`에 Ledger 테이블/정산 RPC 접근 권한이 허용되지 않아 별도 승인된 Server Owner DB 포트 구축 전 운영 연결 불가. SQL Migration, ACL grant, HTTP, Provider, 실제 결제는 변경하지 않는다. `creditBilling.productionMounted=false`, `HOLD_FORWARD_STOPPED` 유지. G4/G5/G6 완료 아님.
### 2026-11-01 / W37 — G4 회원 인증 역할과 비공개 크레딧 예약 역할 분리 (source-only)

- **선행:** PR #2786 HEAD `859cca255d5c06dfc040af034598f809f451f8e9` 일반 필수 CI 모두 GREEN. GitHub Actions `CI Integration Verify`를 HEAD/현재 `main` SHA에 고정해 [#41237078670](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41237078670)으로 dispatch. 이 검사가 성공하기 전에는 #2786을 병합 완료로 선언하지 않음.
- **발견:** 기존 G4 Credit Admission 후보는 `executePostgresSubjectTransactionV1`의 일반 `myeongha_api_executor` 역할로 private `internal_cmd_chat_credit_reserve_v1`을 직접 호출했다. 해당 RPC는 PUBLIC 및 사용자 API 역할에서 EXECUTE가 철회된 비공개 결제 권한이어서 실제 서비스에 연결하면 예약이 거부된다. 결제 RPC를 사용자 역할에 GRANT하거나 일반 User DB 역할을 상향해서는 안 된다.
- **구현:** `admitSeyeonG4FirstMemoryCreditsV1`을 두 독립 경계로 분리했다. 첫 번째 트랜잭션은 기존 일반 RLS 회원 역할로 인증된 Member를 canonical Subject로 resolve하고 DB 소유 Owner Admin 예외만 확인한다. 유료 Member만 두 번째 **별도 내부 Commerce 전용 연결**을 사용해 `SET LOCAL ROLE myeongha_commerce_internal_executor`, 트랜잭션 한정 canonical Subject 바인딩 후 기존 원자 10-credit reservation RPC를 호출한다. 신규 예약만 모델 진입 권한으로 인정하며 기존/기확정/부족 예약은 private 트랜잭션 롤백. 동일 Pool 객체로 일반/비공개 연결을 재사용하거나 Guest/위조 owner이면 출발 전 HOLD한다. 각 DB 역할·Subject 설정은 개별 COMMIT/ROLLBACK에서 해제된다.
- **실행 연결:** 첫 Memory Node 실행 후보는 새 `privateCreditPool`을 명시적으로 받아야 하며 미구성 시 Provider credentials 조회 전 HOLD. `creditBilling.productionMounted=false`가 우선하여 실제 DB 예약/모델 호출은 여전히 절대 실행되지 않음. 기존 일반 `pool`을 비공개 Pool로 몰래 재사용하지 않는다.
- **검증:** 기존 G4 예약 테스트를 일반/비공개 두 개의 독립 Pool 모형으로 변경해 역할·Subject 및 예약 호출 위치, Owner exempt의 비공개 연결 0회, 부족/중복 요청 private ROLLBACK, 두 Pool 동일 객체 거부를 확인한다. `git diff --check` 확인; 신규 PR CI GREEN 이전에 PASS 판정 없음.
- **미완료:** 기존 G4 Reconciliation 후보도 일반 역할에서 private ACK/환불 RPC를 직접 호출하므로 동일한 역할 분리 이행이 다음 구현 과제다. 전용 Commerce 역할에 private G4 최소 EXECUTE가 실제 부여된 적 없으며, 별도 범위 제한/격리 PostgreSQL 증명·승인 후에만 운영 DB 권한 변경 가능. 공개 HTTP ACK와 전달 재조정/미확정 복구도 미완료. 운영 `HOLD_FORWARD_STOPPED`, G4/G5/G6 정식 완료 아님.
### 2026-11-01 / W38 — G4 원본 전달 정산·환불도 Member/Commerce DB 역할 분리 (source-only)

- **연속 구현:** W37(#2843)의 첫 Memory 신규 예약에 이어 `reconcileSeyeonG4FirstMemoryCreditsV1`에서 같은 비공개 정산 권한 문제를 제거한다. 기존에는 일반 RLS `myeongha_api_executor` 트랜잭션에서 private ACK V2 및 크레딧 예약 표·환불 RPC에 직접 접근하므로, 실제 권한이 정상적으로 잠겨 있으면 실행 실패해야 하는 후보 구조였다.
- **구현:** 인증된 Member에 대한 별도 `executePostgresSubjectTransactionV1`로 canonical Subject를 재확인하고, 그 식별자가 최초 reservation과 일치할 때만 별도 `privateCreditPool`에서 `executePostgresCommerceInternalTransactionV1`을 개시한다. Commerce 역할을 트랜잭션 한정으로 진입하고 canonical Subject를 바인딩한 후에만 기존 원본 delivery ACK V2 또는 확정 미전달 환불 SQL을 호출한다. 해당 비공개 TX에서 Owner → 정확한 예약 → 원본 Turn 잠금 순서는 W36과 동일하게 유지한다.
- **차단:** 일반/비공개 Pool 객체가 동일하거나 Guest/Member 불일치·예약/응답 출처 불일치면 정산·환불 전 HOLD. 기존 중복 정산 방어, 네트워크 오류 시 환불 금지, 실제 사용자 전달 영수증 요구는 변경하지 않는다.
- **검증:** 기존 `test/seyeon-g4-first-memory-credit-reconciliation-v1.test.ts`에서 두 개의 독립 Pool 실행, 일반 API 역할 후 내부 Commerce 역할 전환, private TX 내 Subject 바인딩 후 ACK 실행 순서, 동일 Pool 사용 거부, original DB 거부 시 rollback 및 환불 0회를 검사하도록 수정했다. `git diff --check` 확인. 신규 HEAD CI GREEN 이전에 PASS 판정하지 않음.
- **남은 것:** 실제 비공개 Commerce 역할의 G4 reserve/ack/finalize 최소 EXECUTE 권한은 운영에 부여하지 않았고 별도 격리 실증·배포 승격이 필요하다. 검증된 서버 영수증 수신·정산/환불 재시도 복구, Gate G5/G6도 미완료. 기존 `creditBilling.productionMounted=false`, `HOLD_FORWARD_STOPPED` 유지.
### 2026-11-01 / W39 — G4 전용 Commerce 역할 최소 RPC 권한 실증 (격리 PostgreSQL 전용)

- **선행:** #2786 최신 HEAD `52c20b3f` 일반 필수 CI GREEN, `main` 병합 가능 상태. 정확한 HEAD/현재 main 기준 필수 전체 CI Integration Verify [#41240412201](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41240412201) 진행 중; 자동 병합 설정 유지. G4 Member/Commerce DB 역할 분리 #2843 HEAD `ce7e6788` CI GREEN.
- **확인:** W37/W38의 일반 회원 인증 트랜잭션과 private Commerce 전용 트랜잭션을 분리했어도 private 역할에 예약/ACK 최소 EXECUTE가 설치된 적 없어 운영 G4는 의도적으로 HOLD다. 광범위 테이블 권한이나 일반 `myeongha_api_executor`에 크레딧 RPC를 부여해서는 안 된다.
- **구현:** 기존 격리 `chat_credit_private_ledger_v1.sh`의 고정된 disposable PostgreSQL CI 데이터베이스 안에서만 새 `seyeon_g4_private_credit_role_only_v1.sql`을 적용한다. 비공개 `myeongha_commerce_internal_executor`에 **기존 원자 예약 RPC**와 **원본 전달 증명 ACK V2**의 EXECUTE만 허용하고, 예약 테이블 직접 SELECT/UPDATE·범용 finalize/실패 환불·신규 충전 발행 권한은 열지 않는다. Production Migration/ACL은 수정하지 않는다.
- **실증 테스트:** 새 `seyeon_g4_private_credit_role_only_v1_test.sql`은 실제 `SET LOCAL ROLE myeongha_commerce_internal_executor` 및 현재 transaction 한정 canonical Subject 바인딩 후 실제 private reserve 10-credit 성공·동일 Turn 중복 예약 거부, 원본 미전달 ACK 정산 거부, wallet table 직접 권한 없음, 일반 회원/API·authenticated·service_role RPC EXECUTE 없음 검증을 수행하고 전 데이터를 ROLLBACK한다. 기존 W35 원본 전달/환불/권한 테스트도 그대로 유지한다.
- **범위/한계:** private 후보 권한·테스트는 CI=true, PGHOST=localhost, PGDATABASE=myeongha_commerce_credit_candidate_test 검증 후 격리 DB에서만 실행한다. 환불에는 별도 원본 DB 권한/최종 실패 증명이 필요한 만큼 **환불용 비공개 SECDEF 인터페이스는 아직 미장착**이다. 결제 운영 권한, public HTTP, Provider, 고객 유료 실행은 모두 `HOLD_FORWARD_STOPPED` 유지. 신규 HEAD의 실제 PostgreSQL CI GREEN 전에는 PASS를 추정하지 않는다.
### 2026-11-01 / W40 — G4 확정 미전달 환불 최소 권한 DB 함수 및 실제 격리 PG 검증 (source-only)

- **선행:** #2786는 HEAD 전체 `CI Integration Verify` 포함 GREEN으로 `main` 병합 완료. #2846 실제 `db-authority-core` GREEN 후 #2843에 통합(`#2846` squash `1445e0f901ec4e7b8d1113ba6d30f2c22731d789`). #2843은 `main` 대상으로 새 CI 실행 중.
- **발견:** W37/W38의 private Commerce 역할 분리 및 W39의 reserve/ACK 최소 EXECUTE만으로는 확정 미전달 환불이 불가능했다. 기존 `releaseFailedChatCreditsCandidateV1`은 private role이 접근해서는 안 되는 예약·Turn 테이블과 generic `internal_cmd_chat_credit_finalize_v1`을 직접 사용한다. 이 역할에 넓은 SELECT/UPDATE 또는 범용 finalize EXECUTE를 여는 것은 본 G4 최소 권한 원칙과 충돌한다.
- **구현:** `seyeon_g4_private_credit_refund_proven_v1.sql`에 별도 SECDEF 환불 RPC `internal_cmd_seyeon_g4_credit_refund_proven_v1(Subject,Thread,ClientTurn,Reservation)` 추가. 검증된 transaction-local canonical Member context를 확인하고, DB 원본 Subject(active Member) → 일치하는 10크레딧 reserved Reservation → terminal failed_final/abandoned이며 committed_attempt_id/committed_at/delivered_at 모두 NULL인 실제 ChatTurn 순으로 잠금·원본 검증 후 **한 번만** 기존 finalize(false,null)을 내부에서 호출한다. 네트워크 실패, retryable 실패, 다른 ClientTurn/Reservation, 이미 환불/정산된 예약에는 실행 불가. EXECUTE는 내부 Commerce 역할에만 주고 일반 API/browser/service_role에는 주지 않으며 generic finalize/장부 테이블 권한은 열지 않는다.
- **Node 경계:** `seyeon-g4-first-memory-credit-reconciliation-v1.ts`는 실패 경로의 일반 SELECT/owner/reservation/Turn SQL과 generic finalize 경로를 제거하고, 정확한 원본 네 ID로 단일 SECDEF refund RPC만 호출한다. 기존 delivery proven ACK V2/Member 사전 인증/분리된 private Commerce 연결/rollback 유지. 해당 후보는 실제 고객 요청이 아닌 `productionMounted:false` 별도 경로다.
- **DB 실증:** 기존 named disposable `myeongha_commerce_credit_candidate_test`에서만 전용 DDL 적용 후 격리 SQL로 비로그인 내부 역할 전환, 10크레딧 예약, 미확정 Turn 환불 거부, 원본 실패 확정 후 정확한 환불, 다른 ClientTurn·중복 환불·늦은 ACK 거부, 50크레딧 원복 및 일반/API/service 권한 없음 검증. 테스트 전체 `ROLLBACK`. `test/seyeon-g4-first-memory-credit-reconciliation-v1.test.ts`도 내부 RPC 전송 인자·트랜잭션/잘못된 증명 롤백에 맞춤. `git diff --check` 확인; 새 CI PASS 전 실제 DB 검증 성공으로 선언하지 않는다.
- **운영:** Producer/Worker/HTTP/유료 결제/인증 DB/Production Migration 및 실제 권한 부여 없음. 고객 전달 ACK/실제 도착 영수증, 전송 중단 예약 복구와 운영 통합/최종 검증은 미완료. `creditBilling.productionMounted=false`, `HOLD_FORWARD_STOPPED` 유지.
### 2026-11-01 / W41 — G4 첫 보호 답변 원본 수신 증거·10-credit 정상 정산 성공 경로 격리 DB 검증

- **선행:** #2843 HEAD `332adc3046d84db5a7b60f10c9bbeff2710c43df` 필수 Integration Verify 포함 전체 CI GREEN 뒤 `main` squash 병합(`b0ee5d2a3e87e4c3029729ff1fd30cd0aced8bcb`). 회원 DB 역할과 비공개 Commerce DB 역할 분리, 원본 전달 확인 정산·최종 미전달 환불 후보는 통합됐지만 실제 고객 유료 호출/운영 활성화는 되지 않았다.
- **검증 공백:** W35/W39/W40 DB 검증은 잘못된 positive ACK 거부·실패 환불·권한 최소화에 집중했다. 같은 원본 Member/Thread/ClientTurn/CommittedTurn/Attempt/Assistant/Reservation에 대한 **성공적인** private ACK V2 10-credit 정산과 멱등 재시도 증명이 빠져 있었다.
- **추가:** `test/db/candidates/seyeon_g4_positive_delivery_settlement_v1_test.sql`은 기존 `myeongha_commerce_credit_candidate_test` 격리 PostgreSQL에서만 실행된다. 임시 회원·콘텐츠·대화·실제 생성/검증/확정된 Attempt 및 assistant Message 연관 관계와 원본 전달 완료 Turn, **합성된 DB persisted S0 positive 수신 마커**를 하나의 ROLLBACK 트랜잭션에서 만든다. 일반 권한이 아닌 `SET LOCAL ROLE myeongha_commerce_internal_executor`로 예약하고, 잘못된 AssistantMessage 정산 거부, 정확한 원본으로 첫 정산 성공, 동일 ACK 재시도 멱등, 같은 ClientTurn 재예약 `committed_replay`, 이미 정산된 Turn 환불 거부를 검증한다. DB owner로 돌아온 뒤 예약 `settled`, 크레딧 할당 합계=10, 사용 가능 잔액=40을 재확인한다.
- **한계:** 여기서 S0 positive receipt 필드는 격리 SQL에서만 만드는 **합성 저장 상태**다. 실제 S0 영수증 발급·사용자 수신·진위 검증·클라이언트 → HTTPS ACK → private Credit settlement 경로의 인증·통합을 대신하지 않는다. 이 부분은 여전히 G5/G6 미완료. Production Migration/권한/지갑 청구·API·Provider 활성화 전무. SQL 전체 `ROLLBACK` 및 이미 존재하는 이름 고정된 CI 격리 DB 안전검사 유지.
- **실증 조건:** `git diff --check` 및 소스 정합성 확인, 신규 PR의 정확한 HEAD `db-authority-core` GREEN 전에는 실제 DB 통과를 추정하지 않는다. `creditBilling.productionMounted=false`, `HOLD_FORWARD_STOPPED` 유지.
### 2026-11-01 / W42 — G4 정산 CI RED 원인 수정 및 회원/비공개 Commerce HTTP ACK 권한 분리 (구현 묶음, CI 최종 검증 예정)

- **확인된 사실:** #2854 HEAD `71c8d6d67c5ac95355892e28380d6caffc679357` `db-authority-core` RED (run 41293933518); SQL 테스트의 `DO` 안에서 로컬 변수 `state`와 장부 열 `state` 이름이 모호했다. `seyeon_g4_positive_delivery_settlement_v1_test.sql`의 열 참조를 `r.id,r.state`로 고쳤다. CI 재실행은 다른 구현을 모두 끝낼 때까지 하지 않는다.
- **구현:** 기존 Commerce ACK HTTP 후보는 확인된 Member Subject를 일반 API DB 역할로 검증하면서 같은 일반 연결에서 private ACK V2를 실행하려 했다. `commerce-chat-credit-delivery-ack-http-candidate-v1.ts`에 별도의 `privateCreditPool`을 필수로 주입하고 일반 Member 트랜잭션에서는 정규 Subject ID 확인까지만 수행하도록 변경. 그 뒤 독립적인 내부 Commerce 트랜잭션에서 `SET LOCAL ROLE`, 로컬 Subject 바인딩, 원본 committed Turn/assistant/receipt를 DB가 직접 검증하는 좁은 ACK RPC만 호출한다. 두 Pool 동일 객체/누락/인증 불가/비정상 결과는 모두 차단한다.
- **회귀:** 기존 HTTP 후보 테스트에 역할 및 Pool 분리, 정상 Subject 결속, 전용 연결 누락/동일 객체, Guest/익명/조작 요청/DB 거절의 안전 실패를 보강한다. 새 API 라우트의 운영 설치나 Public EXECUTE 권한 확대는 없다.

### 2026-11-01 / W43 — S0 실제 영수증 ACK 완료 후 비공개 G4 크레딧 정산 연결 후보 (운영 미장착)

- **구현:** `seyeon-g4-positive-receipt-credit-bridge-candidate-v1.ts`는 기존 256-bit capability를 검증하는 S0 HTTP 영수증 핸들러가 DB ACK에 성공한 후에만 별도 Commerce pool의 전용 RPC를 호출한다. 브라우저의 delivered 플래그·지갑/Subject/금액/Reservation/Assistant 지정은 허용하지 않는다. 서버는 receipt 경로에서 Attempt ID만 전달하고 DB가 관련 원본을 찾는다. 첫 영수증 DB COMMIT 이후 크레딧 정산에 실패하면 503/retryable로 처리하며 S0 ACK/credit settle 양쪽의 동일 요청 재시도 멱등을 전제한다. HTTP+private DB 두 트랜잭션이 원자적이지 않다는 점을 공개적으로 기록하고, 미정산 건 관측/재처리·운영 권한 제어는 G5 후속으로 유지한다.
- **전용 DB:** 격리된 PG에만 `internal_cmd_seyeon_g4_receipt_credit_settle_v1(Attempt)` SECDEF를 생성한다. 기존 S0 original Attempt에서 `positiveProof`, DB 수신 완료 마커, 완료된 Member/Thread/Turn/Assistant와 10-credit Reservation을 재조회·검증해 좁은 ACK V2로 정산한다. DB 잠금 순서는 Subject -> Reservation -> Turn/Attempt이며 권한은 `myeongha_commerce_internal_executor`에게만 있다. 일반 API/브라우저/service_role에게는 EXECUTE를 주지 않는다.
- **검증:** #2854 격리 PostgreSQL 후보 테스트를 확장해 정확한 original Attempt 정산·멱등·잘못된 Attempt 거부·기존 충전액 50→40 확인 및 권한 범위를 검사한다. 신규 브리지 단위 테스트에서 S0 영수증 실패 시 0회 정산, 민간/전용 Pool 불일치, 정산 오류 후 재시도, 성공일 때만 HTTP 200을 확인한다.
- **구분:** 이 구현은 *후보 소스와 합성 receipt를 이용한 격리 DB 테스트*다. S0 실제 서명/도착 흐름과 연계된 전체 HTTP+DB 2-session 경쟁·장애/재시도 검증, 운영 DB 역할·실제 credential·배포/관측/환불 재처리, G0–G3 Owner 승인 및 G5/G6 완료를 의미하지 않는다. Production router/Provider/결제는 변경하지 않았고 `HOLD_FORWARD_STOPPED`를 유지한다.
### 2026-11-01 / W44 — #2854 Work Track security CI RED: 재사용 HTTP Request 테스트 수정

- **실패 증거:** #2854 HEAD `7c7e310157b01bbf71de2be3575be5c12b8c8536`의 [Work Track security run 41307326596, job 124850337793](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41307326596/job/124850337793) RED. 실패한 테스트는 `commerce-chat-credit-delivery-ack-http-candidate-v1.test.ts`의 `fails closed on absent or shared private executor pool` 1건으로, 기대 503 대비 실제 400. 기존 테스트 9건/새 브리지 5건은 PASS. 같은 run의 실제 `db-authority-core`는 GREEN.
- **원인:** 두 개의 잘못된 private pool 상황을 검사하면서 *동일한 Fetch Request 객체*를 두 번 전달해 본문 스트림이 첫 호출에서 소진됐다. 두 번째 호출은 누락/공유 pool 검사 전에 정상적으로 `INVALID_REQUEST` 400을 반환했다. 이는 운영 SQL 권한/크레딧 오류가 아니라 테스트의 단일 사용 Body 생명주기 실수다.
- **수정:** 두 경우 각각 `input(request())`로 새로운 HTTP 요청을 생성하고, 누락된 전용 풀/일반 풀과 동일한 전용 풀 모두에서 실제 정산 쿼리 없이 503 Fail Closed를 검증하도록 수정. 결제/보안 구현 코드는 유지. 실제 고객 경로 활성화나 운영권한 변경 없음.
- **진행 원칙:** 이 수정 커밋 이후 동일 PR의 새 HEAD 보안·DB·전체 통합 CI 결과만 판정한다. 이전 실패 체크나 이전 HEAD의 Integration 결과를 새 HEAD PASS로 오인하지 않는다. `HOLD_FORWARD_STOPPED` 유지.
### 2026-11-01 / W45 — G5 원본 Positive 수신 증거 기반 크레딧 2세션 경합·실패 복구 검증 후보

- **선행 확인:** #2854 최신 HEAD `64e73341a1ee0a8c90d9433bbc7600dd8a3bfc91`에서 `Work Track security`/실제 `db-authority-core`/전체 `CI Integration` 전부 GREEN(일반 CI 41307829962, Integration 41307884618); 자동 병합 완료, main 커밋 `5172e5f61ff2958041cf395a74b9f47800e76309`.
- **기존 실제 S0 자산:** `test/seyeon-security-s0-postgres.e2e.test.ts`는 S0 첫 Memory의 DB 원본 권한, 공개 전 취소 경쟁, 수신 영수증 발급·수신 및 서로 다른 PostgreSQL 세션을 이미 실증한다. 그대로 유지하고 중복 스캐폴딩을 만들지 않는다. 다만 기존 테스트는 S0와 G4 장부를 같은 요청으로 연계하지 않으므로 두 경로를 합친 운영 G5 PASS로 추정하지 않는다.
- **구현:** `test/db/candidates/seyeon_g5_private_credit_race_v1.mjs`를 추가하여 실제 PostgreSQL의 서로 다른 물리 연결 두 개로 **동일 원본 Attempt·Reservation에 대한 동시 수신 증거 기반 10크레딧 정산**을 수행한다. 첫 세션의 COMMIT 전 다른 세션이 실제 `pg_stat_activity.wait_event_type=Lock`에서 대기함을 확인하고, 직후 첫 세션 확정 → 두 번째 멱등 완료, Reservation 한 건·정산된 할당 10·남은 크레딧 40을 검사한다. 별도의 원본 Attempt는 첫 정산 결과를 COMMIT 전에 ROLLBACK(접속 중단 시나리오)하고 최초 예약 상태를 확인한 뒤 별도 연결에서 재시도해 정확히 한 번 정산한다.
- **격리:** 기존 `myeongha_commerce_credit_candidate_test` 복제 PostgreSQL/`CI=true`/`PGHOST=localhost` 조건에서만 실행되도록 하고, 기존 G4 SQL fixture의 원본 회원·Thread·Turn·Attempt·Assistant·합성 positive receipt를 사용하는 독립 테스트다. S0 영수증 자체의 실제 사용자 수신과 G4 정산을 합친 end-to-end 증명이 아니며 운영 결제/Provider/DB 권한은 변경하지 않는다. `node --check`/`git diff --check`는 통과했으나 실제 2세션 CI 실행 결과는 새 PR에서 확인하기 전까지 **미확인**.
- **남은 Gate:** G5 실제 브라우저 S0 HTTP 수신 → 유효 Challenge ACK → private G4 장부 정산 **같은 현장 결속**, 장애/취소/삭제 경합, Source/Owner 승인 및 G6 실제 운영 역할·관측/복구/승인은 별도. `HOLD_FORWARD_STOPPED`, `creditBilling.productionMounted=false` 유지.
### 2026-11-01 / W46 — G5 원본 S0 HTTP 영수증부터 G4 비공개 10-credit 정산까지 실 PostgreSQL 통합 검증

- **선행 확인:** #2859 HEAD `356c626bf9f92bc9c689495aabe868fe5dfed2f3`의 `Work Track · security`/실제 PostgreSQL `db-authority-core`/전체 `CI Integration` GREEN (41311909990, 41311944672), 자동 병합 `main` `1251e55419e9e3e00c92a39125358ba4a9dca136`. 기존 S0 유효 Challenge·권한 취소·2세션 경합 테스트와 W45 G4 장부 2세션 경합은 각각 통과했지만 결속된 같은 실제 PostgreSQL/HTTP 경로는 미검증이었다.
- **새 통합:** `test/seyeon-security-s0-postgres.e2e.test.ts`의 원본 S0 실제 PostgreSQL 17 테스트에 **기존 Positive Memory 원본 Source Pin·Commit→실제 HTTP Fetch 256-bit Challenge 발급→HTTP 보호 영수증 proof 검증·DB 수신시간 저장→비공개 Commerce 역할로 동일 Attempt 원본 10-credit 정산** 연결을 추가했다. 기존 `prepare()`/`fetchReply()`를 재사용하며 긍정 receipt flag를 SQL로 위조해 세팅하지 않는다. 소스·회원·Turn·Attempt·Assistant의 일치는 기존 DB authority가 재검증한다.
- **거부·재시도:** 첫 수신 전 예약 상태/잔액 40·할당 10 확인, 틀린 256-bit 증거/잘못된 Attempt는 실제 S0 HTTP 503 및 정산 차단, 유효 영수증은 수신시간 저장 뒤 정확히 한 번 정산·동일 proof 재요청 멱등을 검증한다. 다른 원본에서는 S0 receipt DB Commit 성공 직후 비공개 Commerce DB 연결이 끊긴 상황을 합성한다. 사용자에게는 503/retryable, DB 원본 receipt는 남고 예약은 미정산이며, 복구 후 동일 proof를 통해 정산 성공·중복 차감 0을 검증한다.
- **필수 격리:** GitHub Actions PostgreSQL 17 전용 `CI=true`, `GITHUB_ACTIONS=true`, `DB_SUITE=postgres17`, `PGHOST=localhost`, `PGDATABASE=myeongha_ci_case_[0-9]+` 복제본에서만 **테스트 등록 자체를 수행**한다. 이 복제본에서만 기존 signup-only 지갑을 candidate ledger로 교체하고 S0 RPC+private Commerce ACK V2를 함께 설치한다. 복구 드릴의 `127.0.0.1/myeongha_seyeon_security_s0_test` 등 다른 S0 테스트 환경에는 검사 등록/스키마 변경이 발생하지 않는다. 보안상 실제 운영 역할/DB credential과는 다르며 테스트 연결은 격리 PG 자격증명을 이용해 내부 role만 구분한다. Production migration, browser route mount, 실결제, paid Provider 호출은 없다.
- **한계:** 이번 테스트는 Node Request/Response 경계의 실제 S0 핸들러와 실 PostgreSQL을 통과하지만, 공개 브라우저→배포 네트워크·독립 Commerce 운영 비밀키·고객 실제 비용·배포/삭제 복구 승인을 의미하지 않는다. 로컬 전체 테스트 실행 불가: 작업 worktree에 npm 의존성 설치가 없어 실제 G5 성공은 해당 PR `db-authority-core`와 full Integration GREEN을 확인한 뒤에만 인정한다. G0–G6 전체 완료 아님. `HOLD_FORWARD_STOPPED`, `creditBilling.productionMounted=false` 유지.
### 2026-11-01 / W47 — #2861 실제 PG17 RED 원인과 G5 합성 회원 식별자 충돌 수정

- **실패 근거:** PR #2861 HEAD `ceab9aff84ee4c07e0d5c4c689f6664bb08dc842`의 [DB dependency · postgres17 / postgres17, run 41313978675 job 124870088771](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41313978675/job/124870088771) 실패. `test/seyeon-security-s0-postgres.e2e.test.ts`의 신규 G5 통합 테스트 두 건에서만 SQLSTATE `23505`/`auth.users` `users_pkey` 중복 (`a810...0013`, `a810...0014`), 기존 S0 테스트 15건 PASS. 코드 스택은 `prepare()` SQL fixture 주입 107행.
- **원인:** 기존 S0 테스트의 ‘원본 User 증거 부정 검증/원본 증거 대조’가 `prepare(14)` 및 `prepare(13)`을 이미 사용하고 있었는데, 새 G5 첫 답변/장애 복구 테스트가 두 번호를 재사용했다. 이로 인해 테스트 케이스 간 회원 UUID를 중복 INSERT했으며, DB 권한, 운영 크레딧, 네트워크 또는 CI 기계 오류가 원인은 아니었다.
- **수정:** 기존 S0 테스트들은 fixture 번호 `1`~`15`를 이미 사용하고 있으므로 신규 G5의 두 식별자를 각각 `17`, `18`로 분리한다. 기존 1~15의 fixture/DB 보안 동작은 유지한다. 또한 기존 fixture의 `n.toString(16)`이 16 이상에서 두 자리 16진수가 되어 해시 길이가 128자로 늘어나는 문제를 방지하기 위해, 16 이상은 SHA-256으로 정확히 64자리의 고유 콘텐츠 해시를 생성하도록 변경한다. 원본 positive 수신·정산 권한, 10-credit 정확성, 실패 후 멱등 재시도 검사 범위는 유지한다.
- **검증/보류:** `git diff --check`와 실제 fixture 번호 비중복을 로컬 확인하고 같은 PR HEAD를 업데이트한 뒤 새 커밋 CI로 판정한다. 재실행 이전 GREEN이나 합성 receipt를 G5 운영 완료로 주장하지 않으며 `HOLD_FORWARD_STOPPED` 유지.
### 2026-11-01 / W48 — G5 수신 완료·크레딧 미정산 장애 복구 후보 (운영 미장착)

- **확정 선행 게이트:** PR #2861의 정확한 HEAD `0ec658b4a77b2c26b7c8d9ddaed629b0769ec5f2`는 Work Track security·PostgreSQL17·`db-authority-core`·전체 `CI Integration` 모두 GREEN (runs 41315493573, 41315565646), 2026-11-01 `main` 자동 병합 `7d4f6e6f2ed91a66e7339536541772d3f5151324`. 격리 PG17의 실제 S0 최초 Memory/HTTP Fetch/256-bit proof ACK → private G4 10-credit settlement 및 DB 장애 후 같은 proof 재시도는 검증됐지만 사용자가 재요청하지 않으면 `received`+`reserved`가 영구 잔존할 수 있었다.
- **G5 복구 구현:** `seyeon_g5_received_credit_recovery_catalog_v1.sql`에 비공개 `internal_qry_seyeon_g5_unsettled_received_attempts_v1(limit)`를 작성. **DB 원본에 의해 커밋·전달·256-bit 영수증 수신시간이 입증된 Positive Attempt**이며, 기존 동일 Member/Thread/Turn/Assistant 및 `reserved` 10-credit 장부가 일치하고 수신시간이 5분 이상 지난 건만 조회한다. 최대 25건·시간순; 일반 API·브라우저·authenticated·service_role·PUBLIC은 EXECUTE 차단하고 `myeongha_commerce_internal_executor` 전용이다. 잔액/메시지/민감내용은 목록에 반환하지 않으며 DB SELECT/UPDATE 권한 확대가 없다.
- **복구 실행 후보:** `seyeon-g5-received-credit-recovery-candidate-v1.ts`가 별도 비공개 Commerce 트랜잭션에서 대상 원본 Attempt ID를 조회한 뒤 **각 건을 독립된 비공개 트랜잭션**으로 기존 `internal_cmd_seyeon_g4_receipt_credit_settle_v1(Attempt)`에 재전달한다. 기존 SQL이 Subject→Reservation→원본 Assistant/영수증과 할당 10을 다시 검증하므로 사용자가 전달함을 주장하거나 모델 완료만으로 정산하지 않는다. 동시 사용자는 기존 DB 잠금·멱등으로 해결, 잘못된 조회 결과·범위 초과는 즉시 거부, 개별 오류는 `partial` 및 건수로 표시하고 성공을 조작하지 않는다. `productionMounted:false`, `scheduled:false`, 별도 Provider/자격증명/운영 경로 설치하지 않음.
- **추가 검증:** 기존 실제 S0 격리 PG17 테스트 안에 새 카탈로그를 설치하고, 기존 실제 HTTP 영수증의 Commerce DB 오류 직후 **실제 DB 수신 기록은 있으나 예약은 미정산**, 5분 이내 자동 정산 제외, 단독 격리 fixture에서 수신시간을 인위적으로 10분 경과시킨 뒤 비공개 복구가 한 건만 10크레딧 정확히 정산하는지 검증한다. 같은 DB의 **미수신 원본 Attempt**는 오래됐어도 대상 제외, 정산 반복 조회는 0건 확인한다. 기존 테스트가 사용하지 않은 식별자 `19`,`20`만 사용. 보조 단위 테스트에 입력 제한, 조회 결과 무결성, 개별 실패 및 Partial 보고를 추가한다.
- **한계/게이트:** 이 작업은 신규 **후보 소스 + GitHub Actions 일회용 DB 테스트**이며 실제 CI 결과를 확인하기 전 PASS 아님. G5 실제 배포 브라우저/별도 운영 Commerce 로그인·관측·재처리 정책/계정 삭제·복구 검증, G0~G3 최종 Owner 승인, G6 운영 적용은 아직 완료되지 않았다. 기존 `HOLD_FORWARD_STOPPED`, `creditBilling.productionMounted=false` 유지. `git diff --check` 외 불필요한 반복 검증 금지.
### 2026-11-02 / W49 — #2866 G5 복구 PG17 테스트 RED 수정: 원본 영수증 불변성 유지

- **실패 증거:** PR #2866 HEAD `e901b05383204860567db32e96309e590dc127a0`의 [PostgreSQL17 / run 41317560803 job 124880776361](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41317560803/job/124880776361)는 S0 실제 PG17 18개 중 기존 17 PASS, 신규 G5 `recovers only aged DB-confirmed received replies` 1 FAILED. PostgreSQL 제약 `seyeon_positive_delivery_receipt_immutable` (`23514`), 테스트 849행에서 `seyeon_positive_delivery_received_at`을 10분 전으로 직접 UPDATE하다 거부되었다. 원래 강제 불변 계약이 의도대로 작동한 것이며 구현 보안 결함 또는 CI 일시 장애가 아니다.
- **전체 통합 CI:** [run 41317584856](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41317584856)는 `admission`이 필수 `CI Verify` RED를 감지해 연쇄 실패한 결과다. 별도의 독립 장애 아님. `Work Track · security` 및 `db-authority-core`는 같은 HEAD에서 GREEN이었지만 PG17/전체 CI는 RED로 기록한다.
- **수정:** 불변의 S0 Receipt/Attempt DB 필드를 변경하는 SQL 테스트 코드를 제거. `internal_qry_seyeon_g5_unsettled_received_attempts_v1(limit,testAsOf default null)`는 기본적으로 실제 DB 시각 기준 `received_at <= now-5 minutes` 정책을 보존하고, 오직 현재 DB 이름이 `myeongha_ci_case_[0-9]+`인 **일회용 PG17 CI 데이터베이스**에서만 현재보다 0~15분 미래의 읽기 전용 테스트 기준 시각을 허용한다. 별도 HTTP/Provider/운영 경로/DB 컬럼 수정 없음. 복구 함수의 `testAsOf` 옵션은 `CI=true`, `GITHUB_ACTIONS=true`, `DB_SUITE=postgres17`, `PGHOST=localhost`, 정확한 disposable PGDATABASE 검사 실패 시 DB 호출 전에 거절한다. 운영 호출은 항상 `testAsOf=null`이며 수신 후 5분 유예 유지.
- **검증 범위:** 실제 S0 HTTP 발급/256-bit proof ACK는 기존대로 수행, 수신시간은 절대 재기록하지 않은 채 가상 기준 시각에서 정확한 예약 한 건 정산 및 미수신 원본 제외·멱등 재조회 확인. SQL 함수 EXECUTE는 비공개 Commerce 역할만 보유; ACL 검사 시그니처와 단위 테스트 쿼리 인자를 두 매개변수로 갱신. 로컬 문법·diff 및 DB 이름·시간 범위 제한 검사 후 동일 PR 새 HEAD PostgreSQL17 + full Integration 결과만 새 판정 근거로 삼는다.
- **상태:** `HOLD_FORWARD_STOPPED`, `creditBilling.productionMounted=false`, `productionMounted=false`, `scheduled=false` 유지. 실제 고객 과금 및 운영 자동 복구 미활성화. 전체 보안 G0~G6 완료 아님.
### 2026-11-02 / W50 — G5 복구 운영 미리보기·실행 명시 분리 (source-only)

- **선행 상태 확인:** PR #2866의 마지막 HEAD `0336d39d9034e665928d2def78e5f59e8166e1c7`에서 실제 PostgreSQL17/Work Track security/db-authority-core 및 전체 CI Integration GREEN (runs 41319815067, 41319870927), `main` 자동 병합 `5bf2ad19168ee39cb7b404bb818031763a4d5ca7`. W49 receipt 불변성 유지 + 읽기 전용 가상 시각 테스트가 실제 격리 PG17을 통과했다. 합성 최초 수신 증거 없는 클라이언트 주장을 정산 근거로 삼지 않는 정책 유지.
- **남은 실제 문제:** W48의 `recoverSeyeonG5ReceivedCreditsCandidateV1`는 unmounted/private이지만, 코드 호출 시 `maxBatch`만으로 곧바로 정산을 시작했으므로 G5 운영 관측과 실행 의사결정을 분리하지 못했다.
- **추가 구현:** 복구 후보 함수는 `mode: preview | apply`를 **필수**로 받는다. 누락, 오타, 임의 문자열이면 비공개 DB 연결 전에 즉시 실패. `preview`는 기존 비공개 Commerce 역할/원본 영수증 검증/5분 유예/1~25개 bounded catalog와 동일한 조회를 하되 **정산·환불 RPC 0회**, 유출 방지를 위해 개별 Attempt/회원/장부가 아닌 `status=preview,found,settled=0,failed=0`만 반환한다. `found`는 제한된 조회 결과 건수이지 전체 백로그 수로 주장하지 않는다. `apply`만 기존 원본 S0 ACK 증거 검증 + Commerce 비공개 트랜잭션 단위 재정산을 진행한다. 자동 주기 실행·공개 HTTP·운영 credential·paid Provider 권한은 추가하지 않는다.
- **검증:** Vitest 4.1.11 / TypeScript 6.0.2 저장소 의존성 기준. 새 단위 검증은 preview에 정산 SQL이 한 번도 호출되지 않음/민감한 Attempt ID 반환 없음, mode 생략·알 수 없는 mode 일괄 사전 차단을 검증한다. 기존 실제 S0 PG17 E2E에는 수신증거 보존·격리 읽기 가상 시각 조건에서 `preview 1 / 정산 0 / 원본 reservation 여전히 reserved` → 별도 `apply 1 / 정산 정확히 10` → 재조회 0건 흐름을 추가한다. 기존 미수신 Attempt의 예약도 10으로 유지돼야 한다. 동일 PR의 정확한 HEAD PostgreSQL17 + full Integration GREEN 이전 실제 실행 결과는 미확인.
- **미완료:** G5 운영 자격증명 분리·운영 관측/감사 기록/계정 삭제·복구/브라우저 배포 E2E, G0–G3 원본 전체 Source Scope/Owner 최종 승인, G6 운영 마이그레이션·롤백·DR·승인/해제 증거. `HOLD_FORWARD_STOPPED`, `creditBilling.productionMounted=false`, `productionMounted=false`, `scheduled=false` 유지. 실제 자동 복구·고객 과금 활성화 없음.
### 2026-11-02 / W51 — G5 실제 S0 수신·크레딧 미정산 상태에서 계정 삭제 시작 시 복구 차단 (격리 PG17)

- **선행 확인:** PR #2870 exact HEAD `ea6874ef98d43415c9c529f245b4fa973a122548`는 PostgreSQL 17/Work Track security/db-authority-core/CI Integration GREEN (runs 41321748041, 41321772955), `main` 자동 병합 `ae8e9e16b2eacd0c1baba5c63f9f889016bcf393`. GitHub PR Check 목록의 별도 Cloudflare Workers Builds 1건은 FAIL로 표시되어 **모든 외부 빌드 GREEN은 아님**; 이 항목은 별도 점검 범위로 남기고 보안 PostgreSQL 17 결과와 혼동하지 않는다.
- **기존 계약:** 원본 Member `subjects.status='active'`일 때만 G5 비공개 Recovery Catalog에 들어오고, G4 receipt settlement SECDEF RPC는 **원본 Subject row `FOR UPDATE` + active 검사**를 재실행한다. 계정 삭제 시작 명령 `public.cmd_start_account_deletion_v1`은 동일 canonical Subject 행을 잠그고 삭제 Job 등록과 `deletion_pending` 전환을 원자적으로 기록한다. 이 계약은 이미 코드에 존재하며 새 과금 로직이나 운영 권한을 추가하지 않는다.
- **새 검증:** 실제 PostgreSQL17 S0 최초 긍정 Memory/원본 Pin/Commit→Node HTTP Fetch 256-bit proof 발급→실제 HTTP ACK 성공 후 내부 Commerce DB 연결 실패를 합성해 **ACK received + 10-credit reserved** 상태를 만들고(기존과 중복되지 않는 fixture=21), 일회용 DB 읽기용 시간 조정으로 복구 `preview=1 / settle 0`을 확인한다. 이어서 **실제 계정 삭제 시작 DB RPC**를 호출해 삭제 Job `running` 및 Member `deletion_pending`을 확인한다. 같은 기존 `preview=0`, `apply=0`을 확인하고 **앞서 미리보기에서 관측한 동일 원본 Attempt을 비공개 Commerce 역할의 정산 RPC로 직접 실행해도 실패**하는지 검증한다. Member 상태 변경 후에는 일반 잔액 RPC 자체가 active-only로 거부되는 것을 확인하며, 테스트 DB Owner의 비공개 장부 스냅샷으로 예약/할당 10/미사용 40과 원본 수신시간이 그대로 남아 있는지 확인한다.
- **범위:** 테스트용 동일 disposable PostgreSQL 17 복제본에서 실제 기존 계정 삭제 권한 함수 + S0 HTTP + G4 private ledger를 연결하되 Production 계정 삭제, DB migration, 일반 HTTP/브라우저 복구, 신규 공개 API·Role Grant·운영 실행은 전혀 없다. *이 테스트는 삭제와 정산의 실시간 동시 경쟁을 아직 증명하지 않으며*, 삭제가 확정된 뒤 이전 preview를 재사용해도 차감되지 않는 직렬화 경계만 검증한다. 원본 ACK 이후 별도 Grant 철회는 이미 전달된 유료 응답의 소급 환불 근거로 임의 해석하지 않는다.
- **게이트/유지:** 새로운 PR PostgreSQL17 및 전체 Integration이 GREEN 되기 전 성공 판정 금지. G0–G3 확대 Source Scope/Owner 승인, G5 운영 credential 분리·실제 배포 경로·동시 deletion race/삭제 최종화 DR 증거, G6 운영 적용 및 별도 배포 검증은 미완료. `HOLD_FORWARD_STOPPED`, `creditBilling.productionMounted=false`, `scheduled=false` 유지.
### 2026-11-02 / W52 — G5 계정 삭제 시작과 실제 수신 영수증 10-credit 정산의 PostgreSQL 양방향 잠금 경합 검증

- **선행 게이트:** PR #2871 마지막 HEAD `28ac67aec1f3d2e55f55056b9d9cfbfb1275bda9`에 대한 Work Track security·PostgreSQL 17·db-authority-core (run 41323912195), full Integration (run 41323956097) 모두 GREEN. #2871 `main` 자동 병합 `0d83a127c176d0b0b0f949418a965ca92584646b`. 같은 PR Cloudflare Workers Builds도 PASS로 표시됨. 기존 직렬 사례 W51은 계정 삭제가 이미 확정된 후 복구 차단은 증명했지만 정산과 동시에 발생한 실제 DB 잠금 경쟁은 증명하지 못했음.
- **이번 구현:** 기존 `test/seyeon-security-s0-postgres.e2e.test.ts`의 GitHub Actions CI 전용 `myeongha_ci_case_[0-9]+` PostgreSQL17 격리 복제본에 실제 두 DB 세션의 양방향 경합 검증 추가. 기존 S0 Source Pin→Commit→Node HTTP Fetch 256-bit proof ACK 원본 DB 수신 기록을 발급·인증하고, Commerce 연결 장애로 미정산 `reserved` 10-credit를 만든다. 독립 fixture 22/23만 사용. 가상 `received_at` 조작이나 새로운 권한/마이그레이션 없음.
- **정산 먼저:** 별도 Commerce SQL 세션에서 기존 `internal_cmd_seyeon_g4_receipt_credit_settle_v1`로 원본 10-credit 정산을 **커밋 전** 실행해 canonical Subject의 실제 행 잠금을 유지. 별도 Owner 세션에서 실제 `cmd_start_account_deletion_v1` 실행해 `pg_stat_activity.wait_event_type='Lock'` 실측. 정산 커밋 후 계정 삭제가 실행돼 `deletion_pending`. 원본 예약 하나/할당 10/남은 로트 40, 원본 수신시각 불변, 추가 복구 대상 0건을 확인한다.
- **삭제 먼저:** 실제 계정 삭제 명령을 별도 Owner 트랜잭션에서 실행하되 커밋을 보류하고 동일 Member 행 잠금을 유지한다. 별도 Commerce 세션에서 원본 영수증 직접 정산 RPC를 요청하면 `Lock` 대기하는지 확인한 뒤 삭제를 커밋한다. Commerce는 `active original Member` 조건 거부, 트랜잭션 롤백. 원본 예약은 `reserved`, 할당 10/남은 로트 40, receipt는 불변, 새 복구 preview 대상 0을 확인한다. 실패 테스트에서 부분 실패를 PASS라고 간주하지 않는다.
- **범위/한계:** 별도 실제 PostgreSQL 세션 간 잠금 획득과 커밋 순서를 검증한다. 운영 Production 자격증명/공개 브라우저 연결/자동 복구 및 최종 계정 삭제·보존/DR까지 증명한 것은 아니다. 전체 G0~G6 최종 완료·운영 활성화를 선언하지 않는다. `HOLD_FORWARD_STOPPED`, `creditBilling.productionMounted=false` 및 G5 `scheduled=false` 유지. 실측 CI GREEN 이전 결과 미확정.
### 2026-11-02 / W53 — G5 비공개 Commerce 및 일반 API 권한·실제 DB 세션 격리 검증 (운영 credential 변경 없음)

- **선행 상태:** PR #2875 HEAD `80fe453f3a27e608d3f85771d8b0176c13bd2c18`의 PostgreSQL17/security/db-authority-core (41325612054) 및 전체 Integration (41325635612) GREEN, `main` 병합 `b7d71697119c1a0d33a95979d5f4333202da1b5d`. 원본 S0 HTTP 수신 뒤 Commerce 정산/계정 삭제 2세션 동시 경합(양쪽 선행 순서) 격리 DB 검증 PASS.
- **신규 검증:** 기존 CI 전용 실제 S0 PostgreSQL17 disposable DB에서 독립 DB 연결 두 개를 열고, 각각 `SET LOCAL ROLE myeongha_api_executor`와 `SET LOCAL ROLE myeongha_commerce_internal_executor`을 적용. `current_user`가 실제 다른 역할임을 확인한다. 일반 API 역할의 G5 카탈로그·G4 원본 영수증 정산 RPC `EXECUTE`와 신용 장부 직접 `UPDATE`가 모두 차단됨을 확인하고, 실제 G5 복구 목록 SQL 호출이 `42501 permission denied`로 실패하는지 검증한다. Commerce 역할은 비공개 카탈로그 및 정산 RPC `EXECUTE`는 보유하지만 장부 직접 `UPDATE`는 여전히 금지, 자격 없는 일반 API 호출 실패와 무관하게 별도 연결로 읽기 전용 목록 조회가 가능해야 한다.
- **구분:** 동일 테스트 관리자 로그인에서 `SET LOCAL ROLE`만 나누므로 **운영 독립 DB 로그인/비밀번호/credential 프로비저닝 완료 증명은 아니다**. 새로운 운영 credential, Role grant, SQL migration, 공개 HTTP, Provider, 과금 활성화/스케줄러 없음. 실 운영 별도 Commerce 로그인·커넥션 분리·DB GRANT·TLS·후속 DR은 G5/G6 운영 전 단계 미완료.
- **상태:** 새 HEAD의 실제 PostgreSQL17/security/full Integration CI 결과 전에는 PASS 판정 금지. `HOLD_FORWARD_STOPPED`, `creditBilling.productionMounted=false`, 복구 `productionMounted=false`, `scheduled=false` 유지.
### 2026-11-02 / W54 — G5 서로 다른 실제 PostgreSQL 로그인 자격증명·비공개 Commerce 역할 격리 (폐기형 CI)

- **선행:** PR #2877 HEAD `28a7b67853dd6189a8b6b135db00f2d8bba8e92a` PostgreSQL17/security/db-authority-core CI (41394494829), 전체 Integration (41394530674) GREEN; `main` 병합 `9e7d513b9789c1651592ada9791bc6207a8db2da`. W53은 `SET LOCAL ROLE`에 의한 권한 구분을 검증했지만 두 세션은 같은 관리자 로그인에 의존하므로 물리적 DB 로그인 분리 증명은 아니었음.
- **이번 변경:** **GitHub Actions CI 전용** `myeongha_ci_case_[숫자]` PostgreSQL17 disposable DB에서 현재 DB명으로부터 고유하게 파생된 `g5_api_ci_*`, `g5_private_ci_*` 임시 `LOGIN` 역할 2개와 각각 독립 난수 비밀번호를 생성하고, 기존 `myeongha_api_executor` / `myeongha_commerce_internal_executor` 역할만 각각 부여한다. 서로 다른 실제 로그인으로 `pg` Pool을 열어 `session_user`를 확인하고, 로그인별 `SET LOCAL ROLE` 적용 후 `current_user`가 일치하는지 확인한다. 일반 API는 G4 정산/G5 복구 카탈로그 EXECUTE 권한이 없고 실제 복구 조회가 42501로 거부돼야 한다. Commerce는 기존 비공개 정산·복구 RPC EXECUTE만 보유하고 별도 연결의 조회가 동작해야 한다. DB connection을 종료하고 임시 로그인 역할은 반드시 제거하며 Production Role/secret은 생성하지 않는다.
- **범위:** 임의 CI disposable DB 역할만 허용, 실행 전 정확한 CI 환경명 검사. Production DB와 실제 운영 Secret Manager 연결, 별도 런타임 자격 증명 배포·로테이션·폐기 운영은 **미완료**. 실행용 HTTP/API/RPC/PG 운영 권한·과금·스케줄러를 추가/활성화하지 않는다. `HOLD_FORWARD_STOPPED`, `creditBilling.productionMounted=false`, 복구 `productionMounted=false`, `scheduled=false` 유지. 새 CI exact-HEAD GREEN 전 PASS 아님.
### 2026-11-02 / W55 — PR #2880 GitGuardian Generic Password 탐지 대응

- **관측:** PR #2880 GitGuardian CheckRun 125119842932, 사건 39413473에서 커밋 `9894369114182efd58ea0ff3f9e19ccdf9eaf643`의 `test/seyeon-security-s0-postgres.e2e.test.ts` 835줄을 `Generic Password`로 표시했다. 해당 위치는 테스트 로그인 생성 함수 호출의 세 번째 인자인 **DB 역할 이름** `myeongha_api_executor`이며 비밀번호 리터럴이 아니다. 실제 임시 비밀번호 두 개는 실행 중 `randomBytes(30).toString('hex')`로 생성되며 파일에 저장하지 않는다.
- **수정:** 비밀번호로 역할을 생성하는 함수 인자에서 고정 역할 이름을 제거하고, 난수 비밀번호를 사용한 로그인 생성 뒤 기존 API/Commerce 역할 멤버십을 **별도 GRANT 문장**으로 설정하도록 분리했다. 권한 계약과 테스트의 두 개 실제 PG 로그인, S0·Commerce 차단, 임시 역할 정리 동작은 유지한다.
- **근거와 한계:** 소스에서 장기 비밀번호·운영 Secret 노출은 확인되지 않았다. GitGuardian의 최종 판정은 새 HEAD 스캔에서 확인해야 하며 초기 CheckRun 실패가 자동으로 소멸했다고 추정하지 않는다. PR #2880은 GitGuardian RED 상태에서도 2026-11-02 06:08:41 UTC 자동 병합(`acb3362a50972bf3f1b93028239478c438852244`)되었다. 기존 병합 이력을 바꾸지 않고 별도의 수정 PR로 해결하며, GitGuardian 검사 자체가 필수 병합 조건에 포함되는지는 별도 점검한다. 운영 credential 회전/프로비저닝/실제 과금/자동 복구는 수행하지 않는다. `HOLD_FORWARD_STOPPED` 유지.
### 2026-11-02 / W56 — main 필수 GitGuardian Security Checks 추가 및 정책 회귀 방지

- **선행:** PR #2882 정확한 HEAD `5dad79190930935285f45b366e3288ba61688eff`에 대한 GitGuardian·PostgreSQL17·security·db-authority-core·Full Integration GREEN을 확인했고 `main` 병합 SHA `c4002588199a167e2a5b642913f5cb3612021841`이다. 원래 #2880은 GitGuardian RED인데 GitHub Actions 4개 필수 검사는 GREEN이어서 `main`에 자동 병합됨(사고 분류: required check 누락).
- **실제 GitHub 규칙 변경:** 2026-11-02 `gycha0109-beep/MyeongHa` repository ruleset `main-production-guard-v1` ID `23850762`를 REST API로 갱신했다. 기존 필수 `CI Verify`, `Web PR Verify`, `Governance Verify`, `CI Integration Verify` (각 GitHub Actions App ID 15368)를 **그대로 보존**하고 `GitGuardian Security Checks` (실제 GitGuardian App ID **46505**)를 **다섯 번째 필수 검사**에 추가했다. 다시 GET하여 `active`, `refs/heads/main`, 필수 5개, `strict_required_status_checks_policy=false`, `bypass_actors=[]`, 기존 PR·force-push·delete·linear-history 정책 유지 확인. 브랜치 보호 단독 REST API가 404인 것은 이 저장소가 **Ruleset 기반**으로 보호되기 때문이며 보호 없음이 아니다.
- **소스 회귀 방지:** 기존 `scripts/ci/integration-candidate.mjs` `assertStagedPolicy`에 정확한 GitGuardian 검사명 + App ID 46505 검증을 추가했다. 이 값이 live ruleset에서 누락되거나 다른 App으로 대체되면 CI 정책 점검이 실패한다. 대응 테스트는 현재 지정 앱·누락·잘못된 앱 ID를 다룬다. 기존 PR HEAD 고정 정책, 정상 PR CI 제출과 전체 Integration 정책 변경 없음.
- **범위 및 후속:** 과거 PR #2880의 GitGuardian 사건 39413473의 대시보드 상태는 별도 사건 기록이므로 보안 검사 결과가 자동으로 삭제/종료됐다고 주장하지 않는다. 이번 live ruleset 변경은 GitGuardian 검사 누락/실패 PR의 병합 차단을 강화하지만 모든 취약점 탐지 성공/별도 런타임 운영 credential을 의미하지 않는다. G5/G6 운영 결제/스케줄러 전환 없음. `HOLD_FORWARD_STOPPED`, `creditBilling.productionMounted=false` 유지. 신규 CI HEAD GREEN까지 소스 회귀 검증 완료 판정 금지.
### 2026-11-02 / W57 — PR #2884 security CI RED 테스트 계약 갱신

- **실측 실패:** PR #2884 HEAD `7e0d92c32d22098346543f119324e773ada03614`의 `Work Track · security` run 41401875470/job 125135328401 실패. `tests/ci-integration-candidate.test.mjs`의 이전 정상 규칙 fixture가 `CI Integration Verify`(GitHub Actions 15368)만 포함해 새 GitGuardian 필수검사(정확한 App 46505) 조건과 충돌했음. Test Files 1 failed / 974 passed, Tests 1 failed / 7790 passed / 138 skipped. 실제 GitGuardian 탐지 또는 DB 권한 실패는 아님.
- **수정:** 기존 정상 fixture에 `GitGuardian Security Checks`/App 46505를 추가하고, 잘못된 CI Integration App, 잘못된 GitGuardian App는 각각 거부되도록 동일 테스트를 보강. `assertStagedPolicy` 실제 승인 조건과 이전 병렬작업 freshness 정책은 변경하지 않음. 로컬 Node 문법 검사와 정상·누락·잘못된 앱 직접 호출 smoke PASS. 새 PR HEAD에서 실제 CI 통과 전 GREEN으로 간주하지 않는다.
- **운영:** Live main ruleset ID 23850762에 추가된 다섯 번째 필수 검사는 그대로 유지하며, 과금·자동복구·운영 DB에 변경 없음. `HOLD_FORWARD_STOPPED` 유지.
### 2026-11-02 / W58 — G5 비공개 Commerce 물리 로그인·TLS·SQL 권한 검증 연결 풀 (미탑재)

- **선행:** #2884 최신 HEAD `6b399480378457e03cbcad86101ae671869b174f`에서 GitGuardian/Work Track security/CI Verify/전체 Integration 모두 GREEN, main squash `506946becf58c0c8e568cea14c694de7d1aabc12`. main ruleset `23850762`는 GitGuardian App 46505의 `GitGuardian Security Checks`를 다섯 번째 필수 검사로 적용한다.
- **구현:** `apps/api/src/seyeon-g5-private-commerce-postgres-pool-v1.ts`. 기존 `seyeon-governed-postgres-pool-v1.ts`의 좁은 credential 패턴과 pinned verify-full CA 빌더를 재사용하되 **Commerce 복구에 한정된, 어떤 Runtime/HTTP/Worker에도 미탑재된** 연결 풀이다. 명시적으로 전달된 별도 DB URL과 지정 login `myeongha_seyeon_g5_commerce_login`을 점검하며, 일반 API URL과 같은 PostgreSQL 호스트/포트/DB에 별도 사용자/별도 비밀번호를 요구한다. Supavisor session pooler 5432인 경우 정확한 Production 프로젝트 suffix만 허용한다.
- **DB 검증:** 연결 Checkout마다 transaction 밖의 실제 `session_user`와 `current_user`가 전용 LOGIN인지 검사. LOGIN/NOINHERIT/NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE 조건과 정확히 **전용 Commerce 실행 역할 1개에 직접 회원**인지, 일반 API 역할 및 원본 정산/수신 복구 RPC/장부 원시 UPDATE 권한을 login 단계에서 상속하지 않았는지 검증. 이후 격리 BEGIN→`SET LOCAL ROLE myeongha_commerce_internal_executor`→실제 원본 G4 정산/G5 수신 카탈로그 RPC 실행 권한 및 장부 직접 UPDATE 금지 검증→ROLLBACK. 실패 연결은 버리고, 확인된 경우에만 기존 private Commerce transaction executor에 사용할 수 있는 인터페이스로 반환한다.
- **테스트:** `apps/api/src/seyeon-g5-private-commerce-postgres-pool-v1.test.ts` 6건 PASS (환경 자격증명, 권한 과다/부족, ACL 오염, Checkout 반복, 연결 폐기/ROLLBACK). 로컬 Worktree 의존성 junction으로 전체 TS 검사 시 다른 패키지 중복 선언 오류 39개가 발생했으나 **이번 2개 파일에 대한 TS 오류는 0**. 새 HEAD exact CI에서 실제 전체 빌드 판단 필요.
- **안전 범위:** 코드에 운영 DB Secret/새 ROLE GRANT/Production migration 없음. 실제 운영 로그인 발급·프로비저닝, Supabase TLS 인증서 설치, hosted DB의 실접속 확인 및 운영 수신 복구 실행 미완료. G5 runtime mount, HTTP 공개, Scheduler, Provider, Credit Billing, G6 cutover를 수행하지 않음. `HOLD_FORWARD_STOPPED`, `creditBilling.productionMounted=false`, 복구 `productionMounted=false`, `scheduled=false` 유지.
### 2026-11-02 / W59 — PR #2888 CI integration admission 대형 base 커밋 ENOBUFS 복구

- **실패 원인:** PR #2888 HEAD `fe344bd80aea434377f6b950f079a36fa8595c12` 전체 통합 CI run 41405603569 admission에서 `Error: spawnSync gh ENOBUFS`. 기존 `scripts/ci/integration-candidate.mjs`의 `currentCandidate`가 `repos/.../commits/main`의 **전체 커밋+변경 파일 patch** JSON을 `execFileSync` 버퍼(기본 약 1MB)로 읽어, 새 Commerce 대규모 main merge `2b7af680...` 변경 파일에 의해 한도를 초과했다. G5 private credential 코드 자체의 테스트/TypeScript 실패가 아닌 독립된 CI 게이트 오류다.
- **수정:** 현재 HEAD SHA만 필요하므로 REST `repos/.../git/ref/heads/main`의 작은 `object.sha`만 읽도록 변경. 기존 frozen PR head/base 검사·보호 규칙·필수 GitGuardian 검사/전체 CI 범위를 완화하지 않는다. 실제 같은 repo에서 Git ref SHA와 큰 commit endpoint SHA 일치 확인. 기존 CI 정책 22건+신규 G5 6건 로컬 Vitest 총 28 PASS.
- **판정 및 안전:** 변경 HEAD 신규 GitGuardian/security/full Integration GREEN 전 병합 성공을 가정하지 않는다. 전용 credential pool은 unmounted, Production DB role/secret/HTTP/자동 복구/과금 변경 없음. `HOLD_FORWARD_STOPPED`, `creditBilling.productionMounted=false`, G5 `productionMounted=false,scheduled=false` 유지.
### 2026-11-02 / W60 — G5 전용 물리 NOINHERIT LOGIN 실제 PostgreSQL17 수신 크레딧 정산·권한 거부 통합 검증

- **선행 CI:** PR #2888 HEAD `e72659f5e543061b1178fc42d569fbb2e9baf5c4` GitGuardian/Work Track security/전체 Integration (run 41405928677, 41406011103) GREEN, main 병합 `a19cb76b381eccff28f3209c885d5d27db4f9880`. 신규 G5 전용 credential 검증 Pool 자체는 코드 구현 및 단위 테스트 PASS이지만 실제 다른 물리 LOGIN을 통한 PostgreSQL RPC 결과는 미검증이었다.
- **구현:** 기존 S0 실 PostgreSQL17 E2E의 **GitHub Actions 전용** `myeongha_ci_case_[숫자]` named disposable clone에서 실제 전용 LOGIN `myeongha_seyeon_g5_commerce_login`을 `LOGIN NOINHERIT`로 임시 생성하고 30-byte 암호학적 난수 비밀번호를 테스트 실행 중만 사용한다. 일반 API와 달리 오직 `myeongha_commerce_internal_executor` 멤버십만 부여한다. **실제 새 `SeyeonG5PrivateCommercePostgresPoolV1`의 checkout**을 통과한 경우만 기존 수신 크레딧 복구 함수의 private pool로 사용한다. Original S0 Memory/Source Pin→Commit→Node HTTP/256-bit proof ACK를 실제 진행하고 Commerce 장애로 durable receipt+10-credit reserved 상태를 먼저 만든다 (독립 fixture=24).
- **실행 검증:** 물리 별도 LOGIN의 `session_user/current_user` 동일성, 역할 전환 전 G5 catalog 직접 호출 `42501` 거부, 전용 Pool LOGIN/Role/ACL preflight 통과, 10분 CI 가상 clock으로 preview `found=1,settled=0` 및 장부 불변, 실제 G4 원본 정산 RPC를 거치는 apply `found=1,settled=1`, 이후 예약 `settled`, 10-credit allocation/40 available, 원본 수신시각 보존, 재조회 대상 0건 확인. 중간에 전용 LOGIN에 일반 `myeongha_api_executor` 멤버십을 의도적으로 추가하면 preflight 접속 실패, 제거 후 다시 정상 정산되는지 검증한다. 독립 비밀번호는 소스/로그에 기록하지 않으며 테스트 종료 후 Pool 종료와 임시 ROLE 삭제.
- **범위:** 실제 PostgreSQL 연결이지만 로컬 GitHub Actions PG17 클론의 SSL=false로만 실습하며, **Production Supabase verify-full/TLS 인증서와 실제 운영 DB 계정·Secret provisioning을 검증한 것은 아니다**. 실제 Production에서는 어느 Runtime/HTTP/Worker/Scheduler에도 신규 Pool이 연결되지 않았다. 새 DB migration/운영 GRANT/Provider/과금 활성화 없음. `HOLD_FORWARD_STOPPED`, `creditBilling.productionMounted=false`, G5 `productionMounted=false`, `scheduled=false` 유지. 신규 HEAD exact CI 결과 전 PASS 선언 금지.
### 2026-11-02 / W61 — G5 만료된 전용 DB LOGIN의 기존 연결 재사용 차단

- **선행:** PR #2892 HEAD `2dc5553ab507d0422ffa6a4af179772760c1b172` GitGuardian/Work Track security/PostgreSQL17/db-authority-core/full Integration 모두 GREEN (runs 41408630356/41408657848), main squash `d7d07f65eaa483bc2c5015ea32126cc5874cc3ba`. 임시 실제 LOGIN으로 10-credit 복구 preview/apply와 API 권한 추가 시 거부를 검증했으나 DB 비밀번호 만료 뒤 **이미 인증된 물리 연결** 재사용 조건은 별도로 검사하지 않았다.
- **구현:** `SeyeonG5PrivateCommercePostgresPoolV1`의 실제 checkout SQL `pg_catalog.pg_roles`에서 `rolvaliduntil`을 DB 시각 `statement_timestamp()`와 비교해 `credentialUnexpired`을 산출한다. 미설정 `NULL`은 PostgreSQL 17 기본 비밀번호 만료 없음이므로 허용하지만, 만료 및 잘못되거나 누락된 결과는 연결 반환 전 fail-closed로 차단하고 연결을 폐기한다. 일반 API/직접 ledger/role membership ACL 검사와 별도의 `SET LOCAL ROLE` 트랜잭션 증명은 그대로 유지한다. DB 자격증명이나 비밀번호 원문을 응답/로그에 출력하지 않는다.
- **실제 PostgreSQL17 검증:** 기존 S0 fixture 24 disposable CI test에서 정상 원본 수신 ACK+Commerce 장애 10-credit reserved 이후 관리자에 의한 `ALTER ROLE myeongha_seyeon_g5_commerce_login VALID UNTIL 2000-01-01`을 테스트 DB에서만 시행한다. 기존 Pool의 인증된 로그인 연결 자체가 여전히 SELECT 가능하더라도 새 Checkout과 recovery preview는 거부되고 장부는 `reserved/40/10`으로 보존되어야 한다. 유효기간을 먼 미래로 복원한 뒤 일반 API 역할 부여 부정 시나리오와 G4 실제 정산/멱등 검증을 계속 수행한다. 종료 후 Pool/임시 역할 정리. 변경된 권한을 Production DB/Secret Manager에 적용하지 않는다.
- **버전 근거:** PostgreSQL 17 공식 `pg_roles` catalog의 `rolvaliduntil`는 비밀번호 인증 만료 시각, NULL은 미설정 값이며 인증 비밀번호 자체는 view에 노출되지 않는다. PG 서버 시간이 권위이므로 애플리케이션 클록 보정/추측 없음. 비밀번호 회전의 **기존 인증 세션 즉시 종료를 보장하는 기능은 아니며**, 이 Pool의 신규 checkout 차단만 구현했다.
- **운영:** G5 private pool은 미탑재, hosted TLS verify-full/실 운영 DB 자격증명 프로비저닝/DR/G0–G3 최종 검증/G6 모두 미완료. `HOLD_FORWARD_STOPPED`, `creditBilling.productionMounted=false`, G5 `productionMounted=false,scheduled=false` 유지. 새 HEAD의 실제 PostgreSQL17/security/full Integration CI 결과 전 PASS 아님.

### 2026-11-07 / W62 — G4 전용 실행 역할의 매 Checkout 최소 권한 검증 강화

- **선행 및 브랜치 정리:** 현재 main `4f9b8ed8352be45a19879c59f30290988519f7d9`을 기준으로 새 브랜치 `feat/security/g4-governed-role-boundary-20261107`를 만들었다. 기존 PR #2761은 base가 오래된 `29cd48d`, HEAD `cfba933`, 155개 파일 변경 및 충돌 상태(DIRTY)라 추가 변경을 얹지 않고 그대로 보류했다. 이전 브랜치의 W115–W120 보안 수정만 최신 main에 이식했다. W120 이전 exact-head PG17 CI #42216743254는 성공했으나, 최신 main 기반 새 브랜치의 CI 성공으로 간주하지 않는다.
- **이식한 G4 수정:** W115 입력 토큰 계산기 생성 시 모델 정책·요금표·API 키·모델·예약 여유 토큰을 불변 복사본으로 고정. W116–W117 일반 API 역할의 기존 비용 RPC 및 Governed RPC 직접 호출 차단. W118 일반 API가 전용 실행 역할/비용 소유자 역할로 전환할 수 있는 멤버십 차단. W119 전용 로그인 및 일반 API 역할의 원장·예산·요금표 직접 테이블 권한 차단. W120 내부 비용 원장 SECURITY DEFINER 함수 직접 실행 차단.
- **W121 구현:** 매 Checkout마다 로그인 계정뿐 아니라 실제 `myeongha_seyeon_governed_executor` 역할의 NOLOGIN/NOSUPERUSER/NOBYPASSRLS/NOINHERIT/NOCREATEDB/NOCREATEROLE/NOREPLICATION, 추가 역할 멤버십 0건, public 스키마 USAGE 허용·CREATE 금지, Subject/비용/Provider receipt 허용 함수의 정확한 권한, Legacy·내부·정산 Worker 함수의 실행 금지를 확인한다. 비용 원장·예산·요금표·Provider receipt queue 4개 테이블에 대해 테이블 권한과 컬럼 단위 권한까지 확인하며, 누락·불명확·과다 권한은 역할 전환 전에 fail-closed 처리한다.
- **실제 PG17 검증 추가:** 기존 disposable DB 테스트에 역할 속성·멤버십·RPC allowlist·스키마/테이블/컬럼 ACL 감사를 확장했다. 스키마 CREATE, receipt queue SELECT/컬럼 SELECT, Legacy RPC 실행, 일반 API 역할 멤버십을 각각 SAVEPOINT로 임시 부여해 탐지한 뒤 ROLLBACK한다. 별도 테스트 로그인으로 TypeScript의 실제 `GOVERNED_LOGIN_PREFLIGHT_SQL_V1` 원문을 추출해 PostgreSQL 17에서 실행하고 71개 결과 필드를 확인한다. 기존 PG17 S0 실행 경로에 관련 Vitest/Cloudflare 회귀 테스트도 연결했다.
- **로컬 검증:** Node 24 TypeScript/JavaScript 구문 검사 PASS, 두 DB 실행 스크립트 `bash -n` PASS, `git diff --check` PASS, `W121_RUNTIME_PREFLIGHT_AND_PG17_WIRING_PASS fields=71` PASS. 현재 로컬 Worktree에는 `node_modules`가 없어 Vitest는 실행하지 못했다. **새 브랜치 exact-head PostgreSQL17 CI는 아직 실행 전이며 PASS 아님.**
- **커밋 및 안전 범위:** `5c8ced6c4df0310c1f6bcd880318348fe5c5a50e`를 새 브랜치에 푸시했다. 운영 DB ACL/ROLE/Secret 변경, Production 연결, 유료 Provider 호출, 배포 및 병합은 수행하지 않았다. 일반 API 역할에 기존 Legacy/Governed RPC 권한이 남아 있으므로 런타임 ENFORCE는 의도적으로 차단 상태다. G4 미완료, 공식 G0–G6 0/7, `HOLD_FORWARD_STOPPED` 유지.


#### W62 후속 — PostgreSQL 15/17 권한 검사 및 CI 호환성 수정 (2026-11-07)

- **최신 main 동기화:** 기존 W121 작업 브랜치에 최신 main `9963eaaa1df66016f000e66b17f5902338e6960f`를 merge commit `ad6884fb27021eba59171e62567d9be879ba4e8c`로 반영했다. PR #3089는 현재 main 기준 ahead, behind=0이며 다른 트랙의 운영 문서 변경을 보존했다.
- **첫 CI 실패 수정:** `seyeon-governed-postgres-pool-v1.test.ts`의 실패 주입기가 SQL 부분 문자열을 검사해 사전검사 SQL 안의 주석/문구까지 실제 실패 명령으로 오인했다. 정확한 SQL 문장 predicate로 바꾸어 Subject assertion 실패와 `SET LOCAL ROLE` 실패를 각 실행 단계에서 재현하도록 수정했다.
- **PostgreSQL 15/17 테이블 권한 호환성:** `db-authority-core`의 실제 서버는 PostgreSQL 15.19이며, 이 버전의 `has_table_privilege`는 `MAINTAIN`을 지원하지 않는다. 런타임 사전검사는 `server_version_num >= 170000`인 경우에만 `MAINTAIN`을 평가하도록 CASE 분기했고, 두 DB 권한 감사 스크립트도 PostgreSQL 17 이상에서만 해당 권한을 검사한다. PG17 테스트에는 `MAINTAIN` 임시 GRANT 탐지와 SAVEPOINT ROLLBACK 검증을 별도로 유지했다.
- **역할 멤버십 호환성:** PostgreSQL 15의 `pg_has_role`은 `MEMBER`와 `USAGE`를 지원하지만 `SET`은 지원하지 않으며, `GRANT ... WITH INHERIT/SET` 멤버십 옵션도 지원하지 않는다. 테스트는 `MEMBER`/`USAGE`를 검사하고 실제 `SET LOCAL ROLE` 성공·거부를 실행해 15/17 공통 경계를 검증하도록 바꿨다. W121 멤버십 주입도 교차 버전 GRANT 문법을 사용한다.
- **사전검사 결과 직렬화:** 런타임 권한 결과 71개 필드를 71쌍의 `jsonb_build_object` 인자로 넘기던 테스트가 PostgreSQL의 함수 인자 상한 100개를 초과했다. 전체 레코드는 `to_jsonb(preflight)`로 직렬화하고, 예상 필드 목록을 별도 JSON 값으로 함께 반환해 71개 필드 누락/변형을 확인하도록 변경했다.
- **현재 검증 증거:** 코드 HEAD `5b3eb53b0f8a6d56f662fad6b934b9f9e6449dcc`의 [CI run 42263568899](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42263568899)에서 `Work Track · security`와 PostgreSQL 15 `db-authority-core`가 SUCCESS. `W121_GOVERNED_LOGIN_PREFLIGHT_SQL_VERSIONED_PASS`, 독립 LOGIN 경계 및 기존 D4A 권한·비용 경합 테스트까지 확인했다. **동일 run의 PostgreSQL 17 검증은 기록 시점에 진행 중이므로 전체 CI GREEN이나 W121 최종 PASS로 간주하지 않는다.** 이 Worklog 변경 자체로 새 exact-head CI도 다시 실행된다.
- **운영 경계:** Production DB ACL/ROLE/Secret 변경, 운영 연결·배포, 유료 Provider 호출, 과금·스케줄러 활성화 및 PR 병합은 수행하지 않았다. 기존 `HOLD_FORWARD_STOPPED`, `creditBilling.productionMounted=false`, G5 `productionMounted=false`, `scheduled=false`를 유지한다. G0–G6 전체 완료를 선언하지 않는다.

### 2026-11-07 / W122 — S0 제품 완성 중심 실행 로드맵 v3

- **목적:** 새 보안 기능을 계속 추가하는 방식에서 벗어나, 2026-10-25에 정한 S0(원본 `conversation_recall/v1` Memory 1건 + 현재 User 메시지 1건 + 최초 비스트리밍 답변 1회)을 실제 서비스로 완성하도록 실행 순서를 재정렬한다.
- **변경 문서:** `docs/security/SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V3_20261107.md` 신설. `SEYEON_AI_SECURITY_COMPLETION_GATES_V1.md`에 S0 Scope Overlay를 추가하고, 본 구현 현황 문서의 실행 순서·오래된 V2 참조를 갱신했다.
- **정책:** G0~G6의 증거·보안 합격 기준은 유지한다. S0에서는 History/Replay/Reader/Relationship·과거 대화 재사용/다중 Memory/Life Fact/Streaming을 구현하지 않고 계속 HOLD한다. 제외 경로가 실제 모델 Context에 섞이면 전체 요청을 HOLD한다.
- **실행 순서:** G0 S0 계약 → G1 단일 원본 Pin → G4 Governor/일반 고객 크레딧 → G2 원자 Commit → G3 최초 HTTP/receipt/철회 → G5 정확한 S0 통합 검증 → G6 제한 운영 smoke/복구.
- **기존 구현 재사용:** W115~W121 및 PR #3089의 전용 DB 실행 역할·PostgreSQL 15/17 권한 검증은 재작성하지 않는다. S0의 Pin/Commit/Reveal 및 기존 격리 테스트도 통과한 부분은 재사용하고, 실제로 끊긴 운영 연결만 마무리한다.
- **PR:** [#3094](https://github.com/gycha0109-beep/MyeongHa/pull/3094)는 main에 병합됐다. 병합 기준 SHA `cdf71d9453c96b42489a27857a6159936155065e`, 전체 Integration run [#42282815736](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42282815736) GREEN.
- **운영 경계:** 문서 변경만 수행. Production DB/ACL/Role/Secret, Provider, 공개 Route, credit billing, deployment/traffic 변경 0. `HOLD_FORWARD_STOPPED`, `creditBilling.productionMounted=false` 및 G5/G6 HOLD 유지.

### 2026-11-07 / W123 — S0 G1 Pin 이후 G4 예약 및 G5 receipt 정산 연결

- **실행 순서:** 양수 Memory 실행에서 G1의 원본 Memory 1건 + 현재 User 메시지 1건 Pin이 성공한 뒤에만 다음 단계로 진행하도록 연결했다. 서버가 Provider 설정·요금 정책을 검증한 다음 G4 고객 크레딧 예약을 수행하고, 그 이후에만 metered Provider를 구성·호출한다. G1 실패 시 G4 예약과 Provider credential 해석/호출은 실행되지 않는다.
- **G4 연결:** 기존 `admitSeyeonG4FirstMemoryCreditsV1`를 새로 구현하지 않고, 실행 경로의 post-G1 admission callback에서 재사용한다. Owner Admin 면제는 DB 조회 결과로만 인정하며, 일반 Member는 별도 Commerce pool과 신규 예약 결과가 없으면 Provider에 도달하지 못한다. 기존 idempotency·fresh reservation 조건은 유지한다.
- **G5/receipt 연결:** `SEYEON_G5_COMMERCE_HYPERDRIVE` 전용 pool factory를 추가했다. 일반 Subject 및 governed-cost 연결과 다른 전용 Commerce LOGIN/비밀번호, 동일 승인 DB origin, checkout마다 실제 `session_user`/private role/ACL 검증을 요구한다. binding에는 `SEYEON_G5_COMMERCE_HYPERDRIVE_ORIGIN_POLICY=supabase-verify-full-rls-v1` 및 전용 LOGIN principal marker도 요구한다. receipt route는 server-owned `creditBilling.productionMounted`가 true일 때만 기존 G4 receipt-credit bridge를 사용하고, 그렇지 않으면 기존 proof-only receipt 경로를 유지한다. proof receipt는 governed model-cost pool이 없어도 독립 동작하도록 G5 factory에서 해당 연결을 필수로 요구하지 않는다.
- **제품 정책:** 기존 zero-source 첫 답변 경로를 S0 제품 범위로 간주하지 않도록 `zeroSourceFirstReplyApproved=false`로 닫았다. `positiveMemoryFirstReplyApproved=false`, `creditBilling.productionMounted=false`, `memoryCount=1`, `firstReplyOnly=true`, `streamingEnabled=false`, `history/replay/reader/multi-memory=false`를 유지한다. 이 변경으로 공개 모델 경로가 활성화되지는 않는다.
- **Cloudflare 확인:** 현재 계정에서 확인 가능한 Hyperdrive 설정은 5개이며 전용 G5 Commerce binding은 없다. `wrangler.jsonc`에 임의 ID/placeholder를 추가하지 않았다. 따라서 운영 전환에는 전용 LOGIN/Secret/Commerce role grant 및 동일 승인 DB origin의 Hyperdrive 설정이 실제로 필요하다.
- **길이 제한 확인:** S0 `POST /api/chat/:threadId/turns`는 실제 body stream 16,384 bytes, 3,000ms completion deadline, User text 8,000자 상한이다. 연관 `POST /api/me/saju/preview-reading`도 16,384 bytes/3,000ms, `readingText` 200자 상한을 사용한다. 초과는 413, body 미완료는 408이며, 공통 bounded reader가 실제 bytes를 세고 `Content-Length`/`request.json()` 우회를 허용하지 않는다. 모델 요청은 직렬화 524,288 bytes, 공식 `/v1/responses/input_tokens` 인증 + 1,024 headroom 포함 48,000 tokens(원시 count 최대 46,976), Provider-enforced output 4,096 tokens, context window 1,050,000, prompt caching OFF다. Token-count 응답은 8,192 bytes/8,000ms 제한이며 문자 추정 fallback은 없다. 이 인증은 G1 Pin 이후 generation 전에 수행한다.
- **검증:** G5 Hyperdrive pool의 missing/reused/wrong-principal/physical-login/private-role 실패 테스트와 proof-only receipt의 governed pool 독립성 테스트를 추가했다. G1 실패 시 Provider credentials를 읽지 않는 Node runtime 회귀 테스트를 갱신했다. 이 W123 변경의 exact-head CI는 PR 생성 후 확인해야 하며 현재 GREEN으로 간주하지 않는다.
- **미완료/안전 경계:** 운영 Source Registry의 `conversation_recall/v1` 활성화 승인·정확한 positive Pin 실DB 증거, G0 revoke/transport 계약, G5 운영 LOGIN·Secret·Role·TLS·Hyperdrive, G4 운영 예약·receipt 정산·실패 복구, G2/G3 실배포 HTTP ACK는 미완료. `positiveMemoryFirstReplyApproved=false`, `creditBilling.productionMounted=false`, `HOLD_FORWARD_STOPPED`, G5 `productionMounted=false`, `scheduled=false` 유지. Production DB/ACL/Role/Secret, Provider 호출, 배포/트래픽 변경은 수행하지 않았다.


### 2026-11-07 / W124 — S0 비용 조기 차단과 운영 출처·철회 권한 실측

- **코드 수정:** 비용 통제가 OFF인 경우 실행 시도가 있으면 일반 DB 연결 준비 전 거부하도록 복구했다. ENFORCE는 별도 비용 DB 자격증명을 먼저 확인하며, Provider 설정 검증은 모델 전 원본 Pin 이후에 진행한다.
- **PR HEAD 검증:** PR #3097 commit b6da8c79d1cc38fa7b494ecb4c866cf14d3ba53c에서 CI run 42364616632, Governance run 42364616732, Web PR run 42364616633 SUCCESS. 일반 테스트 2,076건 통과. 이 문서 변경에 따른 새 HEAD CI 결과를 선행 추정하지 않는다.
- **운영 Source Registry SELECT:** 명하 Supabase 대상 PostgreSQL 17의 public.seyeon_positive_source_type_registry_v1에 (memory, conversation_recall, v1, seyeon-conversation-recall-projector-v1) 1행이 존재하지만 enabled=false, writable_enabled=false로 비활성화돼 있다. 기존 ‘Registry 비어 있음’ 주장을 수정했다. 실제 사용자 Memory나 Grant 데이터를 조회하지 않았고 positive Pin 실행 증거도 아니다.
- **운영 함수·역할 pg_catalog SELECT:** cmd_mark_seyeon_positive_context_ready_pinned_v1(13인자), cmd_mark_seyeon_chat_context_ready_pinned_v1(4인자), cmd_commit_seyeon_chat_turn_runtime_v2(9인자)가 설치돼 있으며 myeongha_api_executor EXECUTE=true다. 기존 cmd_revoke_memory_character_grant_v1은 API EXECUTE=false, SECURITY INVOKER. myeongha_seyeon_governed_login은 존재하지만 myeongha_seyeon_g5_commerce_login은 없다. G0 철회 전용 권한 계약과 G4/G5 분리된 실제 자격증명·TLS/Secret/Hyperdrive 증명은 미완료다.
- **안전 경계:** 운영 DB DDL/DML/GRANT/Secret, 유료 Provider, 공개 Route, 배포·과금 활성화 변경은 0. positiveMemoryFirstReplyApproved=false, creditBilling.productionMounted=false, HOLD_FORWARD_STOPPED 유지. G0~G6 최종 PASS 아님.


### 2026-11-07 / W125 — G0 철회 권한을 모델 사용 승인과 분리 (PR #3097)

- **실제 변경:** 첫 Memory Fetch 조립에서 기존 `approvedPersonalRecordModelUse`가 철회 HTTP의 `approvedWithdrawalWriteAdmission`으로 자동 전달되던 연결을 제거했다. 모델 사용을 허가해도 개인정보 철회 DB 쓰기가 자동 승인되지 않는다. 서버 전용 `approvedWithdrawalWriteAdmission`을 별도로 명시한 경우에만 기존 G0 철회 핸들러로 전달한다. 별도 Cloudflare 철회/receipt 경로의 정책·모델 비의존성을 유지한다.
- **검증:** 모델 승인만 있는 경우 철회 DB 쓰기 승인이 전달되지 않고, 독립적인 철회 승인만 명시했을 때 전달되는 회귀 테스트를 추가했다. 현재 커밋의 정확한 CI는 실행 결과 확인 전 PASS 아님.
- **미완료:** 실제 운영 Source Registry 활성화 및 Pin 증거, 철회 DB 권한·선형화, G5 Commerce LOGIN/Hyperdrive, 일반 고객 비용 예약·정산, G2/G3 실전송 ACK 및 G6 제한 운영. `positiveMemoryFirstReplyApproved=false`, `creditBilling.productionMounted=false`, `HOLD_FORWARD_STOPPED` 유지. 운영 DB/Role/ACL/Secret/Provider/배포·트래픽 변경 없음.


### 2026-11-07 / W126 — 운영 역할 현황 실측 및 G3 수신 확인의 G5 장애 독립성

- **현재 인프라 읽기 전용 결과:** 명하 Supabase PostgreSQL 17의 `conversation_recall/v1` Source Registry 1행은 `enabled=false,writable_enabled=false`; 기존 S0 긍정 G1은 계속 HOLD. 실제 `cmd_mark_seyeon_positive_context_ready_pinned_v1`, `cmd_commit_seyeon_positive_chat_turn_v1`, `cmd_issue_seyeon_positive_first_reply_v1`, `seyeon_private.cmd_ack_seyeon_positive_reply_v1`, `seyeon_private.cmd_request_seyeon_memory_revoke_v1`는 설치돼 있고 `myeongha_api_executor` 실행 권한이 존재함을 카탈로그에서 확인했다. `anon/authenticated/service_role`은 해당 함수 직접 EXECUTE가 없다. 이 사실만으로 실제 인증 Member 철회/송출 PASS를 선언하지 않는다.
- **별도 비용 연결:** 운영 Supabase에 `myeongha_seyeon_g5_commerce_login`은 없으며, Cloudflare Hyperdrive 총 5개 구성 중 G5 Commerce 전용 구성도 없다. 비밀번호/사용자 원본/개인정보는 조회하지 않았다.
- **구현 수정:** G4 정산 마운트가 참인 상태에서 G5 Commerce Pool 생성 자체가 실패하더라도, 기존 Subject DB의 정확한 256-bit receipt ACK는 진행하도록 변경했다. 수신 확인이 성공하고 정산이 불가능하면 503과 `SEYEON_CREDIT_RECEIPT_SETTLEMENT_UNAVAILABLE`을 반환해 과금 정산 성공으로 오인하지 않는다. G5의 기존 수신 건 복구 후보를 재사용한다. 증명 오류는 원래 거부를 그대로 반환한다.
- **검증/운영:** Commerce 연결 생성 실패·무효 proof·정상 정산 분기 회귀 테스트 추가. 해당 HEAD의 CI 결과 전 PASS 미선언. `positiveMemoryFirstReplyApproved=false`, `creditBilling.productionMounted=false`, `HOLD_FORWARD_STOPPED` 유지. 운영 DB/Role/ACL/Secret/Provider/배포/트래픽 변경 없음. G0~G6 완료 아님.

### 2026-11-07 / W127 — S0 G0 기술 계약 초안의 정확한 제품 범위 정리

- **기존 구현 재사용:** 광범위한 과거 S2용 G0 후보 문서에 현재 [S0 실행 로드맵 v3](SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V3_20261107.md) 전용 계약 후보를 덧붙였다. 원본 `conversation_recall/v1` Memory 1건 + 현재 DB User 메시지 1건 + 최초 비스트리밍 답변 1회를 D1~D5(원본/재동의, Commit/Reveal, 제외 출처, 철회 ACK, receipt/과금 재시도)로 대조했다. 기존 S0 HTTP receipt 계약 및 기존 구현을 그대로 재사용하며 History/Replay/Reader/다중 기억/Streaming 등은 `OUT_OF_SCOPE + FAIL_CLOSED`로 유지한다.
- **기술·운영 결정 분리:** G0 S0 계약은 제안일 뿐 사용자 기술 승인으로 처리하지 않는다. 본 문서와 PR은 운영 DB DDL/DML/GRANT/Role/Secret, Source Registry 활성화, Provider, 배포·트래픽 승인이 아니다. 2026-11-07 읽기 전용 운영 대조에서 결합 Pin 함수 2개/최근 원본 메시지 Pin 컬럼이 미설치이며 G5 Commerce LOGIN 부재와 Source Registry 비활성을 이미 확인했다. 해당 설치·권한 조치는 승인 전 진행하지 않는다.
- **검증 경계:** 이전 PR #3097 HEAD 전체 Integration 및 병합 후 main CI 통과를 기존 증거로 재사용한다. 이 W127 변경은 문서·작업 기록만 수정하며 새 보안 기능/CI 워크플로/운영 변경은 없다. G0~G6 최종 PASS 0/7, `positiveMemoryFirstReplyApproved=false`, `creditBilling.productionMounted=false`, `HOLD_FORWARD_STOPPED` 유지.

### 2026-11-07 / W128 — S0 설치 안내서와 현재 운영 기준 정합화

- **목표:** 로드맵 v3 단계 0/1의 설치 준비 자료에서 과거 Node 최초 답변·빈 Source Registry·Positive 실행권한 부재라고 읽히는 낡은 서술을 제거하고 현재 운영 증거와 일치시키기.
- **변경 파일:** `scripts/operations/seyeon-security-s0/README.md` (S0 Cloudflare Worker 최초 비스트리밍 경로, Registry 비활성 1건, G1 결합 Pin 미설치·G4 Commerce 계정 부재, 기존 16→17 설치 순서 및 운영 승인 경계); 이 WORKLOG. 애플리케이션 코드·SQL·CI workflow 변경 0.
- **완료:** 최신 `main`의 런타임/정책 파일·G1 설치 목록 및 읽기 전용 명하 PostgreSQL 카탈로그와 안내문 대조. 기존 S0의 `OUT_OF_SCOPE + FAIL_CLOSED`, `HOLD_FORWARD_STOPPED` 불변. 운영 DB 원본 내용/Grant/비밀번호 접근 없음.
- **미완료:** G0 D1~D5의 사용자 기술 승인, G1 운영 결합 Pin 적용·증명, G4 Commerce LOGIN/Hyperdrive, G2/G3 Worker·receipt·철회 경합, G5/G6 실환경 증거. 최종 Gate PASS 0/7.
- **브랜치·커밋·PR:** `docs/security/s0-operations-guide-sync-20261107`, 기준 main `dba6f436e90e9a83c27137fa218ab5115d048cf4`; README+WORKLOG 최초 동시 커밋 `80e644aaf334c699015c7c1fa310976d0d1c7f40`; [PR #3104](https://github.com/gycha0109-beep/MyeongHa/pull/3104). PR 최종 HEAD `22efb8e297c3e897123766d43b9b69ecf768bbc5`는 CI/전체 Integration PASS 후 `0814d79f5c9a534e1fd731ec9dffb7efcde8da94`로 병합 완료(아래 W129 증거 참조).
- **테스트·CI 근거:** 내용 근거는 `scripts/operations/seyeon-security-s0/plan.mjs`, `cloudflare/myeongha-worker.mjs`, `apps/api/src/seyeon-security-s0-production-policy-v1.ts`, 운영 PostgreSQL read-only catalog; 선행 [PR #3102 전체 Integration](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42370395077), [병합 후 main CI](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42370851017) SUCCESS. PR #3104 해당 HEAD [CI #42374190383](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42374190383), [전체 Integration #42374245792](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42374245792), 병합 후 [main CI #42375162788](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42375162788) 모두 SUCCESS.
- **블로커·다음 작업:** G0 기술 계약과 운영 DDL/ACL/Source 전환은 사용자 범위별 승인 필수. 승인 전 운영 변경 금지. PR CI 완료를 확인하고, 승인 시 로드맵 G1 실제 원본 Pin 연결부터 재개.

### 2026-11-07 / W129 — W128 PR 병합·검증 증거 확정 및 승인 경계 재확인

- **목표:** W128의 'CI 미확인'을 실제 완료 결과로 교정하고 다음 로드맵 작업의 선행조건을 정확히 구분한다. 기존 코드·SQL 또는 운영 환경을 임의 재실행하지 않는다.
- **변경 파일:** 기존 트랙 워크로그 `docs/security/SEYEON_AI_SECURITY_IMPLEMENTATION_STATUS_AND_ENDPOINTS_20261030.md` (W128 HEAD/CI 증거 보완 및 W129 후속 기록). 신규 WORKLOG·기능·SQL·CI workflow 추가 없음.
- **완료:** W128 [PR #3104](https://github.com/gycha0109-beep/MyeongHa/pull/3104)의 HEAD `22efb8e297c3e897123766d43b9b69ecf768bbc5`, 병합 SHA `0814d79f5c9a534e1fd731ec9dffb7efcde8da94` 및 정확한 HEAD 검증 확정. 최신 main `61736e57979d886559451d15a853292fb3bf586e`의 이후 변경은 별도 ops/DR PR #3095이며 security G0~G6 PASS 증가 근거가 아니다.
- **미완료:** G0 D1~D5 사용자 기술 계약 확정, G1 운영 combined Pin 설치·실효 권한·원본 사용 검증, G4 고객 크레딧/Commerce 전용 LOGIN/Hyperdrive, G2/G3 송출·철회 증거, G5/G6 운영 검증. 종료 게이트 0/7 `HOLD_FORWARD_STOPPED` 유지.
- **브랜치·커밋·PR:** `docs/security/w128-evidence-closure-20261107` / 기준 main `61736e57979d886559451d15a853292fb3bf586e`; 초기 기록 커밋 `9b3c6a5ecf19629a54fe2716b5c7df234f028085`; [PR #3106](https://github.com/gycha0109-beep/MyeongHa/pull/3106). 최종 HEAD CI·병합 결과는 증거 확인 전 미판정.
- **테스트·CI 근거:** 이전 W128 PR [일반 CI #42374190383](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42374190383) SUCCESS, [전체 Integration #42374245792](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42374245792) SUCCESS (PostgreSQL 17, DB authority, commerce 포함), 병합 후 [main CI #42375162788](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42375162788) SUCCESS. Production [workflow #42375162390](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42375162390)는 SUCCESS이나 migration/deploy 단계는 SKIPPED. 현재 증거는 문서 및 격리 검증이며 실제 S0 운영 PASS 아님.
- **블로커·다음 작업:** G0 기술 결정과 별도 운영 DB DDL/Role/ACL/Source 변경은 사용자 승인 필요. 승인 없이 G1 SQL 설치·Source ON·Provider/과금/배포를 하지 않는다. 범위별 승인 뒤 기존 `16→17` G1 결합 Pin을 대상 DB에서 검증하고 G4→G2→G3→G5→G6 순으로 진행한다.

### 2026-11-08 / W130 — 잘못된 ops/DR 이탈 차단 및 세연 AI 보안 S0 작업 재개 지점 복원

- **목표/원인 판정:** 사용자가 AI 보안 후속 작업을 기대했으나 전달된 결과가 `명하 운영·복구 Phase 8~13` 및 PR #3113(`Watchtower-Track: ops`)으로 이어졌음을 확인. 이는 AI 보안의 S0 v3 로드맵과 별개의 트랙이며, **채팅/자동 이관의 정확한 오귀속 발생 지점은 이 GitHub 기록만으로 확정할 수 없다**. 서로 다른 작업의 과거 코드를 임의 되돌리거나 ops 성과를 security 완료로 치환하지 않는다.
- **정본 보안 이력 복원:** AI 보안 WORKLOG의 마지막 정상 작업 W129는 [PR #3106](https://github.com/gycha0109-beep/MyeongHa/pull/3106). 최종 HEAD `9a2b43378686ef0bfd9240f7f3be68e6659f9f26`, 병합 SHA `8897a38f941a1948abe673a820b36a1124f9ded5`. 해당 HEAD의 [일반 CI #42375976905](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42375976905), [Governance #42375976869](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42375976869), [Web PR #42375976927](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42375976927), [전체 Integration #42375991548](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42375991548)은 모두 SUCCESS. 이 근거는 **문서/기존 검증**의 완료이지 S0 보안 Gate 최종 PASS 또는 Production 활성화를 뜻하지 않는다.
- **다른 트랙 분리:** [운영 PR #3113](https://github.com/gycha0109-beep/MyeongHa/pull/3113)과 관련 `docs/operations/PRODUCTION_OPERATIONS_STATUS_AND_EXIT_20261030.md`·`docs/operations/PRODUCTION_OPERATIONS_EXIT_ROADMAP_20261107.md`는 `Watchtower-Track: ops` 및 DR Phase 8~13 소관이다. 해당 변경·백업·DB 객체/권한 대조·CI를 security의 다음 구현 또는 완료 증거로 계산하지 않는다. 이미 수행된 ops 코드/문서/PR은 원래 귀속을 유지하며, 승인 없는 운영 변경이나 강제 롤백을 하지 않는다.
- **현재 제품 범위·상태:** S0 = 인증된 현재 Member/Turn + 명시적으로 허용된 원본 `conversation_recall/v1` Memory 1건 + 현재 User 원문 1건 + 최초 **비스트리밍** 답변 1회. G0~G6 최종 수용 **0/7**, `HOLD_FORWARD_STOPPED`, `positiveMemoryFirstReplyApproved=false`, `creditBilling.productionMounted=false`. History/Replay/Reader/Relationship/다중 Memory/Life Fact/Streaming 및 전체 ops/DR 로드맵은 S0 완료의 선행 구현 작업이 아니다.
- **변경 파일/브랜치:** 기존 보안 WORKLOG(본 문서)에 해당 복구 경계·최종 PR/CI·재개 순서를 기록하고, 기존 `SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V3_20261107.md`의 트랙 연속성 지침을 보강. 브랜치 `docs/security/restore-s0-track-continuity-20261108` / [복구 PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120). 최초 WORKLOG 커밋 `f710839be2f37d80aff2c5ceac6c5b010f2e70fa`, 로드맵 정렬 커밋 `abace91bd087d9b29a21c5851179018aa7f8a72f`. 애플리케이션 코드·SQL·Production 데이터/역할/시크릿·Provider·트래픽·CI workflow 변경 없음. 신규 기능이나 신규 워크로그 문서 생성 없음.
- **남은 과제/다음 작업:** **기존 v3 실행 순서 그대로** (1) G0 S0 D1~D5 기술 계약의 미확정 사항을 실제 소스·실행 계약과 대조하고 사용자 결정이 필요한 항목을 분리 (2) 운영 변경 없이 G1의 결합 원본 Pin 기존 `16→17` 설치·권한/선행 조건을 재확인 (3) 승인된 범위에서만 G4 일반 고객 크레딧·별도 Commerce LOGIN/Hyperdrive → G2 원자 Commit → G3 첫 HTTP/receipt/철회 → G5 통합 검증 → G6 제한 운영 검증. 기존 S0 구현과 통과 증거는 재사용하며 ops 단계로 전환하지 않는다.
- **블로커 및 승인사항:** G0 D1~D5 기술 계약 최종 승인, 운영 G1 설치·Source Registry ON/권한·Role·Secret/Hyperdrive, 유료 Provider·과금/배포·트래픽·개인정보 테스트는 각각 실제 승인 범위 전까지 실행 금지. **다른 ops 트랙의 승인·CI·병합은 security 승인으로 전용하지 않는다.** 코드/문서 검토 및 기존 테스트 재사용에는 신규 승인 없음. 이 문서-only 변경의 최종 PR/CI는 정확한 HEAD 검증 전 미판정, `ROADMAP_COMPLETE` 아님.

### 2026-11-08 / W131 — G1 결합 Pin 실행권한 사전 확인 및 비승인 시 Turn 생성 차단

- **목표·발견:** 보안 S0 v3의 G1 양수 Memory+현재 User 결합 Pin을 실제 호출하는 코드가 일반 Member Subject 트랜잭션의 `myeongha_api_executor` 경로임을 확인. 반면 현재 source-only `17-g1-positive-combined-model-source-pin.sql`은 `seyeon_private.pin_positive_model_context_sources_v1`에 대한 `myeongha_api_executor` 직접 EXECUTE를 명시적으로 회수하며, 선행 운영 검증은 0건 Pin 1640 존재·권한만 확인한다. 따라서 **16/17 함수·컬럼을 설치했다는 사실만으로 정상 양수 응답을 허가할 수 없다**. 저장소 소스 기준 결손이며 새 Production DB 권한/기능 승인으로 간주하지 않는다.
- **구현:** `apps/api/src/production-seyeon-chat-runtime-v1.ts`에 `assertSeyeonProductionCombinedPinReadinessV1` 추가. 기존 서버 소유 양수 Memory 승인 callback이 명시적으로 존재할 때만, **기존 Member DB 트랜잭션 내부의 읽기 전용 카탈로그 조회**로 (a) 결합 함수 SECURITY DEFINER 여부, (b) 실제 호출 역할의 EXECUTE와 private schema USAGE, (c) 16번 최근 원본 Pin 함수, (d) 원래 positive Pin 함수, (e) `chat_turn_attempts.seyeon_recent_source_pin_jsonb` 컬럼의 설치 여부를 확인한다. 어느 하나라도 불충분하면 기존 `SEYEON_PIN_MIGRATION_REQUIRED` 오류로 User Turn·Attempt 생성 **이전에** 중단한다. 0건 경로의 기존 검사와 승인/활성화 정책은 변경하지 않는다.
- **테스트:** `test/production-seyeon-g1-combined-pin-readiness.test.ts` 추가. 양수 준비 승인 메타데이터가 갖춰진 정상 readback, 미설치·권한 미허용, 0건/중복/비정상 카탈로그 응답 거부, 읽기 전용 SQL 구조를 검증. 정확한 PR HEAD의 실제 GitHub CI 결과가 나오기 전까지 테스트 PASS라고 선언하지 않는다.
- **변경 경계:** Production DB DDL/DML/GRANT/RLS/Role/Secret, Hosted 자원, 원본 Memory/Grant 조회, Provider·과금·배포·트래픽 변경 없음. G0 D1~D5 사용자 기술 승인과 별도 운영 SQL/권한 승인 없이 private 함수를 API에 노출하거나 실행 역할을 승격하지 않는다. `positiveMemoryFirstReplyApproved=false`, `creditBilling.productionMounted=false`, `HOLD_FORWARD_STOPPED` 유지. 이 조치는 **미설치·접근불가 원인을 조기 거부할 뿐 G1 실행 성공을 만들지는 않는다**.
- **브랜치·PR/증거:** `docs/security/restore-s0-track-continuity-20261108` · 기존 [security PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120)에서 W130 다음에 계속 진행. 코드 최초 변경 `5ae4af8bafde01a4e2412d15d0f7a513172b882d`; 테스트 추가 `2a1de4b2dfd635fc9973b3361494859266e0d172`; fixture 타입 조정 `3b358fbf606a9d7b51d774daf040a56aa04d46d5`. 새 WORKLOG/CI Workflow 만들지 않고 기존 보안 기록에 남긴다.
- **남은 일·다음 작업:** G0 S0 기술 계약의 최종 확정(사용자 결정), 실제 실행 Role/Function의 안전한 **권한 호출 설계** 확정 및 G1 16→17 운영 설치·실행 입증. 이후 기존 로드맵의 G4 일반 고객 크레딧 → G2 원자 Commit → G3 최초 수신/철회 → G5 통합 → G6 제한 운영. 불필요한 보안 범위 추가나 `ops` 로드맵 전환 금지.
- **블로커/승인:** 기술 계약과 운영 ACL·SQL 적용 승인 전에는 positive 실행을 계속 HOLD. 해당 승인 부재로 G0~G6 최종 PASS **0/7**, `ROADMAP_COMPLETE` 아님.


### 2026-11-08 / W132 — 기존 기억 정책 승인 재사용·G1 CI 검증 및 운영 권한 변경 경계

- **작업 목표:** 이전 작업 W131의 코드·PR·CI와 보안 로드맵을 다시 대조하고, 이미 승인한 개인 기억 사용 원칙을 반복 승인 요청하는 잘못된 작업 흐름을 바로잡는다. 기존 WORKLOG를 재사용하며 새 트랙/새 기능/새 운영 작업을 만들지 않는다.
- **변경 파일:** `docs/security/SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V3_20261107.md`에 2026-10-18 [기존 사용자 승인 결정](SEYEON_PRODUCT_OWNER_MEMORY_REVOKE_HISTORY_DECISION_20261018.md)의 재사용·중복 승인 요청 금지와 '기능 검증 미완료 ≠ 원칙 미승인' 경계를 명문화했다. `docs/security/SEYEON_AI_SECURITY_IMPLEMENTATION_STATUS_AND_ENDPOINTS_20261030.md`(본 WORKLOG)에 W132와 CI·다음 작업을 누적하고, 최상단 재개 지점을 최신 기록으로 수정했다. 애플리케이션/SQL/CI Workflow 변경 없음.
- **완료·코드 대조:** [보안 PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120) W131 HEAD `5f03150b239dbab086525b1e73e61cb6171a1583`에서 결합 출처의 모델 호출 전 사전 차단 및 기존 Member 실행 역할을 확인했다. 실제 Subject 트랜잭션은 `SET LOCAL ROLE myeongha_api_executor`를 수행하므로 새 카탈로그 검사 `current_user`는 해당 역할을 대상으로 한다. 기존 소스 전용 `17-g1-positive-combined-model-source-pin.sql`은 이 역할의 private 결합 함수 실행 권한을 명시적으로 회수한다. **새 방어 검사의 정상 동작은 확인돼도 양수 원본 기억 응답의 실제 성공은 아직 불가능/미검증**이다.
- **정확한 테스트·CI 근거:** W131 HEAD `5f03150...`에 연결된 [PR Checks](https://github.com/gycha0109-beep/MyeongHa/pull/3120/checks): [Web Gates #42401435211](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42401435211), [Governance #42401435223](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42401435223), [CI #42401435225](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42401435225) 모두 **SUCCESS** 확인. CI의 `Work Track · security` 및 `CI Verify`는 SUCCESS, 이 실행에서 PostgreSQL 17·DB Authority 등은 **SKIPPED**여서 전체 Integration/운영 DB 실증 PASS로 간주하지 않는다. 이 W132 문서 변경 후 **새 HEAD의 CI는 별도 확인 전 미판정**.
- **브랜치·커밋·PR:** 기존 `docs/security/restore-s0-track-continuity-20261108` / 보안 [PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120). W131 완료 기록 커밋 `5f03150b239dbab086525b1e73e61cb6171a1583`; 이번 로드맵 승인 재사용 명시 커밋 `f6e6a085132aa8ca5343bf566ab16164971b7960`; 이 W132 기록은 이어지는 동일 PR WORKLOG 커밋에 포함한다.
- **미완료:** 운영용 결합 Pin 함수·컬럼 설치, 안전한 실행 권한 구성, 정확한 사용자 기억/현재 메시지 결합 동작 및 모델 호출 전 저장 실증. 이후 기존 G4 고객 크레딧→G2 원자 확정→G3 첫 답변/철회→G5 통합→G6 제한 운영 순서가 남는다. 제품 정책 기승인과 무관하게 G0~G6 **운영 수용 증거 0/7**, `HOLD_FORWARD_STOPPED`, `positiveMemoryFirstReplyApproved=false`, `creditBilling.productionMounted=false` 유지.
- **블로커·다음 작업:** 사용자에게 이미 승인한 다섯 가지 기억 정책을 다시 묻지 않는다. 다음 실행 단계는 기존 16→17 결합 함수의 설치·최소 권한 계약을 확정해 운영 대상에 실제 적용·검증하는 작업이나, **운영 DB 함수·컬럼·접근권한 변경은 이 작업 단위의 권한 밖**이므로 여기서 중단한다. 변경할 정확한 대상·권한이 준비되기 전 포괄적 승인을 요구하지 않으며 운영 DB/Role/Secret/Provider/과금/배포/트래픽을 변경하지 않는다. 다음 세션은 이 W132와 로드맵을 먼저 확인하여 중복 개발·승인 요청을 피한다.

### 2026-11-08 / W133 — S0 원본 기억 결합 Pin의 기본 차단 소유자 호출 경로 실구현

- **목표:** 이전 W131/W132 대조에서 발견한 실결손 해결: 일반 회원 Subject DB 실행 역할(`SET LOCAL ROLE myeongha_api_executor`)은 `seyeon_private.pin_positive_model_context_sources_v1` EXECUTE를 의도적으로 부여받지 않는데 기존 서버 코드가 해당 private 함수를 직접 호출하고 있었다. G1 원본 Memory 1건+현재 User 원본 메시지 1건을 같은 DB 호출로 결속하는 기존 기능을 재사용하고, private 함수의 직접 실행 제한을 유지하면서 **호출 가능한 최소 소유자 경로를 소스 코드에 연결**한다. S0 범위 밖 출처는 계속 차단한다.
- **변경 파일(기능):** `scripts/operations/seyeon-security-s0/17-g1-positive-combined-model-source-pin.sql`에 `public.cmd_pin_seyeon_positive_model_context_sources_v1`을 SECURITY DEFINER·기존 NOLOGIN 채팅 소유자 권한으로 추가한다. 함수는 현재 Subject 권한을 확인한 다음 기존 private 원자 결합 함수만 같은 트랜잭션에서 호출한다. public wrapper의 PUBLIC/anon/authenticated/service_role/API EXECUTE는 모두 **REVOKE(기본 차단)**, 기존 private 함수의 직접 API EXECUTE도 계속 REVOKE. owner 이전에만 `public` schema CREATE를 일시 부여하고 즉시 회수한다. **운영 SQL 마이그레이션 또는 운영 ACL 변경은 아님.**
- **변경 파일(연결·안전 검사):** `apps/api/src/seyeon-g1-positive-combined-source-port-v1.ts`의 실제 호출 대상과 상수를 private 함수에서 새 public Owner 함수로 전환. `apps/api/src/production-seyeon-chat-runtime-v1.ts`의 Turn/Attempt 생성 전 읽기 전용 준비 검사에서 (1) public 함수가 정확한 Owner 소유·SECURITY DEFINER, (2) 현재 API 실행 역할에만 유효한 좁은 EXECUTE·schema USAGE, (3) anon/authenticated/service_role은 호출 불가, (4) private 원본 함수는 Owner 소유·SECURITY DEFINER이면서 현재 API 역할에 **직접 EXECUTE 불가**, (5) 기존 최근 메시지 Pin 함수·원본 Memory Pin 함수·필수 컬럼 존재를 점검한다. 이상 시 기존 `SEYEON_PIN_MIGRATION_REQUIRED`로 사용자 Turn 생성 전 중단. **권한을 자동으로 부여하거나 사용 기능을 활성화하지 않는다.**
- **변경 파일(검사·설명):** `scripts/operations/seyeon-security-s0/install-isolated.mjs`에 격리 설치 후 public wrapper/private 원본 함수 모두 API EXECUTE가 없다는 검사를 추가. `test/production-seyeon-g1-combined-pin-readiness.test.ts`에 호출 대상·private 직접 호출 금지·Owner/권한 확인 SQL·SQL 소스 기본 REVOKE 회귀 검사 추가. `scripts/operations/seyeon-security-s0/README.md`에 운영 설치와 실행 권한이 독립적으로 필요함을 명시. 기존 WORKLOG 본 파일에 W133 기록; 새 WORKLOG/로드맵/CI Workflow 추가 없음.
- **완료 범위/코드 커밋:** 브랜치 `docs/security/restore-s0-track-continuity-20261108` / 보안 [PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120). 새 wrapper `20a48850b3108af3365396baa913c5ed2a105c7c`, API 호출 전환 `7229f02b5250c66507734a11ef31d3191199968b`, 역할·권한 사전검사 `fe697f2eb2772aca6d8ea4bc20b74317aa3b3229`, 격리 ACL 검사 `b3e54ced5b657bd1f9b0d93badc35b567faf2ba5`, 회귀 테스트 `5feee6bdbd8ce475f2cd073b3e3d647abe364c29`, 설치 스키마 임시 권한 수정 `7df730f59d7a05c15f66708445397f794049e626`, 테스트 정정 `adf5769afeb955b3eff593f2fd5601671ba1d397`, README 정합화 `095902b2250448f1aba6608cd06f5ba2c3589de5`. 이 W133 기록은 별도 후속 커밋으로 **같은 PR**에 포함.
- **테스트·CI 근거:** 직전 W132 HEAD `dadaf167a487a8f89f681d72f075eafd9bf5311b` [CI #42405594701](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42405594701), [Governance #42405594735](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42405594735), [Web Gates #42405594556](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42405594556)는 모두 SUCCESS. **이것은 W133 소스 변경의 CI 성공 근거가 아님.** W133 HEAD 및 [PR Checks](https://github.com/gycha0109-beep/MyeongHa/pull/3120/checks)의 새 CI·전체 Integration·실제 독립 PostgreSQL 권한 검증은 각 결과가 확인되기 전 **미판정**. 원격 Production DB의 private/public 함수 설치·실제 1 Memory Pin 성공도 검증되지 않았다.
- **미완료·블로커:** 소스에 새 public Owner 함수가 있어도 기본 API EXECUTE는 REVOKE이고, 최신 운영 증거에서는 기존 16·17 원본 함수·컬럼이 설치되지 않은 것으로 확인됐다. 따라서 현재도 실제 양수 원본 기억 사용 불가, Source Registry 비활성, Provider/과금/HTTP Reveal OFF, `HOLD_FORWARD_STOPPED`, `positiveMemoryFirstReplyApproved=false`, `creditBilling.productionMounted=false`. 운영 DB 설치·최소 EXECUTE 부여, 실제 Member/Attempt/원본 Pin 실증은 **운영 권한 변경 범위에 해당하므로 승인 없이 실행 금지**. 이미 승인된 기억 정책 D1~D5를 다시 묻지 않는다. G0~G6 최종 수용 0/7, `ROADMAP_COMPLETE` 아님.
- **다음 작업:** W133 HEAD의 기존 PR CI와 필요한 격리 PostgreSQL 검증 결과를 확인해 실패 시 동일 트랙에서 수정한다. 독립적으로 가능한 로드맵 범위의 작업만 추가 진행한다. 실제 운영 적용은 대상 함수·필요한 계정 1개·새로 설치할 객체·변경 전후 권한·복구 경계를 구체적으로 명시한 후 사용자 승인 범위 내에서만 수행한다. 설치 성공 이후 G1 실제 영속 Pin→기존 G4 일반 고객 크레딧→G2 원자 Commit→G3 최초 송출/철회→G5 통합→G6 제한 운영 순서로 진행한다.

### 2026-11-08 / W134 — private 스키마 접근권한 없이 G1 설치 상태 확인 가능하도록 수정

- **작업 목표:** [보안 PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120) W133 소스 연결을 정확한 Member 역할/SQL 권한 계약과 다시 대조. 일반 회원 실행 역할은 private 스키마 USAGE와 private G1 함수 EXECUTE가 없어야 하므로, 해당 역할이 `to_regprocedure('seyeon_private....')`로 private 함수 존재 여부를 직접 찾으면 정상 차단 구성도 준비 실패로 잘못 판정할 수 있는 위험을 해결한다. 기존 기억 사용·철회 정책에 대한 재승인은 요청하지 않는다.
- **변경 파일·완료:** `apps/api/src/production-seyeon-chat-runtime-v1.ts`에서 **private 두 함수**의 준비 상태만 스키마 이름·함수 이름·인자 개수·정확한 16/7개 인자 타입을 `pg_catalog.pg_proc/pg_namespace`로 조회하도록 변경. Owner, SECURITY DEFINER, private 함수의 현재 API 직접 EXECUTE **거부** 검사는 유지한다. public 소유자 명령 실행 허용·일반 사용자의 직접 실행 금지·기존 컬럼 확인·Turn 생성 전 차단도 그대로다. `test/production-seyeon-g1-combined-pin-readiness.test.ts`에서 private 함수 이름 해석에 의존하지 않는 조회와 정확한 인자 검증을 확인하도록 기존 회귀 검사를 갱신했다. 앱 코드/테스트 2개 파일만 변경; 새 기능·워크플로·WORKLOG 없음.
- **브랜치·커밋·PR:** 기존 `docs/security/restore-s0-track-continuity-20261108`, [PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120), 선행 W133 SHA `255f70aa810b98e7a7a4fbf285a5b6f5bfdf4318`. 이번 소스 수정 `2bfe62617245d364d308e8d2ded81df548604db2`, 테스트 `8ccde55f9a92c07159b907c64fd7e074ceaaee78`. W134 기록은 이어지는 동일 PR 커밋에 포함한다.
- **테스트·CI 근거:** W133 SHA `255f70aa...`에 연결된 [CI #42406266223](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42406266223), [Governance #42406266116](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42406266116), [Web Gates #42406266140](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42406266140) **모두 SUCCESS**를 확인했다. 이는 새 W134 변경의 PASS 증거가 아니다. W134 정확한 HEAD [PR Checks](https://github.com/gycha0109-beep/MyeongHa/pull/3120/checks)의 CI/DB 격리 검증·전체 Integration은 별도 결과 확인 전 미판정. PostgreSQL 17의 `pg_proc.proargtypes`는 0부터 인덱싱되는 실제 입력 인자 시그니처이므로 이를 사용해 정확한 두 함수를 확인한다. <https://www.postgresql.org/docs/17/catalog-pg-proc.html> 참조; 운영 DB 쿼리·원본 데이터 조회는 시행하지 않았다.
- **미완료:** 현재 운영 DB에 16→17 결합 Pin 함수·컬럼 적용 및 정확한 최소 API 실행 권한 증명, 원본 Memory 1건+현재 User 1건 실제 Pin·비승인 모델 호출 0건 실증. G4 고객 크레딧→G2 동일 트랜잭션 확정→G3 첫 HTTP 송출/철회→G5 통합→G6 제한 운영 검증은 그대로 남는다. `HOLD_FORWARD_STOPPED`, `positiveMemoryFirstReplyApproved=false`, `creditBilling.productionMounted=false`, 최종 완료 증거 0/7 유지. 신규 사용자 데이터/SQL/Role/Secret/Provider/과금/배포/트래픽 운영 변경 없음.
- **블로커·다음 작업:** 이번 HEAD의 검사 완료와 병합을 먼저 확인하며 실패하면 같은 트랙에서 수정한다. 실제 운영 DB에 **기존 승인 S0 범위의 16→17 함수·컬럼 및 정확한 실행 권한을 설치**하는 단계는 운영 변경의 구체적인 범위가 확정되고 별도 적용 승인되기 전에는 중단한다. 사용자에게 이미 승인한 개인 기억 정책의 재승인을 요구하지 않고, 안전한 운영 적용 이후에만 현재 로드맵의 다음 G1/G4 단계를 진행한다. `ROADMAP_COMPLETE` 미선언.

### 2026-11-08 / W135 — 기존 PostgreSQL 격리 경로에서 실제 통합 원본 Pin 호출 검증 추가

- **작업 목표:** 직전 W134의 새 소유자 경유 통합 G1 함수는 설치·기본 차단·정적 권한 확인과 기존 개별 Pin 경로만 검증됐다. 실제 회원 DB 실행 역할로 `public.cmd_pin_seyeon_positive_model_context_sources_v1`을 호출하여 원본 `conversation_recall/v1` Memory 1건과 현재 User 1건을 **하나의 호출로 Pin**하고, 기존 G2 Commit/최초 답변 경로에 이어지는 증거가 부족했다. 기존 로드맵 G1/G5의 누락된 실경로 검증을 기존 PostgreSQL 17 격리 테스트에서 재사용한다.
- **변경 파일·구현:** `test/seyeon-security-s0-postgres.e2e.test.ts` 기존 합성 Member/Thread/Turn/Attempt/원본 Memory/Grant fixture에 `combined` 분기 추가. **격리 테스트 DB에서만** 새 public 소유자 함수 실행 권한을 현재 Member 실행 역할에 정확한 시그니처로 허용하고, 기존 `pinSeyeonG1CombinedModelSourcesV1` 어댑터로 정확한 서버 선택과 모델 원본 사용 집합을 전달한다. 두 Pin의 같은 Attempt 영속 저장, 직접 private 결합 함수의 API EXECUTE 거부, 기존 G2 원자 Commit 및 최초 응답 본문 1회 전달을 단일 합성 시나리오에서 확인한다. 기존 개별 Pin·철회·Reader 제외·G5 테스트와 격리 설치 기본 차단 검사는 유지한다. 운영 DB/Role/ACL·새 CI workflow 변경 없음.
- **브랜치·커밋·PR:** `docs/security/restore-s0-track-continuity-20261108` / [보안 PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120). 통합 호출 격리 검증 추가 커밋 `f541f5b2c525855ebde278f3a0358ca22206bdda`; 최초 전송 결과형의 과잉 가정 제거 `d46326efe59ac7868f3a2d517f87d1b33e4cbf35`. 이 W135 기록은 동일 PR 후속 커밋에 포함.
- **기존 테스트·CI 근거:** W134 정확한 HEAD `13b7927eff3b3137254e033548087b4a1ec99772` [CI #42407108953](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42407108953), [Governance #42407108904](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42407108904), [Web Gates #42407108894](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42407108894) **모두 SUCCESS** 확인. 이 중 PostgreSQL 17 격리 사례는 `S0_INSTALLED ... 16 ... 17`, `S0_DEFAULT_CLOSED`, 기존 `test/seyeon-security-s0-postgres.e2e.test.ts` 24건 PASS를 남겼지만 새 combined 공개 소유자 호출의 성공을 직접 증명하지는 않았다. **이번 W135 HEAD의 추가 통합 테스트 및 CI·전체 Integration 결과는 정확한 HEAD 실행 확인 전 미판정**이다. 실행 중/미실행을 성공으로 승격하지 않는다.
- **미완료·블로커:** 운영 대상 DB에 16→17 원본 결합 함수·최근 Pin 컬럼·기본 차단 public 함수 설치, 정확한 서버 역할 1개에만 좁은 실행 권한 부여, 실제 운영 Member 모델 이전 Pin/원본 권한/철회 경합 실증 미완료. G4 고객 크레딧→G2 실제 운영 Commit→G3 실제 Worker 첫 송출/수신 확인→G5 전체 통합→G6 제한 운영 순서를 유지한다. `positiveMemoryFirstReplyApproved=false`, `creditBilling.productionMounted=false`, `HOLD_FORWARD_STOPPED`, G0~G6 최종 수용 0/7, `ROADMAP_COMPLETE` 아님.
- **다음 작업 및 승인 경계:** W135 정확한 HEAD의 기존 CI/PG17 독립 DB 검증 결과를 확인하고 실패 시 이 PR 내에서 원인 수정한다. 이미 승인된 개인 기억 정책은 재요청하지 않는다. 운영 DB 구조·함수/권한·Source Registry·유료 호출/배포/실제 공개를 변경하는 작업은 **실제 적용 범위에 대한 명시적 승인 전까지 수행하지 않는다**. 기존 보안 트랙만 이어가며 별도 ops/DR 작업으로 전환하지 않는다.

### 2026-11-08 / W136 — 기본 차단 회원 계정의 G1 모델 호출 전 준비 검사 실DB 검증 추가

- **작업 목표:** 보안 [PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120)의 W134/W135 코드 및 v3 실행 로드맵과 기존 S0 PostgreSQL 17 격리 테스트를 대조. W135에서 실제 결합 Pin과 최초 답변까지 검증할 수 있게 했으나, 기존 격리 테스트는 일부 과거 경로를 위해 API 계정에 private schema USAGE·최근 원본 함수 EXECUTE를 임시 허용한다. 따라서 W134의 **실운영 기본 차단 조건(두 직접 접근 권한 없음)** 아래에서 사용자 Turn 생성 이전 읽기 전용 준비 검사가 정상 작동한다는 실제 DB 증거는 없었다. 이를 동일 격리 테스트 안에서 검증한다.
- **변경 파일·구현:** 기존 `test/seyeon-security-s0-postgres.e2e.test.ts`의 합성 결합 Pin 검사에 `createSeyeonProductionSubjectTransactionRunnerV1` 및 `assertSeyeonProductionCombinedPinReadinessV1`를 연결. 먼저 private 결합 함수의 API 직접 실행 거부를 확인한다. 격리 DB에서만 기존 테스트 fixture용 private schema USAGE 및 최근 원본 함수 EXECUTE를 임시 회수하여 **실운영 수준 기본 차단**을 재현하고, 실제 Member Subject 트랜잭션으로 G1 사전 준비 검사가 통과하는지 검증한다. 기존 fixture를 훼손하지 않도록 `finally`에서 두 임시 허용을 복원한다. 모델 Provider·실제 운영 DB·Secret·배포·타 트랙 설정에는 접근하지 않는다. 신규 Workflow/WORKLOG 생성 없음.
- **완료 범위·변경 근거:** 테스트 구현을 동일 기존 PR/브랜치에 커밋 `249a64d5a714c7434b5b96801f6bfd5294eb4ffc`. W135의 원본 두 출처 Pin·Commit·최초 응답 본문 검증과 W134의 실제 준비 검사 사이 누락된 인수 테스트를 추가한 것이며 새로운 제품 기능 또는 광역 방어 계층이 아니다. 이 W136 기존 WORKLOG 기록은 이어지는 커밋에 포함한다.
- **브랜치·PR·CI:** `docs/security/restore-s0-track-continuity-20261108` / [PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120). W135 HEAD `d225261fe4785077d9d3fe6fb55a19ad4c082ba9` [Web Gates #42408103990](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42408103990), [Governance #42408104108](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42408104108) **SUCCESS**를 확인했다. [CI #42408104006](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42408104006)의 보안 작업 검사 자체는 SUCCESS였지만 PostgreSQL17 및 DB 권한 검사는 **마지막 확인 시 진행 중**이어서 통과를 선언하지 않는다. **W136 변경의 exact HEAD CI 및 실DB 검증 결과는 새 CI 결과 확인 전 미판정**이며, 다른 커밋의 통과를 전용하지 않는다.
- **미완료:** 실제 운영 DB의 G1 결합 Pin 소스 설치·실효 최소 권한 확인 및 실제 Member 사용 증명, G4 일반 고객 크레딧/실환경 자격증명, G2 실제 DB Commit 경쟁, G3 실제 Cloudflare Worker 최초 송출·수신 확인 및 철회, G5/G6 실운영 증거는 미완료. `positiveMemoryFirstReplyApproved=false`, `creditBilling.productionMounted=false`, `HOLD_FORWARD_STOPPED`, 최종 0/7, `ROADMAP_COMPLETE` 아님.
- **블로커·다음 작업:** 이번 정확한 HEAD의 기존 CI·PostgreSQL17 격리 테스트가 통과해야 코드 검증을 수용한다. 실패 시 해당 원인만 수정한다. 독립 작업이 끝난 뒤에는 기존 16→17 SQL·정확한 실행 계정 1개·제한된 권한 부여·복구를 포함한 **운영 데이터베이스 실제 변경**이 다음 연결 단계로서 별도 구체적 적용 승인이 필요하다. 이미 승인한 기억 동의·철회 정책의 승인을 다시 요구하지 않는다. 운영 변경·유료 호출·실서비스 활성화는 진행하지 않았다.

### 2026-11-08 / W137 — 신규 결합 원본 Pin 호출권의 사고 중단 누락 해결

- **작업 목표:** 기존 보안 [실행 로드맵 v3](SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V3_20261107.md)의 G1·G3 중단/철회 경계를 W136 구현·기존 사고 중단 SQL과 대조했다. W133에서 새로 만든 `public.cmd_pin_seyeon_positive_model_context_sources_v1`는 설치 시 기본 차단되지만, 이후 허용된 회원 실행 역할의 EXECUTE를 사고 시 중단 SQL `stop-positive-use.sql`이 회수하지 않는 결손을 확인했다. 기존 사용자 철회·답변 수신 확인 권한을 그대로 보존하면서 해당 신규 명령의 재사용을 차단한다.
- **변경 파일·완료:** `scripts/operations/seyeon-security-s0/stop-positive-use.sql`에서 기존 모델 출처 레지스트리 OFF/positive 원본 Pin·Commit·최초 공개 차단과 함께 **public 결합 원본 Pin 소유자 명령의 정확한 16인자 EXECUTE**도 `myeongha_api_executor`에서 회수하도록 추가했다. `test/seyeon-security-s0-postgres.e2e.test.ts` 기존 마지막 중단 시나리오에서 격리 DB가 먼저 이 함수 실행을 허용한 상태임을 확인하고 중단 SQL 실행 후 사용 권한이 사라지는지 검사한다. 원본 기억 데이터 개수가 유지되고 사용자 철회 명령이 남는지도 기존대로 확인한다. `scripts/operations/seyeon-security-s0/README.md`의 중단 절차 설명을 수정하고, 본 기존 트랙 WORKLOG에 W137을 기록했다. 운영 SQL 실제 실행·권한/데이터 변경·유료 Provider·배포 없음. 신규 테스트 workflow·WORKLOG 없음.
- **브랜치·커밋·PR:** `docs/security/restore-s0-track-continuity-20261108`, [security PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120). 기능 SQL `c02d59330ff3a9340e8dd3c678adda6e8288423d`, 격리 회귀 검사 `4d49ed1f0b46cf6f69d61ce010c8138bc9854323`, 안내 수정 `f44b36e5c3e0ede9ef104c4736fb6785d7a4e61f`. 본 W137 기록은 이어지는 동일 PR 커밋에 포함한다.
- **테스트·CI 근거:** 직전 W136 정확한 HEAD `08badbae3819152989fc6c971951ec16c767243a`에서 [Web Gates #42408525876](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42408525876)와 [Governance #42408525860](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42408525860)는 SUCCESS, [CI #42408525929](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42408525929)는 **CANCELLED**로 확인했다. 이 CI의 DB authority·PostgreSQL 17·최종 Verify도 취소돼 W136 실DB PASS 근거가 아니다. W137 source/격리 테스트는 PR의 **새 정확한 HEAD**에서 해당 PostgreSQL 17 경로를 완주하기 전에는 PASS라고 주장하지 않는다. 이전에 성공한 W134 SQL 설치와 합성 전송 검증은 참고 근거일 뿐 이 변경을 검증하지 않는다.
- **미완료:** 실제 운영 데이터베이스의 `16→17` 결합 Pin SQL·최소 회원 실행 권한·원본 기억/현재 User 영속 Pin 성공, G4 일반 고객 크레딧, G2 운영 원자 Commit 및 철회 경합, G3 Worker 최초 송출/receipt, G5 통합·G6 제한 운영 증거 미확정. `HOLD_FORWARD_STOPPED`, `positiveMemoryFirstReplyApproved=false`, `creditBilling.productionMounted=false` 및 G0~G6 최종 PASS 0/7 유지. `ROADMAP_COMPLETE` 미선언.
- **블로커·다음 작업:** 이번 PR HEAD의 CI·PostgreSQL17 S0 격리 경로가 완료되는 것을 확인하고 실패 시 실제 실패 코드만 수정한다. 그 후 기존 로드맵의 운영 G1 설치/좁은 API 실행 권한 부여는 **정확한 대상 변경·회수 절차에 대한 별도 운영 적용 승인**이 있을 때만 실행한다. 이미 승인한 개인 기억 정책을 재승인 받지 않고, 다른 운영 트랙으로 전환하거나 승인되지 않은 DB·Provider·과금·트래픽을 활성화하지 않는다.

### 2026-11-08 / W138 — 승인된 운영 G1 설치의 실DB·CI 사전 대조 및 백업 필수조건 확인

- **작업 목표:** 사용자로부터 "명하의 실제 데이터베이스에 장기기억 연결 기능을 설치하고 필요한 최소 권한을 설정하는 작업"에 대해 **명시적인 운영 적용 승인**을 받았다. 새 정책 승인이나 운영·복구 트랙 전환 없이, v3 로드맵의 G1 첫 연결 대상에만 16→17 출처 설치·정확한 `myeongha_api_executor` EXECUTE 허용을 적용할 수 있는지 먼저 검증한다. Source Registry 사용 활성화, 실사용 AI/과금, 일반 공개/배포는 이번 승인 범위 밖이다.
- **대조 근거:** 보안 [PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120), HEAD `caa4b78f8b9e311751db0659f3e0f4d3bc418dfa`; [CI #42408891382](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42408891382) **SUCCESS**(Work Track · security, db-authority-core, PostgreSQL17, CI Verify 모두 success), [Governance #42408891242](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42408891242) **SUCCESS**, [Web Gates #42408891276](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42408891276) **SUCCESS**. 이전 W137의 CI 미확정은 이번 exact HEAD 통과로 해소됐다. 이 CI는 **격리 검증**이지 운영 DB 설치 증거가 아니다.
- **운영 읽기 전용 사전 확인:** Supabase 계정 `명하`의 운영 프로젝트 `MyengHa` / ID `cnsfpcdiyofqvhpcegfc`, PostgreSQL 17, `ACTIVE_HEALTHY`. 실제 `postgres` 계정으로 카탈로그를 조회한 결과 `16` 최근 원본 Pin 함수·`17` private 결합 함수·public wrapper 모두 없음, `chat_turn_attempts.seyeon_recent_source_pin_jsonb` 없음, 대상 DB 역할 2개 존재, NOLOGIN owner 및 기존 personal Pin/원본 lock 존재, 결합 함수명 트리거 중복 없음, Source Registry 활성 타입 **0**. API 역할의 `seyeon_private` 스키마 USAGE는 현재 true로 확인됐으며 이 기존 권한을 변경하지 않는다. `myeongha_api_executor`의 private 신규 함수 직접 EXECUTE는 설치 후에도 허용하지 않을 계획이다.
- **실제 적용 보류 사유:** 운영 조직은 Supabase **free** 요금제이며 최근 복구 가능 DB 백업이 조회/확인되지 않았다. 접근 가능한 이전 백업 및 격리 복원 증거는 [2026-10-24 백업 #40104377484](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40104377484), [복원 #40130586169](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40130586169)뿐으로 최신 운영 사용자 데이터 복구를 보장하지 않는다. 현재 연결 도구에는 운영 DB 백업 생성·동일 최신 백업의 실제 복원 확인 기능이 제공되지 않아 안전한 선행 조건을 만족시킬 수 없었다. **운영 SQL 16·17·GRANT/Role/Registry DDL·DML을 한 건도 실행하지 않았다.** 사용자가 내린 구체적 운영 설치 승인은 유효하며 재승인 요청하지 않는다.
- **변경 파일·완료:** `scripts/operations/seyeon-security-s0/README.md`의 운영 설치 재개 지침을 승인 범위·실측 대상/CI·백업 선행 조건·정확한 함수 ACL·기존 사고 중단 SQL 순서로 최신화, 변경 커밋 `f819629f0d06a02debdbfb0665a879970bd8ec0c`. 기존 보안 WORKLOG 본 W138을 같은 PR 후속 커밋에 기록한다. 새 기능 코드/DB 변경은 없음. 실환경 적용은 아직 미완료.
- **미완료·다음 작업:** (1) 현재 명하 운영 DB의 **최신 시점 복구 가능 백업 + 별도 격리 복원** 확보 및 검증 (2) 동일 대상/SQL source digest 재확인 후 승인된 G1 `16-g1-model-recent-source-pin.sql` → `17-g1-positive-combined-model-source-pin.sql` 설치 (3) 소유자 private 직접 호출은 기본 차단, 정확한 public owner RPC에만 `GRANT EXECUTE` (4) 설치 카탈로그/허용 계정 기능과 원본 Registry OFF·G3 Reveal OFF 검증 및 기존 중단 SQL 재확인. 이후 기존 G4→G2→G3→G5→G6 순서. `positiveMemoryFirstReplyApproved=false`, `creditBilling.productionMounted=false`, `HOLD_FORWARD_STOPPED`, 최종 G0~G6 0/7 및 `ROADMAP_COMPLETE` 미선언.
- **브랜치·PR·블로커:** `docs/security/restore-s0-track-continuity-20261108`, 기존 [PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120), 위 README 커밋과 본 WORKLOG 커밋. **블로커는 추가 사용자 승인이나 CI 실패가 아니라 현재 시점 안전한 백업·복원 증거 부재**. 현 도구로 백업을 직접 확보하지 못하는 상태에서 실 운영 데이터를 위험에 빠뜨리는 DDL은 실행하지 않았다. 사용자는 이미 승인했으므로 동일 설치 승인을 반복 요구하지 않는다.

### 2026-11-08 / W139 — 운영 G1 백업 차단의 기존 공식 백업 경로 확인·새 실행 요청

- **작업 목표:** 사용자 승인된 G1 운영 원본 연결 기능 설치를 진행하려면 직전 W138의 최신 운영 DB 백업/복원 차단을 해소해야 한다. 세연 보안 트랙의 최신 v3 로드맵, 기존 WORKLOG, [PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120), 기존 GitHub Actions의 운영 암호화 백업·격리 복원 흐름을 먼저 대조하고, 별도 새 백업 기능이나 타 트랙 Phase 작업을 만들지 않는다.
- **코드·PR·CI:** 시작 시 보안 PR #3120 HEAD `3909be349b3335d6d2dc955b2c6f2456b12f86e0`. [CI #42414250315](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42414250315), [Governance #42414250490](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42414250490), [Web Gates #42414250344](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42414250344) 모두 **SUCCESS** 확인. 이는 기존 G1 격리 코드의 검사이며 운영 DB 설치 PASS가 아니다.
- **새로 확보한 실제 근거:** 기존 `.github/workflows/production-postgres-backup.yml`는 운영 PostgreSQL을 읽기 전용으로 export하고 암호화 artifact를 30일 보존하는 주기 실행/수동 실행 워크플로다. 직전 W138의 '2026-10-24 백업만 확인'은 불완전했으며, [2026-11-07 백업 #42309503582](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42309503582)는 **SUCCESS**, 암호화 artifact `13548176984`가 존재하고, [일회성 복원 #42375717923](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42375717923)과 [후속 복원 #42405467038](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42405467038)도 SUCCESS 기록이 있음을 확인했다. 다만 이것이 **지금 현재 시점 운영 전체 데이터 최신 백업**이라는 뜻은 아니다.
- **완료·변경 파일:** 기존 GitHub 인증 계정에서 새 기능·비밀값·권한 변경 없이 `gh workflow run production-postgres-backup.yml --ref main`으로 새 운영 **읽기 전용 암호화 백업** [#42415093056](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42415093056)을 수동 시작했다. 이 WORKLOG 작성 시 `encrypted-logical-backup` 작업은 **진행 중**(원본 export 단계)으로 성공/다운로드/복원 완료는 아직 주장하지 않는다. `scripts/operations/seyeon-security-s0/README.md`의 이전 백업 현황 오류를 실제 11월 7일 백업·복원 기록 및 새 백업 실행으로 갱신한 커밋 `ad0ef0e212e68d825590ab494ddc9b66858cc27e`. 본 W139는 같은 보안 PR에 후속 커밋으로 기록한다. SQL/운영 DB/Source Registry/API Role/AI Provider/비용/배포 변경 없음.
- **미완료·다음 작업:** (1) 이번 새 백업 #42415093056 정확한 성공/암호화 artifact 유효성 확인, 실패 시 백업 원인 조치 (2) 해당 새 백업을 기존 `postgres-isolated-restore-drill.yml`로 일회성 격리 복원하고 원본 운영 DB의 migration/schema frontier와 일치하는지 확인 (3) 확인된 최신 안전 복원 근거와 승인 범위에서만 기존 SQL 16→17 설치 + 공개 결합 소유자 RPC 1개에 API 실행 권한 부여 (4) 데이터 원본 타입은 계속 OFF, G4/G3 송출·크레딧은 사용하지 않고 설치 후 읽기·권한 검증. 이 선행조건을 충족하기 전에는 실제 운영 DDL/ACL을 실행하지 않는다.
- **브랜치·PR·블로커:** `docs/security/restore-s0-track-continuity-20261108`, [PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120), README 커밋 `ad0ef0e212e68d825590ab494ddc9b66858cc27e` 및 본 WORKLOG 후속 커밋. **보류 이유:** 최신 백업 작업 및 그 백업을 격리 복원한 증거가 아직 없음. 운영 G1 설치·최소 권한 승인은 **이미 받았으며 재승인 불필요**. `HOLD_FORWARD_STOPPED`, `positiveMemoryFirstReplyApproved=false`, `creditBilling.productionMounted=false`, 최종 G0~G6 **0/7**, `ROADMAP_COMPLETE` 아님.

### 2026-11-08 / W140 — 최신 운영 백업 격리 복원 PASS 및 승인된 G1 설치의 잠금 충돌 롤백

- **목표:** 기존 보안 트랙 WORKLOG W139와 v3 로드맵 G1·G6 선행 복원 조건, 기존 보안 [PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120), CI·운영 원본 16→17 SQL을 대조한 뒤 승인된 명하 운영 DB의 장기기억 원본 결합 Pin·최소 회원 실행 권한 설치를 실제로 진행한다. Source Registry ON·과금·Provider·HTTP 공개·배포는 이번 승인 대상이 아니다.
- **기존 코드·CI:** 시작 HEAD `c15d6f7c4757082fca0ccdaa8831b8800b0f9ec7`의 [CI #42415413257](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42415413257), [Governance #42415413240](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42415413240), [Web Gates #42415413252](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42415413252) **모두 SUCCESS**. 격리 코드 검증은 유지되나 운영 DB 변경의 성공 증거는 아니다.
- **백업·복원 증거:** 2026-11-07 UTC 최신 운영 암호화 백업 [#42415093056](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42415093056) **SUCCESS**, artifact `13591083526` (`myeongha-postgres-20261107T211732Z`, 만료 2026-12-07T21:20:39Z). 첫 복원 [#42416185560](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42416185560)은 백업 복호화·PG17 격리 복원·현재 애플리케이션 구조 비교·합성 개인정보 복구 단계 **SUCCESS**이나 `incidentReferenceUtc`를 백업 완료보다 앞선 `2026-11-07T21:17:32Z`로 입력해 최종 증거 포장 단계 **FAILURE**. 올바른 기준 시간 `2026-11-07T21:22:00Z`로 같은 백업을 재시도한 [#42416383688](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42416383688)은 격리 복원·구조 비교·합성 개인정보 복구·증거 포장 및 보관 **모두 SUCCESS**. evidence artifact `13591363096`. 관리형 Auth/Storage 전체 복구나 G6 실 운영 출시는 이 복원으로 증명되지 않는다.
- **운영 대상·사전 검사:** Supabase `명하` 프로젝트 `cnsfpcdiyofqvhpcegfc` / PostgreSQL 17, 최신 migration `20261105075227` 총 241개. G1 16→17 새 함수와 최근 원본 저장 컬럼은 여전히 미설치, Source Registry 활성 타입 0. 기존 개인 Memory Pin/잠금 함수 및 소유자·회원 실행 계정은 존재한다. 운영 관리 계정 `postgres`의 NOLOGIN Owner 역할 멤버십이 이미 `SET FALSE`라는 실제 차이를 확인했다. 소유자 역할 전환권만 임시 부여→복원하는 절차를 별도 `BEGIN ... ROLLBACK`으로 시험하여 사후 `owner_set_available=false`를 확인했다. 기존 관리자 role membership을 삭제·추가하지 않는다.
- **설치 시도·결과:** 정확한 `scripts/operations/seyeon-security-s0/16-g1-model-recent-source-pin.sql`와 `17-g1-positive-combined-model-source-pin.sql` 본문을 **단일 운영 SQL 트랜잭션**으로 묶고, 운영 기본 관리자 역할 관계를 지키기 위해 원본 SQL의 `grant/revoke owner to current_user` 부분만 검증된 일시 SET TRUE→최종 SET FALSE 방식으로 대체했다. 사전 조건/사후 최소 권한·출처 OFF 검사를 한 거래에 넣었으나 SQL 실행이 **PostgreSQL `55P03` (5초 잠금 시간 초과)**로 취소됐다. 사후 읽기 확인: public/private 결합 함수 없음, 최근 출처 Pin 함수/컬럼 없음, owner SET 권한 false, 활성 Source Registry 0. **실제 운영 DDL·ACL 설치/권한 허용 완료로 주장하지 않으며 부분 설치 없음**.
- **실패 원인·조치:** 읽기 전용 `pg_stat_activity/pg_locks` 조사에서 Supavisor 연결 `idle in transaction` PID `3035490`이 `public.chat_turn_attempts`와 `public.conversation_messages`에 `AccessShareLock`을 유지해 ALTER TABLE의 배타적 잠금을 방해함을 확인. 다른 세션을 종료하거나 사용자 작업을 강제 중단하지 않았다. 장기 lock timeout/강제 락 해제로 우회하지 않는다.
- **변경 파일·브랜치·커밋·PR:** 기존 `scripts/operations/seyeon-security-s0/README.md`에 최신 백업/복원 증거, 적용 실패·롤백·잠금 충돌과 안전 재개 순서를 기록한 커밋 `826dba7576e85ec48ccaa0eea10fe4344990cccf`; 이 기존 트랙 WORKLOG에 W140을 후속 커밋. 브랜치 `docs/security/restore-s0-track-continuity-20261108`, [PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120). 로드맵 범위 밖 새 기능·테스트·운영/DR 워크로그는 만들지 않았다.
- **남은 과제·다음 작업:** 안전한 상태에서 충돌 연결의 **자연 종료**를 확인한 뒤, 같은 승인된 SQL 16→17을 제한된 lock timeout·원자 거래로 재실행하고 오직 `public.cmd_pin_seyeon_positive_model_context_sources_v1`에 `myeongha_api_executor` 최소 EXECUTE만 허용. OWNER/private 직접 호출 차단·현재 Memory Registry OFF·G3 송출 OFF·사고 중단 명령과 consent revoke/ACK 유지 검증. 그 다음 G1 실제 원본 Pin/G4→G2→G3→G5→G6. `HOLD_FORWARD_STOPPED`, `positiveMemoryFirstReplyApproved=false`, `creditBilling.productionMounted=false`, 최종 G0~G6 **0/7**, `ROADMAP_COMPLETE` 아님.
- **블로커·승인:** **DB의 다른 세션이 테이블 잠금을 장시간 보유하는 문제**로 이번 실제 G1 DDL이 중단. 승인된 운영 G1 SQL/최소 EXECUTE 범위를 재승인 받지 않는다. 다른 사용자/프로세스 세션 강제 종료는 기존 승인 범위에 넣지 않았으므로 실행하지 않는다.

### 2026-11-08 / W141 — 운영 잠금 해제 확인 후 G1 소유자 ACL 설정 결함 수정

- **작업 목표:** 기존 보안 트랙 WORKLOG W140·[실행 로드맵 v3](SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V3_20261107.md)·[PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120)의 실제 코드/CI를 재대조하고, 이미 사용자 승인한 명하 운영 DB G1 기억 1건+현재 User 1건의 원본 결합 Pin 및 정확한 실행 권한 설치를 재개한다. 모델·유료 크레딧·Source Registry·공개·스트리밍 변경은 제외한다.
- **시작 검증:** 직전 정확한 HEAD `045dc809311067bfff369bf36f4bfbd4f49daae7` [CI #42417790890](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42417790890), [Governance #42417790863](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42417790863), [Web Gates #42417790856](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42417790856) 모두 **SUCCESS**. 실 운영 대상 Supabase `cnsfpcdiyofqvhpcegfc`의 PostgreSQL17·migration `20261105075227`, G1 함수/컬럼 미설치, Source Registry 활성 0, NOLOGIN OWNER 역할 SET 권한 false 확인. W140에서 설치를 방해하던 다른 세션의 `idle in transaction` 및 `chat_turn_attempts` 읽기 잠금이 조회 시 **0건**임을 확인.
- **운영 재시도 결과:** 원본 `16-g1-model-recent-source-pin.sql`→`17-g1-positive-combined-model-source-pin.sql` 전체를 기존처럼 단일 `BEGIN`/사전·사후 조건 검사/한정된 `lock_timeout`으로 묶고 Owner 역할은 임시 SET TRUE→원상 SET FALSE, Member에는 public owner RPC 정확한 시그니처 EXECUTE만 허용하도록 시도했다. PostgreSQL `42501 permission denied for function pin_model_recent_sources_v1`로 트랜잭션 **전부 롤백**. 직접 원인: 최초 생성자가 새 private 함수를 NOLOGIN Owner로 소유권 이전한 후, 일반 설치 관리자 `postgres`는 해당 권한을 상속하지 않아 함수 `REVOKE EXECUTE`를 실행할 수 없음. **사후 DB 조회에서 새 private/public G1 함수/컬럼 없음, Owner SET=false, Source Registry ON=0, 다른 장기 실행 트랜잭션 0** 확인. 운영 적용 완료가 아니다.
- **변경 파일·완료:** 기존 `scripts/operations/seyeon-security-s0/16-g1-model-recent-source-pin.sql`의 최근 Pin 함수 ACL 1곳, `17-g1-positive-combined-model-source-pin.sql`의 private 결합 함수 및 public owner RPC ACL 2곳에서, 기존 `REVOKE ALL` 바로 앞뒤에 **정확한 NOLOGIN Owner로 `SET LOCAL ROLE` → ACL 회수 → `RESET ROLE`**를 추가했다. 익명/인증/서비스 계정에 권한을 열지 않는다. 변경 커밋 `b35ce0f3548bd35f9f3395ff27d021d0cfd1d496`, `712a8743609121e0642a22ea3db6ecaae0d9870d`. 기존 `scripts/operations/seyeon-security-s0/README.md`에 원인·재검증 조건·백업 및 복원 근거를 기재한 커밋 `44f3a8e72e3c211d0c5933ea95b3abc8cc45b358`. 본 기존 WORKLOG W141은 같은 브랜치/PR의 후속 커밋에 포함한다. 신규 트랙/기능/Workflow 없음.
- **테스트·CI 근거:** 수정 직후 HEAD `712a8743609121e0642a22ea3db6ecaae0d9870d`에서 [Web Gates #42474585342](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42474585342), [Governance #42474585323](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42474585323) **SUCCESS**, [CI #42474585400](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42474585400)는 보안 Work Track·DB 권한·PostgreSQL17 검사 **마지막 확인 시 진행 중**. 이후 README/WORKLOG 문서 커밋에 따른 **새 정확한 HEAD CI 통과는 결과 확인 전 미판정**이며 이전 성공을 새 소스에 적용하지 않는다. 이전 실 운영 암호화 [백업 #42415093056](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42415093056)과 동일 백업의 [격리 복원 #42416383688](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42416383688) PASS는 유지한다.
- **미완료·블로커:** 수정한 16·17 SQL의 정확한 HEAD PG17 격리 설치 및 PR 필수 CI 결과를 먼저 확인해야 한다. 완료 전 실 운영 SQL 재적용 보류. 이후 동일 사용자 승인 범위의 16→17 원자 설치·public owner RPC 하나의 EXECUTE만 추가·정확한 DB role/ACL·본인 소유 원본 모델 전 Pin 검증을 진행한다. `HOLD_FORWARD_STOPPED`, `positiveMemoryFirstReplyApproved=false`, `creditBilling.productionMounted=false`, 최종 G0~G6 **0/7**, `ROADMAP_COMPLETE` 아님. 사용자 승인 재요청 없음. 현재 블로커는 새 코드 CI 결과이며, 새 공개/유료 호출/운영 실사용 승인은 별개다.
- **브랜치·PR·다음 작업:** `docs/security/restore-s0-track-continuity-20261108`, [security PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120). 현재 헤드 CI 완료까지 무의미한 반복 조회/추가 커밋으로 결과를 취소하지 않고, CI 통과 후 승인된 운영 원자 설치부터 재시도한다. 실패 시 해당 SQL 및 격리 테스트 증거로 원인 수정한다. 별도 운영 트랙/DR 로드맵 전환 없음.

### 2026-11-08 / W142 — 승인된 실 운영 DB G1 원본 결합 Pin 설치 및 최소 실행권 검증 완료

- **작업 목표:** W141 보안 WORKLOG와 v3 로드맵 G1, [보안 PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120), 현재 코드·CI 및 운영 DB를 대조한 뒤, 이미 사용자에게 승인받은 **명하 실제 DB에 개인 기억 1건+현재 User 메시지 1건을 결합 Pin하는 함수 설치와 해당 서버 실행 계정의 최소 권한 설정**을 수행한다. 사용자 원본 기억 사용/Registry ON, AI 모델/크레딧/공개/배포는 이번 적용 범위가 아니다.
- **적용 전 코드·CI/백업:** [CI #42474860198](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42474860198)는 route-ci-scope·Work Track security·db-authority-core·PostgreSQL17·CI Verify **모두 SUCCESS**, [Governance #42474860203](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42474860203)와 [Web Gates #42474860167](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42474860167)도 **SUCCESS**(코드 HEAD `0738eea27c07e6467505c8eecdb8b91cee4d69c8`). [암호화 실운영 백업 #42415093056](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42415093056)과 그 백업의 [PG17 격리 복원 #42416383688](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42416383688) SUCCESS 증거를 재사용. 운영 대상 PostgreSQL 17 `cnsfpcdiyofqvhpcegfc` 읽기 확인에서 migration `20261105075227`, 기존 G1 새 함수·컬럼 미설치, 활성 Source Registry 0, W140 장시간 DB 잠금 0임을 확인했다.
- **실제 운영 변경·완료:** 기존 소스 `scripts/operations/seyeon-security-s0/16-g1-model-recent-source-pin.sql`(blob `76f852d13d74bc28e452c2c4b2ea4780514af2f5`) → `17-g1-positive-combined-model-source-pin.sql`(blob `886c9b5774fbfed5bfb7997dd3b3ea3e7c672679`)을 하나의 원자적 운영 PostgreSQL transaction 안에서 **성공적으로 COMMIT**. 두 파일의 트랜잭션 경계와 기존 임시 소유자 멤버십 GRANT/REVOKE만 합쳐 중복을 제거하고, W141에서 수정한 `SET LOCAL ROLE`에 의한 정확한 함수 ACL 회수를 유지했다. `public.chat_turn_attempts.seyeon_recent_source_pin_jsonb` 컬럼 및 불변 트리거, 기존 메시지 원본 잠금 policy/제한된 column update ACL, `seyeon_private.pin_model_recent_sources_v1`·`seyeon_private.pin_positive_model_context_sources_v1`와 서버 호출용 `public.cmd_pin_seyeon_positive_model_context_sources_v1`를 설치. 정확한 **public 합성 RPC 16인자 하나**에만 `myeongha_api_executor` `EXECUTE` 허용했다. 동일 거래의 사전·사후 검사가 모두 통과해 실행 결과 `G1_DB_INSTALLED_CLOSED`, `member_rpc_execute=true`, `anon_rpc_execute=false`, `operator_owner_set=false`, `admitted_sources=0` 확인.
- **별도 읽기 전용 운영 검증:** 사후 `pg_proc` 등 카탈로그 조회 결과 세 함수 모두 `myeongha_seyeon_chat_runtime_owner` 소유 `SECURITY DEFINER`이고 시그니처는 public 16/private recent 7/private combined 16 인자. API의 public wrapper EXECUTE=true, private 두 함수 직접 EXECUTE=false, `anon`/`authenticated`/`service_role`/PUBLIC 모두 새 RPC EXECUTE=false. 최근 Pin 컬럼 **1건**, 불변 트리거 **1건**, 원본 잠금 정책 **1건**. NOLOGIN owner 유지, owner의 불필요한 public/private schema CREATE=false, 운영 `postgres`의 임시 SET owner 권한=false로 원상 복원. Source Registry 전체 1행 중 활성 타입 **0**, migration frontier 이전과 동일. 기존 API 계정의 private schema USAGE=true는 **기존 실측 권한**이며 이 설치가 허용한 private 함수 EXECUTE가 아니다.
- **변경 파일·브랜치·커밋·PR:** 운영 SQL 실행 내용은 위의 **기존 두 파일**이며 소스 파일을 이 단계에서 다시 변경하지 않았다. 설치 적용 및 안전 상태를 `scripts/operations/seyeon-security-s0/README.md`에 최신 실행 기록으로 정리한 커밋 `5c4f23d71d0d7128bd229cd26341e62893540d03`. 본 기존 보안 WORKLOG W142는 같은 PR 후속 커밋으로 함께 기록. 브랜치 `docs/security/restore-s0-track-continuity-20261108`, [PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120). 신규 Workflow·기능·다른 트랙/WORKLOG 생성 없음.
- **미완료·다음 작업:** **설치와 정적 최소 권한 검증은 완료**, 그러나 실제 동의 받은 `conversation_recall/v1` 원본 Memory 1건+현재 User 원본 메시지 1건에 대한 Member 컨텍스트에서 모델 전 결합 Pin **운영 성공 증거는 없음**. Source Registry `enabled=false,writable_enabled=false` 유지. 이후 기존 v3 순서에 따라 G1 실효 승인/원본 검증 → G4 일반 고객 크레딧·유료 호출 경계 → G2 운영 Commit/철회 경합 → G3 최초 Worker 송출/receipt → G5 통합 → G6 제한 운영 검증이 필요하다. 고객 개인정보와 모델을 쓰는 실운영 호출, Registry 활성화, 공개/유료 트래픽은 **이번 설치 승인에 포함되지 않았으므로 실행하지 않았다**.
- **블로커·최종 판정:** 설치 단계의 CI·DB 잠금·함수 소유자 ACL 블로커는 해소. 다음 제품 호출 단계는 **실제 회원 원본 사용 동의·운영 Source Registry admission 및 G4 비용 권한을 증명해야** 진행 가능하다. 이미 확정한 D1~D5 기억 정책을 재승인 요청하지 않는다. `HOLD_FORWARD_STOPPED`, `positiveMemoryFirstReplyApproved=false`, `creditBilling.productionMounted=false`, 최종 Gate **0/7**, `ROADMAP_COMPLETE` 미선언. 새 HEAD CI는 문서 커밋 이후 별도 확인 필요; 과거 성공 CI를 문서 HEAD 증거로 바꾸지 않는다.

### 2026-11-08 / W143 — 실제 운영 Member API 실행 계정의 G1 사전 준비·무인증 거부 검증

- **작업 목표:** 기존 보안 WORKLOG W142·실행 로드맵 v3와 [보안 PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120), 소스 `apps/api/src/production-seyeon-chat-runtime-v1.ts`의 `assertSeyeonProductionCombinedPinReadinessV1` 및 운영 DB를 대조. W142의 설치자 `postgres` 권한 카탈로그 검사에서 더 나아가 **실제 앱 실행 역할 `myeongha_api_executor`**로 동일 소스의 사전 준비 SQL이 PASS하는지, 정식 Subject 인증이 없는 G1 호출이 거부되는지 운영에서 검증한다. 회원 개인정보·실제 Memory·유료 모델·Source Registry 활성화는 사용하지 않는다.
- **사전 CI·PR 확인:** 시작 보안 PR #3120 HEAD `5a11392a737c16aa8a8ef47c8b21d36d601e94a2`, [CI #42476090190](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42476090190), [Governance #42476090185](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42476090185), [Web Gates #42476090176](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42476090176) **모두 SUCCESS**. Roadmap G0~G6 최종 수용은 계속 **0/7**, `HOLD_FORWARD_STOPPED`.
- **실제 DB 실행·결과:** Supabase 명하 `cnsfpcdiyofqvhpcegfc` PostgreSQL 17에서 `BEGIN`, 관리자 계정의 서버 실행 역할 멤버십을 **트랜잭션 안에서만** `SET TRUE`로 전환한 뒤 `SET LOCAL ROLE myeongha_api_executor`를 사용. 운영 코드의 `assertSeyeonProductionCombinedPinReadinessV1` **동일 SQL**(public owner RPC 소유권·EXECUTE·private 함수의 비공개/NO EXECUTE·원본 저장 컬럼·기존 personal Pin)을 이 실제 역할로 수행해 `ready=true` PASS. 이어 실존하지 않는 고정 테스트 UUID·비어 있는 출처 배열·인증되지 않은 Subject로 **public 결합 Pin 호출을 거부하는지** 검증했다. PostgreSQL 실제 거부 SQLSTATE는 `28000`(invalid authorization)였고, 처음 실행의 엄격한 예상 코드 검사에서는 `42501`/`23514`만 허용하여 검증 SQL 자체가 실패했다. 인증 실패의 실제 SQLSTATE `28000`을 허용하는 것으로 기대값을 바로잡아 **재실행 PASS**, 허가되지 않은 호출이 성공하지 않았음을 확인했다. 두 검사 모두 `ROLLBACK`하여 데이터/Role 영속 변경이 없고 최종 `temporary_member_set_after=false`, Source Registry 활성 0, 최근 원본 컬럼 1 유지 확인. 실제 사용자 기록·비밀값·원본 식별자를 조회·출력하지 않았다.
- **변경 파일·완료:** 기존 `docs/security/SEYEON_AI_SECURITY_IMPLEMENTATION_STATUS_AND_ENDPOINTS_20261030.md` 본 WORKLOG W143에 **실 운영 회원 실행 역할의 긍정적 준비 검사 + 무인증 G1 거부** 결과를 기록하고 동일 보안 PR에 커밋한다. 소스 및 운영 SQL/ACL/Role, Registry, Provider, 클라우드 Secret, 배포·결제는 변경하지 않았다. 기존 보안 기능을 재작성하거나 새 테스트 Workflow/운영 트랙을 만들지 않았다.
- **브랜치·커밋·PR:** `docs/security/restore-s0-track-continuity-20261108` / [보안 PR #3120](https://github.com/gycha0109-beep/MyeongHa/pull/3120). W143 기록은 이 변경의 커밋에 포함되며 커밋 SHA는 GitHub 결과에 따른다. 기존 W142 설치 커밋 `5a11392a737c16aa8a8ef47c8b21d36d601e94a2` 및 정확한 HEAD CI 근거를 별도로 기록한다. W143 기록 커밋 후 새 정확한 HEAD CI는 결과 확인 전 미판정.
- **남은 과제·블로커·다음 작업:** 이번 PASS는 **실제 회원 인증 정보·현재 원본 메시지·실사용 동의된 Memory/Grant를 포함한 운영 양수 결합 Pin 영속 저장 성공이 아니다**. 운영 Registry `enabled=false,writable_enabled=false`가 유지돼 실제 기억 재사용은 시작하지 않았다. G1 실제 동의 Member 1건·원본 Pin의 허용된 제한 운영 검증과 source admission은 별도 실사용 변경 판단이 필요하고, 뒤이어 기존 순서 **G4 고객 크레딧/비용 → G2 원자 Commit → G3 HTTP 첫 송출/ACK → G5 통합 → G6 제한 운영**이 남아 있다. D1~D5 기억 정책 재승인 불필요. 회원 기억을 무단 사용하거나 유료 호출·공개를 열지 않는다. `positiveMemoryFirstReplyApproved=false`, `creditBilling.productionMounted=false`, `HOLD_FORWARD_STOPPED`, 전체 Gate **0/7**, `ROADMAP_COMPLETE` 아님.
