# character-memory · N06 재승인 실모델 품질 비교 · 2026-10-22

## 사용자 승인 및 기존 작업 중단
- 사용자가 직전 Terra 요청 길이 초과 수정의 CI GREEN 및 코드 병합을 확인한 후 "**승인. 진행**"이라고 명시적으로 허가했다.
- Reader 대화·메모리 기능 로드맵은 완료 PR #2460 이후 별도 중단 상태를 계속 유지한다. RR-03/04·RR-09/10·RR-11/12·G1·Production Read/Write 권한을 바꾸지 않는다.
- 기존 실모델 최초 실행 [#39751436405](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39751436405)은 FAILED. Luna 첫 호출만 HTTP 200, 사용량 기준 추정 $0.000447(실청구 미정산). Terra/GLM 각 0회였으며 Terra에서 18,789 > 15,680 UTF-8 bytes 사전 거부가 무료 재현에서 확인됐다.
- [수정 PR #2474](https://github.com/gycha0109-beep/MyeongHa/pull/2474)는 **전체 통합 CI 성공 및 main 병합 cc550c10104a888c39a50f4f11c2cadbbfc5ccdb**. 요청 상한 19,200 bytes, Terra 회당 보수적 예약 $0.057, 총 6회 추가 예약 **$0.194 또는 최대 485원(보수적 환율 상한 2,500원/USD)**.

## 새 일회성 승인 경계
- 기존 실패 실행을 다시 돌리거나 같은 트리거를 변경하지 않는다.
- **새 GitHub Actions workflow:** `seyeon-n06-sub500-second-one-shot-v1.yml`. 별도의 단일 트리거 `.github/seyeon-n06-sub500-second-one-shot-v1.trigger`를 main에 정확히 한 번 병합해서 실행한다.
- 실행 전 Github API에서 새 workflow의 push 실행 전체 기록이 정확히 현재 1개, attempt 1, 현재 main HEAD인지 검증한다. 동시에 이전 실패 실행 `39751436405`와 수정 PR `2474`의 ID·HEAD·상태를 고정 검증한다. 사본/재실행/다른 브랜치/다른 이벤트 모두 차단한다.
- N06 공개 합성 입력만 사용: `오늘은 네가 먼저 이야기해 줘.` Luna 1회(통합 preflight), Terra 2회(통합 해석+대사, 의미 독립검토) vs OpenRouter `z-ai/glm-5.3-flash` 3회(동일 단계). 요청마다 인자/모델/단계/크기/예약 원자 로그 fsync, 실패 재시도 없음.
- 비용 예약 상한 Luna $0.020 ×1 + Terra $0.057 ×2 + GLM $0.020 ×3 = $0.194 × 보수적 환율 2,500 = **485원 (<500원)**. 과거 Luna 예약 $0.020까지 고려한 전역 비용 경계 5,000원도 유지. 이전 실제 청구액은 미정산이므로 단정하지 않는다.
- 요청 byte 최대 19,200, 모델별 출력 cap 1,536 tokens; OpenRouter는 기존 ZDR/schema/funding 정확 일치 provider only/no fallback.
- 신규 무료 오프라인 입장 검사: 해당 N06의 실제 3+3 JSON 직렬화·정확 모델 순서·byte cap·출력/Canon guard 확인. 가짜 공개 합성 출력만 사용하고 **실제 provider 0회**. 실모델 응답 품질을 평가한 것처럼 간주하지 않는다.
- 숫자/비용/지연 시간 및 **양쪽 Guard가 모두 통과한 공개 합성 최종 대사만** 소유자 확인 로그에 출력. 한쪽이라도 실패하면 중간 원문/모델 응답 텍스트를 출력하지 않는다.

## 의도된 작업 순서
1. 새 실행 코드 PR을 열어 기본·Governance·Web 및 전체 통합 CI를 통과시킨다.
2. 무료 오프라인 3+3 바이트 및 Canon Guard 테스트를 통과한 뒤 새 트리거를 안전하게 CI 게이트 아래에 포함해 main에 병합한다.
3. 새 push 워크플로가 모델을 실제 호출하면 실행 로그와 수치 artifact를 보고 1:1 N06 대사를 비교한다. 실패 시 재시도 없이 모델 단계·비용·실패 원인을 명시한다.
4. N10/N21은 이번 승인 범위 밖이다. 별도 사용자 지시까지 유료 실험 추가 및 Product Promotion은 금지한다.
