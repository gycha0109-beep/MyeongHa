# 세연 Cost Governor PR-04D1 — 원가 신뢰성과 운영 우회 감사

Watchtower-Track: character-memory

## 범위 및 안전 상태

- 본 변경은 **기존 PR-04C의 opt-in governed 경로**만 강화한다. Governor가 설정되지 않은 기존 경로와 과거 비용 장부는 그대로 둔다.
- Production ENFORCE 플래그 활성화, API 키 설정, 실제 유료 모델 호출, 운영 데이터 수정은 하지 않는다.
- 여기서 검증하는 금액은 공급자 청구서가 아니라, DB에 고정된 단가와 사용량으로 계산한 추정 microUSD이다. 청구서 대조는 PR-04D5에서 별도 수행한다.

## 실제 코드 경로 확인 (2026-10-10 기준)

| 경로 | 확인된 진입점 | 현재 경계 | D3 후속 |
|---|---|---|---|
| Production Chat HTTP → turn-send | `apps/api/src/production-seyeon-turn-send-runtime-v1.ts` → `createProductionSeyeonChatRuntimeV1` | 서버가 ProviderConfig/역할별 ProviderConfig를 주입한다. Cost Governor 설정 연결은 없음 | 요청별 모든 4개 역할을 서버 정책으로 강제 결속 |
| Chat 사전분류·해석·렌더·검토 | `apps/api/src/production-seyeon-chat-runtime-v1.ts` → `meterRole` | Native ProviderConfig에 대해서만 `createPersistingSeyeonAiProviderV1` 사용. `costGovernorForRole`은 선택적 | Provider 포트 주입 및 누락 설정을 ENFORCE에서 거부 |
| Post-turn Worker | `apps/api/src/production-seyeon-post-turn-worker-runtime-v1.ts` → `createPersistingSeyeonAiProviderV1` | `costGovernor` 선택적; 별도 Provider 주입 가능 | 서비스 구동 설정·외부 Worker 호출 경로 모두 강제 |
| Provider 외부 전송 | `apps/api/src/openai-seyeon-structured-provider-v1.ts` → `fetchImpl` | `beforeDispatch`가 있으나 직접 생성한 Provider는 계측이 강제되지 않음 | 신뢰된 서버 팩터리 밖의 직접 생성 금지 |
| Legacy 비용 호출 시작 | `apps/api/src/postgres-seyeon-ai-cost-ledger-v1.ts` → `cmd_start_seyeon_ai_call_v1` | API executor에 EXECUTE 권한이 남아 예산 승인 없는 시작 가능 | 모든 생산 호출 경로 전환 이후 일반 실행권 철회 |
| Legacy 단독 정산 | `cmd_settle_seyeon_ai_call_v1`, `cmd_record_seyeon_ai_call_cost_v1` | 이전 버전 호환용으로 존재, governed 정산을 우회할 위험 | governed 예약 호출의 레거시 단독 정산 거부·권한 재검토 |

위 표는 확인된 구현 진입점 감사 결과다. 저장소 전체의 모든 동적 Provider 호출 또는 운영 외부 서비스를 완전 증명한 것은 아니며, **D3에서는 모든 패키지의 Provider 생성/직접 HTTP 호출을 정적 검색과 런타임 테스트로 봉쇄해야 한다.**

## D1 구현된 정책 무결성

- PostgreSQL `seyeon_ai_governor_model_policies_v1`은 기존 정책 키/단가/허용목적/토큰 한도에 대한 UPDATE 및 DELETE를 거부한다. 운영자의 `is_active` 토글만 허용한다. 단가 변경은 **새 policyVersion/priceVersion으로 새 행을 생성**해야 한다.
- `cmd_governed_settle_seyeon_ai_call_v1`은 예약된 정책 버전과 모델/공급자/단가 버전을 DB에서 조회한다. 정산 도중 정책이 비활성화돼도 이전 예약 정산은 허용한다.
- `estimated`라면 필수 입력/캐시/출력 사용 토큰을 요구한다. **DB 비용 = 올림[(입력-캐시)×입력단가 + 캐시×캐시단가 + 출력×출력단가] / 1,000,000**. JSON 이벤트의 예상 비용과 한 microUSD라도 다르면 거부한다.
- Governor가 이미 승인된 단가를 갖고 있으므로 `price_unknown`을 허용하지 않는다. 모든 사용량이 있는 `usage_unknown`도 거부한다. 진짜 사용량 미확정/타임아웃은 기존과 같이 **예약액 전액 유지**한다.
- 원가 재검증과 기존 원장 정산 및 전역 카운터 변경은 한 트랜잭션이다. 거부 시 원장과 예산 모두 원상 유지.
- 정산 대상의 신원 결속 및 토큰 필드 기본 정합성은 기존 `cmd_settle_seyeon_ai_call_v1`도 계속 수행하며, legacy 호출과 과거 데이터는 손대지 않는다.

## 잔여 HOLD 및 종료 기준

- **D1 A**: DB 단가 불변성·가격/캐시 비율 위조·불완전 토큰/가격 상태 변조 차단: CI DB 회귀 증빙 필요
- **D1 B**: 기존 Production 진입점·역할 4개·Post-turn·레거시 RPC·직접 Provider 생성 감사 범위 문서화: 문서 완료, 전체 경로 정적 강제는 D3
- **PR-04D C (운영 ENFORCE)**: 신뢰된 토큰 upper bound(D2), 모든 유료 경로 강제 및 레거시 권한 차단(D3), 다중 DB 세션 경쟁/삭제·크래시 검증(D4), 운영 감시·승인(D5) 전까지 HOLD

### 다음 구현 순서

`D2 신뢰 토큰 계산` → `D3 런타임 강제 경로 및 DB 우회 차단` → `D4 독립 세션 경합/개인정보 삭제` → `D5 운영 준비·감시`. 활성화 승인은 코드 병합과 별개다.
