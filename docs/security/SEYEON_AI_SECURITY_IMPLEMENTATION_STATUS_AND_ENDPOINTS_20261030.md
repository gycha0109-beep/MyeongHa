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