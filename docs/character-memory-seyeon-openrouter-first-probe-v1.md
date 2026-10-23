# OpenRouter 저가 모델 인증·잔액·구조화 출력 첫 단발 실측 (2026-10-20)

Watchtower-Track: character-memory

사용자가 GitHub Actions production 환경에 OPENROUTER_API_KEY를 등록했다고 설명했고, **충전하지 않은 상태지만 실제 요청을 보내보라고 승인**했다. 이번 요청은 공개 합성 N01 «안녕, 세연아!»의 통합 사전분류 **단 1회**, 모델 openai/gpt-oss-20b이다.

- 선행 PR #2366은 기본 CI/전체 통합 검사 성공 후 main 병합(commit 30aeef27bc59a8044db203abdba3ef0a3df84c31).
- 1회만 main marker push로 발동, 불변 github.sha checkout, workflow 이력 total_count 1과 attempt 1 확인, 반복 실행 금지.
- 실제 호출 전 fsync 비용 예약 $0.01 (2500KRW/USD로 25원). 기존 예산 예약액 $0.806554과 누적 합산 최대 약 2041.385원으로 승인된 5000원 이내. 실제 청구액은 별도 확인 전까지 NULL이며 공급자 하드캡 적용 보증 아님.
- 안전 가드: output token 1024, 요청 본문 24576 bytes 이하, 30초 timeout, no retry, no fallbacks, privacy provider ZDR/deny, require_parameters, JSON Schema strict. GPT-OSS 20B 공급자 중 지원 조합이 없다면 4xx HOLD.
- 1회 HTTP 402는 CREDIT_REQUIRED HOLD, 401 또는 다른 오류는 HTTP_FAILURE, 사용량 불명이면 USAGE_UNKNOWN, 분류 실패면 안전 HOLD. 어느 경우에도 추가 호출이나 키 대체 금지.
- journal/report에는 상태, 모델, stage, 숫자 토큰·지연시간·선예약 비용만 남긴다. 사용자/모델 원문이나 실제 Private/Canon/DB/Memory/Grant 접근 0, 운영 라우팅 교체 0, G0~G6 또는 Publication 승격 0.
- 이번 성공 시에도 세연의 실제 대화 응답이나 3-call E2E가 검증된 것이 아니다. 차후 잔액/품질을 별도로 검증한다.
