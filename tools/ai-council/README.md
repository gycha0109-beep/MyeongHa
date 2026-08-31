# MyeongHa AI Council MVP

## 1. 설치

```powershell
cd .\myeongha-ai-council-mvp
npm install
Copy-Item .env.example .env
notepad .env
```

`.env`의 `OPENAI_API_KEY`에 API 키를 입력합니다. `.env`는 커밋하지 않습니다.

## 2. 로컬 회의실 실행

```powershell
npm run start:room
```

브라우저에서 `http://127.0.0.1:3000`을 엽니다.

기본 회의는 World, Revenue, Engineering이 2개 라운드 동안 검토한 뒤 Integration이 정리합니다. **Round 1 specialist는 서로의 같은 라운드 출력을 보지 않고 독립적으로 최초 입장을 생성합니다.** 상호 발언 검토는 Round 2에서만 시작합니다. Round 2의 전문 Agent는 반드시 `ACCEPT / OBJECT / DELTA` 형식으로 실제 입장 변화를 작성합니다. Integration은 transcript에 존재하는 실제 주장만 사용하며, 근거 Agent와 Round를 표시합니다. 각 Agent의 발언은 SSE로 완료되는 즉시 화면에 표시됩니다.

Production Integration 호출에는 semantic evolution gate가 적용됩니다. 현재 CONFLICT는 Round 2가 존재하는 Agent의 최신 R2 stance만 현재 근거로 사용할 수 있고, superseded R1을 현재 충돌로 재활성화할 수 없습니다. 또한 회의 주제와 실제 transcript에 없는 정확한 기간·quota·threshold·가격·횟수·비율을 새로 확정하면 fail-closed 처리합니다. Round 1 isolation과 Integration semantic 검증은 production fetch gate에서 적용되며, `integration-semantic-runtime-gate.mjs`와 `integration-semantic-evolution.mjs`가 runtime 검증의 source of truth입니다.

`웹 검색 허용`을 켜면 각 Agent의 Responses API 호출에 `web_search` 도구를 함께 전달합니다. 검색 호출은 추가 비용과 지연이 발생할 수 있으므로 회의별로 끌 수 있습니다.

## 3. 비용 제한

- `COUNCIL_WORLD_MAX_OUTPUT_TOKENS`: World 1회 출력 상한 (기본 800)
- `COUNCIL_REVENUE_MAX_OUTPUT_TOKENS`: Revenue 1회 출력 상한 (기본 800)
- `COUNCIL_ENGINEERING_MAX_OUTPUT_TOKENS`: Engineering 1회 출력 상한 (기본 900)
- `COUNCIL_INTEGRATION_MAX_OUTPUT_TOKENS`: Integration 1회 출력 상한 (기본 3000)
- `COUNCIL_DOGFOOD_INTEGRATION_MAX_OUTPUT_TOKENS`: Dogfood Integration-only retry 상한 (기본 5000, 최소 4000)
- `COUNCIL_MAX_CONTEXT_CHARS`: transcript context 상한 (기본 24000)
- `COUNCIL_SPECIALIST_REASONING_EFFORT`: World/Revenue/Engineering reasoning 강도 (기본 `minimal`)
- `COUNCIL_INTEGRATION_REASONING_EFFORT`: Integration reasoning 강도 (기본 `low`)
- `COUNCIL_*_MODEL`: Agent별 모델
- 화면에서 호출할 Agent만 선택
- 현재 기본 모델은 `gpt-5-mini`

기존 `COUNCIL_MAX_OUTPUT_TOKENS`가 이미 설정되어 있으면 호환을 위해 specialist Agent에 적용됩니다. Integration은 완결된 8-section 출력을 위해 별도 `COUNCIL_INTEGRATION_MAX_OUTPUT_TOKENS`를 사용하며, 양의 값이 없으면 wrapper 기본값 3000을 사용합니다.

## 4. 회의 품질 테스트

