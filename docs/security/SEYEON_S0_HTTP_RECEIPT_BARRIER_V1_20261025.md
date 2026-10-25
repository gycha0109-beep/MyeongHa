# S0 HTTP 수신 증명과 철회 장벽 v1

Watchtower-Track: security

사용자의 “자체적으로 설계 해서 진행하도록” 위임에 따라 기존 S0의 Cloudflare 전송 결손을 설계·구현한다. 다른 사람의 기술 서명을 대신 작성하지 않는다. 이 문서는 이전 D-04의 단순 Node `finish`/Fetch 반환/클라이언트 ACK 단독 주장을 채택하지 않고, **DB에 먼저 남긴 미확정 송출을 철회 완료의 장벽으로 사용하는 계약**을 정의한다. 대상 환경 실증과 운영 활성화는 별도 실행 증거로 판정한다.

## 범위와 보장

현재 verified Member/현재 Turn, 원본 `conversation_recall/v1` Memory 1건, 최초 비스트리밍 답변만 다룬다. 원본 Grant/Memory/G1/G2/Outbox 검증은 기존 단일 SQL authority를 공유한다. History/Replay/Reader 및 다중 기억은 제외한다.

순서는 다음과 같다.

1. 기존 G1 모델 전 Pin, ENFORCE 비용 통제, G2 동일 트랜잭션 Commit을 통과한다.
2. 새 G3 issuer가 기존 원본 권한을 잠금 재검사하고, 기존 Attempt에 **정확한 답변 UTF-8 본문·256-bit 임의 challenge에 결속한 증명의 SHA-256과 issued 시각**을 기록한다. 명확한 DB COMMIT ACK 전에는 Fetch 응답을 외부로 반환하지 않는다. DB에는 challenge 원문이 전달되지 않는다.
3. JSON 응답에서 모든 보호 본문 뒤에 원본 Attempt ID와 challenge를 둔다. HTTP는 identity encoding/no-transform을 사용한다. 브라우저/모바일 공용 클라이언트는 응답 전체의 JSON·기존 결과 계약을 파싱한 뒤, 본문과 challenge hash의 domain-separated 증명을 계산해 receipt endpoint에 보낸다. challenge만 그대로 보내거나 다른 본문에 결속한 증명은 거부된다. 원문·challenge·증명은 로그/클라이언트 영속 저장소에 남기지 않는다.
4. DB receipt 명령은 정확한 Attempt/증명 해시를 확인하고 received를 기록한다. 이때 해당 원본 Turn만 `delivered`로 전이한다. 증명은 source 조회·새 추론·재전송·새 철회 권한이 아니다.
5. 철회 요청은 Subject 잠금 아래 원본 Grant에 불변 intent를 기록한다. intent가 있는 Grant는 restrictive RLS와 G1/G2/G3 원본 잠금 검사에서 즉시 새 사용이 차단된다. issued/미received 응답이 있으면 **202 pending + newUseBlocked=true**를 반환하고 Grant 철회 COMMIT 및 철회 완료 ACK를 만들지 않는다.
6. 해당 응답의 올바른 receipt가 와야 기존 철회 명령으로 이미 요청된 철회를 완료한다. pending이 없으면 기존 철회 명령과 COMMIT 이후 200 committed를 사용한다.

따라서 Cloudflare의 불명확한 실제 송출 `S`를 `new Response`, stream close 또는 OS-buffer handoff로 정의하지 않는다. **철회 완료가 가능할 때에는 해당 응답 전체를 받은 수신자가 증명을 이미 가지고 있어야 한다.** 증명 하나만 믿는 방식과 달리, 미수신·미확정 송출의 durable DB 장벽이 모든 철회·source 무효화 경로를 막는다.

## 장애와 권한

