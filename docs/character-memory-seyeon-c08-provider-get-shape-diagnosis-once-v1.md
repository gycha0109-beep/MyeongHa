# C08 §7.3-6 — 첫 실제 Provider GET의 구조 불일치 원인 진단

Watchtower-Track: character-memory

## 확인된 사실

- PR #2530은 보호된 `main`에 병합됐다. [기존 실조회 #39998680318](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39998680318)에서 공식 OpenRouter GET **4/4 모두 HTTP 200**, 단 `completeMetadataRead=false`. **gpt-oss-120b, Qwen3.5-Flash, Gemini 3.1 Flash Lite**는 모두 검증 가능한 exact Provider tag **0건**이다.
- 최초 워크플로의 [sanitized artifact #12521460977](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39998680318)에는 status와 최종 HOLD만 들어 있다. HTTP 200은 JSON `data`의 올바른 schema, 모델 ID 또는 ZDR Provider 자격 증명이 아니다.
- 기존 first-run guard에 따라 기존 `seyeon-c08-provider-metadata-readonly-once-v1.yml`의 동일 실행을 **재시도하지 않는다**.

## 다음 1회성 원인 진단

- 새 `seyeon-c08-provider-get-shape-diagnostic-once-v1.yml`: GitHub 앱의 수동 workflow dispatch 부재를 우회하기 위해 **보호된 main에 고정 마커를 첫 추가하는 push**만 허용. 실행자가 GitHub history 첫 run, SHA, event, attempt 1, commit diff의 marker `added`를 검사한 뒤에만 API 키 사용.
- 공식 `GET /api/v1/endpoints/zdr` 1회 + 모델별 공식 `GET /api/v1/models/:author/:slug/endpoints` 3회. **0 paid inference POST, 0 retries, 0 fallback**.
- 응답 본문을 저장하지 않고 다음만 기록:
  - HTTP status 및 `data`가 array/object/null 중 무엇인지
  - `data.id`가 요청 모델 ID와 **정확히** 일치하는지
  - `data.endpoints`가 배열인지와 엔드포인트 개수
  - ZDR 모델별 row 개수, exact tag 교집합 개수, 양쪽 active+`response_format` 교집합 개수
  - 구조 검증과 별개로 `paidDispatchAuthorized=false`
- CLI 증거 파일: GitHub Actions sanitized `report.json`, 14일. 원문 대화/비공개 데이터/API 키/전체 upstream JSON 저장 금지.

## 실패·후속 조치

- 진단 결과 `completeMetadataRead=false`이면 CI는 정직하게 RED/HOLD. 이는 **문제 재현 및 분류 자료**이지 추론 실패나 운영 장애의 증거가 아니다.
- `data`가 예상 schema와 다르면 공식 응답 형태에 맞춰 offline parser를 **Fail-Closed로만** 수리한다. 모델별 정확한 tag와 ZDR/JSON 지원·단가에 대한 부족한 근거를 채우기 전에는 어떤 후보도 eligible로 승격하지 않는다.
- **모델 유료 실험 사전 승인**은 유효하되, 최초 실제 유료 호출 직전 사용자에게 모델·Provider tag·최대 6회·턴당 목표 10원/전체 20원 및 하드 청구 한도와 실패 정책을 '다음에 할 것'로 먼저 보고한다. 데이터 미확인 시 호출 0.
- C07 Gold, Canon, Census, ACL, Reader/Production, Memory/Grants, 기존 인보이스와 Guard는 변경하지 않는다.
