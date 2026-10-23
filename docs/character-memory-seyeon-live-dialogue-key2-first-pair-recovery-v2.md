# 세연 KEY2 대화 E2E 단발 복구 v2 (2026-10-19)

Watchtower-Track: character-memory

최초 실제 대화 E2E #39225780485는 npm ci, 테스트, build 성공 후 자바스크립트 모듈 로딩 시 **SyntaxError: Identifier 'purpose' has already been declared**로 중단됐습니다. 이전 실행에서는 모델 Provider 호출 이전 파싱 실패로 호출 0회, 선예약 0건, Artifact 0개입니다.

본 수정은 평가 Wrapper 내 동일 scope 중복 선언만 수정하고, 실제 호출 전 Node `--check`를 수행합니다. 기존 합성 `N01` 사용자 첫 인사, 기존 5회/후보 3회, `OPENAI_API_KEY2`, 최대 8호출, 건당 0.08 USD 예약/총 0.64 USD=보수적으로 1600원, 무재시도, 무개인정보, numeric-only 기록, 고정 GitHub SHA 검증은 동일합니다.

독립 새 workflow는 이전 failed run SHA/attempt을 확인하고 오직 새 workflow 첫 push 1회만 인정합니다. 이전 workflow는 재호출하지 않습니다. 고정 Gold·Production routing·Canon·Memory·DB·ACL·G0~G6 변경은 없습니다. 비용 추정은 청구서가 아니며 신규 E2E 품질 전체 검증이 아닙니다.