- Worker crash, Response 유실, disconnect, DB COMMIT 불명, receipt ACK 유실은 성공으로 추정하지 않는다. 미확정 issuance에 자동 만료·자동 replay·자동 철회 완료를 부여하지 않는다.
- **가용성 한계:** 응답/증명을 영구 유실하면 새 사용은 차단되어도 철회 완료는 계속 pending일 수 있다. timeout을 근거로 완료시키지 않는다. 이 잔여 상태를 운영 경보·운영 판정 대상으로 명시한다. 모든 장애에서 즉시 철회 완료를 보장한다고 주장하지 않는다.
- logout/계정 삭제로 receipt 제출이 불가능해지지 않도록 receipt endpoint는 임의 증명 자체를 한정 capability로 사용한다. fresh login 없이 제출할 수 있지만, source·사용자 정보·답변을 반환하지 않고 이미 발행된 원본 Attempt의 receipt만 처리한다. 추측 불가능한 256-bit 증명은 URL/로그/영속 클라이언트 저장소에 남기지 않는다.
- DB BEFORE trigger가 legacy Grant/Memory 무효화, Subject 변경/삭제, 미확정 Attempt 삭제·출처 변경도 차단한다. 단일 HTTP wrapper만 믿지 않는다. DB 관리자에 의한 trigger 비활성화·임의 SQL 증명 조작은 정상 운영 명령이 아니며 완료 증거로 인정하지 않는다.
- 완료된 Attempt의 답변·Pin·모델/검증 결과는 계속 불변이다. postgres 소유 명령의 delivery 3개 필드만 기존 terminal trigger의 좁은 예외로 허용하고, 별도 trigger로 일회성·불변 전이를 강제한다.
- 기존 table/Subject 삭제 그래프를 사용한다. 새 개인정보 table, 별도 권한 저장소, in-memory 전역 잠금, DO/Hyperdrive/새 Worker는 추가하지 않는다. 현재 명시적 CA/verify-full/전용 LOGIN 검증을 재사용한다.
- 실제 Worker에서는 Node TLS adapter의 로컬 검증을 운영 보장으로 사용하지 않는다. Cloudflare workerd의 `node:tls`는 사용자 CA를 반영하지 않는 구현이므로 일반 `pg-cloudflare`/Node TLS alias를 S0 origin authority로 채택하지 않는다. 기존 Hyperdrive transport에 등록된 Supabase Root 2021 CA를 결속하고 origin의 `verify-full` 및 query caching disabled를 실제 Cloudflare API로 확인한다. Worker와 Hyperdrive의 관리형 binding을 사용하고, 인터넷 origin 구간의 인증서·hostname 검증을 별도로 입증한다.
- 일반 Subject/API와 비용 Gov는 서로 다른 `SEYEON_SUBJECT_HYPERDRIVE` / `SEYEON_GOVERNED_HYPERDRIVE` binding과 NOINHERIT LOGIN을 사용한다. 기존 Ops LOGIN과 자격증명을 보존하기 위해 S0는 `myeongha_seyeon_subject_login`을 별도로 사용한다. 이는 동일 API executor를 쓰는 요청 경로별 접속 주체이며 새로운 개인정보 권한 유형이나 fallback이 아니다. 기존 pool preflight가 실제 LOGIN과 허용/금지 권한을 확인하고, Gov는 실제 `SET LOCAL ROLE`까지 확인한다. 같은 binding이나 일반 LOGIN을 비용 연결에 넣으면 차단한다. pool은 요청마다 소유하며 max=1, 모든 경로에서 닫는다.
- 운영 HTTP 활성화에서는 unreceipted Node G3 RPC의 API EXECUTE를 열 필요가 없다. receipt issuer와 ACK/철회 RPC, G1/G2만 필요한 실행 권한을 받는다.

## 비용과 클라이언트 계약

