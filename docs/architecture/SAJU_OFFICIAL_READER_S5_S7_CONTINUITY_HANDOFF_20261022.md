# Saju Official Reading 동일원본 인수 · S5 보호 저장 → S6 재조회 → S7 전달 기록 (2026-10-22)

> 소유 범위: Saju Source 인수와 명하 DB/Reader/Records의 **기술적 원본 연속성**. 운영 Source 발행, DB Writer 승인, Privacy/Commerce/법무 결정은 각각 기존 Owner 권한이다.
>
> 참조: [명하 14트랙 통합 로드맵 PR #2437 작업 브랜치](https://github.com/gycha0109-beep/MyeongHa/blob/docs/master-track-roadmap-gpt14-20261022/docs/roadmaps/MYEONGHA_GPT_TRACK_MASTER_ROADMAP_20261022.md), [사주 12메뉴 로드맵 PR #2679 작업 브랜치](https://github.com/gycha0109-beep/Saju/blob/docs/myeongha-roadmap-alignment-20261022/docs/ROADMAP.md). 둘 다 미병합 기준이며 최신 `main`/소유 PR이 실제 실행 기준이다.

## 기존 작업 그대로 계승

1. **S3:** Saju [#2683](https://github.com/gycha0109-beep/Saju/pull/2683)의 source unit/원본 버전 지문과 기존 MyeongHa [#2442](https://github.com/gycha0109-beep/MyeongHa/pull/2442)의 정확한 Reader·Records DB 원본 조회 및 지문 일치 경계. Saju [#2410](https://github.com/gycha0109-beep/Saju/issues/2410)의 **Production 발급·서명·원본 id 매핑/selected-vs-companion/Guard authority**는 아직 별도 미완료.
2. **S5:** MyeongHa [#2301 Draft](https://github.com/gycha0109-beep/MyeongHa/pull/2301) `official-reader-private-paid-answer-commit-v1.ts`와 SQL 1960 보호 저장. 기존 T1/T2 동일 Subject Lock·원본/Grant/ProductSpec/Release/출생 개정 재검사 유지. Source/Privacy/DB Owner 승인 전 운영 Writer 실행권 및 유료 원문 저장 금지.
3. **S6:** 위 Draft `official-reader-private-paid-answer-reread-v1.ts`는 기존 보호 암호문을 **다시 읽을 때** 최신 Privacy Lease 및 S1 잠금 상태를 확인하여 `officialReadingId`, `bodyId`, `readerCharacterId`, `committedAt`과 보호 본문을 내부에만 돌려준다. 원문을 일반 Chat/Memory/Analytics/서버 로그로 보내지 않는다.
4. **S7:** 위 Draft `official-reader-private-delivery-journal-v1.ts`는 별개 SQL에서 서버 준비 시간 `responsePreparedAt`, 인증 클라이언트 ACK `clientAcknowledgedAt`를 기록한다. **준비=전달 보장 아님, ACK=실제 사용자의 인간 독서 증거 아님.** 재요청은 동일 요청 ID 기준 원래 시각 재생; 환불/권한 철회 후 이전 ACK로 본문 재노출 금지.

## 이번 구현

`apps/api/src/official-reader-s5-s7-reading-continuity-v1.ts`는 **이미 DB/서버에서 독립 인가된** Reader Admission과 Records 조회 결과 및 #2301 Draft의 현재 S5/S6/S7 **메타데이터만** 받아 연속성을 대조한다.

- DB Official Reading UUID, 세션, 사주 영역, Reader/Bundle/Product/Spec/contractVersion, 원본 `responseSnapshotJsonb` 및 공개 기록의 정확한 바이트 지문 동일성을 요구한다. Saju 계산 `readingId`를 DB UUID라고 추정·자동 변환하지 않는다.
- S5 `bodyId`/safeMessageId/turnId/attemptId/commit timestamp와 S6 최신 보호 재조회 `bodyId`/같은 `officialReadingId`/Reader/timestamp를 대조한다. **S5 commit 결과 자체에는 DB 원본 Reading ID가 없으므로 S6의 별도 DB 재조회 증명 없이는 연결 성공으로 판단하지 않는다.**
- S6에 결속된 S7 response preparation만 검사한다. client ACK가 존재할 때는 동일 deliveryAttemptId 및 준비 시각 이후의 clientAcknowledgedAt이 요구된다. 재요청 `replayed` 메타데이터는 시각이 같을 때 수용하지만 **다시 보낼 권한이나 별도 수신을 발급하지 않는다**.
- 결과는 `HELD/BLOCKED`, 단계 메타데이터 `S5_COMMITTED_REFERENCE` / `S7_RESPONSE_PREPARED` / `S7_CLIENT_ACKNOWLEDGED_NOT_HUMAN_READ`, 고정 `NOT_EVALUATED`와 `canPersist/canDisclose/canPublish/canSell=false`만 포함한다. `bodyId`, Reading/Subject ID, 구매권, 전문, SourceUnit, 해시, ACK bearer token은 반환하지 않는다.
- #2301 Draft의 S5·S6·S7 타입과 메타데이터 형상만 별도 인터페이스로 묶으며 **아직 main에 없는 Draft를 코드가 import하지 않는다**. PR #2301 병합 후 해당 Owner의 실제 runtime/output에 연결될 때만 현재 권한/Privacy/DB 트랜잭션 검사가 유효하다.

## 남은 실제 인수

- Saju #2410: 공식 출처 서명·발급 환경·nonce replay·요청 digest와 SourceUnit selected/co-present/Disclosure/ambiguity, Semantic/Output Guard의 검증 가능한 영수증.
- DB/Privacy Owner: #2301 Draft 실 DB Writer ACL·Privacy 삭제/복구/보호 저장, S5 T2/환불 동시성 및 S6 최신 Grant/Lease 검증.
- S7/제품 Owner: 준비·전송·인증 클라이언트 ACK 증거의 실제 API 계약, 환불·재전송의 비재노출, 동일 safeMessageId/bodyId 별도 인증 DB 증명. 현재 continuity 함수에는 ACK token·바디·새 DB 조회권이 없다.
- Product/Commerce Owner: 가격/판매·환불 고지, Source/DB/Reader 공개 및 출시 승인.

`HELD`는 완료/승인이 아니다. 현재는 추가 LLM 호출·SQL/RLS 수정·HTTP 라우팅·실제 저장/수신·Preview→Official 승격을 전부 하지 않는다.
