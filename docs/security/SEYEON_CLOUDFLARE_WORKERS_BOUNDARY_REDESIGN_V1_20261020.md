# 세연 AI 보안 트랙 — Cloudflare Workers 실행 경계 재설계 v1 (2026-10-20)

> Watchtower-Track: security  
> **상태: SECURITY REDESIGN PROPOSAL / G0-D04 TECHNICAL SIGNOFF OPEN / POSITIVE REVEAL HOLD**  
> 기준: `main@4b673ad91d87aa220c766bbb4042cd39000b3d0e`; 별도 Ops 이관 설계·로드맵 브랜치 `docs/ops/cloudflare-workers-migration-20261020@f08a792efdcfd79527df6684a4f65376add1bfd4`  
> 본 문서는 **보안 트랙이 변경할 부분만** 정의한다. Cloudflare 프로젝트·배포·유료 전환·DNS·Production DB 변경을 승인하거나 수행하지 않는다.

## 0. 입력 정본 및 책임 분리

- [Cloudflare 이관 아키텍처](../CLOUDFLARE_MIGRATION_ARCHITECTURE_V1.md) / [이관 로드맵](../CLOUDFLARE_MIGRATION_ROADMAP_V1.md)은 **Ops 문서 브랜치**에 있으며, 이 문서 작성 시점에는 `main` 반영 여부를 전제하지 않는다. 정확한 읽기 URL:
  - [Ops architecture branch](https://github.com/gycha0109-beep/MyeongHa/blob/docs/ops/cloudflare-workers-migration-20261020/docs/CLOUDFLARE_MIGRATION_ARCHITECTURE_V1.md)
  - [Ops roadmap branch](https://github.com/gycha0109-beep/MyeongHa/blob/docs/ops/cloudflare-workers-migration-20261020/docs/CLOUDFLARE_MIGRATION_ROADMAP_V1.md)
- [제품 책임자 승인](SEYEON_PRODUCT_OWNER_MEMORY_REVOKE_HISTORY_DECISION_20261018.md)은 **`PRODUCT_POLICY_APPROVED`**. 재승인 요청 금지. Security/API/DB의 G0-D04 기술 계약/승인과 분리한다.
- [G0 기술 소유자 요청](SEYEON_G0_OWNER_TECHNICAL_SIGNOFF_REQUEST_20261017.md), [R18 기술 인수](SEYEON_R18_G0_TECHNICAL_AUTHORITY_HANDOFF_20261019.md), [G0~G6 완료 게이트](SEYEON_AI_SECURITY_COMPLETION_GATES_V1.md), [보안 실행 로드맵](../operations/SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V2_20261016.md), [증거 원장 #1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866)을 계속 상위 정본으로 사용한다.
- **Ops 소유:** GitHub→Worker Builds, Wrangler, Static Assets, 11개 멀티페이지 HTML, 헤더·rewrite 동등성, 기본 API router, 프리뷰/비용/롤백, Vercel Production 유지.
- **Security 소유:** 세연용 Provider 이전 금지, 응답 본문·Replay·History·파생 출처 차단, 현재 Grant 검증, G0-D04 송출 계약, 음성 시험·G5 증거. 별도의 공개 경로·배포 파이프라인을 보안 트랙에서 만들지 않는다.
- **DB/Character/API 소유:** 승인된 실 recordType/codec, 모델 입력 전체 출처, 영속 원본 Pin, 동일 트랜잭션 Grant 검증·Commit, `R/V/S/ACK` 기술 서명. Ops 단계 5/7에서 계약을 재구현하거나 우회하지 않는다.

## 1. 유지할 보안 불변조건

1. `SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1=[]`, `writeAdmission:'DENY'`, `publicRouteMounted:false`(해당 runtime), 공개/유료 OFF, 미승인 Production DB writes 0 유지. 기존 0건 Pin이 *positive* Grant/Record Pin 또는 최초 Reveal 허가는 아니다.
2. 사용자에게 **이미 송출된** 바이트는 철회 뒤에 도착할 수 있다는 제품 책임자 승인 경계를 유지한다. 반대로 철회 확정 뒤 **아직 송출하지 않은** 보호 응답과 철회된 기억의 새 모델 입력/검색/캐시/재시도/새 공개는 차단한다.
3. 같은 Record에 새로운 Grant가 발행되어도 과거 Grant/Attempt/파생 답변의 미승인 공개를 되살리지 않는다.
4. 비스트리밍을 최초 허용 범위의 기본값으로 둔다. 비스트리밍이 전송 원자성을 증명한다는 주장은 금지한다.
5. 원본 Record/Grant/Projection digest·최종 모델 입력의 lineage를 모델 호출 **이전**에 DB Owner가 영속 Pin해야 한다. DB Commit은 같은 DB 트랜잭션 안에서 현재 원본 Grant와 Record를 잠그고 검증한다.
6. 단순 Vercel→Cloudflare 이전, `nodejs_compat`, `Response` 반환, Promise 해결, `ReadableStream` 완료, `ctx.waitUntil`, `request.signal`, `ServerResponse.finish`, 브라우저 ACK 중 **어느 하나도** 클라이언트 실제 수신이나 안전한 `R→S` 순서를 독립 증명하지 않는다.
7. **`V→R→ACK→S` 금지:** 권한을 확인한 후 철회가 확정되고 철회 성공을 사용자에게 알린 다음, 아직 송출되지 않은 보호 응답을 내보내는 실행은 불허한다. `R`은 철회 DB COMMIT, `ACK`는 철회 완료 응답, `S`는 기술 소유자가 서명할 *정확한 실제 송출 경계*로 남긴다.
8. History, committed replay, 관계 이벤트, Reader, 후속 Worker/캐시의 개인기억 파생 본문을 단순 과거 저장 사실로 재공개하지 않는다.

## 2. 플랫폼별 실행 경계 재배치

```text
현재 Production (유지)                         Cloudflare 이관 트랙 (별도, 초기에는 deny-only)
Vercel /api/me ............................... Worker fetch /api/* explicit route (Ops 소유)
  ├─ Request/Auth preflight                    ├─ 명시적 세연 경로 식별, malformed/unknown 차단
  ├─ First Reveal pre-Provider HOLD             ├─ [Security] Provider/DB positive work 이전 HOLD
  └─ Vercel Fetch reveal fence → 503            └─ [Security] 최종 Response 외부 노출 직전 fence → 503
                │                                                   │
             기존 DB/RLS ─────────────────────────────────── DB Owner 계약 재사용 후보
                          (미승인 positive Pin/Reveal 연결 금지)
```

**공개 경로가 마운트되지 않은 초기 Ops 단계에서도** 세연 경로가 정적 `index.html` 또는 실수로 Vercel/Provider proxy로 빠져나가면 실패로 판정한다. 라우터의 순서는 `exact route identification → method/auth/preflight → pre-provider hard HOLD → optional handler → final egress hard fence`로 제안한다. **요청 전 차단과 외부 응답 전 차단은 독립 방어층**이다. 성공 body가 먼저 생성된 뒤 외부 fence만 거는 방식은 개인정보·비용 측면에서 불충분하다.

### 2.1 기존 소스 재사용/격리

| 기존 자산 | 처리 | 보안 판단 |
| --- | --- | --- |
| `apps/api/src/seyeon-first-http-reveal-hold-v1.ts` | **재사용** 가능한 순수 pre-Provider deny; Worker 호환성 확인 | 모든 syntactically valid authenticated first POST에서 최초 reveal 거부 유지 |
| `apps/api/src/seyeon-vercel-fetch-reveal-fence-v1.ts` | Vercel Production에서 **그대로 유지**. 별도 Workers Fetch 외부 경계 adapter 신규 설계 | 기존 weak identity registered-static-4xx 패턴은 재사용 *후보*이나 Worker 경계 독립 시험 필요 |
| `api/me.ts` | Vercel 전용 dispatch 보존. Workers 라우팅은 Ops 소유 | `api/me.ts`의 fence 제거/rename으로 positive 답변이 열린다고 간주하지 않음 |
| `apps/api/src/seyeon-node-original-grant-send-boundary-v1.ts` | Node 단독 후보 연구 자료로 유지; Workers에서 참조·마운트하지 않음 | `finish`는 OS 송신 버퍼 handoff의 근거일 뿐 클라이언트 수신/Cloudflare Proxy 근거 아님 |
| `apps/api/src/seyeon-first-zero-direct-https-loopback-host-v1.ts` | 독립 Node/TLS 후보로 **비공개 보존** | Workers HTTP inbound는 해당 Node TCP/443 listening socket과 다름 |
| `apps/api/src/production-seyeon-turn-send-runtime-v1.ts` | 현재 유료 Provider/OIDC/`pg` 런타임 조합을 즉시 Workers에 복사하지 않음 | Provider/Governor/DB 권한·secret/비용을 각각 재검증하고 미승인 호출은 0 |
| DB 0건 Pin·G1 source closure·R17 revoke 후보 | 의미·버전·최소권한 유지. Ops adapter만 변경 가능 | Positive source type 미승인, Production DB SQL/ACL 자동 적용 금지 |

### 2.2 Workers deny-only contract (아직 구현·배포 아님)

- **Ingress guard:** 정확히 분류한 세연 first turn/replay/read 및 lineage가 의심되는 protected route에 적용. 잘못된 메서드/인증/파라미터는 원본 계약에 맞는 최소한의 고정 4xx를 돌려준다. 인증을 통과한 첫 Reveal 요청은 **Provider 및 개인정보 조회·양수 DB Commit 이전** 고정 `503 SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE`로 차단한다.
- **Egress guard:** Worker의 최종 `fetch` 반환 전 적용; **신뢰 출처가 등록한 비스트리밍·비캐시 고정 4xx preflight만** 제한적으로 통과. 나머지 모든 잠재 보호 응답 객체의 body는 폐기하고 새로운 **고정 503/no-store**를 만든다. 임의 caller-generated 4xx, 변조된 header, 200 JSON, SSE/WS, 3xx redirect, 위험한 5xx body를 pass-through로 취급하지 않는다. 등록된 안전한 preflight `Response` 객체와 최종 wrapper의 결속·대체·clone·stream 소비 문제를 Workers runtime에서 따로 시험한다.
- **오류 경로:** handler, authorization, serialization, binding 누락, timeout, network/DB 실패는 민감 텍스트 없이 차단. 보호된 `Response`/log/cache/exception에 body를 사전 누출하지 않는다.
- **캐시/헤더:** 개인기억/assistant payload 및 오류 응답 `Cache-Control:no-store`; Auth/Cookie 원본 및 CSP `connect-src 'self'`, CORS allowlist, `Vary`, Cloudflare cache/Pages HTML fallback에서 보호 결과 재사용 금지. 정확한 header의 소유자는 Ops router와 Security guard가 합의한다.
- **에너지·비용:** deny-only 경로에서는 OpenAI 호출 0, 유료 DB 쓰기 0을 증명한다. free CPU 10ms와 128MB/isolate 한도는 방어 우회를 위한 이유가 아니다.
- **Host와 환경:** Vercel redirect marker를 Workers 클라이언트 파라미터 권한으로 쓰지 않으며, Preview `workers.dev`가 별도 origin인 점을 반영. 미승인 cross-origin production proxy 없음.

## 3. G0-D04 송출·철회 설계 — 미승인 기술 선택을 승인으로 바꾸지 않는다

### 3.1 실제 순서별 검증 질문

| 경쟁 상황 | 요구 결과 | 증명해야 하는 위치 |
| --- | --- | --- |
| `R` 확정 → 최초/다음 모델 사용 | 이전 원본 Grant로 사용 0 | DB Source Pin 및 Context assembly |
| `V→R→ACK→S` | 보호된 미송출 본문 0바이트 | Worker + Cloudflare edge/proxy + DB |
| `S→R→ACK` | `S`가 **기술적으로 실제 송출**로 입증된 바이트에 한해 이후 도착 허용 | 권한이 고정된 실제 송출 경계 |
| `V→S?`에서 disconnect, timeout, edge buffering | 송출 불확실성을 허용 완료로 취급하지 않음; 불확실 시 HOLD/재시도 차단 | Worker/브라우저/중간 프록시 관측 |
| 철회 Commit 성공·ACK 유실/중복 | 재사용은 즉시 금지, 외부에는 거짓 성공 ACK 금지 | DB commit/readback/retry 멱등성 |
| Regrant 후 이전 Attempt replay | 복구/공개 금지 | 원본 Grant ID/Attempt의 현재 검증 |
| History·Reader·관계 이벤트·후속 background Worker | 현재 권한 및 전체 파생 출처 불명 시 금지 | Authoritative lineage + send fence |

`Response` 반환·`ReadableStream.write/close`·`waitUntil`·`request.signal`·WebSocket ACK·Durable Object 순차화는 시험 후보/계측 경계일 뿐 **외부 클라이언트 수신 또는 네트워크 송출의 증명으로 채택되지 않았다**. 클라이언트 ACK만으로 모든 프록시 버퍼 경합이 해결된다고 선언하지 않는다. 다중 Cloudflare PoP에서 in-memory Map/단일 isolate lock으로 DB Grant revoke를 직렬화하지 않는다.

### 3.2 선택지와 보류 판정

1. **1차: Workers 관리형 HTTP에서 G0-D04를 충족할 수 있는지 격리 실증.** DB-authoritative epoch/Grant 잠금/철회 장벽과 Worker 요청·응답의 송출 전후를 표식화한 실제 Cloudflare 프리뷰+두 독립 PG 세션으로 검증한다. 송출 경계와 ACK 정의, in-flight bounded wait 또는 fail-closed, edge buffering 정책은 **Security/API/DB의 기술 판정 후** 계약화한다. 이 문서에서 임의 정의하지 않는다.
2. **불가능하거나 미증명 시:** Cloudflare의 일반 웹/비세연 API는 Ops 계획대로 진행하되 **세연 protected positive Reveal은 계속 503**. 별도의 전송 실행 환경 후보(Node direct TLS 등)는 재평가할 수 있으나 VPS/신규 도메인의 필요성을 자동 결론내리지 않는다.
3. **별도 기법:** Durable Object coordination, client receipt ACK, encrypted response/key release 등은 추후 검증 후보일 뿐 G0-D04 승인이나 안전성의 증명이 아니다. 새 storage/billing/secret 취급도 별도 Ops 승인 대상.

**전달 조건:** `G0-D04 Security+API+DB`의 버전 있는 서명 + 실제 검증된 trust-boundary diagram + `V/R/S/ACK` 정의 + HTTP/Proxy/DB 경합 결과 + Worker 코드 exact SHA 없이는 positive reveal 금지. 승인된 정책상 이미 실제 송출된 바이트의 사후 도착은 허용되지만, 그 사실로 `S`를 임의 앞당겨 정의하지 않는다.

## 4. 보안 트랙의 재편 작업 순서 (Ops 로드맵과 병렬)

| 보안 단계 | 실행 범위 및 산출물 | Ops 의존/시점 | 완료와 HOLD의 구분 |
| --- | --- | --- | --- |
| **S-CF0 계약 재기준** | 이 문서, 경계/owner 표, 과거 Node 증거의 한계 명시 | Ops 문서 PR #2381 / Roadmap §6, §10 | 문서 제안. G0 승인 아님 |
| **S-CF1 순수 deny 추출** | Vercel prod 변경 없이 공유 가능한 pre-Provider HOLD와 등록형 static denial/response fence의 최소 계약, fake runtime 음성 시험 | Ops 단계 1~2와 **병렬** | 모든 보호 응답 503. positive 구현 없음 |
| **S-CF2 Worker 외부 fence 연결** | Ops가 만든 explicit `/api/*` Worker entrypoint에 ingress/egress 이중 차단 부착; app header/cache/404/405 테스트 | Ops 단계 4 router 등장 시 | 최초 POST/replay/history 등 본문 유출 0, Provider 0 |
| **S-CF3 권한·출처 Pin** | Character 실제 S0 type/codec 서명 뒤 exact source+derived lineage의 모델 전 영속 Pin; 기존 0건 Pin 유지 | Ops 5 DB adapter와 보안 별도 진행 | 양수 Pin·Owner 미승인이면 HOLD |
| **S-CF4 Commit·Revoke 경합** | DB Owner same-transaction exact Grant lock/Commit, revoke/regrant/timeout/2 session; 새 adapter의 TLS/RLS 검사 | Ops 단계 5 계약 확인 | G2 증명과 DB 권한 없으면 positive HOLD |
| **S-CF5 Reveal transport proof** | Cloudflare Fetch/edge/ACK에 대한 실제 `V/R/S/ACK`, retry/abort/history/worker/Reader 검증; G0-D04 Owner 판정 | Ops 단계 7 연결, 안전 Preview 필요 | 증명·서명 없으면 503 유지 |
| **S-CF6 G5·G6** | 기존 CI/Watchtower Integration, synthetic PG+HTTP, DR/rollback/비용, 운영 signoff | Ops 9~10과 조정 | 세연 공개 승인은 독립. Ops cutover는 비활성 세연 상태로도 가능 |

**중요한 의존성:** S-CF1 음성 시험은 Cloudflare 계정이나 Preview가 없어도 작성 가능. S-CF2는 Ops router 인터페이스가 확정되어야 하고, S-CF5의 실제 Cloudflare 송출 시험은 Preview와 독립 DB/보안 승인 조건을 충족해야 한다. **Ops 정적 배포 작업을 보안 승인 때문에 전면 중단할 필요는 없고, 보안 때문에 protected API를 일찍 열어서도 안 된다.**

## 5. 필수 음성·경합 시험 (실패 기준 고정)

| ID | 검증 상황 | 보호 기대값 |
| --- | --- | --- |
| CF-D01 | syntactically valid authenticated 첫 세연 POST / Provider spy | 고정 `503/no-store`, 보호 바이트 0, Provider 0 |
| CF-D02 | 등록된 exact static preflight 4xx / 악성·임의 4xx, forged body/header | trusted 4xx만 통과, 나머지 고정 503 |
| CF-D03 | 성공 JSON, SSE body, stream, 3xx, 5xx, throw/timeout을 outer fence에 주입 | sensitive body 0, 200/stream/redirect bypass 0 |
| CF-D04 | GET/committed replay/History/Reader 및 cross-grant, 신규 Grant와 이전 Attempt | 미승인 유래 본문 0, 소급 replay 0 |
| CF-D05 | URL marker duplicate/encoding, method OPTIONS/HEAD, API→HTML fallback, static asset route overlap | 보안 헤더/404/405/503 계약, 보호 HTML/body 0 |
| CF-D06 | `V→R→ACK→S`, `S→R`, 취소·지연·프록시 버퍼·다중 PoP (합성 2세션 PG) | Owner가 `S` 서명하기 전 positive 0; 모든 관측은 unknown 명시 |
| CF-D07 | 느린 client/abort/closed tab, 중복 요청·비동기 완료, `waitUntil` | 미승인 후속 send 0, 유료/DB side effect 0 |
| CF-D08 | Worker env 누락, DB TLS/role 에러, Provider timeout, 캐시·CSP·CORS 회귀 | fail-closed, privacy-safe telemetry |
| CF-D09 | CPU/메모리/대상 Worker 수, timeout, header/rewrite, CI exact SHA | Ops 사용량과 보안 차단 독립 통과 |
| CF-D10 | 실 Production 미이관 상태에서 새 Worker Preview 및 기존 Vercel 동시 요청 | 원본 Vercel 보안 503 유지, Preview가 Production/DB로 암묵 프록시하지 않음 |

Mock/정적 시험은 **S-CF1/S-CF2 후보 증거**이지 G0-D04/G3/G5 PASS가 아니다. 실제 Postgres 독립 세션, Cloudflare 배포 version/edge/proxy/브라우저 경계, 현재 Owner signoff 없는 CF-D06 양수 테스트는 PASS 불가다.

## 6. Ops 트랙으로 보낼 짧은 인터페이스 계약

- Workers route는 **보호된 chat/turn send/replay/history를 명확히 분기**하고, `/api/*`를 Static Assets에 잘못 위임하지 않는다. API 오류를 200 HTML로 만들지 않는다.
- Worker entrypoint에서 Security-owned **pre-Provider HOLD + final Fetch egress fence**를 연결할 안정된 호출 지점을 제공한다. 현재 Vercel fence 제거/route 활성화/유료 Provider 연결 금지.
- Auth/DB 및 Saju 등 일반 API 이관 성공이 세연 G0-D04 승인으로 전이되지 않게 route별 수락 상태 분리.
- Workers 제한의 **메모리 128MB는 invocation 단위가 아니라 isolate 단위**이다. Ops 설계 9장의 `128 MB/invocation`은 정확히는 `128 MB/isolate`로 수정할 사항이며, 하나의 isolate에서 동시 요청이 메모리를 공유한다. 공식 근거: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#memory).
- Worker의 Node 호환 설정으로 `node:http.ServerResponse` 또는 직접 외부 TLS/443 listener가 살아난다고 가정하지 않는다. 공식: [Node APIs](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), [TCP connect handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/connect/).
- Preview 생성·Cloudflare secret·DNS 변경·Vercel 종료·유료 요금제 전환은 **Ops의 사용자 승인 구간**에 남긴다.

## 7. 성공 판정과 현재 상태

- **이 재설계 문서 완료:** 정확한 Ops 두 문서·기존 Security 정본의 책임과 기술 경계가 충돌 없이 기록됨. S-CF0 문서 작성은 `G0-D04 APPROVED`나 `G3 PASS`가 아님.
- **다음 실제 보안 코드:** Ops 구현과 충돌하지 않는 `S-CF1` offline deny contract 및 tests. Ops Worker router가 준비되기 전 새 public route 구현 금지.
- **실제 이용자 대상 긍정 응답:** G0-D01/02/03/04/05/09, G1/G2/G3, G4~G6 해당 scope의 Owner/CI/DB/운영 증거 전까지 `HOLD`.
- **보존:** Node direct-TLS 연구물, 기존 Vercel fail-closed 및 private-memory revoke 후보, 기존 migration/ACL 및 소유권 정책. **폐기/우회/비공개 실제 데이터 테스트 금지.**

작성 당시 Production code/deployment/Cloudflare account/Supabase/Provider 상태를 변경하지 않았다. 이 문서의 기술 제안은 승인된 보안 계약이 아니며, 실제 구현 PR과 Owner 판정에 따라 버전 갱신한다.
