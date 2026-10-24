# C08 §7.3-5 실제 유료 N06 첫 모델 테스트 — 단일 POST Canary

Watchtower-Track: character-memory

## 사용자 승인 / 이번 실행 범위

사용자는 **유료 모델 실험을 사전 승인**하였고, 실제 호출 전에 다음 작업을 보고하도록 요청했다. 보고한 연구 범위는 N06 공개 합성 텍스트, gpt-oss-120b 후보, 합산 최대 6회, 각 턴 10원/전체 20원 예약 목표이다.

이번 PR은 전체 6회 실험이 아닌 **첫 유료 모델 POST 1회** 실측을 수행한다. 첫 호출이 strict JSON을 실제로 반환할 수 있는지, 응답 지연·HTTP 코드·사용량을 확인한다. 출력은 개인·운영·소스·캐릭터 정본으로 공개/저장되지 않는다. 이 단일 canary 성공을 기존 3회 Guard/Gold 동등성 또는 서비스 5초 목표 달성으로 간주하지 않는다.

## 실행 계약

- 모델: `openai/gpt-oss-120b`, 실제 tag는 실행 시 공식 OpenRouter `GET /endpoints/zdr` 안의 **해당 모델 + active + response_format + max_completion_tokens >= 256** 중 입력단가 ≤ $0.03/M, 출력단가 ≤ $0.17/M, request fee 0인 곳을 정확히 골라 `provider.only=[tag]`로 pin. 없으면 유료 POST **0회/HOLD**.
- 호출: **정확히 최대 1회** `POST /api/v1/chat/completions`; 공개 합성 N06 `오늘은 네가 먼저 이야기해 줘.`만 전송. `response_format.json_schema.strict=true`, `max_completion_tokens=256`, `zdr=true`, `data_collection=deny`, `allow_fallbacks=false`, `require_parameters=true`, 가격 단가 제한. auto retry 없음.
- 사전 GET: `/api/v1/key`, `/api/v1/credits`, `/api/v1/endpoints/zdr` 3개. 계정 잔액/키 제한 부족, ZDR tag 없음, JSON 파라미터 미지원이면 유료 POST 0회.
- 최대 요청 body 4,096 UTF-8바이트, 예약 계산 `ceil(bodyBytes × inputRate + 256 × outputRate)` microUSD. 1회 예약 목표 **≤4,000 microUSD = 10원(보수적 환율 2,500)**. 호출 전 **fsync 완료된 예약 원장**을 남기고 나서만 POST. 실패나 사용량 미제공도 재실행·fallback·다른 모델 이동 금지.
- 실행권한: main 브랜치의 새 `.github/seyeon-c08-n06-paid-canary-once.trigger` 파일을 처음 추가한 보호된 병합에서만 시작. GitHub 첫-run/attempt/SHA/정확한 marker diff 검증. CI와 PR만으로는 실행되지 않음.
- 결과: 실제 HTTP, 지연(ms), 토큰, 추정 원가, strict JSON 1회 확인 여부, 예약 원장만 14일 아티팩트로 보관. API 키/전체 출력 내용/개인정보/비공개 데이터는 출력하지 않는다. `paidCalls=0`이면 왜 실행하지 못했는지 이유만 보고한다.

## 한계 / 다음

- ZDR 목록은 실제 요청이 반드시 해당 Provider에서 처리됐다는 독립 감사나 invoice hard cap 증거가 아니다. Local reserve는 요청 수·입출력 상한 **연구용 예약 차단**이며 공급자 실제 청구액의 결제 하드캡이 아니다. 청구액 미정산은 그대로 별도 표시한다.
- strict JSON 1회 PASS는 **전체 독립 semantic review, Census, Gold, 페르소나 및 guard E2E**의 증거가 아니다. 본 실행의 최대 POST 1회는 사전 승인된 총 최대 6회 안에 포함하고 남은 호출을 임의로 실행하지 않는다.
- 성공 시 실제 지연·토큰·구조와 청구 정보를 확인한 후 기존 3회 baseline vs compact `C08 §7.3` 평가로 확장. 실패 시 즉시 중지하고 결과에 기반한 정확한 한 가지 차단 원인만 수리한다.

**운영 라우팅/DB/ACL/Canon/Gold/Memory/Grants/Source는 변경하지 않는다.**
