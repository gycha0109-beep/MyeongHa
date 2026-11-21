# 여울 Claude 집필 → DeepSeek 명리 해설 실험 (2026-11-21)

- 목적: DeepSeek 단독 6장 해설서의 캐릭터 소실 문제에 대해 집필과 명리 감수를 분리한다.
- 입력: Saju 합성 여성 명식 A, 동일 출처 32개(원국 7/연운 5/월운 18/대운 계산상 기간 2). 공식 발급·판매 금지.
- 1단계: OpenRouter `anthropic/claude-sonnet-4.6` 실제 집필, 6장 5,352자, 비용 `$0.125796`. 독서 경험과 여울 음성 기준을 사용하되 사건 예언 금지.
- 2단계: OpenRouter `deepseek/deepseek-v4.1-flash-1017` 명리 근거 해설·오류 검토. 최초 응답은 length 종료로 불완전 `$0.003646828`; 두 번째 완료 `$0.00623462`, 6개 장 17개 검토 항목. 저장 오류는 API 원응답에서 복구하여 추가 결제 없이 완료.
- 전체 확인된 API 비용: `$0.135677448`.
- 감수 지적: 1~4·6장에서 일부 근거보다 강한 대인관계/경력 단정; 5장에서 절입 전후 설명 및 보조 신호 과장 가능성. 모두 수정 전이며 상품 검수 통과 아님.
- 파일: 사용자 PC `Documents/MyeongHa-Yeoul-Reading-Results-20261121/case-a-claude-deepseek.final.html` / `.md` / 호출별 private JSON. 소스 코드에 원문·API 키·개인정보 미포함.
- 스크립트: `yeoul-claude-deepseek-research.mjs`(2단계 API), `recover-yeoul-deepseek-review.mjs`(확인된 실제 원응답 복구), `render-yeoul-two-model-reading.mjs`(Claude 본문 보존+DeepSeek 검토 펼치기).
- 검증: 스크립트 구문 검사, 기존 연구 입력 계약 테스트 7건 통과, 장 6개·감수 6개·HTML 생성 성공. DeepSeek 감수 의견은 자동 수정하지 않음.
- 다음 실험 시에는 17건을 근거에 맞게 국소 수정하고 여울의 실제 캐릭터 몰입감을 별도 평가해야 한다. 사용자 승인 없는 추가 유료 호출은 진행하지 않는다.

## 2026-11-21 — 실험 결과의 채택 여부

- Claude 집필 → DeepSeek 감수는 비교 실험으로만 보존한다. 사용자는 비용 대비 체감 품질 향상이 부족하다고 판단해 기존 DeepSeek 단일 호출 방식으로 돌아가기로 결정했다.
- 후속 개선은 기존 단일 호출 프롬프트 안에서 진행하며 Claude 추가 호출이나 다단계 생성 경로를 기본 방식으로 사용하지 않는다.
