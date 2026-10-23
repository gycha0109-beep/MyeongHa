# C08 §7.3-6 — 대체 Provider 메타데이터 GET 1회 실측 경로 (무과금)

Watchtower-Track: character-memory

## 배경

병합 완료된 C08 #2512 광고 단가 산식과 #2516 양쪽 Provider 메타데이터 교차검사만으로는 **현재 OpenRouter 계정이 실제 볼 수 있는 ZDR·JSON 제공 경로**를 확인했다고 주장할 수 없다. 따라서 이 PR은 키를 사용할 수 있는 GitHub의 **수동 1회성 GET 전용 증거 수집**을 추가한다. 원본 C07 Gold, Canon, Integrity/Disclosure, Consent/Grants, ACL, Census, 3-call Shadow, Runtime Guard, Production은 변경하지 않는다.

## 실제 구현

- `.github/workflows/seyeon-c08-provider-metadata-readonly-once-v1.yml`: main 브랜치의 사용자가 입력한 **정확한 40자리 commit SHA**와 `github.sha`가 일치하는 첫 `workflow_dispatch` 시도만 허용. 재실행, 브랜치 오인, SHA 불일치 거부. 기존 production environment에서 허용된 OpenRouter 키를 **읽기 전용**으로 사용하나 Secrets, Deploy, Cloudflare, DB, 모델 API 호출·운영 트래픽 변경 없음.
- `scripts/seyeon-c08-provider-metadata-readonly-once-v1.mjs`: GitHub의 해당 workflow `total_count===1`, 현재 run ID·SHA·브랜치·이벤트·attempt 1을 확인 **한 뒤** `inspectSeyeonC08ProviderMetadataReadOnlyV1`을 호출. OpenRouter `GET /api/v1/endpoints/zdr` 및 gpt-oss-120b / Qwen3.5-Flash / Gemini 3.1 Flash Lite **모델별 3 GET**만 실행하고 리트라이하지 않는다.
- 산출: Runner 임시 디렉터리에 모의 사용자가 아닌 **공개 모델·provider tag·표시가격·읽기 상태·HOLD 플래그만** 기록한 `report.json` 생성. key, 원문 대화, 사용자 프로필, 비공개 데이터, 임의 provider 응답 본문은 포함하지 않는다. 오류 발생 시 PASS가 아닌 HOLD.
- `test/seyeon-c08-provider-metadata-readonly-once-v1.test.mjs`: 이전 사용/수동 재실행·불일치 SHA/브랜치 차단, 청구권한 불승격, output allowlist, 자격 정보 출력 차단, workflow 트리거 정적 검사.

## 실행/승격 구분

이 PR 자체는 수동 워크플로의 **정의 및 오프라인 테스트**만 실행한다. 새로운 모델 inference 요청 **0회**, 메타데이터 live GET **0회(정의만)**. 수동 워크플로는 기본 빌드·CI·PR에서 자동 시작되지 않으므로 main 병합 후 사용자가 명시적으로 실행하거나 해당 범위를 별도 진행해야 실제 증거가 나온다.

하나의 GET 완료로 **strict JSON schema 런타임 결과, request-level ZDR 및 data_collection=deny, 최종 실청구/턴 하드캡, Guarded E2E 5초, C07 Gold/Canon 동등성, 유료 실험 승인**을 대체할 수 없다. 후속 유료 비교는 별도 사용자 승인 전까지 HOLD.