프로토콜과 production semantic runtime gate 검증은 API 비용 없이 실행합니다.

```powershell
npm test
```

저장된 live 결과의 replay와 증거 상태는 API 호출 없이 확인할 수 있습니다.

```powershell
npm run test:quality:replay
npm run test:quality:status
```

`test:quality:status`는 `CURRENT_FRESH_PASS`, `REPLAYABLE_STALE_PASS`, `HISTORICAL_PASS_SOURCE_LOST` 등 case별 evidence state를 구분합니다. runtime fingerprint가 달라졌다고 해서 과거 live 결과를 자동으로 현재 generation coverage로 승격하지 않습니다.

실제 모델 generation이 꼭 필요한 경우에만 targeted live test를 실행합니다. 각 case의 정상 full live는 7 API calls이며, specialist 6개가 성공한 뒤 Integration만 실패한 경우 full rerun 대신 Integration retry를 사용합니다.

```powershell
npm run test:quality:live:a
npm run test:quality:live:b
npm run test:quality:retry-integration:a
npm run test:quality:retry-integration:b
```

## 5. 첫 Product Dogfood

첫 실전 Council case는 `무료 첫 Saju/Reading 가치 vs 유료 structured artifact` 경계입니다. 품질 test fixture와 별도로 기록하며, 정확한 가격/quota나 `SRC-18`/`SRC-21` commerce authority를 새로 발명하지 않습니다.

기본 명령은 **dry-run**이며 API를 호출하지 않고 실제 회의 주제와 최대 호출 수만 확인합니다.

```powershell
npm run dogfood:reading-boundary
```

실제 Council을 실행할 때만 아래 명령을 사용합니다. 정상 완료 시 World/Revenue/Engineering R1 3회 + R2 3회 + Integration 1회, 최대 7 calls입니다. 웹 검색은 꺼져 있습니다. 새 recording에는 `roundOneIsolation=true`가 저장됩니다.

```powershell
npm run dogfood:reading-boundary:live
```

실행 결과는 Git에서 제외된 `test/.recordings/dogfood/reading-boundary.latest.json`에 저장됩니다. 실패하더라도 자동 재실행하지 말고 저장된 specialist output을 먼저 검토합니다.

specialist 6개가 성공하고 Integration만 실패했다면 full dogfood를 다시 실행하지 않습니다. 아래 명령은 기존 6개를 재사용하고 Integration만 1회 새로 요청합니다. 첫 3000-token Integration이 `max_output_tokens`로 잘린 경우를 위해 기본 5000 tokens를 사용합니다.

```powershell
npm run dogfood:reading-boundary:retry-integration
```

retry는 accepted call 수와 실제 API attempt를 분리해 기록합니다. 예를 들어 최초 run에서 7 attempts 후 Integration이 실패하고 retry가 성공하면 `calls=7`, `source_api_attempts=7`, `retry_api_attempts=1`, `total_api_attempts=8`입니다. retry가 다시 실패해도 자동 재실행하지 않습니다.

저장된 dogfood 결과는 추가 API 호출 없이 현재 validator로 다시 검증할 수 있습니다.

```powershell
npm run dogfood:reading-boundary:review
```

이 review는 Round 2 protocol, Integration grounding, semantic evolution을 다시 검사하고 Integration 결과만 재출력합니다. 또한 recording의 `roundOneIsolation`을 확인합니다. isolation 도입 이전 결과처럼 필드가 없거나 false이면 validator가 PASS여도 `LEGACY_ANCHORED_R1_NOT_ADOPTABLE`로 표시하며 제품 정책 증거로 승격하지 않습니다.

## 6. Discord / n8n

`bridge.mjs`와 `n8n-phase1-world.json`은 선택형 Discord 어댑터 초안입니다. 로컬 회의실 MVP가 검증된 뒤 Discord를 입력·출력 채널로 붙이고, n8n은 GitHub 기록·예약 실행·외부 자동화에 사용합니다.
