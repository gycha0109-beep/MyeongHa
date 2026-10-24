# 가상 기억 E2E 실행 결과 — 2026-10-24

Watchtower-Track: security

**VERIFIED: 격리 PostgreSQL + 실제 Node HTTP + 합성 모델의 가상 기억 경로 8/8 PASS.**

기준 코드 `4043dab650e1d0a7a5b46d6a0990420de640c2e7`, 브랜치 `codex/ai-security-virtual-memory-e2e-20261024`. 변경은 기존 S0 DB 테스트의 가상 기억 사례 두 개와 이 실행 기록이다. 제품 코드·공개 API·저장 계약·운영 설정 변경은 없다.

## 사용자 관점 결과

- 가상 기억: “나는 매주 토요일 아침에 한강을 산책한다.”
- 질문: “내가 주말에 뭐 한다고 했지?”
- 합성 답변: “기억해요. 나는 매주 토요일 아침에 한강을 산책한다.”
- 권한이 있는 최초 답변: HTTP **200**, `Cache-Control: no-store`, DB Assistant 본문과 HTTP 본문 일치.
- 생성·Commit 후 첫 전송 직전 권한 철회: HTTP **503**, 응답에 기억/답변 원문 없음. 새 personal-record 조회 결과 0건.

실제 기존 DB context-read 포트 → 기존 `conversation_recall/v1` projector → 실제 model source selection → G1 영속 Pin을 사용한다. Pin의 context digest를 확인한 다음에만 로컬 합성 모델이 읽은 기억으로 답변을 조립한다. 실제 SQL generation/validation fixture → v2 Commit/Outbox → 현재 원본 Grant 잠금 재조회 → 실제 loopback Node socket 송출까지 실행했다.

**합성 부분:** Member 신원 verifier, 모델, generation/output-guard 증거는 테스트 fixture다. 전체 Production runtime/Governor/실 Provider 호출, 실제 로그인·브라우저 UI·외부 proxy는 실행하지 않았다. 실제 모델의 기억 이해 품질이나 전체 제품 E2E, 운영 보안 완료로 해석하지 않는다. 철회 후 기록 원문 보존과 personal-record 조회 차단을 확인했으며 미승인 History/Replay 공개를 허용하지 않는다.

## 실행 및 검증

Windows / Node 24.14.0 / Vitest 4.1.11 / PostgreSQL **18.6**. 운영과 분리된 loopback transient cluster, DB `myeongha_seyeon_security_s0_test`만 사용했다. PG17은 이번 로컬 실행의 버전이 아니다.

현재 checkout의 auth stub과 migration 193개를 새 DB에 적용했다. 기존 PG17 harness와 동일하게 `0860_birth_profile_create_runtime_authority.sql`만 managed-principal 전용 검증으로 제외했다. 이어 현재 S0 installer를 실행해 `S0_DEFAULT_CLOSED PostgreSQL 180006`을 확인했다. 테스트 안에서만 합성 registry/실행 권한을 등록했다.

```powershell
# 별도로 구성한 named disposable loopback DB에서만 실행
$env:PGHOST = '127.0.0.1'
$env:PGPORT = '<해당 transient instance의 port>'
$env:PGDATABASE = 'myeongha_seyeon_security_s0_test'
$env:PGUSER = 'postgres'
$env:PGSSLMODE = 'disable'
$env:SEYEON_SECURITY_S0_REAL_PG = '1'
npx vitest run test/seyeon-security-s0-postgres.e2e.test.ts --maxWorkers=1 --reporter=verbose --reporter=json --outputFile=artifacts/seyeon-virtual-memory-e2e-20261024/result.json
```

8/8 PASS: 기존 Pin/Commit/최초 송출·private 저장 0 Grant, 원본 Grant 철회 후 재부여 우회 차단, legacy v2 원본 User 불일치 rollback, 두 실제 PG 세션의 철회 lock wait, 송출 중단 rollback, 한국어 기억 정상 HTTP, 첫 송출 전 철회 HTTP 차단, 데이터/철회 권한 보존 stop.

`npx tsc -p tsconfig.json --noEmit`와 `git diff --check` PASS. 새 fixture/source-selection 조립에 타입 오류 없음. 전체 회귀나 유료 Provider 호출은 추가하지 않았다.

실행 산출물: `artifacts/seyeon-virtual-memory-e2e-20261024/result.json`, `run.log`, `baseline.log`.

## 제한된 진단 기록

- 이전 테스트 DB template 재사용 시 기존 astral UTF-16 음성 검사가 1건 실패했다. expected=4000 UTF-16 code-unit 초과 거부, observed=이전 SQL 함수가 저장 허용, runtime=local PG18, stage=private accept, classification=stale disposable template. 현재 source의 함수 정의와 다른 템플릿을 사용한 것이 원인이다. 새 빈 DB에 현재 migration/S0 SQL을 설치하고 위 명령으로 8/8 PASS를 확인했다. 기존 실패 DB는 history 이름으로 보존했다. 테스트나 길이 제한을 완화하지 않았다.
- 이미 설치된 template에 installer를 다시 실행하면 private schema 존재 보호에서 거부된다. 현재 installer는 재설치용이 아니다. 새 빈 baseline에 한 번 설치하는 기존 절차를 사용했다.
- pinned pg8 드라이버의 concurrent-query deprecation 경고가 기존 abort 경합 사례에서 출력됐다. 테스트 실패는 없으며 별도 드라이버 변경은 하지 않았다.

Architecture Check: docs updated=yes, 구조 영향 없음. 테스트 fixture만 확대했으며 새 category/mode/fallback/normalization/운영 활성화 경로는 없다.

후속: 사용자 요청으로 합성 모델을 실제 native 모델/Chat runtime으로 대체한 실행은 [실제 모델 E2E 기록](SEYEON_AI_SECURITY_REAL_MODEL_E2E_20261024.md)에 별도로 남겼다. 그 실행에서 이 합성 조립이 놓친 current User seal 및 thread participant UUID 결함 두 개를 찾아 수정했다. 본 기록의 8/8은 합성 모델 경계의 과거 결과다.
