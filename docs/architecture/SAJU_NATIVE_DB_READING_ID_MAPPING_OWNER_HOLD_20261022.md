# Saju native Reading ID ↔ MyeongHa DB Official UUID 인수 · S3 Owner HOLD (2026-10-22)

> 기술 인수 담당: 공식 Reading 원본·버전·범위가 DB/Reader/Records에서 동일한지 확인. 출처 발급/키/서명/DB 변환 권한은 별도 Saju Source Owner / DB Owner.
>
> 로드맵: [MyeongHa 통합 로드맵 PR #2437 미병합 작업 브랜치](https://github.com/gycha0109-beep/MyeongHa/blob/docs/master-track-roadmap-gpt14-20261022/docs/roadmaps/MYEONGHA_GPT_TRACK_MASTER_ROADMAP_20261022.md), [Saju 12메뉴 PR #2679 미병합 작업 브랜치](https://github.com/gycha0109-beep/Saju/blob/docs/myeongha-roadmap-alignment-20261022/docs/ROADMAP.md). 실제 실행 기준은 각 Owner의 최신 main 및 소유 PR.
>
> 기존 구현: Saju #2683(원본/SourceUnit 인수, 병합), MyeongHa #2442(Reader/Records 정합성, 병합), #2456(S3→S7 동일 DB 원본, 병합), #2459(S6 AAD→S7 메시지, 병합), #2461(동일 S5/S7 재시도 확인, 별도 진행).

## 실제 부족한 권한/매핑

Saju `source-reading-reader-records-handoff.ts`는 내부 `readingId`와 응답 원본 `responseBodyHash`를 생산한다. MyeongHa `character-standard-reading-knowledge.ts`의 DB 공식 Reading은 **별도의 UUID**로 소유한다. 기존 `official-reader-saju-source-inventory-parity-v1.ts`는 Saju `source.readingId`가 DB UUID와 같을 때만 통과한다. 원래 서로 다르면 BLOCKED가 올바른 기본 동작이다.

Saju native Reading ID를 DB UUID로 바꿔 기록하거나 `responseBodyHash`를 새 값으로 계산하는 행위는 **Saju/DB Owner가 승인한 버전·원본 변환 및 Production 출처 인증이 없는 한 금지**한다. 사용자 해석 문구가 같다는 이유만으로 두 Reading이 법적/상업적/의미적으로 동일하다고 단정해서도 안 된다.

## 이번 구현의 범위

`apps/api/src/saju-native-db-reading-identity-gap-v1.ts`:
- 기존 `compareOfficialReaderRecordsSourceV1`가 독립 DB Reader Admission과 Subject 인가 Records 조회에서 **같은 DB 공식 Reading UUID·Reader/Spec/Session·원문**을 확인한 경우에만 진행한다.
- 입력 Saju handoff는 **Preview / HELD / NOT_EVALUATED / canPersist·canDisclose=false** 형상만 수용한다. `canMapReadingId` 같은 미승인 신규 권한을 넣은 요청은 BLOCKED.
- **서로 다른 Saju native Reading ID와 DB UUID**를 정확하게 보존한 채 `responseVersion/responseId` 및 Saju 인벤토리 self-hash 형식, 원문 `sourceRef`·SHA-256, 필수 Disclosure 및 ambiguity 지문을 기존 DB Reader projector 결과와 비교한다. 필드 교환·누락·다른 텍스트를 차단한다.
- `state='held'`, `reason='issuer_and_db_mapping_required'`는 SourceUnit 차원에서 인수 준비 자료가 서로 맞는다는 뜻이지 **Saju 출처 서명 검증, 원본 BodyHash 검증, ID 변환의 정당성/현재 Grant 인정**을 의미하지 않는다. 이 함수에는 **원래 Saju Response 전체와 Production issuer 증명이 없으므로** 임의로 작성된 정합적인 `responseBodyHash`조차 진위 판정할 수 없다.
- 결과는 고정된 비공개 상태 `HELD/BLOCKED`와 `mappingAuthority/sourceAuthority/privacyApproval=NOT_EVALUATED`, `canMapReadingId/canPersist/canDisclose/canPublish/canSell=false`만 반환한다. 어떠한 ID·원문·hash·비용·구매권도 출력하지 않는다.
- 기존 S3 strict-ID parity, S5 Writer, S6 최신 구매권·Privacy, S7 전달·ACK/환불 경계를 **완화·수정·호출하지 않는다**. 새 SQL/HTTP/암호 키/LLM/공개 권한이 없다.

## 승인된 Owner 인수를 기다리는 다음 단계

1. **Saju Source Owner [#2410](https://github.com/gycha0109-beep/Saju/issues/2410):** Production issuer 서명·키 수명·nonce/요청 digest, 선별/동반 SourceUnit, Disclosure/ambiguity/semantic/output 증명, 원래 Reading ID/원본 응답 바이트 확인.
2. **명하 DB/Privacy Owner [#2301 Draft](https://github.com/gycha0109-beep/MyeongHa/pull/2301):** DB Official Reading UUID·Subject/Birth Revision·Product/Spec/Release·실제 저장 Response Hash의 원본 보존 또는 Owner가 승인한 변환 영수증, Privacy 삭제·복원·보호 저장/권한 경계 증명.
3. **통합 인수:** 양쪽에서 독립적으로 검증된 발행/저장 영수증이 정확히 같은 문구뿐 아니라 **같은 공식 Reading 정체성**을 묶는 경우에만 기존 `preflightSajuReaderRecordsSourceInventoryParityV1`의 ID 불일치 차단 정책을 Owner 승인 하에 별도 변경한다. 이번 PR은 이를 변경하지 않는다.
4. **S5/S7 실제 저장/전달:** 승인 후에도 매 요청 최신 Grant·환불·Privacy Lease 검증 및 T2 동일 범위 S1 lock은 DB Owner의 기존 진입점이 책임진다. ACK는 사람의 실제 독서 증거가 아니다.

## 전체 원본 Response ID-only Diff 인수 추가

`apps/api/src/saju-db-reading-id-only-response-parity-v1.ts`는 **Saju 원본 ProductReadingResponse v2의 실제 전체 응답 객체**를 서버 내부에서 받아 DB Reader/Records의 원본과 비교한다. 기존 SourceUnit 동등성 검사만으로 확인할 수 없는 Subject/Birth 표기, 명식 계산 요약, 생성 시각, 섹션 제목·상태, Disclosure 외 metadata의 유출·변조 여부도 검출한다.

- 사전 조건: 위 native-ID vs DB-UUID `HELD` 정합성 + 기존 DB가 별도로 인가한 Reader/Records 원본. Saju native 응답은 정상 `delivered` v2이고 `reading.readingId`는 Saju handoff의 native ID와 정확하게 같아야 한다.
- Saju 원본 전체 응답 `sha256`이 handoff `source.responseBodyHash`와 동일해야 한다. DB 저장 응답을 **복사한 비교용 임시 객체의 `reading.readingId` 한 곳만 native ID로 표시**한 뒤 같은 정규화 해시 함수를 적용했을 때 전체 해시가 원본과 같아야 한다. 실제 DB JSONB나 Saju 응답은 수정·재발행하지 않는다.
- 원문/명의·Subject 계산 데이터, 제공 범위, 원본 `generatedAt`, 추가 필드나 disclosure, fallback 상태, 출처 hash 중 어느 하나라도 다르면 BLOCKED. 일치하면 `reason=only_reading_id_payload_change_unattested`로 HELD만 반환한다.
- **원래 Saju 응답이 Production 발급자에게서 왔다는 증거는 이 함수가 갖고 있지 않다.** 그러므로 source signature + normalized request/birth revision + DB transform의 Owner 승인·인가 영수증이 없으면 `canMapReadingId=false`, `canPersist/canDisclose/canPublish/canSell=false`가 변하지 않는다. 단지 내용 차이가 한 필드뿐이라는 사실로 Reader/Records 공식 권한을 열거나 S3 strict-ID 검사를 완화하지 않는다.
- 원본 Response·해시·Subject 값은 서버 내부 입력 전용이다. 검사의 출력에는 민감한 식별자, 전문, SourceUnit, hash, 인증 서명이나 Reader 구매권을 포함하지 않는다.
