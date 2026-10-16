# 병렬 개발 트랙: PR 헤드 고정 · CI 재사용 프로토콜 (2026-10-16)

> 적용: MyeongHa의 모든 동시 작업 트랙. 새 계정/권한/운영 DB 변경 없음. 구현: `scripts/ci/request-integration.mjs`, `scripts/ci/integration-submission-state.mjs`, `scripts/ci/integration-candidate.mjs`.

## 장애 원인과 수정

이전 사주 브릿지 #2175에서 개발자가/자동화가 **통합 CI가 대기 중인 동안** 다른 트랙의 main 병합을 발견할 때마다 PR 브랜치를 갱신해 `head.sha`를 바꿨다. 통합 CI는 GitHub의 PR 라벨 이벤트에 결속한 **고정 head/base SHA**를 마지막에 재검증하므로, 전체 회귀 검사가 통과해도 `PR head changed; request a new candidate`로 실패했다. 다른 트랙이 `main`을 갱신한 것 자체는 실패 원인이 아니었다.

2026-10-16 확인한 [main-production-guard-v1 ruleset](https://github.com/gycha0109-beep/MyeongHa/rules/23850762)은 `strict_required_status_checks_policy=false`이며 기존 `CI Verify`, `Web PR Verify`, `Governance Verify`, `CI Integration Verify`(GitHub Actions App 15368)를 요구한다. 이 규칙 아래에서는 **main이 앞서갔다는 이유만으로 PR head를 갱신할 필요가 없다.**

## 실행 프로토콜 (필수)

1. 해당 PR의 **원하는 코드 작업을 모두 완료한 뒤** `head.sha`를 확정한다. 일반 CI·웹·거버넌스 등 기존 필수 검사를 통과한다.
2. **한 번만** `node scripts/ci/request-integration.mjs OWNER/REPO PR_NUMBER`로 PR-event 기반 통합 CI를 요청한다. 이 명령은 활성/성공한 **같은 head**의 실행을 발견하면 재요청·라벨 토글을 하지 않는다.
3. 요청 후부터 전체 CI 완료까지 **같은 PR head에 push, rebase, merge-main 커밋 또는 ref 갱신을 하지 않는다.** 봇/에이전트/다른 트랙에도 동일하다. 다른 트랙은 **각자의 브랜치**에서 계속 개발하고 main에 병합할 수 있다.
4. CI 대기 중 main이 이동해도 **아무 동작을 하지 않는다.** 후보는 제출 당시 head/base를 기준으로 격리된 합성 트리에서 전체 CI를 수행한다. `main moved` 알림은 그 자체로 실패/재시험 원인이 아니다.
5. 전체 CI에서 현재 고정 `head.sha`의 모든 11개 job이 성공하는지 확인한다. 마지막 head 일치 검증은 계속 유지하며, **head가 실제 변경된 경우에만** 실패로 처리한다.
6. 병합 직전에 최신 PR head·main SHA·GitHub **mergeable**·모든 필수 check의 App 바인딩/최신 결과를 다시 확인한다. main이 움직였더라도 head가 그대로고 충돌이 없으며 저장소 정책상 병합이 허용된다면 **재베이스 없이 병합할 수 있다**. GitHub merge API의 `expected_head_sha`를 사용한다. PR 본문/코드/권한/DB 경계가 바뀐 것은 main 이동과 달리 재검증 사유다.
7. **예외:** 병합 충돌, 프로덕션/DB/공유 라이브러리 등의 의존 변경으로 기존 합성 트리 증거가 충분하지 않은 경우, 현재 CI **완료 후에만** 브랜치를 최신 main에 갱신하고 새 head에서 전체 CI를 다시 요청한다. 자동 충돌 해결이나 보안 검사 우회는 금지한다. GitHub 보호 규칙이 `strict=true`로 변경되면 이 프로토콜을 적용하지 않고 새 정책에 맞게 별도 설계한다.

## 추가 동시 요청 경계 (2026-10-16 검증 후 보완)

라벨 추가와 GitHub Actions 실행이 목록 API에 표시되는 시점 사이에는 **비동기 색인 지연**이 있다. 두 세션이 거의 동시에 동일 PR을 요청할 경우, 첫 번째 세션이 라벨을 붙인 직후 두 번째 세션이 실행 목록을 조회하면 아직 빈 결과를 받을 수 있다. 이때 이미 붙어 있는 라벨을 자동으로 떼었다 다시 붙이면 새 `pull_request:labeled` 이벤트가 발생하고, **같은 헤드에서 전체 CI가 중복 시작**될 수 있다.

`request-integration.mjs`의 현재 계약:
- 같은 PR/head의 활성·성공 실행 발견 ⇒ no-op
- **현재 헤드 실행이 아직 목록에 없고 PR에 라벨이 이미 존재** ⇒ `LABEL_PRESENT_RUN_NOT_YET_INDEXED`로 **no-op**, 재라벨하지 않음
- 라벨 없고 실행 없음 ⇒ 한 번만 라벨 추가
- 같은 헤드의 최신 실행이 완료했으나 실패한 것이 명확 ⇒ 원인 확인 후 재요청 가능

실행이 계속 보이지 않는 오래된 라벨·새 HEAD로 변경됐는데 기존 라벨이 남아 있는 사례는 **자동 성공 처리하지 않고 별도 조사**한다. 보호 규칙이나 통합 검사 우회 없이, 정확한 PR/head·이벤트·실행 기록을 확인한 뒤 재제출한다. 마냥 재라벨하거나 시간만 보고 성공으로 간주하는 규칙은 없다.

이는 검증된 병합 결과와 별개로 **동시 제출 경쟁 창을 줄이는 운영 안전장치**다. 서버 측 원자적 예약이나 분산 락을 구현했다고 주장하지 않는다.

## 하지 말 것

- CI 상태가 `pending`/ `queued`/ `in_progress`인데 main SHA만 변경됐다는 이유로 HEAD를 갱신하지 않는다.
- 같은 head·PR에 대한 활성/성공한 통합 실행이 있는데 라벨을 재부착하여 중복 실행을 만들지 않는다.
- 이전 실패 실행의 성공한 자식 job만 따서 새 HEAD의 통합 SUCCESS라고 주장하지 않는다.
- `workflow_dispatch` 결과를 PR-event의 필수 `CI Integration Verify`로 간주하지 않는다.
- 브랜치 보호 규칙 변경, required check 삭제, App ID 변경, `strict=true` 정책 우회, merge-admin override, 실패한 DB 권한/ACL/RLS 검사 무시는 금지한다.

## 판정표

| 이벤트 | 다음 행동 |
| --- | --- |
| 다른 트랙이 main에 병합; 이 PR HEAD 고정 | **계속 대기**. 기존 CI 결과를 버리지 않음 |
| 동일 HEAD CI queued/running | **요청 no-op** |
| 동일 HEAD CI SUCCESS | **요청 no-op**; 병합 가능성과 필수 체크 최종 검사 |
| 동일 HEAD CI FAIL | 원인 분석; 새 HEAD가 불필요하면 **그대로 재요청** 가능 |
| 이 PR의 코드/HEAD 변경 | 앞선 CI 검증은 더 이상 현재 후보가 아님; 새 HEAD의 필수 검사와 통합 CI |
| main과 PR 충돌/영향력 있는 공유 계약 변경 | 전체 CI 완료 후 필요한 변경만 통합하고 **새 HEAD에서 재검증** |
| GitHub strict branch freshness 활성 | **중지**; 보호 정책과 배포/보안 기준 재설계 |

## 근거 및 한계

- `CI Integration Verify`는 동일 헤드의 새 커밋에 대해 재사용되지 않는다. HEAD 변경의 탐지는 제거하지 않는다.
- 합성 테스트 트리는 **제출 시의 고정 base + HEAD**이며, CI 완료 후 main이 달라졌다면 최신 main과의 정확한 결합 트리가 재검증됐다고 주장할 수는 없다. 충돌/공유 의존 영향 판정이 중요하며, 위험이 있으면 재검증한다.
- 일반 앱 CI, PostgreSQL 테스트, RLS/권한 계약, 결제, 사주 엔진 배포와 운영 DB 승인 경계는 그대로 유지한다.
- 이 운영 변경은 `CI_STAGED_VERIFICATION` 활성화나 기존 GitHub ruleset 변경을 요구하지 않는다.
