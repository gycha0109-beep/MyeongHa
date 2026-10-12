# 세연 개인기록 사용 승인 — 오프라인 구현 연결 계약 v1

Watchtower-Track: character-memory

근거: [보안 G0–G6](./security/SEYEON_AI_SECURITY_COMPLETION_GATES_V1.md), [#1843](https://github.com/gycha0109-beep/MyeongHa/issues/1843), [#1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866).

## 승인된 개발 범위

- 사용자 소유 및 실제 사용 허가된 개인기록만 선택하여 캐릭터 문맥에 활용.
- 선택된 원본 Record/Grant와 정확한 모델 투입 출처는 Provider **이전** 영속 Pin 필요.
- 생성 후 최종 Commit과 동일한 DB 트랜잭션에서 **기존 exact Grant** 및 기록 현재 상태를 재검사. Grant 재발급은 구 Attempt에 소급하지 않음.
- 최초 Reveal 및 committed replay/과거 응답은 **현재 공개 권한**을 재검사하고 취소 후에는 응답 본문 전부 HOLD.
- 최초 활성화 시 개인기록 응답 스트리밍 OFF. 이미 전송된 바이트는 철회할 수 없음.
- 운영 DB/기존 스키마 및 소유권, 유료 AI 모델, public route, Production Projector와 Governor 모드는 변경하지 않음.

## 이번 코드의 범위

`apps/api/src/seyeon-offline-granted-turn-v1.ts`는 위 순서를 조합하는 **오프라인 실행 경계**입니다. 테스트는 합성 모델 출력과 합성 권한 포트를 사용하여 pre-model pin 실패, revoke-before-commit, revoke-before-reveal, Grant 교체 후 과거 답변 재조회 거부를 검증합니다. 반환되는 공개 본문은 별도 Current Grant Reveal 포트를 통과한 경우에만 생성합니다.

**현재 Production Chat에는 연결하지 않습니다.** 기존 `SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1=[]`와 positive precommit HOLD, `routeMounted:false`, 운영 DB의 zero-only 선행 Pin은 그대로입니다. 코드상의 Pin/Commit/Reveal 인터페이스는 **DB 인증·최소권한·원자성 증거가 아닙니다**. 클라이언트가 원본 Pin 또는 Grant ID를 직접 제출하는 공개 인터페이스도 없습니다.

## 실제 연결 전 필수 미완료 사항

1. **G0:** Security/DB/Character 소유자가 기록 종류·출처 스키마·과거 대화/관계 이벤트에서 파생된 개인정보 권한 상속·취소 효력·Reveal 선형화 시점을 확정. 사용자 승인으로 기본 개발 방향은 결정됐지만 이 세부 계약을 임의 확정하지 않음.
2. **G1:** DB Owner가 모델에 실제 들어간 positive 집합 전체를 immutable Attempt Pin으로 저장하고, 동일 attempt/digest/subject/thread 및 DB 최소권한을 입증.
3. **G2:** 실제 `cmd_commit_seyeon_chat_turn_runtime_v2` 한 트랜잭션 내 Grant row lock 및 record digest 검증과 revoke 경쟁 시험.
4. **G3:** 최초 HTTP/committed_replay/과거 Context/worker의 Current Grant 공개 검사와 저장·공개 경합 정책. 본 파일의 authority port는 구현 책임 분리이지 완성된 DB adapter가 아님.
5. **G5/G6:** PostgreSQL 독립 2세션, 실제 HTTP, CI, 운영 승인·복구 증거 별도. Reader 구매 기반 허가는 #1827 권한 소유 범위 준수.

이 PR은 positive 개인기록 운영 허용·G0~G6 PASS 또는 운영 승격을 주장하지 않습니다.
