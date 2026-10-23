# C08 §7.3-6 — Protected main에서 단 한 번만 실행되는 Provider GET 조회

Watchtower-Track: character-memory

## 목적 및 이전 블로커 해소

#2516에서 `seyeon-c08-provider-metadata-readonly-once-v1.yml`와 GET-only 검증기/정제된 결과 산출기를 main에 반영했으나, 연결된 GitHub 앱에 `workflow_dispatch` 쓰기 액션이 없어 실행이 막혀 있었다. 본 변경은 사용자가 계속 지시한 무료 제공업체 실조회만 진행하기 위해 **기존 조회 워크플로의 보호된 main 마커 파일 첫 추가에 한정한 push 트리거**를 추가한다. 모델 유료 POST와 Production 런타임은 그대로 불허.

## 실행 조건

- Work Track: `character-memory`; branch: `main`; 파일: `.github/seyeon-c08-provider-metadata-readonly-once.trigger`가 **main commit에서 처음 `added`** 된 경우만.
- 기존 수동 `workflow_dispatch`도 유지하나 `expected_head_sha == github.sha` 필수. Push는 `github.sha`를 같은 실행 SHA 환경변수로 주입.
- 실제 공개 GET 수행 직전 실행기가 **GitHub 해당 워크플로의 전체 첫 실행 목록(total_count===1)**, 정확한 run ID·attempt 1·main SHA·event, Push 때는 실제 commit 파일 diff의 마커 `status=added`를 검사한다. 이전 수동 실행이 하나라도 있거나, 재실행/중복/다른 파일 Push/마커 수정이면 **유료·무료 외부 추론뿐 아니라 Provider GET 전에도 HOLD**.
- 워크플로: read-only contents/actions 권한, 기존 `production` environment의 secret 사용, `npm ci --ignore-scripts` 및 두 오프라인 Vitest 확인 후에만 네 공식 OpenRouter metadata GET(1 ZDR + gpt-oss-120b/Qwen3.5-Flash/Gemini 3.1 Flash Lite 각각 1). 모델 `POST /chat/completions` **0회**. 자동 retry와 fallback 0.
- 결과 `report.json`에는 공개 model ID/provider tag/광고 단가와 미입증 Boolean만 존재. GitHub Actions artifact 14일 보관. API 키·사용자 대화·결제 데이터·전체 upstream 본문은 기록하지 않는다. 실패하면 LIVE GET이 없을 수 있고, 일부 GET가 실패하면 `completeMetadataRead=false`로 표시한다.
- trigger commit이 main에 병합됐다는 사실은 워크플로가 **실제 실행·성공했다는 뜻이 아니다**. 푸시 이벤트와 해당 Actions run 및 artifact를 별도로 확인해야 한다. 일부 모형의 endpoint GET가 404여도 실패는 HOLD로 정직하게 기록한다.

## 유료 실험 전 보류 조건

#2523, #2525, #2527의 N06 쌍대(최대 6회) 실험 계약·요청 wire 계측·GET artifact 기반 재견적은 유지. 실제 실험은 GET 결과에서 **동일 model/provider tag**가 확인되고, 계정 잔액/과거 청구·strict JSON·request-level ZDR+data_collection deny·턴별 hard billing cap이 확인될 때까지 호출 금지. 태그 `openai`는 테스트용 가정이므로 실조회에서 확인되지 않으면 **기존 wire 바이트를 다른 태그에 재사용하지 않는다**. Provider가 다르면 정확한 태그로 새 오프라인 wire 계측부터 진행한다.

유료 실험 사전 승인은 이미 있으며, 최초 실제 유료 호출 직전에는 모델·Provider·정확 호출수·전체 예약 한도·보호 조건을 **'다음에 할 것'에 보고한 다음** 실행한다. 이번 PR은 무료 metadata GET만 자동 실행하도록 경로를 준비하며, API inference나 비용 지출을 포함하지 않는다.
