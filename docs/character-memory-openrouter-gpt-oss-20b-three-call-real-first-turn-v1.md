# 세연 공개 첫 인사 GPT-OSS 20B 전체 3회 실측 (2026-10-20)

Watchtower-Track: character-memory

사용자가 "계속 진행"을 승인함에 따라 OpenRouter `OPENROUTER_API_KEY`로 실제 대화 첫 인사 N01의 통합 사전분류 → 대화 해석·초안 생성 → 독립 의미 검증을 순서대로 수행한다.

## 과거 성공 증거와 이번 범위
- OpenRouter 첫 유료 가능 실측 Actions #39366717049는 HTTP 200, 인증·구조화 사전분류 PASS, 사용량 895 입력/273 출력, $0.000046 추정; 청구·무료 제공 크레딧 확인되지 않음.
- 이번은 공개 합성 문장 `안녕, 세연아!` 1건을 실제 GPT-OSS 20B로 **최대 3번** 호출하며 전체 실제 Domain/Guard를 적용한다. 개인/실사용자/비공개 memory/Canon/DB/인격 권한 호출 금지.
- 기존 Terra/Luna 3회 Shadow 실제 N01 기준: 9,698ms, 입력 7,873/출력 735 tokens, $0.022062 추정. 비교 표준이지만 표본 하나로 일반화하지 않는다.

## 승인된 추가 비용 한도
- 요청별 0.02 USD를 내구성 JSONL에 선예약하고 sync 한 후 전송. 총 0.06 USD = 150원(보수적 환율 2,500 KRW/USD), 최대 3 POST, 재시도·대체 공급자 0.
- 이전의 최대 예약 누적 `816,554 microUSD`를 포함한 최악의 누적 예약액은 **2,191.385원**, 승인 5,000원 이내. 실제 청구액은 별도이며 지출 하드캡 보증 불가.
- 각 요청은 24,576 byte 이하, 출력 1,536 tokens 이하, 30초 타임아웃; 요청 payload는 strict JSON Schema, ZDR/deny, require_parameters, no fallback.
- 이전 #39366717049 성공과 PR #2369 병합 증거를 읽기 전용 확인 후 **독립 단발 main push 트리거**; 단 1 실행, 1 attempt. 반복 실행/미승인 stage 불가.
- HTTP 401/402/5xx, 스키마 불일치, 사용량 미기록, 검증 거부 → 즉시 HOLD. 알 수 없는 금액은 0원으로 기록하지 않는다.

## 결과 처리
- 로그·artifact에는 토큰·시간·HTTP 상태·가드 코드·원화 환산 가능 단가, 출력 문자 길이·한국어 포함 플래그만 포함한다. 세연의 실제 생성문장 및 프롬프트, 비밀 키, 개인정보는 저장하지 않는다.
- 서버 자동 Guard PASS는 캐릭터 자연스러움, 다중 턴, 장기 기억 검증과 동등하지 않으며 `characterVoiceQualityVerified=false`, `productionPromotionPermitted=false` 유지.
- PR 기본 CI, Governance, Web, 전체 통합 검사까지 확인 후 병합하여 실행한다.
