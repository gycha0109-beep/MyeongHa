# C08-V — 6슬롯 단발성 모의 실행·비용 원장·재실행 차단

Watchtower-Track: character-memory

## 경계

- 이번 구현은 유료 워크플로가 아니라 **신규 수동/단발성 무료 모의 실험**입니다. 전용 OpenAI Secret, 실모델 POST, Production DB, 개인기록, G0~G6 및 서비스 라우팅을 건드리지 않습니다.
- C08-T 정책의 A01 / H01 / C02_mixed-admin-private_01 × Original/Compact, 6개 슬롯과 요청당 3,277 microUSD, 첫 배치 19,662 microUSD 예약을 그대로 사용합니다. 약 49.155원은 보수적 산식이며 실제 청구액이 아닙니다.
- 사용자가 추가 누적 5,000원은 이미 승인했으며, 이번 무료 단계에서 승인을 다시 요구하지 않습니다.

## 실제 구현

- 수동 GitHub Actions 워크플로는 첫 workflow_dispatch 1회, main 브랜치, 정확한 최신 SHA, GITHUB_RUN_ATTEMPT=1만 인정합니다. GitHub Actions의 총 실행 이력을 신뢰 가능한 조회로 검증하고, 이력 부재·조회 실패·rerun·2번째 요청이면 무조건 거부합니다.
- 고정 Gold를 입력받는 **모의 Provider**만 허용합니다. 예약 → 파일 원장 기록 → 모의 응답 → 사용량 검증 → 원장 기록 → Gold 비교를 순차 처리합니다. 원장 기록 실패, 출력/입력 토큰 초과, 응답 불명, 점수 불일치가 생기면 다음 슬롯을 막습니다.
- 저장/로그에는 슬롯 ID, 예약·추정 비용 및 차단 사유만 둡니다. 원문 질문·모의 분류 내용·비밀키는 포함하지 않습니다. 로컬 실행 원장은 최초 생성만 허용하고 소유자 전용 0600 파일로 기록하며 Artifact로 공개하지 않습니다.
- 기존 C07 사용 완료 워크플로와 운영 환경변수 OPENAI_API_KEY/OPENAI_API_KEY2 및 Vercel 설정에는 접근하지 않습니다.

## 테스트와 남은 검증

- 테스트는 여섯 슬롯의 순서·원장 선행 기록·사용량 오류·GitHub 재실행·Gold 불일치·실패 시 다음 모의 호출 0건을 점검합니다. **Mock의 정답 출력은 평가용 합성값이며 실모델 품질 증거가 아닙니다.**
- 이 단계 이후에도 과거 11회 인보이스, 신규 평가 Project의 현재 월 사용액, 전용 키의 실제 프로젝트 귀속, USD 1 강제 하드캡 독립 확인은 미완료입니다. C08-U의 MODEL_GET_ACCESSIBLE는 이 항목을 증명하지 않습니다.
- 실제 유료 요청은 여전히 0건입니다. paidDispatchEnabled=false, G0~G6 HOLD, 실모델 관측 6/72 유지입니다.
- 유료 첫 배치 실행에는 별도의 Reviewed PR, 공급자 지출 제한 증거, 실행 간에도 유지되는 선예약·중복 호출 방지 원장, 실제 토큰/Body 상한, 실패·네트워크 불명 시 재시도 없는 최종 차단이 추가로 필요합니다. 본 C08-V 결과를 그 승인으로 전환할 수 없습니다.

## 기술 검증

npx vitest run test/seyeon-cost-c08v-offline-once-pilot-v1.test.mjs test/seyeon-cost-c08t-owner-budget-pilot-v1.test.mjs

CI/Governance/Full Integration의 정확 HEAD 증거 및 Squash 병합 후 main 검사가 성공해야 기술적 완료로 판정합니다.
