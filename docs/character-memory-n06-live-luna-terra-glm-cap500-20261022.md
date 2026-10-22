# character-memory — 기존 Reader 로드맵 일시 중단, 실모델 N06 품질 쌍대 비교

## 재개 위치(로드맵 유지, 미진행)
- 트랙명은 `character-memory`, 실행 범위는 Reader 대화·메모리 그대로 유지한다.
- 마지막 완료 코드: #2440(공식/일상 의도), #2444(동의 Memory 출처), #2447(최신 Answer/Anchor), #2451(보안 신호·도메인), #2455(Guard Renderer 연결), #2460(15 synthetic 시나리오, 11 테스트 PASS) 병합.
- RR-03/04 Writer·Anchor, RR-09/10 원자 Commit/철회, RR-11/12 HTTP/UI, 긍정적인 개인 기억 G1 Pin 및 보안/Production 승인은 여전히 해당 소유자 HOLD.
- 추가 로드맵 구현은 사용자 지시 시점까지 중단한다.

## 이번 실험 유일 승인·제약
- 사용자 지시: **Luna 1 + Terra 2 vs GLM 3 품질 비교를 진행하되 이번 추가 비용은 500원 미만일 때만 실행**.
- 기존 원본의 N06/N10/N21 세 케이스 총 18개 요청 예약 상한은 $0.54 × 2,500원/USD = **1,350원**, 범위 초과. 이번 실행은 **N06 단일 케이스 6회**만 승인 가능.
- N06 고정 발화: `오늘은 네가 먼저 이야기해 줘.` (공개 합성 / initiative).
- Candidate: `gpt-5.6-luna` 1회 `unified_preflight_shadow`; `gpt-5.6-terra` 2회 `turn_interpret_render_shadow`, `semantic_review`.
- Benchmark: `z-ai/glm-5.3-flash` 3회, 같은 stage 및 합성 Census/Canon/Guard. OpenRouter의 ZDR/JSON Schema/잔액 사전검사를 그대로 사용한다.
- 기존 단위 예약: Luna $0.02 ×1 + Terra $0.05 ×2 + GLM $0.02 ×3 = **$0.18 = 450원(보수적 환율 상한 2,500원/USD 적용)**. 500원보다 작다.
- 요청 크기는 15,680 bytes 이하, 출력 cap 1,536 tokens. 실제 모델 호출 전 route별 예약을 강제하고 총 6회/정확한 stage/중복 금지. 누락/실패에는 호출 재시도 없음.
- 별도 workflow `seyeon-terra-glm-quality-cap500-v1.yml`는 정해진 **한 번의 main 트리거**만 허용한다. 이미 실행한 원본 one-shot/retry 이력은 변경하지 않는다. 실행 이력 2건 이상·re-run·잘못된 branch/event/commit은 admit 이전 HOLD.
- 이전에 예약한 $0.976554는 실청구액이 아니며, 프로젝트 예산 5,000원에 대한 누적 예약 상한도 유지한다. 과거 실청구 미확인 상태를 0원이라고 가정하지 않는다.

## 검사 및 판정
1. 기본 PR CI: 비용/중복/모델 단계/비밀자료 차단의 무료 계약 테스트. **모델 품질 검증이라고 주장하지 않는다.**
2. 실험 workflow: N06 후보 3회 실제 요청 완료 → GLM 3회 실제 요청 완료 → 공개 합성의 Guard 허용 최종 문장 **두 개가 모두 확보된 경우에만** 사람 품질 비교 단계로 진행한다. 실패 시 숫자와 고정 분류 진단만 출력하고 불완전 대사 공개 금지.
3. 기록: 요청/응답 토큰, 모델별 지연, 추정 비용, 예약 상한, 실제 기록된 OpenRouter usage delta, 실패 phase, 전체 Output Guard 성공여부. 공급자 invoice 완전 대조는 별도이므로 `actualProviderInvoiceReconciled:false`.
4. 사용자에게 실제 양측 발화를 그대로 제시하고 initiative·자연스러움·캐릭터성·질문 강요 여부를 비교한다. 합성 테스트 GREEN과 구분한다.
5. `N10`/ `N21`의 유료 쌍대 비교 및 실유저/Production 연결은 이번 승인 범위 바깥. 이전 3쌍 전체 PASS 표기 금지.

**금지:** 실제 사용자 DB/기억·승인 출처 모델 주입, 공개 Chat 라우팅 변경, 복구 재시도, 본 실험을 이용한 추가 모델 요청·배포, 다른 트랙 CI 대기.
