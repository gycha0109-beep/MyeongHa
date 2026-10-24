# 가상 기억 + 실제 모델 서버 E2E — 2026-10-24

Watchtower-Track: security

**VERIFIED: 격리 DB에서 실제 서버 Chat runtime·native OpenAI 모델·직접 Node HTTP의 초기 단일 Memory 경로.** 제품에 기억 추가 UI를 만들지 않고 내부 fixture로 기억/Grant를 넣었다. 로그인/브라우저/외부 proxy/운영 배포 검증은 아니다.

## 실제 결과

가상 기억: `사용자가 "이번 토요일 아침 한강에서 노란색 모자를 쓰고 산책할까 해"라고 말한 대화 기억이다.`

질문: `내가 이번 토요일 산책 얘기하면서 어디랑 무슨 색 모자를 말했지?`

실제 `gpt-5.6-terra` 답변: **“한강이요. 노란색 모자라고 하셨죠—제가 이런 건 은근히 안 놓쳐요.”**

| 사례 | 확인한 결과 |
| --- | --- |
| 허용된 기억으로 첫 답변 | 실제 native Preflight 2회·Interpreter·Renderer·Reviewer, 의미 검증 PASS, 실제 G1→generated/validated→G2 Commit/Outbox→G3 잠금 조회→HTTP **200/no-store**. HTTP 답변과 DB Assistant 본문 일치 |
| 실제 모델 생성·Commit 후 첫 전송 직전 철회 | 별도 가상 Member에서 같은 실제 경로 실행. Commit된 Assistant 1건을 확인하고 HTTP **503/no-store**, 장소·모자 정보 노출 0 |
| context 조회 후 실제 G1 직전 철회 | 실제 두 번째 DB 세션에서 원본 Grant 철회. `42501 / seyeon_source_lock_original_grant_required`, 모델·token-count 외부 요청 **0회**, socket 종료/응답 본문 0 |

세 번째 사례는 서버 전용 테스트 wrapper로 실제 G1 SQL 직전에 동시 철회를 배치한다. DB 명령·source 검사·모델 응답을 대체하지 않는다. 모든 외부 호출은 native endpoint로 변경 없이 전달했다. 관찰기는 요청 해시·source 포함 여부·실제 response ID/usage를 기록하며 API 키/인증 헤더/원격 오류 본문은 기록하지 않는다. 합성 답변·강제 의미 검증 통과·캐시 답변은 없다.

## 실제 실행에서 수정한 두 결함

1. `seyeon-positive-g1-final-model-context-seal-v1.ts`는 모델 입력의 `recentMessages=[]`만 허용했다. 실제 Chat runtime은 원본 현재 User 1건을 넣으므로 정상 실행도 막혔다. 실제 received User ID/text를 seal에 전달하고 **그 원본 User 1건만 정확히 일치**해야 허용한다. 과거/중복/assistant/다른 ID·다른 질문은 거부한다. 전체 deterministic context/Memory digest·원본 Grant 검사는 유지한다.
2. 첫 송출 TS guard는 DB의 `threadCharacterId`를 slug `seyeon`으로 가정했다. 실제 receive port는 `conversation_thread_characters.id` UUID를 반환한다. 해당 필드는 UUID로 검증하며 기존 server thread binding의 단일 `seyeon` 및 locked DB Reveal의 실제 원본 권한 검사를 유지한다. 테스트 fixture도 DB와 같은 UUID 계약으로 수정했다.

범위를 넓힌 근거는 실제 runtime의 G1 seal 거부와, 실제 모델/의미 검증/G2가 완료된 뒤 정상 원본 송출이 거부되는 재현이다. 직접 guard/caller와 직접 테스트만 수정했다. 새 domain category·mode·fallback·normalization·UI·API·테이블·migration·권한 정책은 없다.

## 환경·한계

- 기준 코드 `4043dab6` + 이 브랜치의 세 runtime 파일 수정. Windows / Node 24.14.0 / Vitest 4.1.11 / PostgreSQL **18.6**. 이번 실행을 PG17로 표시하지 않는다.
- named disposable `myeongha_seyeon_security_s0_test`, loopback 전용 transient cluster. 현재 migration 193개와 현재 S0 SQL 설치, 기존 PG17 harness의 managed-role 0860 제외를 그대로 사용했다. 이전 실행 DB는 history 이름으로 보존했다.
- 별도 실제 LOGIN·역할 검사를 통과한 ordinary pool과 governed cost pool, 실제 canonical Member Subject 트랜잭션을 사용했다. 로컬 DB 연결은 TLS 없는 내부 테스트 seam이다. Member identity verifier는 가상 신원이다. 실제 hosted Auth/TLS/proxy 증거가 아니다.
- 모델은 저장소 기본 `gpt-5.6-terra`, ENFORCE/native Governor·공식 input-token count·4096 output cap·`store:false`. [공식 모델 문서](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)를 확인했다. 격리 DB에만 테스트 정책·예산(global $1/member $0.50)을 등록했다. 운영 예산/registry 승인은 아니다.
- 성공한 두 실제 생성 사례는 generation **10회**와 각 input count를 실행했다. 해당 실행 DB ledger의 추정 비용은 **52,510 microUSD ($0.052510)**. 이전 진단 실행은 별도 history/log에 남겼다. 비용은 기존 ledger의 ESTIMATED 값이며 cache-write/외부 count 서비스/최종 청구서 정산 증거가 아니다.
- 이는 초기 Memory 1건·현재 User·첫 답변의 제한된 통과다. 모델 품질의 일반 합격, G0/SRC-25 기술 서명, 운영 DB/DR·외부 V/R/S/ACK·공개 활성화 또는 전체 보안 트랙 종료가 아니다.

