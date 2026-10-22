# Saju S3 → MyeongHa S5 → S6 → S7 동일 원본 인수 게이트 (2026-10-22)

> 기존 [Saju #2683](https://github.com/gycha0109-beep/Saju/pull/2683) 병합, [MyeongHa Reader/Records #2442](https://github.com/gycha0109-beep/MyeongHa/pull/2442) 병합 및 [S5/S7 메타데이터 연속성 #2448](https://github.com/gycha0109-beep/MyeongHa/pull/2448) 구현을 그대로 사용한다.
>
> 인계 참고: [통합 로드맵 PR #2437 작업 브랜치](https://github.com/gycha0109-beep/MyeongHa/blob/docs/master-track-roadmap-gpt14-20261022/docs/roadmaps/MYEONGHA_GPT_TRACK_MASTER_ROADMAP_20261022.md) / [사주 12메뉴 PR #2679 작업 브랜치](https://github.com/gycha0109-beep/Saju/blob/docs/myeongha-roadmap-alignment-20261022/docs/ROADMAP.md). 이 PR들의 병합을 추정하지 않는다.

## 왜 같은 함수에서 검사하는가

기존 #2442는 **Saju SourceUnit vs DB Reader/Records**를 비교한다. #2448은 **DB Reader/Records vs S5/S6/S7 보호 본문·영수증**을 비교한다. 각각 따로 호출하면 같은 시점의 같은 DB 원본을 조회했다는 것이 보장되지 않으므로, S3 불일치를 놓치고 S5·S7 메타데이터만 맞는 사례를 차단할 단일 비공개 접점을 제공한다.

`apps/api/src/official-reader-source-through-delivery-parity-v1.ts`의 `inspectOfficialReaderSourceThroughDeliveryParityV1`는:

1. 기존 Reader 서버·DB 인수물 `PreparedOfficialReadingReaderAdmissionV1`의 Subject×Reading이 맞는지 확인한다.
2. **기존 Records Owner API** `getOfficialReadingRecord`를 `scope.subjectId`와 `scope.readingId`로 **정확히 한 번** 호출한다. 다른 SQL/GRANT/권한 발행 없음.
3. 동일한 Records 응답으로 `preflightSajuReaderRecordsSourceInventoryParityV1`를 호출해 Saju v2 SourceUnit/Response hash/Disclosure/ambiguity 및 DB 공식 Reading 지문을 재대조한다. **HELD**인 경우에만 계속한다. SourceUnit 누락·교차 Reading·본원 버전 차이는 BLOCKED.
4. **동일 Records 응답**을 `inspectOfficialReaderS5S7ContinuityV1`에 전달해 S5 immutable bodyId ↔ S6 private reread Reading ID/Reader/시각 ↔ S7 responsePrepared/acknowledged 시점 및 attempt ID를 검사한다. 어느 단계든 실패하면 BLOCKED.
5. 비민감 결과 `HELD/BLOCKED + 단계 이름`만 반환한다. 원문·해시·구매권·ACK bearer/Subject/Body ID는 반환하지 않는다.

## 운영권한과 S3/S5/S7 인계 경계

- **이것은 상태/증거 일치성 검사이지 현재 권한 조회의 대체가 아니다.** 실제 S6 Reader Grant·Privacy Lease 재인증, S5 T2 구매권/Source Guard/Privacy 유출 차단, S7 client token 검증은 [DB Owner #2301 Draft](https://github.com/gycha0109-beep/MyeongHa/pull/2301) 및 관련 기존 SQL/앱 소유 기능이 수행한다. 호출자가 임의 생성한 metadata는 `HELD`가 되더라도 공개에 사용할 수 없다.
- Saju #2410의 **Production Source 발행·서명·원본 ID→DB UUID 인증 매핑** 및 S3 selected/co-present/semantic/output proof가 승인되지 않았다. Preview 인벤토리를 Official로 바꾸지 않으며 모든 성공도 `sourceAuthority:NOT_EVALUATED`로 고정.
- 기존 S5 보호 원문 생성/SQL 저장 또는 새 LLM 호출을 이 PR이 시작하지 않는다. S7 준비·ACK·환불 재전송 정책/HTTP 노출도 새로 만들지 않는다.
- `canPersist/canDisclose/canPublish/canSell=false`, `s5AtomicStorage/s7Delivery=DB_OWNER_REQUIRED`, `privacyApproval/currentAccessAuthority=NOT_EVALUATED` 고정. `S7_CLIENT_ACKNOWLEDGED_NOT_HUMAN_READ`은 인증 클라이언트 ACK 메타데이터 일치라는 기술적 이름일 뿐 실제 사람이 읽거나 환불 의무가 발생했다는 확정이 아니다.
- 출처/저장/삭제/복원 운영 승인은 Saju Source Owner·DB/Privacy Owner, 구매·가격/환불/전달 고지는 Commerce/Legal/제품 Owner. 내부 HELD 게이트 성공으로 어떤 승인을 대체하지 않는다.

## 다음 기존 미완료 단계

1. Saju Owner [#2410](https://github.com/gycha0109-beep/Saju/issues/2410): Production 발급자/nonce/요청 digest/Subject·Revision, 버전/Unit closure와 승인된 Source mapping 실증.
2. MyeongHa DB/Privacy Owner #2301 Draft: 현재 S5 T2 Writer/Privacy S4 복원·삭제/유출 격리 승인 후 실제 서버 인수 결과로 검증. **승인 전 영구 저장 없음**.
3. S7 Owner: 동일 safeMessageId×bodyId×deliveryRequestId의 replay·환불 권한 회수·단절/재접속 시각 인계. 읽기 여부를 ACK로 추정하지 않으며 실제 공개 기능은 별도 승인.

이 문서는 새 트랙을 만들지 않고 기존 S3→S5→S7 기술 인수 계약만 구체화한다.
