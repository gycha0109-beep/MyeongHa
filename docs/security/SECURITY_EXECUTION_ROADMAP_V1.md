# 명하 Security 실행 로드맵 v1

> **현재 실행 대상 정정:** 주 서버는 Cloudflare입니다. 최신 대상·실행 상태·미완료 경계는 [Cloudflare 실행 기록](GENERAL_SECURITY_CLOUDFLARE_EXECUTION_20261024.md)을 따릅니다. 아래 Vercel/Node 개발 이력과 검증 결과만으로 Cloudflare 운영 완료를 선언하지 않습니다.

> Watchtower-Track: security
> 갱신: 2026-10-24 KST
> 구현 기준: `1fce280a039d7d7ec5192ce2f5ba7851fc7b6023` (착수 당시 원격 main과 일치 확인; 이후 main의 최신성을 주장하지 않음)
> 현재 작업: `codex/general-security-attack-e2e-20261024`; 공격 E2E 후 필수 CI·PR 병합 진행. 운영 DB 적용·수치 활성화는 HOLD입니다.

## 목표와 작업 배분

일반 security의 실제 미구현 경로를 닫습니다. 기본 작업 배분은 **구현 90 / 검증 10**입니다. 매 단계에서 실행 가능한 코드를 먼저 완성하고, 직접 consumer·실패 경계만 한 번 검증합니다. 필수 검증 후 새 Critical/High 문제나 명시된 완료 조건 미충족이 없으면 같은 검증을 반복하지 않습니다. 전체 재감사·음성 fixture 추가·새 verifier 작성만을 독립 진척으로 세지 않습니다.