## 검증 기록과 재현

`test/seyeon-security-s0-live-model.e2e.test.ts`는 `SEYEON_SECURITY_S0_LIVE_MODEL=1`이 없으면 SKIP한다. 일반 CI가 유료 호출하지 않는다. 명시적인 local credential file에서 기존 키만 읽으며 키를 복사/출력하지 않는다. 테스트는 지정된 loopback DB 이외의 실행을 거부한다.

```powershell
$env:PGHOST = '127.0.0.1'
$env:PGPORT = '<owned transient instance port>'
$env:PGDATABASE = 'myeongha_seyeon_security_s0_test'
$env:PGSSLMODE = 'disable'
$env:SEYEON_SECURITY_S0_LIVE_MODEL = '1'
$env:SEYEON_S0_LIVE_KEY_FILE = '<existing ignored local env file>'
$env:SEYEON_S0_LIVE_REPORT = 'artifacts/seyeon-real-model-e2e-20261024/network-and-outcomes.json'
npx vitest run test/seyeon-security-s0-live-model.e2e.test.ts --maxWorkers=1 --bail=1
```

최종 실제 생성 실행의 정상/전송 전 철회 **2/2 PASS**. 같은 실행에서 사전 철회는 실제 private lock helper가 예상보다 먼저 차단해, 테스트가 예상한 뒤쪽 G1 constraint 이름만 불일치했다. 정확한 `seyeon_source_lock_original_grant_required`로 고친 뒤 새 DB에서 해당 사례만 **1/1 PASS**(외부 요청 0회)로 재검증했다. 이미 통과한 두 유료 사례는 다시 호출하지 않았다. 한 번의 3/3 녹색 실행으로 표기하지 않는다.

- 최종 두 생성 결과·request/response 증거: `artifacts/seyeon-real-model-e2e-20261024/run.log`, `result.json`, `network-and-outcomes.json`.
- 사전 철회 최종 PASS: `pre-model-revoke.log`, `pre-model-revoke-result.json`, `pre-model-revoke-network.json`.
- 네 직접 파일 **50/50 PASS**: 실제 DB S0 8개 + G1 seal/첫 Node ingress/송출 guard 42개. `regression.log`, `regression-result.json`.
- `npm run typecheck`(root/api-client/web/mobile), `npm run build`, `git diff --check` PASS.

이전 실패도 보존했다: 최초 실제 G1 current User 거부, 모델 의미 검증 거부(안전하게 비공개), 실제 G2 후 UUID/slug 송출 거부, 관찰기의 JSON escape 비교 오류. 의미 검증을 약화하지 않았다. fixture는 주체 없는 1인칭 습관 진술에서 명확한 사용자의 대화 회상으로 수정했다. 기존 `conversation_recall/v1` codec/claimKind/권한 정책은 변경하지 않았다.

### CI의 추가 직접 fixture 보정

최초 PR HEAD `d10f2dab`의 CI #40097621895에서 영향 테스트의 `seyeon-g3-first-reply-request-content-v1.test.ts` 정상 사례 두 개가 `INVALID_COMMIT`으로 실패했다. expected=실제 participant UUID로 G3 request/Outbox 검사를 실행, observed=이 직접 caller fixture 두 파일에만 아직 slug `seyeon`이 남음, runtime=GitHub Node24/Vitest, stage=첫 송출 guard, classification=stale synthetic fixture. 두 fixture를 같은 DB UUID 계약으로 보정하고 `npx vitest related apps/api/src/seyeon-first-positive-memory-node-delivery-v1.ts apps/api/src/seyeon-positive-g1-final-model-context-seal-v1.ts apps/api/src/seyeon-production-chat-execution-v1.ts --run --passWithNoTests`로 직접 영향 테스트를 실행한다. 제품 검사/DB 조건을 완화하지 않으며 이전 HEAD 실패를 PASS로 재사용하지 않는다.

위 related 실행은 **278 PASS / 28 SKIP**, 파일 29 PASS / 3 SKIP이다. 최초 로컬 실행의 HTTPS 사례 3개는 `openssl ENOENT`였으며 설치된 Git의 `mingw64/bin`을 해당 프로세스 PATH에 추가해 그대로 실행했다. 제품/테스트 skip 조건을 추가하지 않았다. 근거는 `artifacts/seyeon-real-model-e2e-20261024/related.log`다.

Architecture Check:

* Docs updated: yes — 이 증거와 실행 로드맵의 실제 모델 후속 기록.
* Ghost-code risk: findings — positive Node 경로는 여전히 운영 미마운트다. 실제 테스트는 production Chat runtime과 native Provider·Governor를 호출했으며 UI/운영 활성화 증거로 세지 않는다.
* Notes: 현재 User 원본 결속과 DB row UUID 의미를 기존 계약에 맞춰 복구했다. 공개 API/DB schema·정책·카테고리·fallback·normalization 변경 없음.
