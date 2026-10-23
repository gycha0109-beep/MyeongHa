# C08-D — 3회 후보: 전체 대화 이력 확인을 필수화한 무료 안전 검사

Watchtower-Track: character-memory

## 해결하는 문제

**최근 메시지가 1건이라고 실제 전체 대화가 첫 1건이라는 뜻은 아닙니다.** 기존 서버는 읽기 비용을 줄이기 위해 최근 메시지 최대 12~24건만 가져옵니다. 한 번이라도 이력이 잘려서 현재 메시지만 남으면, 이전 Shadow의 최근 메시지 검사만으로는 첫 대화를 오인할 수 있습니다.

## 수정

- `apps/api/src/seyeon-fast-dialogue-shadow-v1.ts`의 새 `fullThreadCensus` 포트는 **첫 대화 Shadow가 결합 AI 요청을 보내기 전에 반드시 통과해야 합니다.**
- `subjectId`, `threadId`, `currentUserMessageId`를 읽기 포트에 고정하여 전달합니다.
- 결과는 `schemaVersion=seyeon-first-turn-census-shadow-v1`, 정확히 동일한 세 식별자, `messageCount=1`, `latestSenderType=user`, `complete=true`를 요구합니다.
- 조회 누락, 예외, 오래된 다른 턴, 0건/2건 이상, 다른 Subject/Thread, 잘못된 필드 및 응답은 **`FAST_THREAD_CENSUS_REJECTED`**; Candidate Provider/Reviewer 호출 모두 0회입니다. DB 예외 본문은 사용자 오류로 노출하지 않습니다.
- 기존 Guard, 의미 검증, 5회·3회 오프라인 경로 테스트는 그대로 두고, 기존 성공 테스트에는 **모의 전체 이력 조회 포트**를 명시적으로 주입합니다.

## 정밀한 범위 구분

| 사항 | 이번에 검증하는 것 | 아직 HOLD인 것 |
|---|---|---|
| 전체 이력 판단 | 모의 전체 이력 조회 결과가 없거나 틀리면 AI 호출 전 차단 | **실제 PostgreSQL/RLS/Reader↔Subject 권한 보장 및 최신 카운트 조회 구현** |
| 첫 대화 | 서버 기준 전체 메시지 수 1인 경우에만 Shadow 요청 검토 | count→Provider 사이 동시 입력을 차단하는 **트랜잭션 고정/선형화** |
| 기억 | 기존 개인기록/비공개 정보·출처 차단 유지 | 실제 Grant 철회↔Commit↔HTTP 최초 Reveal 동시성 |
| 비용 | AI 가짜 응답만 사용하며 실제 호출 0회 | 실모델 5→3 비용·지연·페르소나 품질 비교 |
| 운영 | `SHADOW_ONLY_NOT_PRODUCTION` 유지 | 실서비스 후보 라우팅·배포·유료 평가 승인 |

**중요:** 새 포트는 보안이 완료된 실제 DB 어댑터가 아닙니다. 포트 응답의 원본, DB Subject 정책, 최신 상태가 입증되기 전에는 이 Shadow가 Production 첫 대화를 보장한다고 주장할 수 없습니다. 임의로 만든 클라이언트 JSON을 이 포트의 대체 증거로 쓰면 안 됩니다.

## 실무 결론

- 실제 모델 호출: **추가 0회**. 기존 누적 **11회**, 사용량 추정 3,770 microUSD, 예약액 36,047 microUSD 그대로.
- Production Chat/원장/DB/Grant/ACL/Canon/Relationship/기억·배포 경로는 **변경하지 않습니다**.
- 검사: `npx vitest run test/seyeon-c08d-full-thread-census-offline-v1.test.ts test/seyeon-c08c-first-turn-revocation-and-retry-v1.test.ts test/seyeon-c08b-five-three-real-guards-offline-v1.test.ts test/seyeon-fast-dialogue-shadow-v1.test.ts`.
- 다음: 승인된 서버 권한 인터페이스와 동일 시점 DB 증빙을 정의하고, READ-only PostgreSQL 격리 테스트 이후에만 실제 adapter와 연결. G0~G6 보안·운영 종료 조건은 계속 HOLD.