기존 [OWASP 원장 #1529](https://github.com/gycha0109-beep/MyeongHa/issues/1529)의 미종료 항목을 범위로 고정했습니다. 직접 의존하는 사주 관측기, 보안 이벤트 emitter, 분석기, 복구 workflow만 조사했습니다. 세연의 Grant/Commit/Reveal 및 유료·공개 활성화 로드맵은 별도 소유 범위입니다.

완료 기준은 실제 구현, 직접 검증, 운영 적용을 각각 기록하는 것입니다. 현재 API·DB·인증 정책을 바꾸거나 운영을 활성화하려면 기존 개별 승인이 필요합니다. 수치 승인이 없는 상태에서 임의 제한값으로 공개 API 동작을 바꾸지 않습니다.

## 구현 순서와 종료 상태

| 순서 | 실제 산출물 / 완료 조건 | 현재 상태 |
|---|---|---|
| 1 | #1526·#1527 공용 로그 입력: JSON·JSONL·텍스트 수용, 여러 캡처 병합, 중복 제거, 수집창·조회 상한·보존 한계 기록 | **VERIFIED** — `collect-security-baseline.mjs`, 기존 A06 분석기 재사용 |
| 2 | #1527 보안 이벤트 집계: 401/403/429·5xx의 상태/route/method 분포, 합성 트래픽 제외, 식별자·원문 미출력 | **VERIFIED** — `analyze-security-event-baseline.mjs`; 실제 emitter 및 CLI consumer 직접 검사 |
| 3 | #1526 사주 API admission: 승인된 수치와 보존 정책 → 기존 PostgreSQL 후보 계약의 명령·runtime gate → 429/503·Retry-After 연결 | **개발 구현 VERIFIED / 운영 HOLD** — migration, 실제 PostgreSQL port, 계산·Preview handler, Production composition 연결 완료. PostgreSQL 17.11 격리 검사 PASS. 운영 정책 등록·활성화는 별도 승인 |
| 4 | #1527 경보: 실제 분포와 한계 → alert/no-alert 결정 → 필요 시 지원 provider 경로로 적용 | **후보 설정·실행 경로 VERIFIED / 운영 HOLD** — 공식 schema v3의 API 4xx native anomaly 후보 및 기존 실행기에 별도 승인 guard 연결. 개별 status 임계값 대신 4xx 전체 provider 기준선을 쓰는 후보. 기존 5xx provider 현재 상태는 미재조회 |
| 5 | #1536 고정 digest 사용 후 복구 성공 증거 연결 | **VERIFIED (기존 실행 재확인)** — 아래 실행 근거. 재훈련 구현/dispatch 불필요; GitHub 이슈 자체는 여전히 OPEN |
| 6 | #425 플랫폼 default ACL 후속 | **BLOCKED_EXTERNAL** — 플랫폼 소유 권한 변경은 이번 범위에 없음; 현재 노출 유무를 새로 실DB 감사한 상태도 아님 |

3번은 [기존 admission 후보 계약](../operations/SAJU_ABUSE_ADMISSION_POLICY_CANDIDATE_V1.md)을 따릅니다. 이 계약의 `NOT APPROVED`, 제한·window·정리 보존 미결정을 새 로드맵이 대신 승인하지 않습니다. 사용자가 [DB 구현 범위](SECURITY_PROTECTED_IMPLEMENTATION_PROPOSAL_20261024.md)에 **“DB 구현·격리 검증 승인”**으로 답해 해당 개발을 완료했습니다. 이번 승인에는 운영 DB 적용·수치 활성화·배포가 포함되지 않습니다.

## 실제 차단·경보 구현 (2026-10-24 후속)

- `saju-abuse-admission-http.ts`와 두 실제 HTTP handler/Production composition에 서버 전용 admission 입력을 연결했습니다. 신원 transport 검사 이후, Subject/Birth 조회·Preview 본문 읽기·외부 호출 이전에 실행합니다. 허용은 기존 경로로 진행하고 초과는 429+Retry-After, 저장소 오류·모순 응답은 503, 현재 credential 부재는 401입니다. 기존 관측기와 바깥 security emitter가 결과를 기록하며 admission 재시도·메모리 fallback은 없습니다.
- 숫자는 요청이나 application config에서 받지 않습니다. 승인 정책 registry의 version/hash/window/limit/정리 보존을 같은 DB admission 결과에 결속합니다. 신규 migration은 정책을 한 건도 seed하지 않습니다. Production 구성 함수의 서버 전용 `sajuAbuseAdmissionEnabled: true`가 실제 PostgreSQL port를 생성하며 기본 호출은 비활성입니다. 운영 mount·환경변수·traffic는 변경하지 않았습니다.
- Guest transport verifier가 만드는 hash만으로는 활성 session이 증명되지 않습니다. DB 명령이 기존 lifecycle 조건으로 Member/Guest 유효성을 확인한 뒤 counter를 만듭니다. 등록되지 않거나 만료·소비·claim된 Guest는 counter 없이 빈 결과를 반환하고 HTTP는 401로 끝납니다. 원본 Member UUID·Guest hash는 SQL 인자로만 사용하고 bucket에 저장하지 않습니다.
- [`20261024065948_saju_abuse_admission_runtime_authority.sql`](../../supabase/proposals/20261024065948_saju_abuse_admission_runtime_authority.sql): Supabase CLI로 생성한 SQL을 기존 proposal 경로에 보관합니다. `supabase/migrations/`에 넣으면 main 병합으로 운영 DB 자동 배포가 시작되므로, 개발·격리 승인 경계를 지키기 위해 자동 적용 대상에서 제외했습니다. 운영 승격은 별도 승인입니다. Subject/Guest RLS 선행 조건, dedicated NOLOGIN/NOBYPASSRLS owner, empty search_path, 강제 RLS, 표 직접 접근 차단, API executor 단일 함수 실행권한을 적용합니다. 정책 내용은 변경 불가이며 새 version이 필요합니다. 버전별 HMAC bucket을 원자 upsert하고 초과 count를 saturation에 고정합니다.
- PostgreSQL port는 BEGIN → 제한 role → 명령 → 결과 검증 → COMMIT을 수행합니다. reset과 `evaluatedAt`을 같은 DB 시계에 결속해 API 서버의 독립 시계로 판단하지 않습니다. 검증 실패·명령 실패·commit 오류는 rollback하며 자동 재시도하지 않습니다. rollback 실패 시 connection을 폐기합니다.
- 만료 counter는 승인된 retention 이후 요청당 최대 8개를 SKIP LOCKED로 정리합니다. 이는 bounded opportunistic cleanup이며, 무트래픽 상황의 엄격한 삭제 시한이나 운영 cleanup schedule을 보장하지 않습니다. 해당 운영 보존·스케줄 결정은 운영 적용 승인에 남깁니다.
- 4xx 후보 설정은 `statusGroup:4xx AND route:/api/*`, 단일 기존 project, high severity, team-owner notifications입니다. [`vercel alerts rules`](https://vercel.com/docs/cli/alerts) 및 실제 `vercel@59.19.1 alerts rules schema --type built-in` 응답의 schema v3 `error_anomaly_filter`가 4xx/5xx를 지원함을 확인했습니다. 임의 fixed threshold는 없습니다. 401/403/429 외의 API 4xx도 포함되므로 개별 status detector로 표현하지 않습니다.
- 기존 `ensure-vercel-security-alert-rule.mjs`를 재사용합니다. 기존 5xx 정본 외의 규칙은 파일·project·filter가 정확히 묶인 decision을 요구하며 `APPROVED`와 운영 변경 승인 두 조건이 없으면 activate를 provider 호출 전에 거부합니다. 기존 5xx 실행 경로는 유지합니다.

4xx 후보의 읽기 전용 확인 명령(기존 dedicated token을 안전하게 제공한 실행 환경에서 사용):

```powershell
node scripts/operations/ensure-vercel-security-alert-rule.mjs preflight config/security/vercel-production-4xx-error-anomaly-rule-candidate-v1.json config/security/production-security-alerting-v1.json config/security/production-4xx-security-alert-decision-candidate-v1.json
```

provider schema 조회는 성공했습니다. 이 후보의 activate 명령은 미승인 decision으로 실행해 `SECURITY_ALERT_RULE_NOT_AUTHORIZED` / exit 1로 provider 호출 전에 차단됨을 확인했습니다. 외부 provider에 접근하는 rules preflight·규칙 생성은 실행하지 않았습니다. 후보 `policyAuthority=NOT_APPROVED`, `productionMutationAuthorized=false`입니다.

## 이번 구현

- 기존 A06 파서를 공용 transport parser에 연결해 JSONL export가 누락되던 입력 경로를 처리했습니다. admission보다 이른 outcome은 거부합니다.
- A09 emitter의 status/code/severity/OWASP 결속을 검증하고, route별 중복과 Node 송출 실패 이벤트를 구분해 집계합니다. 성공 요청이 없는 스트림이므로 오류율·요청률을 계산하지 않습니다.
- 캡처 CLI는 기존 합성 제외 원장을 항상 사용하고, 선택한 추가 제외 파일을 합칩니다. 모든 제외 항목은 기존 A06 계약으로 검증합니다.
- 수집창 밖 이벤트·상충 중복·잘못된 입력은 거부합니다. JSON 오류에 원문을 붙이지 않습니다. 결과는 집계와 수집 한계만 포함하며 `requestId`, `clientKey`, 입력 경로·부가 payload를 내보내지 않습니다.
- 출력 파일은 새 파일로만 생성합니다. 기존 결과를 덮어쓰지 않습니다. 입력은 파일당 32 MiB, 전체 64 MiB, 최대 64개로 제한합니다. 이는 로컬 분석기 자원 상한이며 서비스 admission 정책과 무관합니다.

## 실행 방법

로그 export와 다음 manifest를 같은 로컬 디렉터리에 둡니다. 파일 경로는 manifest 기준입니다. 각 capture는 두 emitter prefix를 포함할 수 있습니다. 조회창은 UTC `[from, to)`입니다. `recordCount`/`recordLimit`/`retentionLimited`는 실제 provider 응답에 근거해 입력합니다.

```json
{
  "schemaVersion": "myeongha-security-baseline-capture-input-v1",
  "captures": [
    {
      "file": "runtime.jsonl",
      "from": "2026-10-23T19:50:00.000Z",
      "to": "2026-10-23T19:53:00.000Z",
      "recordCount": 17,
      "recordLimit": 100,
      "retentionLimited": false
    }
  ]
}
```

```powershell
npm run security:baseline -- C:\local-evidence\capture.json --output C:\local-evidence\report-001.json
```

`additionalSyntheticFile`은 기존 `myeongha-saju-abuse-synthetic-exclusions-v1` 형식의 추가 제외 파일 경로입니다. 선택적 `burstWindowSeconds`는 분석 window만 지정하며 운영 제한값을 정하지 않습니다. manifest·로그 원문은 저장소에 커밋하지 않습니다. 도구는 네트워크 호출, 스케줄 등록, 운영 DB 저장을 수행하지 않습니다. 원문 export의 보존 권한·정책은 별도로 확보해야 합니다.

조회창이 연속이어도 provider 전달·필터·보존의 완전성을 증명하지 못하므로 `completePopulationProven=false`를 유지합니다. 미등록 smoke가 섞일 수 있어 제외되지 않은 트래픽을 곧바로 organic으로 판정하지 않습니다. 출력의 SHA-256은 분석에 전달된 UTF-8 텍스트 기준입니다.

## 실제 조회 및 복구 근거

[집계 결과](../operations/SECURITY_BASELINE_CAPTURE_20261024.json): Vercel Production deployment `dpl_5tQMn4NnTgWZxF17eDuVwY3K7ZHf`, provider 응답창 **2026-10-23 19:50–19:53 UTC (10월 24일 04:50–04:53 KST)**. 17개 이벤트에서 사주 admission/outcome 7쌍(계산 2, preview 5; 모두 HTTP 200), 보안 503 이벤트 3건을 집계했습니다. 401/403/429 표본은 없습니다. 7건은 최근 수동 smoke 여부가 미분류이므로 organic baseline으로 승인하지 않습니다. 앞선 30분 exact-window 조회는 timeout이었고, deployment로 좁힌 3분 조회만 성공했습니다. 이 조회가 전체 트래픽이나 현재 시각까지의 운영 상태를 보장하지 않습니다.

#1536의 오래된 “post-pin drill 미실행” 기록은 [복구 run 39114107262](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39114107262)로 해소됐습니다. 2026-10-18 실행 SHA `2d73b41500b6e6f3eb74ac358252602d0da686a7`, backup run `39067271230`, 고정 image digest `sha256:b3bfedb107413abb3b8cb0d0874b0414a1dceb3d55bc0c778de6ad22d1f7dc86` 사용을 로그에서 재확인했습니다. 복원·합성 개인정보 정합성·evidence envelope 단계가 성공했습니다. 실제 Production privacy ledger replay는 SKIPPED이므로 전체 DR/현재 migration frontier/개인정보 복원 완료를 선언하지 않습니다. 이슈 댓글·상태는 변경하지 않았습니다.

## 검증 및 구조 영향

검증 명령과 결과는 이 작업의 최종 로컬 상태에서 아래 범위로 고정합니다.

```powershell
node node_modules/vitest/vitest.mjs run test/security-baseline-capture.test.mjs test/saju-abuse-baseline-analysis.test.mjs test/saju-abuse-baseline-snapshot.test.mjs test/security-observability.test.ts
node scripts/verify-saju-abuse-admission-policy-candidate.mjs
node scripts/verify-security-observability-governance.mjs
node scripts/verify-production-security-alerting-governance.mjs
```

초기 직접 검사: 10 files / 90 tests PASS. `tsc -p tsconfig.build.json` PASS, 직접 governance 3개 및 migration version 유일성 PASS. [초기 격리 실행 기록](SAJU_ABUSE_ADMISSION_IMPLEMENTATION_EVIDENCE_20261024.json)은 SQL을 proposal로 옮기기 전 과거 snapshot입니다. 현재 공격 검사와 소스 digest는 [공격 E2E 근거](SECURITY_ATTACK_E2E_EVIDENCE_20261024.json)에 기록합니다.

PostgreSQL 17.11의 fresh loopback DB에서 실제 migration/adapter/두 HTTP handler를 실행했습니다. Member·Guest×두 route 정상 200, 동시 12건 중 허용 3/거부 9, saturation/reset/route 분리/정리 상한, 무효 Guest 무저장, 정책 내용 불변·새 version fresh bucket, rollback, 제한 LOGIN 및 anon/authenticated/service_role 우회 차단, 실제 Production composition의 네 경우 429·upstream 0회를 확인했습니다. 수치는 합성 정책 fixture에만 존재합니다. hosted Auth와 외부 Saju는 mock이며 Production E2E가 아닙니다. `supabase db advisors --type security --level warn --fail-on error`도 동일 격리 DB에서 No issues found / exit 0입니다.

재현은 fresh PostgreSQL 17의 전용 loopback DB와 `npm run build` 이후 다음 명령으로 수행합니다. script는 remote host·일반 DB 이름·비-17 runtime을 거부합니다. 기존 DB에 반복 실행하거나 운영 URL을 넣지 않습니다.

```powershell
$env:MYEONGHA_SAJU_ADMISSION_TEST_DATABASE_URL = 'postgresql://postgres@127.0.0.1:57624/myeongha_saju_admission_isolated_test'
node scripts/verify-saju-abuse-admission-postgres.mjs
```

추가 공격 E2E는 실제 loopback HTTP 서버·fetch·제한 LOGIN·PostgreSQL 17을 연결합니다. 84건을 송신해 Member·Guest × 두 route 각각 동시 12건 중 3건 허용/9건 429, 위조·미등록·만료·소비·claim Guest 무저장, 헤더·본문·query·path·method 우회 거부, 정책 부재·실행권한 회수 시 503과 upstream 0회, 관측 기록의 원본 credential·Subject ID 미포함을 확인합니다. 계산 API의 비어 있지 않은 본문은 기존 계약대로 400이며 Preview는 admission을 먼저 수행합니다. hosted Auth와 성공 Saju 응답은 mock입니다. 검사 준비 코드의 기존 캐시 헤더·본문 거부·Auth header casing 가정을 수정한 후 전체 fresh DB 재실행으로 PASS를 확인했습니다.

이 검사를 기존 PostgreSQL 17 CI case에 등록하고 proposal·adapter·직접 consumer가 변경되면 해당 suite로 라우팅합니다. CI는 서비스의 격리 case DB에만 실행하도록 별도 guard를 사용하며 무작위 일회용 LOGIN 비밀번호를 메모리에서 생성합니다. 운영 DB·provider 정책 활성화는 실행하지 않습니다. 사용자의 후속 “공격 E2E까지 … 통과하면 병합” 지시에 따라 필수 CI 후 정상 PR 병합을 수행합니다.

구조 영향: 이벤트 정본은 기존 runtime emitter, A06 분석 정본은 기존 analyzer, 합성 제외 정본은 기존 원장입니다. application gate는 기존 canonical HMAC과 기존 Subject/Guest lifecycle 조건을 재사용합니다. admission 수치 정본은 신규 DB 정책 registry 하나이며 application에 별도 정책·메모리 fallback·중복 key 정규화는 없습니다. DB command signature, port result 및 HTTP consumer는 version/hash/DB evaluation time을 공유합니다. 신규 migration과 두 표·전용 role·최소권한 RLS를 추가했습니다. 새 package 의존성·공개 설정·운영 mount 활성화는 없습니다. 4xx는 기존 alert 실행기에 연결된 별도 승인 후보이며 기존 5xx 정책을 덮어쓰지 않습니다.

## 다음 단일 작업

승인된 개발 구현과 공격 E2E는 VERIFIED입니다. PR 병합은 별도 후속 지시로 승인됐으며 필수 CI 통과 조건으로 진행합니다. 다음 운영 작업은 #1526 제한·정리 보존과 #1527 4xx alert/no-alert 정책을 확정해 SQL 승격·배포·활성화 패킷을 검토하는 것입니다. 병합을 운영 활성화·DEPLOYED로 간주하지 않습니다. #425는 외부 플랫폼 후속입니다.
