# 세연 관리자 대화방 분리 — 운영 실행 기록

Watchtower-Track: security

## 실행 목적과 범위
- 운영 DB G0 원본 권한 검증 함수 4개를 설치했지만, 과거 세연 Assistant 응답 3개에는 현행 G1 원본 출처 Pin이 없음.
- 해당 과거 응답을 삭제·재서명·임의 제거해서 새 모델 문맥에 투입하지 않는다. 한 명의 관리자 계정에 속한 기존 단일 세연 대화방을 `archived`로 전환하여 **원본 Chat/Attempt/Message를 보관**한다.
- 새 대화방은 브라우저가 인증된 Member 토큰으로 이미 배포된 `POST /api/chat`을 호출할 때 `cmd_open_member_single_character_thread_v1`이 생성한다. 관리자가 DB에서 새 Thread ID를 임의 생성하지 않는다.
- 운영 SQL: `scripts/operations/seyeon-security-s0/production-owner-seyeon-archive-legacy-thread-20261101.sql`. 정확히 관리자 계정 1건, 기존 활성 대화방 1건, 재시도 대기 1건, 미정산 모델 비용 0건, 미수신 송출 0건, 동작 중 Attempt 0건을 전제한다.
- PostgreSQL 트랜잭션에서 canonical Subject/Thread를 FOR UPDATE로 잠그고 status만 `active → archived`로 전환한다. 불변 Chat/Message/Attempt 건수는 수정 전후 동일함을 검사한다. 재실행 시 활성 대상이 없으므로 실패해야 한다.

## 실제 확인 결과 (2026-11-01 KST)
- 운영 SQL 적용: SUCCESS. 관리자 세연 대화방: active 0건, archived 1건.
- 보관 데이터: 메시지 12건, 대화 Turn 9건. 기존 실패 `failed_retryable` Turn은 보관함에 그대로 있으며, 새 대화방에 자동 복제되지 않는다.
- AI 비용 원장: 미정산 0건, GLM 호출 기록 0건 (실제 GLM 답변 성공으로 주장하지 않음).
- 개인 기억 준비: `conversation_recall/v1` 승인 원본 기억 0건, 활성 세연 접근 Grant 0건, 활성 Positive source 유형 등록 0건.
- 현재 **운영 첫 답장 경로는 `requiredPersonalRecordCount:1`을 강제**한다. 이는 `docs/security/SEYEON_S0_HTTP_RECEIPT_BARRIER_V1_20261025.md`에 명시된 서버 고정 보안 정책이며, 빈 새 대화방에서 자동으로 성공하지 않는다.
- 기존 Positive Memory G3 issuer는 발행 전에 정확한 승인 기억 원본/G1·G2 증명을 요구하므로, 일반 대화 목적의 zero-source 답변을 우회적으로 긍정 Reveal로 내보내지 않는다.

## 다음 정상 실행 경로
1. 현재 `PR #2832`의 원본 검증 DB readiness 코드가 통합 검사 통과 후 운영 Worker에 배포된 것을 확인한다.
2. 관리자가 `/chat.html?character=seyeon`을 열면 `POST /api/chat`의 canonical Subject 인증으로 빈 활성 대화방이 자동 생성된다. 기존 `?threadId=<archived>` 링크를 새 Thread로 자동 치환하지 않는다.
3. 실대화 활성화는 별도의 **승인된 첫 원본 Memory + Grant + 허용 source registry** 또는 아키텍처적으로 검토·구현된 **zero-personal-source 첫 답변 G3** 중 하나가 필요하다. 양쪽 중 아무 조건도 없는 상태에서 긍정 답변을 강제로 내보내거나 크레딧/비용 Governor를 해제하지 않는다.
4. 실제 reply가 도착하면 receipt ACK, 일일 예산 예약·DB 정산과 GLM Provider 사용량까지 함께 확인한다.

## 보관의 제한
기존 과거 메시지 행은 데이터베이스에 남지만, 출처 검증되지 않은 과거 답변의 사용자 재표시도 현재 G3 정책에 의해 제한될 수 있다. 이를 '복원된 대화 기록 조회'로 보고하지 않는다.
