# 세연 AI 보안 트랙 — 구현 현황·목적·엔드포인트·종료 조건 (2026-10-30)

Watchtower-Track: security

- **상태:** **HOLD_FORWARD_STOPPED / 트랙 미종료**. 소스 구현·PR CI 통과는 실제 운영 DB 적용, 실서비스 공개, G0~G6 완료와 다르다.
- **대상:** 명하 세연 AI의 개인기록 동의·AI 입력·생성·커밋·첫 공개·과거 대화/관계 재사용·취소·비용 통제.
- **이번 병합 단위:** [PR #2768](https://github.com/gycha0109-beep/MyeongHa/pull/2768), 검증된 보고서 작성 전 HEAD `fd5465dc13170c684f27972705d79d40c7313c9d`. [기본 CI #41017140338](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41017140338) SUCCESS, Governance/Web SUCCESS. 보고서 커밋 이후 최종 HEAD의 CI/Integration 증거는 **별도로 확정**한다.
- **종료 판정 정본:** [G0~G6 완료·증거 계약](SEYEON_AI_SECURITY_COMPLETION_GATES_V1.md), [G0 동의 취소·파생 출처 후보](SEYEON_G0_REVOKE_REGRANT_REVEAL_POLICY_CANDIDATE_V1.md), [운영 G3 읽기 전용 검증 범위](SEYEON_G3_PRODUCTION_READONLY_PREFLIGHT_20261029.md), [상위 원장 #1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866). 과거 문서에서 참조하는 `docs/operations/SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V2_20261016.md`는 이번 main tree 조회에서 찾지 못했으므로, 이 문서에서 로드맵 원문을 새로 추정하지 않는다.

## 1. 무엇을 완성하려는가 — 최종 엔드포인트(종료점)

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

## 5. 아직 미완성인 **벽의 핵심** — 다음 실제 구현 순서

1. **G0-D3 파생 출처 전체:** 현재 1 Memory 원본에서 만든 Assistant 메시지 이외에 **과거 User 메시지·Relationship Event·Reader Knowledge**의 DB 기록/원본·Grant 관계를 정의하고 같은 Owner 권한 조회로 연결한다. 과거 출처가 불명확하면 현재처럼 HOLD한다.
2. **G0-D1/G1 최종 모델 사용 집합:** 혼합 Memory/Life Fact·다중 기록·상한/재정렬/Preflight 파생 컨텍스트를 포함해 Provider 이전 정확한 Attempt Pin을 완성한다. 미승인 타입/Projector를 임의 허용하지 않는다.
3. **G2/G3 원자적 사용·공개:** 전체 출처에 대해 실제 Commit과 최초 HTTP/Replay/History의 현재 Grant 검증을 연결하고, 철회·재승인·원문 변경 시 부분 성공이나 과거 본문 재노출이 없도록 한다.
4. **G4 일반 유료/크레딧 종단:** 기존 `creditBilling.productionMounted:false`를 끝내려면 원자 예약/수신 ACK/정산을 실제 서비스에 연결해야 한다. 임의 ON 금지.
5. **G5/G6 종료:** 승인된 단일 Scope의 정확한 main/deploy HEAD, 실 DB 독립 세션·실 HTTP·forward stop/복구·비용/유출 0, 최종 활성화 결정을 문서화한다. 필요 증거가 없는 항목은 HOLD다.

**우선순위 규칙:** 현재 범위를 완성하기 전 새로운 방어 레이어·우회 체크·광범위 테스트 추가를 작업 목표로 만들지 않는다. 기존 실제 실패의 필수 수정은 예외다. 이전에 만든 방어/검증은 그대로 유지하되 **핵심 본체 G0 → G1/G2 → G3 → G4 → G5/G6** 순서로 끝낸다.

## 6. 증거와 현재 블로커

- **병합 대상:** [#2768](https://github.com/gycha0109-beep/MyeongHa/pull/2768). 현황 보고서 작성 시점의 이전 HEAD CI [#41017140338](https://github.com/gycha0109-beep/MyeongHa/actions/runs/41017140338) PASS. 최종 문서 커밋 HEAD의 통합/병합 상태는 CI 결과로 갱신해야 한다.
- **최근 인접 구현:** [#2764](https://github.com/gycha0109-beep/MyeongHa/pull/2764) 관계 Worker HOLD, [#2765](https://github.com/gycha0109-beep/MyeongHa/pull/2765) 관계 Outbox Node 어댑터 HOLD, [#2767](https://github.com/gycha0109-beep/MyeongHa/pull/2767) DB 직접 RPC ACL 회수 후보. 각각의 **소스 병합**을 운영 DB 차단 완료로 간주하지 않는다.
- **운영 근거 한계:** 2026-10-29 문서의 G3 운영 HTTP 검증은 읽기 전용 preflight/수동 workflow 정의이며, 실제 인증 HTTP 성공/Worker version/현재 Catalog 전부가 확인된 G3 PASS는 아니다. 이번 작업에서 운영 DB/Cloudflare/Supabase 자격증명·정책·트래픽 변경을 실행하지 않았다.
- **블로커:** SRC-25 승인된 전체 타입/원본 증명, G0-D1~D5의 미완료 derived/transport 계약, G4 일반 크레딧 정산 종단, 실환경 운영 증거와 G5/G6.
- **사용자 결정:** 적용 범위와 최종 운영 활성화는 사용자에게 있다. 이미 정해진 거부 우선 설계 안의 소스 구현·CI·PR 병합은 추가 결정을 기다리지 않는다.

> **최종 보고 결론:** `#2768 SOURCE_IMPLEMENTED / 기존 HEAD CI_GREEN / OPERATIONS_HOLD / SECURITY_TRACK_OPEN`. 이 파일 자체가 운영 권한을 부여하거나 G0~G6 PASS 증거를 생성하지 않는다.
