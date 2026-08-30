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

기본 회의는 World, Revenue, Engineering이 앞선 발언을 읽고 2개 라운드 동안 서로 검토한 뒤 Integration이 정리합니다. 각 Agent의 발언은 SSE로 완료되는 즉시 화면에 표시됩니다.

`웹 검색 허용`을 켜면 각 Agent의 Responses API 호출에 `web_search` 도구를 함께 전달합니다. 검색 호출은 추가 비용과 지연이 발생할 수 있으므로 회의별로 끌 수 있습니다.

## 3. 비용 제한

- `COUNCIL_MAX_OUTPUT_TOKENS`: Agent 1회 출력 상한
- `COUNCIL_*_MODEL`: Agent별 모델
- 화면에서 호출할 Agent만 선택
- 현재 기본 모델은 `gpt-5-mini`

## 4. Discord / n8n

`bridge.mjs`와 `n8n-phase1-world.json`은 선택형 Discord 어댑터 초안입니다. 로컬 회의실 MVP가 검증된 뒤 Discord를 입력·출력 채널로 붙이고, n8n은 GitHub 기록·예약 실행·외부 자동화에 사용합니다.
