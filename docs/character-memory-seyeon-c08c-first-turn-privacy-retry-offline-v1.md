# C08-C — 첫 대화 판정·기억 접근·재시도 차단 강화

Watchtower-Track: character-memory

## 한 문장으로

**세연과 이전에 대화한 흔적이 있다면 관계 데이터가 비어 있어도 3회 빠른 경로에 진입하지 못하도록 했습니다.** 여기에 기억 권한이 불명확하거나 분류 모델 호출이 실패한 경우도 모의 데이터로 점검합니다.

## 변경

- `apps/api/src/seyeon-fast-dialogue-shadow-v1.ts`: 기존의 관계·기억·민감정보·주장 차단 조건을 **그대로 유지**하고, **recentConversation이 현재 user 메시지 정확히 1건일 때만** 후보 진입을 허용합니다. 행위 정책도 `public_first_contact`여야 합니다.
- `test/seyeon-fast-dialogue-shadow-v1.test.ts`: 기존 테스트가 서버의 실제 Context assembler를 사용하도록 교체합니다.
- `test/seyeon-c08c-first-turn-revocation-and-retry-v1.test.ts`: 과거 대화/assistant 메시지, 모의 revoked·미승인 메모리, 가짜 관리자 주장, 빈 Grant 증빙, zero-record proof 오용, 동일 턴 분류 실패 후 중복 호출을 검사합니다.

## 무료 검사에서 기대하는 것

| 상황 | 기대되는 서버 동작 |
| --- | --- |
| 관계 상태 null이지만 과거 user/assistant 메시지가 남아 있음 | 3회 Shadow 입장 거부, Provider 호출 0 |
| 현재 메시지가 아니라 assistant 메시지가 마지막임 | 입장 거부, Provider 호출 0 |
| 개인 기억 또는 관계 이벤트가 Context에 있음 | 입장 거부, Provider 호출 0 |
| 관리자 사칭 주장 Integrity 결정 존재 | 입장 거부, Provider 호출 0 |
| 가짜/미확인 개인기억을 증빙 없이 선택·'0개'로 표시하려 함 | 기존 Source Selection / Zero Proof HOLD |
| 하나의 사용자 턴에서 분류 모델 오류 후 프리플라이트 재진입 | 기존 캐시된 실패 재사용, 추가 자동 분류 호출 0 |

## 여전히 검증되지 않은 것

- 현재 요청 컨텍스트에서 과거 메시지가 보이지 않는다고 **DB에 과거 대화가 없다는 보장**은 아닙니다. 진정한 첫 턴 판단에는 서버의 전체 thread 이력과 신뢰 가능한 시점 증빙이 별도로 필요합니다.
- revoked/미승인 상태는 합성 공격 입력입니다. 실제 PostgreSQL 권한 철회, Reader·Subject ACL 격리, 철회 경쟁 조건, DB 원자 커밋·중복 저장·HTTP 답변 노출 여부를 증명하지 못합니다.
- 기존 5회 → 3회 모델 품질 동등성, 사용자 반응, 장기 기억, latency/비용은 미검증입니다.
- 빠른 경로는 **Shadow 전용**, Production Chat·DB·사용자 기억·관계·Canon·원장·프롬프트 라우팅 변경 없음.

## 비용·진행 조건

- 추가 실모델 API 호출 **0회**. 기존 누적 11회/이용량 추정 3,770 microUSD/예약 36,047 microUSD 유지.
- CI 실행: `npx vitest run test/seyeon-c08c-first-turn-revocation-and-retry-v1.test.ts test/seyeon-fast-dialogue-shadow-v1.test.ts test/seyeon-c08b-five-three-real-guards-offline-v1.test.ts`
- 다음 후보: 신뢰할 수 있는 DB 전체 thread 메시지 수 또는 첫 턴 확정 증빙 없이 일반화된 fast path를 허용하지 않는 Admission Contract 검토. **실모델 확대는 별도 Owner 승인, 실제 청구 확인, hard-cap 검증 이후에만**.