서버 정책은 기존 native `gpt-5.6-terra`, 네 역할 ENFORCE Governor, 별도 비용 LOGIN, 실제 input-token count, output cap 4096, `store:false`를 사용한다. 기존 원장이 cache-write 요금을 표현하지 않으므로 S0 native 요청은 **`prompt_cache_options:{mode:'explicit'}`와 breakpoint 0개**로 캐시 읽기/쓰기를 비활성화한다. 공식 [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)과 [모델 가격](https://developers.openai.com/api/docs/models/gpt-5.6-terra)을 2026-10-25 확인했다. 가격은 입력 $2/캐시 입력 $0.20/출력 $12 per million이며 원장은 invoice가 아닌 추정 비용이다.

새 요청 capability header `x-myeongha-delivery-receipt:v1`은 클라이언트 수신 프로토콜 지원을 나타낼 뿐 개인정보 사용 승인으로 취급하지 않는다. 지원하지 않는 클라이언트는 모델 호출 전 차단한다. 응답 data에 `deliveryReceipt`가 추가되며 공용 API client는 원본 텍스트 파싱 후 receipt를 보내고 capability를 caller/UI 결과에서 제거한다. receipt 실패가 모델 재호출 허가가 되지 않는다.

운영 기본값은 `seyeon-security-s0-production-policy-v1.ts`의 두 gate가 모두 false다. receipt/withdrawal gate와 model-use gate를 분리해 중단 시 기존 receipt와 철회 능력을 보존한다. 실제 DB 설치·기존 백업 복제본 리허설·필수 CI·운영 smoke 없이 gate를 올리지 않는다.

## 현재 검증

로컬 PostgreSQL 18.6에서 기존 S0 8개와 수신 장벽 3개 **11/11 PASS**. 실제 독립 세션의 미COMMIT issue→철회 대기→COMMIT→pending, 미소비 Fetch 응답→철회 pending→잘못된/교차 증명 거부→정확한 증명→철회 완료, 유실 응답의 durable pending과 삭제/일반 역할 조작 거부를 확인했다. 직접 client/비용 입력/Worker/철회 회귀 **38 PASS**, root typecheck와 정적 웹/Worker dry-run build PASS. 이는 아직 운영 Edge/hosted Auth 또는 PG17 복원본 실행 결과가 아니다. 관련 로그는 `artifacts/seyeon-production-rollout-20261025/`에 보존한다.

Architecture Check:

* Docs updated: yes — 이 계약 및 운영 실행 기록.
* Ghost-code risk: findings — 실제 운영 gate는 아직 false. 운영 활성화 증거로 계산하지 않는다.
* Notes: 기존 Attempt/Grant에 metadata 추가, 기존 G3 공통 authority와 terminal trigger의 좁은 예외, additive HTTP receipt capability/202 withdrawal pending 계약. 글로벌 Projectors=[]는 유지하며 신규 source 유형·payload coercion·자동 UNKNOWN 해소·API proxy fallback은 없다.


## Worker transport 현장 확인

2026-10-25 실제 primary Worker의 가상 계정 로그인은 HTTP 200, 소유 Member DB 조회는 503이었다. 로컬 Node의 TCP/SSLRequest/custom CA 검증은 해당 Worker의 수용 증거가 아니었다. [workerd TLS 구현](https://github.com/cloudflare/workerd/blob/main/src/node/internal/internal_tls_common.ts)은 custom SecureContext/CA를 제공하지 않고 [TLS upgrade](https://github.com/cloudflare/workerd/blob/main/src/node/internal/internal_tls_wrap.ts)는 플랫폼 startTls에 위임한다. [Hyperdrive 공식 TLS 계약](https://developers.cloudflare.com/hyperdrive/configuration/tls-ssl-certificates-for-hyperdrive/)의 custom CA와 verify-full 경로를 재사용한다. 기존 Cloudflare certificate `d25c14bc-d654-46b8-89cf-5c4baf931771`의 PEM은 로컬 고정 fingerprint의 CA와 일치함을 API로 확인했다. certificate 존재만으로 Hyperdrive 연결·앱 로그인 DB·Gov·모델 동작을 완료 처리하지 않는다.

운영 origin 비밀번호는 보호된 로컬 operator 파일에만 남기고 Wrangler의 기존 인증 및 공개 command-handler API를 프로세스 내부에서 사용해 등록한다. 비밀번호·DB URL·token을 CLI argv나 tool 인자에 넣지 않는다. Worker에는 origin 비밀번호를 추가하지 않으며, 기존 원본 DB 설정을 바꾸지 않는다. 새로운 두 Hyperdrive ID와 read-only 구성 검증 결과를 실제 실행 뒤 기록한다.

S0 최초 기억 경로는 서버 전용 `requiredPersonalRecordCount:1`을 exact-model selector에 전달한다. 원본 기억이 없거나 철회로 사라졌으면 governance/provider/input-count 전에서 HOLD한다. 기존 일반 zero-source 실행은 바꾸지 않는다. 이 constraint는 HTTP/LLM 입력 또는 모델 packet의 권한 필드가 아니다.
