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

## 2026-10-22 S6 암호문 Identity / S7 준비 영수증의 정확한 결속

- 기존 Saju·DB 원본 인수와 S5→S7 동일성 검사 위에 `apps/api/src/official-reader-s6-ciphertext-s7-identity-v1.ts`를 추가한다. 별도 DB 변경 없이 **DB Owner #2301 Draft의 기존 `OfficialReaderProtectedBodyIdentityV1` AAD 12개 필드**를 수신하는 비공개 witness 계약이다.
- `subjectId`, `threadId`, `turnId`, `attemptId`, `safeMessageId`, `officialReadingId`, `readerCharacterId`, `readerContentBundleId`, `contentReleaseId`, `originatingEntitlementGrantId`, `productId`, `sourceResponseHash`를 Reader scope·S5 commit·S6 재조회와 대조한다. `sourceResponseHash`는 Saju deterministic response hash를 `sha256:v1:` 접두사로 감싼 **기존 DB Owner S5 형식**과만 비교한다. DB Records의 별도 `officialArtifactResponseHash` 표현을 Saju hash와 같다고 추정하지 않는다.
- S7 준비가 있을 때는 SQL Owner가 실제 인증된 Subject×Thread×SafeMessage×Body×DeliveryRequest×Attempt에 묶은 `s7PreparedBinding`을 추가로 요구한다. 현재 S6 반환 객체에는 민감한 AAD 전체가 **포함돼 있지 않으므로**, 이 witness를 일반 클라이언트 또는 응답 객체에서 만들어 쓰면 안 된다. #2301의 기존 S1 보호 읽기 SQL·키/Privacy Owner가 서버 내부에서 검증된 원본 메타데이터만 인계해야 이후 실 연결 가능하다.
- `inspectOfficialReaderS6CiphertextS7IdentityV1`는 위 사전 결속 후 **기존 단일 Records 조회 게이트를 정확히 한 번** 실행한다. 사용자 응답은 HELD/BLOCKED 및 S5/S7 단계 이름뿐이며 SourceUnit·ciphertext·DEK·원문·Subject/Body/Token을 노출하지 않는다. 구매권, 삭제/환불/재전송, ACK의 발행 여부 및 실제 사용자 열람을 결정하지 않는다.
- `S7_CLIENT_ACKNOWLEDGED_NOT_HUMAN_READ`은 준비·인증 ACK의 메타데이터 일치만 뜻한다. 별도 승인 전 `canPersist/canDisclose/canPublish/canSell=false`, `sourceAuthority/Privacy/currentAccessAuthority=NOT_EVALUATED`, `s5AtomicStorage/s7Delivery=DB_OWNER_REQUIRED`은 불변이다.

## 2026-10-22 S5·S7 같은 요청 재시도 / 환불 경계

- `official-reader-s5-s7-immutable-replay-v1.ts`는 **기존** #2301 DB Owner의 S5 `replayed` commit과 S7 동일 deliveryRequestId 준비·ACK 재시도를 비교하는 **서버 비공개 원본 증거 일치성** 계약이다. 새 delivery 요청·새 답변 발행·결제·환불·송신을 실행하지 않는다.
- 최초 S5 `bodyId / safeMessageId / turnId / attemptId / committedAt`와 재시도 S5 결과가 완전히 동일해야 하며, 재시도 `replayed=true`를 요구한다. 최초/재시도 S6는 같은 Official Reading·Reader·bodyId·committedAt을 가리켜야 한다. 신규 원문을 S6 메타데이터에 끼워 넣으면 차단한다.
- 동일 S7 `deliveryRequestId / deliveryAttemptId / responsePreparedAt`와 DB Owner의 Subject×Thread×SafeMessage×Body 준비 바인딩을 유지하고, 재시도 준비 `replayed=true`를 요구한다. 임의 새로운 deliveryRequestId를 기존 요청의 재시도라고 주장하는 경우 차단한다.
- **ACK는 별도 클라이언트 사건이다.** 원래 ACK가 존재했으면 재시도 ACK는 같은 deliveryAttemptId/원본 timestamp로 `replayed=true`여야 한다. 원래 ACK가 없고 뒤늦게 최초 ACK를 받은 경우, 기존 S7 Owner의 인증 ACK SQL로 새 사건을 별도 검증해야 하며 이 재시도 비교에서는 HOLD/BLOCKED다. HTTP 전송 준비·ACK는 사람이 읽었다는 증거가 아니다.
- 정합성 검사 전에 **#2459 S6 암호문 AAD + #2456 동일 Saju 출처와 현재 Records Owner DB 조회**를 그대로 재사용한다. 이 계약 성공에도 `HELD` / `canPersist/canDisclose/canPublish/canSell=false` 고정. Reader 구매권·환불·Privacy Lease·키 삭제/복원·실제 전송 조건은 **매 요청마다 #2301 DB/Privacy Owner 정본**이 별도 검증해야 하며 과거 재시도 결과는 현재 접근 허가가 아니다.
