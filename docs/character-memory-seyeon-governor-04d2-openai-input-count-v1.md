# PR-04D2 — 공식 OpenAI Responses 입력 토큰 계산 포트 (기본 비활성)

Watchtower-Track: character-memory

## 구현

- `createSeyeonOpenAiInputTokenCountAdmissionV1`은 서버 소유 API 키/모델/PR-04A 정책을 가진 **명시적 opt-in 함수**다.
- Provider는 모델 요청을 **1회 직렬화**한다. 같은 JSON 바이트가 입력 계측 포트와 실제 모델 `fetch`에 전달된다. 토큰 포트는 이 값과 서버가 계측한 바이트 수가 일치하지 않으면 실패한다.
- 오직 공식 `POST https://api.openai.com/v1/responses/input_tokens`에 `model`, `instructions`, `input`, `text`를 제출한다. 응답에서 `object=response.input_tokens`와 양의 정수 `input_tokens`를 요구하고, 서버 승인된 양의 `reservedHeadroomTokens`를 더한다.
- 모델 호출에 존재하는 추가 비계측/미지원 필드, 특히 Vercel Gateway의 `providerOptions`, 모델 변경, JSON Schema 누락, 출력 상한 불일치, 바이트 수 불일치, 계측 실패, 악성 응답, 토큰 초과는 **DB 예약/모델 생성 전 fail-closed**된다.
- 원래 `beforeDispatch` 메타데이터 hook에는 본문을 노출하지 않는다. 계측 포트 내부로만 최종 요청 본문을 전달하고 DB/원장/로그에는 개인정보, 프롬프트, API 키를 전달하지 않는다.
- 계산기 전용 모의 HTTP, 모델 생성 모의 HTTP, 모의 DB로 순서 `count → reserve → generate → settle` 및 오류 시 모델 호출 0건을 검증한다.

## 인증 및 운영 경계

공식 입력 계산 API는 요청 구조의 역할·JSON Schema 등 프레이밍 토큰을 포함하는 값을 반환한다. 다만 본 구현은 **정확한 텍스트+JSON Schema 형태의 네이티브 OpenAI Responses 요청만** 지원한다. 실제 운영의 모델/엔드포인트 호환성 및 계측 API 요금·속도 제한·계측 응답 정합성을 별도 확인해야 한다.

이 포트는 실제 네트워크 계측을 수행하는 코드이나 **이번 PR은 Production 생성 시 어떤 인스턴스에도 설정하지 않는다.** 유료 또는 실시간 API 요청은 테스트 중 발생하지 않는다. 운영에서 계측 API를 사용하려면 별도 승인과 호출 비용 정책·지연/타임아웃 설계가 필요하다.

- `max_output_tokens`는 PR-04A 정책에서 강제되며 숨은 reasoning/formatting 토큰을 포함하는 Provider 상한이다.
- token_count 결과는 서버 정책의 **입력 상한** 및 DB 예산을 승인하기 위한 것이지 공급자 청구서와 같다는 주장 아님.
- `reservedHeadroomTokens`를 1 이상 명시해야 한다. 미승인 모델·Vercel Gateway에는 대체 추정치를 사용하지 않는다.
- PR-04D3에서 모든 Production 생성 경로의 Governor 강제, 원가 장부 레거시 우회 봉쇄 전까지 ENFORCE HOLD.
- PR-04D4 독립 세션 경합/삭제 복구, D5 운영 승인/계측 비용 감시까지 Production ENFORCE HOLD.

## 종료 조건

A. 동일 생성 요청 본문에서 공식 계산 payload 투영 및 상한 검증: Mock CI.
B. 계산 실패/거부/기한 초과/모델 불일치 → 예약 0건/생성 0건: Mock CI.
C. 모든 Production 연결 및 운영 가격/요금 검증: **HOLD**.

## 공식 계약

- https://developers.openai.com/api/docs/guides/token-counting
- https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count
