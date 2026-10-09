# 세연 PR-04B — PostgreSQL 원자적 일일 예산 Admission v1

Watchtower-Track: character-memory

## 현재 구현과 운영 상태

- 신규 `cmd_governed_start_seyeon_ai_call_v1`: **운영 미연결**. 명시적으로 운영자가 승인한 UTC 날짜·모델·단가 정책이 없으면 실패한다.
- 전역 일일 예산 행을 `SELECT FOR UPDATE`로 직렬화한 뒤 같은 트랜잭션에서 Subject 점유, 최대 비용, 기존 `cmd_start_seyeon_ai_call_v1` 호출 시작 기록, 전역 카운터 증가를 확정한다.
- 같은 `call_id`를 두 번 보내면 기존 Ledger PK에 의해 거부된다. 실패한 절차의 전역 비용 증가는 전체 DB 트랜잭션과 함께 롤백한다.
- 사용자별 예약 정보는 기존 `seyeon_ai_call_cost_events`의 승인된 Subject/Turn/Attempt 행에 저장한다. **새 Subject FK 또는 사용자별 테이블 없음**. 기존 Attempt 삭제 트리거가 예약 개인 정보도 정리한다.
- 서비스 전체 카운터는 개인정보 삭제 후에도 유지하는 **보수적 예산 점유**다. 정확한 실제 청구액은 아니다.
- 정책 행은 운영자가 DB 관리 권한으로 선등록해야 한다. 브라우저/anon/authenticated/API executor는 정책 테이블을 직접 생성·수정할 수 없다.
- SECDEF 함수 소유자 `myeongha_seyeon_cost_meter_owner`는 NOLOGIN, NOBYPASSRLS를 유지한다. API executor는 제한된 함수 실행만 허용된다.

## 비용 산정

`inputCeiling * max(standardInputRate,cachedInputRate) + outputCeiling * outputRate`를 백만 토큰 단위에서 **올림**한다. `numeric`을 사용해 정수 중간 곱셈 오버플로를 피한다. 토큰·요금은 전부 DB 관리 승인 행에서 한도 검증한다. 불명확한 비용은 0으로 처리하지 않는다.

DB 함수에 전달하는 `verified_input_token_bound`, `serialized_request_bytes`는 아직 Production에서 연결되지 않았다. 이 값은 오직 **신뢰된 서버 토크나이저/최종 HTTP 본문 계측 포트**가 만들어야 하며, 사용자 지정 값을 통과시키면 안전 조건 위반이다.

## 남은 C/D 조건

1. 기존 `cmd_start_seyeon_ai_call_v1`은 아직 API executor가 실행 가능하다. **운영 활성화 전 반드시 우회 경로 제거** 후 모든 모델 호출을 새 RPC에 배선해야 한다.
2. 이번 04B는 보수적으로 비용을 **전액 예약**하며, 정산 뒤 남은 차액을 자동 환급하지 않는다. 04C에서 기존 `cmd_settle_seyeon_ai_call_v1`과 동일 트랜잭션의 원자적 정산·차액 반환을 구현한다. 기존 미정산/타임아웃은 환불하지 않는다.
3. 모델별 진짜 입력 토큰 상한·Provider enforced output cap·비용 부가항목 검증이 완성되기 전 실제 ENFORCE 금지.
4. 오프라인 DB 단일 세션 회귀 외에 **2개 이상의 독립 DB 세션을 이용한 경합 시험**, 개인정보 삭제 최종화, Subject 승격·재시도, 장애 복구 검증이 필요하다.
5. 비용 청구서 대조 및 운영 ON/OFF/SHADOW/ENFORCE 제어는 04D에서 담당한다.

## 검증·종료 조건

- A: 신규 스키마/RLS/함수, Subject/전역 예산, 중복, 가격/상한/권한 검증 — DB CI 확인.
- B: 동시성·복구·정산 차액 반환 — **미완료**.
- C: Production 운영 차단 — **HOLD**.
