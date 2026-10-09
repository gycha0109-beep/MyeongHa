# 세연 Cost Governor 상태 전이 계약 v1 — 오프라인 후보

Watchtower-Track: character-memory

## 0. 비활성화 및 권한 경계
- 이 모듈은 순수 참조 상태 머신이다. **Production 라우팅·Provider 호출·DB·결제·이용권을 전혀 수정하지 않는다.**
- 순수 메모리 스냅샷은 동시 요청 보호 장치가 아니다. 실제 비용 차단은 반드시 Postgres 원자적 예약/정산 포트와 모든 모델 호출부 배선이 완성된 후에만 활성화할 수 있다.
- 예상 원가 계산/단가 버전은 별도 `seyeon-model-cost-accounting-v1` 계약에서 공급하며, 본 상태 머신은 **server-owned ceilingMicroUsd**만 입력받는다.
- 앱이나 사용자가 예산·Subject·예약 키·버킷·모델·요금을 선택할 권한은 없다. Commerce entitlement는 별도 authority.

## 1. 예약 식별과 일일 한도
- 예약 키는 Subject / Turn / Attempt / 호출 목적 / 호출 순번 단위로 서버에서 만든다. 동일 키 재수신 시 모델을 다시 호출하지 않고 `DUPLICATE`로 처리한다.
- UTC 일자별 Subject 예산 + 전체 서비스 예산을 동시에 검사한다. 수락 시 확정된 최대 비용을 예약하므로 병렬 호출의 총 견적 상한이 지출 한도를 넘지 않아야 한다.
- 예약은 모델 호출 **전에** 생성하고, Provider로 넘기기 **직전** `DISPATCHED` 전이를 영속적으로 기록한다. 잠금은 예약/상태 전이 트랜잭션에만 걸고 외부 AI 호출 동안 보유하지 않는다.
- 시스템 레벨 일일 전체 예산은 현재 사업 정책의 예시가 아니라 **추후 운영 소유자가 설정하는 필수 설정**이다. 무한 또는 임의의 기본값 금지.

## 2. 상태 전이 규칙

| 상태 | 이벤트 | 다음 상태 | 예산 점유 |
|---|---|---|---|
| 없음 | 충분한 예산 예약 | RESERVED | ceiling |
| RESERVED | 모델 전송 시작 기록 | DISPATCHED | ceiling |
| RESERVED | 전송되지 않았음을 증명 | RELEASED_UNSENT | 0 |
| DISPATCHED | 유효한 사용량과 계산된 원가 | SETTLED | 실제 추정원가 |
| DISPATCHED | 사용량 누락/타임아웃/청구 불확실 | HELD_UNKNOWN_USAGE | ceiling 유지 |
| DISPATCHED | 실제 원가가 예약 상한 초과 | OVER_CEILING | 실제 추정원가, 이상 경보 대상 |
| HELD_UNKNOWN_USAGE | 감사 증거 및 원가 확인 | SETTLED / OVER_CEILING | 실제 추정원가 |

- Provider로 보낸 호출은 사용량을 읽지 못했다는 이유로 무료 처리/예약 자동 환급을 하지 않는다.
- `DUPLICATE`, `DISPATCHED` 재전이, 정산 금액 변경은 새로운 유료 호출로 이어지지 않고 거부한다.
- `HELD_UNKNOWN_USAGE`의 추정 금액은 실제 청구액이 아니다. 별도의 청구 대조·감사 기록으로만 해제한다.
- 상한 초과는 막아야 하는 운영 사고다. 단순 상태 머신이 공급자 출력량을 제한하지 않으므로 **Provider 자체 max_output_tokens, 입력 토큰 상한, 재시도 제한을 반드시 추가**해야 한다.

## 2.1 옵트인 모델 출력 제한 (이 PR에 포함)
- `openai-seyeon-structured-provider-v1`에 `maxOutputTokens` 선택 설정을 추가한다. 유효 범위는 1~32,768 정수다.
- 명시적으로 설정한 경우에만 Responses payload에 `max_output_tokens`가 들어간다. 설정되지 않은 기존 Production 요청은 그대로 유지된다.
- `max_output_tokens`는 추론 토큰을 포함한 전체 출력 상한이다. 작은 값을 강제로 주면 기존 JSON 생성이 실패할 수 있어 기본 활성화하지 않는다.
- **입력 토큰 상한과 전체 예약의 원자적 실행은 아직 구현되지 않았다.** 출력 제한만으로 총 예산을 보장하지 못하므로 Governor 운영 활성화는 계속 보류한다.

## 3. 향후 DB 어댑터 선행 조건
1. DB authority/역할 소유자가 예약·정산 테이블 및 좁은 EXECUTE 전용 SECURITY DEFINER 계약을 승인한다. 임의 테이블 DML·RLS 권한 확대 금지.
2. 원자적 `admit` 트랜잭션 내 Subject·전역 예산을 함께 잠그거나 충돌 안전한 행/키로 예약한다. 두 요청이 동시에 잔여 한도를 통과하는 문제를 DB 경합 시험에서 재현·차단한다.
3. 기존 `chat_turns.client_turn_id` 재전송과 `chat_turn_attempts` 재시도 상태를 연결한다. 재시도 AI 호출마다 **새로운 예약 키**를 쓰고 기존 호출의 비용 기록은 보존한다.
4. `event_extraction` Post-turn Outbox 워커를 같은 비용 장부에 포함한다. 다른 사용자/다른 worker가 같은 outbox를 중복 결제하지 않아야 한다.
5. 비용 계산이 불명확하거나 정산 실패 시 새로운 유료 호출은 fail-closed하고, 사용자 채팅 이용권 차감과 API 실제 원가 기록을 별도로 처리한다.

## 4. 종료조건
A. 상태별 전이/중복 키/예산 소진/타임아웃/감사 증거/오버런 **오프라인 테스트 PASS**.
B. PostgreSQL 권한·원자성·동시성·복구·outbox 재처리 **별도 DB 검증 필요**.
C. 실제 Provider 예산 제한 및 Production 사용량 차단 **미구현**. 유료 평가 및 운영 활성화는 별도 승인.
