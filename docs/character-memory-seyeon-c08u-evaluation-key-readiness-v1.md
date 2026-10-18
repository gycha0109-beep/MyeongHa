# C08-U — 평가 전용 Secret의 무료 인증/모델 접근 점검

Watchtower-Track: character-memory

## 입력 및 완료 주장

- 사용자가 `MyeongHa-Evaluation`이라는 **분리된 OpenAI Project**에 월 USD 1 / Enforce a hard limit를 설정했다고 보고하였고, 해당 프로젝트용 키를 GitHub Actions Repository Secret `OPENAI_EVAL_API_KEY`에 등록했다고 보고하였다.
- 이 사용자 확인은 **실제 공급자 설정 조회나 청구원장 증거가 아니다**. 프로젝트 ID, 강제 차단 현재 상태, 월 누적 지출, 기존 11회의 실제 청구액을 `true` 또는 0으로 임의 확정하지 않는다.
- 이 단계는 **키 존재 및 요청 대상 모델의 metadata GET 접근 가능 여부만** 확인한다. 유료 평가 실행은 여전히 `HOLD`.

## 구현 범위

- `scripts/seyeon-cost-c08u-eval-project-key-readiness-v1.mjs`: C08-T에서 고정한 `gpt-5.6-luna` 모델의 **GET `https://api.openai.com/v1/models/gpt-5.6-luna`** 단일 요청만 시도. 유효한 메타데이터만 `MODEL_GET_ACCESSIBLE`이고 나머지는 `HOLD`. 키·원본 응답/헤더/오류 본문은 어디에도 출력하지 않으며 결과 JSON은 고정 판정어만 포함한다. 모델 접근 성공도 프로젝트 동일성, 하드캡, 청구액을 증명하지 않는다.
- `.github/workflows/seyeon-c08u-eval-project-key-readiness-v1.yml`: `main`에서 파일 변경시 push 1회 + 수동 `workflow_dispatch`로 동작. GitHub `OPENAI_EVAL_API_KEY` **하나만** 전달한다. 저장소 Secret-consumer Trust Boundary에 따라 `environment: production`을 선언하되 Production 호출·배포·DB 권한은 없다. `POST /v1/responses`·추론·실제 사용자 메시지·Production Secret/Environment·배포·권한 변경을 금지.
- `test/seyeon-cost-c08u-eval-project-key-readiness-v1.test.mjs`: 고정 URL/GET, 비밀 미유출, 유효하지 않은 키, 네트워크 실패/401/403/404/429, 응답 초과 크기, 모델 불일치, GitHub workflow의 유료 API 금지 회귀.

## 다음 경계

1. 정확한 PR HEAD의 Character Memory CI, Governance, PG17 Full Integration 성공 이후 병합한다.
2. `main`에 대한 **C08-U Read-only Workflow** 결과를 확인한다. 성공이면 새 Secret의 인증/모델 목록 접근만 확인된 것이다.
3. 공급자 사용량·기존 실청구 대조, 새 Project 전용 키 매핑과 월 USD 1 **Enforce hard limit** 증거, 이번 달 지출액, 5,000원 전체 신규 사용 상한을 별도로 확보한다. 인증 확인의 성공만으로 기존 `paidDispatchEnabled=false`를 해제하지 않는다.
4. 그 후 **별도 Reviewed PR**에서 3개 고위험 Gold × 2 variant 최대 6회 / 49.155원 가정 예약의 **단 한 번만 실행 가능한 유료 워크플로**를 준비한다. 리트라이/중복/타인 비용과 알 수 없는 결과는 중단해야 하며, Production G0~G6 권한은 건드리지 않는다.

> **프로젝트 강제 차단은 반영 지연 또는 초과 과금 가능성이 있어 완전한 결제 상한을 보장하지 않는다.** 실제 공급자측 USD 1 월 차단과 애플리케이션 예약 게이트의 이중 안전장치가 필요하다.
