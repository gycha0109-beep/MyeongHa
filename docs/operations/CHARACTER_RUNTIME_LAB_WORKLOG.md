# 캐릭터 런타임 언어 A/B 실험 트랙 WORKLOG

- Track: `character-runtime-lab`
- 작업 기준: `docs/character-runtime-lab/taegyeom-language-ab-v1.md` (기존 승인된 12문항 × 2반복 × 3조건 × 2모델, 총 144회)
- 권한 경계: 운영 사용자 대화·기억·관계 상태를 읽거나 쓰지 않으며, OpenRouter 제공자 변경·모델 대체·fallback을 금지한다. 제공자 보고 비용 상한 USD 0.20과 데이터 보안 설정을 유지한다.

## 2026-11-08 — 최신 main 언어 A/B 실행 RED, 첫 호출 진단 복구

- **실제 실패 근거:** [GitHub Actions #42412622575](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42412622575), attempt 1, `main` `a699f532158da7369496b20fcb57a20d56f61dc2`, `[WT:character-runtime-lab] 태겸 GLM vs Luna 언어 비교 144회`. `Run isolated two-model synthetic experiment` 단계에서 `{"status":"HOLD","failure":"LANGUAGE_AB_OPAQUE_FAILURE","attempted":1,"completed":0,"costUsd":0}` 및 종료 코드 1. 첫 요청 외부 호출이 실패했으나 기존 코드가 알 수 없는 예외를 일괄 `OPAQUE_FAILURE`로 변환해 네트워크/TLS/DNS/API 응답 형식 중 실제 원인을 구분할 정보가 없었다. 제공자 보고 비용 0은 외부 청구 0의 증거가 아님. `OPENROUTER_API_KEY` 존재 검사는 통과했으나 유효한 모델·공급자 응답은 입증되지 않았다.
- **최신 재실행 대조:** 동일 SHA의 일반 [CI #42412622590](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42412622590), [Governance #42412622583](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42412622583), [Web Browser Smoke #42412622591](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42412622591)는 SUCCESS이나 **별도 A/B 실행 실패를 가리지 못함**. 위 A/B workflow의 추가 실행/재시도 성공은 이 수정 시점까지 확인되지 않았으므로 성공을 추정하지 않는다.
- **수정 파일:** `scripts/run-taegyeom-language-model-ab-v1.mjs` (첫 외부 fetch 예외를 승인된 에러 코드로 분류, JSON 응답 파싱 실패도 별도로 HOLD 처리), `scripts/operations/classify-taegyeom-language-transport-failure.mjs` (신규; DNS/연결/TLS/타임아웃 코드를 비밀정보 없이 구분), `scripts/operations/classify-taegyeom-language-transport-failure.cases.mjs` (신규; 오류 분류·민감문자열 비노출 회귀 테스트), `.github/workflows/character-runtime-taegyeom-language-ab-v1.yml` (기존 실험 전에 회귀 테스트 실행), 본 기존 트랙 WORKLOG 신설. 승인된 두 모델 ID, 실험 문항/반복/변형, 144회 제한, JSON schema, ZDR·fallback 금지, 비용상한은 수정하지 않음.
- **코드 커밋:** 분류기 `c9aee5c9eb41ed61828c87595d4e154450ab0e78`, 회귀검사 `f55583e3cd626c45fe7e19b08416a7d88d5b118c`, 실행 코드 `05c58caffd2f047256e72e56f271515fb9efc81f`, 기존 workflow 테스트 연결 `aed561be98aa56b9a59feb6b52d4fc4249fe28b2`.
- **검증:** 수정 브랜치에서 실제 두 신규 파일을 내려받아 Node.js 내장 테스트 **3/3 PASS**. 이 값은 오류 분류 로직에 한정하며 외부 모델 호출과 144회 실험 완수를 보장하지 않는다. 현재 변경 브랜치의 GitHub Actions 최종 CI 및 수정 코드의 실제 A/B 재실행 결과는 확인 전까지 **미판정**.
- **미완료·다음 작업:** 해당 브랜치 PR에서 기존 CI·Governance와 필수 통합 검증 성공 후 병합한 `main`으로 `workflow_dispatch`를 한 번 재시도한다. 정상 완료 시 144개 답변·제공자 비용·출력·보안 플래그를 증거로 검증한다. 새 실행도 HOLD이면 코드에 남은 **구체적 안전 진단 코드**를 기준으로 공급자 인증/모델 존재/네트워크 오류를 다음 단위로 수정한다. 허용된 모델이나 데이터 보안 조건 변경이 필요하면 사용자에게 승인 보고하고 변경 전 중단한다.
- **승인·블로커:** 현재 진단 코드 변경에는 승인 불필요. 생산 사용자 데이터나 비밀값에 접근하지 않으며 모델 대체·신규 유료 서비스 리소스 변경을 수행하지 않는다. 실험 최종 완료는 선언하지 않는다.

Watchtower-Track: character-runtime-lab
