# 세연 D-04 HTTP Reveal 전송·철회 선형화 계약 후보 — 기술 승인 전용

> Watchtower-Track: security  
> 2026-10-18 / **PROPOSAL / UNAPPROVED / G0 OPEN / G3 HOLD**  
> 판정 대상: Security + API + DB Authority, Character/Source Authority의 파생 출처 범위 확인  
> 상위 정본: [G0 기술 승인 요청서](SEYEON_G0_OWNER_TECHNICAL_SIGNOFF_REQUEST_20261017.md), [G0~G6 완료 게이트](SEYEON_AI_SECURITY_COMPLETION_GATES_V1.md), [원장 #1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866)

## 1. 검증된 사실과 검증되지 않은 주장 구분

- R5 격리 PostgreSQL Owner-style Read/Commit 선형화는 **DB 쿼리의 COMMIT**까지 검증했습니다. R7 [#2274](https://github.com/gycha0109-beep/MyeongHa/pull/2274)는 승인된 DB Read COMMIT 이후 원본 Grant를 취소하면 새로운 DB Read는 HOLD되지만 **이미 반환한 Assistant 문자열은 Node 버퍼에 남는다는 반례**를 재현했습니다.
- 현재 `handleSeyeonChatTurnSendRequestV1`는 올바른 Member 및 JSON body 확인 뒤, `assertSeyeonFirstHttpRevealAuthorizedV1()`의 **무조건 throw** 때문에 첫 Reveal을 **503/no-store**로 차단하며 `runtime.run` 및 Provider를 호출하지 않습니다. R6/R7은 이 **현재의 부정권 경계**만 통과했습니다.
- Web Fetch `Response` 객체를 반환하거나 `Response.json()`을 생성하는 시점, 서버 어댑터가 전송을 시작한 시점, 네트워크에서 클라이언트가 실제 바이트를 수신한 시점은 **같지 않습니다**. `Response` 구성 뒤에 DB 취소를 확정해도 이미 구성된 바이트는 자동으로 소거되지 않습니다.
- 따라서 **DB 공개 결정/영속 Read Receipt/서버 메모리에서만 epoch 재확인/JSON 직렬화 직전 재조회/비스트리밍 전환** 중 어느 하나만으로 “취소 ACK 이후 전송 바이트 0”이라고 주장할 수 없습니다. 비스트리밍은 복잡도를 줄이는 초기 후보일 뿐 전송 완료에 대한 증거가 아닙니다.

## 2. 이벤트와 선택해야 할 시간 계약

| 이벤트 | 의미 | D-04 Owner가 명시할 것 |
| --- | --- | --- |
| `P` | 최종 모델 입력 원본 Grant+Record의 DB 불변 Pin | G1/G2와 동일한 exact Attempt/SourceSet 귀속 |
| `C` | Assistant v2 Commit과 두 Outbox 같은 트랜잭션 확정 | 원 Grant 취소가 먼저라면 Commit 0 |
| `R` | 최초/Replay/History Current Original Grant+Derived Lineage Owner 판정 COMMIT | 과거 동의가 아닌 **현재** 원본 Grant/Record 검증 |
| `S` | 서버/프록시의 **실제 전송 시작 또는 쓰기 확정** | 구체적 플랫폼 훅과 타임스탬프/실행자 정의 필수. 단순 `new Response` 아님 |
| `F` | 전송 완료 또는 중단의 검증 가능한 경계 | 무한 대기·끊어진 연결·게이트웨이 재시도 결과를 어떻게 판정할지 |
| `V` | 원본 Grant 취소/Record 무효화의 DB COMMIT 및 사용자 취소 성공 ACK | 취소 ACK가 보장하는 바이트 효력/이미 진행 중인 응답 처리 |

**요구되는 시나리오:**
1. `V`가 `R`보다 먼저: Read/Reveal 불허, HTTP body의 개인기록 Assistant 내용 0바이트.
2. `R` 후 `V`, 그 뒤 `S`: **R7 반례**. 기존 DB Receipt만으로 `S`를 허용하면 안 됨. 승인할 epoch/fence 또는 실제 송신 게이트가 없으면 HOLD.
3. `S` 후 `V` ACK 전후: 이전에 시작된 응답의 잔여 바이트를 **어느 시점까지 허용/차단할지** 결정 필요. 전송 후 바이트 회수 불가. “ACK 후 어떤 네트워크 바이트도 도착하지 않는다”는 분산 네트워크에서 일반적으로 보장하지 못하므로 그대로 승인 금지.
4. `R` 이후 서버 crash/재시도 또는 `F` 불명: 재사용 가능한 장기 Permit 금지. 재시도·Replay·History 모두 새로운 Current Original Grant+Derived Lineage 검증 필요.
5. 동일 Record에 **새 Grant ID** 발급: 옛 Grant의 Attempt/답변/캐시/History 공개 권한을 부활시키면 안 됨.

## 3. 기술 결정 후보 — 승인까지 실제 양수 전송 HOLD

**후보 A — 서버가 제어하는 전송 게이트 + 철회 장벽:** 동일 Subject를 기준으로 DB 현재권한과 실제 송신 시작을 결합하는 게이트가 필요한지, `V` 성공 ACK 전에 이미 진입한 송신을 중단 또는 드레인해야 하는지 결정합니다. SQL 트랜잭션은 DB에만 적용되므로 HTTP 네트워크 송신과 원자적 결합을 보장하지 않습니다. Vercel/Web Response 구성만으로 이 계약을 충족했다고 주장하지 않습니다. Edge/Proxy/Worker 포함 모든 송신자는 동일한 장벽을 증명해야 합니다.

**후보 B — 더 약한 사용자 가시성 계약:** 취소 성공 이후 *새롭게 시작되는* Reveal 시도만 차단하되 이미 시작된 네트워크 응답은 취소 후에도 클라이언트에 도착할 수 있음을 명시하는 방향입니다. 이 경우 사용자가 예상하는 “철회 즉시 비공개”와 다르며 Product 정책 및 Security 위험 수용의 **별도 명시 판단**이 필요합니다. 현재 기존 Product Owner 정책 승인만으로 후보 B가 승인됐다고 해석하지 않습니다.

**공통 제약:** S0 직접 Memory 1건 + 현재 발화 + 승인된 공개 Bible 외 모든 미귀속 과거 대화/Reader/Saju/Face/Relationship/Worker provenance는 OUT_OF_SCOPE+FAIL_CLOSED. 비스트리밍을 기본 후보로 하되, 실제 전송 시작/취소 ACK의 순서, idempotency, 역할 ACL, 오류 시 0-byte-deny, 재동의/장기 캐시 회복 거부를 각각 승인해야 합니다. `Response` body의 콘텐츠가 한 번이라도 구성된 뒤에는 503으로 회수했다고 추정하지 않습니다.

## 4. 추가 우회 테스트와 한계

| 테스트 | 기대 | 증거 범위 |
| --- | --- | --- |
| Vercel `/api/me` rewrite → 실제 canonical 세연 HTTP Handler | Member라도 503/no-store, Runtime 0, Assistant bytes 0 | **실제 handler + route canonicalizer**, 인증은 가짜 |
| 원 경로 `/api/chat/:threadId/turns` rewrite → 같은 Handler | 동일 HOLD, client 소유 승인 헤더 무효 | 경로 우회 부정 검사 |
| `ReadableStream` request body 후반부 지연 | 본문을 기다린 뒤에도 503, Runtime 0, body canary 0 | 요청 입력 지연, **응답 송신 지연 proof 아님** |
| 반복 query/mixed dispatch authority | route target 부정 | 라우팅 변조 방어 |
| 허용된 `Response.json`을 구성한 후 Grant 취소 | 구성된 bytes 여전히 존재 | **반례**. 실제 전송/철회 원자성 proof 아님 |
| R7 named disposable PostgreSQL original Grant revoke | fresh DB Read 0, old app buffer remains | DB 경계 검증, **transport boundary 미검증** |

이 PR은 새 positive authorization 함수, DDL, ACL, Provider, Product/public/paid 설정, 사용자의 실제 기록, 운영 DB를 건드리지 않습니다. 독립 DB Owner 테스트는 선행 R7에서 수행했고, 이번 추가 테스트는 네트워크/HTTP 진입 경계의 부정 사례입니다. **G3 승인이나 transport linearization PASS가 아닙니다.**

## 5. 책임자가 서명할 D-04 결정서 (모두 빈 상태)

```text
G0 결정 ID: D-04
판정: APPROVE | REVISE | OUT_OF_SCOPE+FAIL_CLOSED
승인자: [Security 실제 책임자] / [API 실제 책임자] / [DB Authority 실제 책임자]
선택 계약: 후보 A | 후보 B | 승인된 별도 계약
적용 범위: S0 Memory 1건의 POST 최초 / committed_replay / History GET / Worker
R, S, F, V의 실제 시스템/저장·송신 관측점:
취소 ACK 이전/이후, 이미 송신 중일 때의 개인정보 바이트 허용 범위:
S 이후 crash, DB unavailable, lock timeout, retry/replay, 취소 후 재동의 처리:
격리 PG+실제 HTTP 네트워크 송신 경쟁 검증 링크:
버전 및 정확한 PR head SHA/DB migration SHA:
판정 이유 / 잔여 리스크 / 승인 시각:
```

**Owner 서명이 없어 D-04는 OPEN이며 Production 처음 공개·Replay·History·Worker G3는 HOLD**. 기존 제품 방향 2026-10-13 승인 재요청 금지. G0 Character/SRC-25 D-01 범위 결정, DB D-03/D-06 원자 계약, Ops/Production #1887 DR/원격 migration 승인, G6 공개·유료 출시 승인은 각각 별도 게이트입니다.
