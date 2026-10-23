# Reader ↔ Records 동일 Official Reading 확인 · S3/S5/S7 인수 (2026-10-22)

> 소유: Saju 출처·버전·범위 인수 보조. 기존 MyeongHa DB/Reader/Records Owner의 기능·승인 대체 금지.
> 상태: **서버 내부 참조 일치성 구현 / 공식 출처 발행·실 DB 승인·보호 저장·전달·공개 미완료**.
> 최신 기준: [Saju #2683](https://github.com/gycha0109-beep/Saju/pull/2683), [MyeongHa DB #2301 Draft](https://github.com/gycha0109-beep/MyeongHa/pull/2301). 두 PR 모두 main 승격/승인을 전제하지 않는다.

## 기존 소유 기능 재사용

- Reader 기존 호출: `prepareOfficialReadingReaderAdmissionV1`로 인증 Subject×Reading×Reader×Bundle×Release×Product/Spec×현재 Grant/정책을 **명하 서버/DB 권한**으로 확인한 뒤 `PreparedOfficialReadingReaderAdmissionV1`만 인계한다.
- Records 기존 호출: `getOfficialReadingRecord` + `public.qry_official_reading_record_runtime_v1`로 **독립적인 Subject×Reading 기록 조회 권한**을 확인한 `OfficialReadingRecordV1`만 인계한다. Reader가 접근할 수 있다고 Records 조회가 허용되는 것이 아니며 역도 같다.
- 새 `apps/api/src/official-reader-records-source-consistency-v1.ts` 함수는 위 두 결과에서 **같은 DB Official Reading ID/세션, Source/Reader/Product/Bundle/Spec/domain/contract, 원본 response snapshot, 표시 상태**를 확인하고, MyeongHa 기존 Saju canonical digest 헬퍼로 동일 snapshot 바이트를 비교한다. Saju 계산 `official_reading_<hash>`가 DB의 UUID와 일치한다고 추측하지 않는다.
- DB Reader source의 `responseHash`는 기존 서버 scope `officialArtifactResponseHash`와 대조하고, Records에서 독립적으로 인가된 `responseSnapshotJsonb`를 해당 Reader source와 비교한다. Records 고객 API는 원본 hash를 노출하지 않으므로 이 함수는 **독립 DB hash/Production Source Proof 검증을 완료했다고 주장하지 않는다**. 그 단계는 DB Owner와 Saju #2410의 Source Issuer 계약이 필요하다.
- `projectOfficialStandardReadingToProtectedCharacterSajuContextV1`를 통과하는 v2 원문만 구조 비교한다. 별도 새 Saju 해석 엔진, Chat 질문, LLM, DB query, 공개 HTTP, 일반 Chat/Memory/Log 기록 없음.

## 무권한 결과

`compareOfficialReaderRecordsSourceV1` 결과는 오직 `state:held|blocked`, 비공개 고정 사유, `sourceAuthority/Privacy/currentAccessAuthority=NOT_EVALUATED`와 `canPersist/canDisclose/canPublish/canSell=false`뿐이다. 동일한 원문이 두 조회에 존재한다는 사실은 **현재 이용권·판매·사용자 수신·기록 열람 승인**을 주지 않는다.

오류/교차 Subject(기존 조회 경계), Reading, session, Reader, content bundle, Product spec, response version/state/hash, 보호 텍스트 원본 불일치에서는 모두 `blocked`. 다른 사람의 원문 또는 응답 지문은 출력하지 않는다.

## S3 → S5 → S7 후속 인수 순서

1. **S3 Saju Owner**: Saju [#2410](https://github.com/gycha0109-beep/Saju/issues/2410)에서 실제 Production 출처 issuer, 요청 digest/nonce, exact Claim/Unit selected·companion, disclosure/ambiguity, Semantic/Output 검증 등 승인된 증명을 발급해야 한다. Preview signed transport나 본 참조 비교로 위조하지 않는다.
2. **S5 DB/Privacy Owner**: [#2301 Draft](https://github.com/gycha0109-beep/MyeongHa/pull/2301)의 공동 Scope lock/T2 최신 Grant·원본 source·Response revision 재조회, 보호 본문·시도·근거의 SQL 단일 트랜잭션 저장, Privacy 승인 및 장애 복구·환불 경쟁 검증이 필요한 상태. 본 계약은 기존 1950/1960 writer나 DB ACL을 변경하지 않는다.
3. **S6 Reader/Records**: 각각 현재 권한을 확인한 뒤 위와 같이 동일 **DB Official Reading 원본**을 재참조한다. Records 화면이 Reading ID를 재요청하는 기존 `/api/readings?readingId=...`와 Reader의 전용 읽기 권한을 혼동하지 않는다. 추가 Reader의 별도 구매도 원본 해석 재발행과 다르다.
4. **S7 전달**: [#2301 Draft](https://github.com/gycha0109-beep/MyeongHa/pull/2301) `official-reader-private-delivery-journal-v1.ts`의 `responsePreparedAt`과 `clientAcknowledgedAt`는 보호 본문 S5 `committedAt`와 별개다. 중복 전송은 저장된 원본/시각으로 재생; Client ACK는 인간 실제 독서 증거가 아니다. 환불·회수 후에는 공개 재노출과 캐시 재사용 불허.
5. **출시 경계**: 상품 가격/구매권/환불 정책은 Commerce·제품 Owner, 보호 데이터 운영 저장/삭제·복원은 DB/Privacy Owner, 서명된 Production Source는 Saju Owner; 운영 실제 권한과 사용자 화면 공개 승인 모두 미완료.

## 로드맵 링크 (아직 두 PR main 미병합)

- [MyeongHa GPT 통합 로드맵 · PR #2437 작업 브랜치](https://github.com/gycha0109-beep/MyeongHa/blob/docs/master-track-roadmap-gpt14-20261022/docs/roadmaps/MYEONGHA_GPT_TRACK_MASTER_ROADMAP_20261022.md)
- [Saju 12메뉴 로드맵 · PR #2679 작업 브랜치](https://github.com/gycha0109-beep/Saju/blob/docs/myeongha-roadmap-alignment-20261022/docs/ROADMAP.md)

실행 순서는 각 Owner 최신 `main`, 작업 PR, Source/DB/Privacy/Commerce 별도 승인 경계가 우선. 통합 로드맵 인계는 새 트랙/승인이 아니다.

## Saju #2683 원본 Unit 지문과 DB Reader/Records 교차 대조 — 2026-10-22 추가 구현

- `official-reader-saju-source-inventory-parity-v1.ts`가 기존 `compareOfficialReaderRecordsSourceV1` 결과에 이어 Saju의 `saju-reader-records-source-reference-handoff-v1` **in-process/Preview/held** 인벤토리를 독립 저장한 DB 원본과 교차 비교한다. `responseId`, `readingId`, `responseVersion`, canonical `responseBodyHash`, `inventoryHash`, `profileRef`, `registrySnapshotId`, `evidenceBundleHash`, `readingVersion`의 형식과 범위를 고정한다.
- 원래 MyeongHa `character-standard-reading-protected-context.ts` projector를 **새로 구현하지 않고 그대로 재사용**하여 각 `sourceRef`, 텍스트 SHA-256, `disclosures`, `ambiguityHashes`와 정확한 순서/개수까지 비교한다. 빠진 Disclosure/단위·본문 변조·ID 교환·대체 Reader 원본을 차단한다.
- 중요: Saju 엔진의 `official_reading_<digest>` 식별자와 MyeongHa DB `reading_id UUID`는 서로 다를 수 있다. **발행자 인가 매핑 영수증이 없는 현행 계약에서는 일치하지 않을 때 BLOCKED**이고, MyeongHa가 임의로 ID를 치환하거나 해시를 재발행하지 않는다. Saju #2410 Source Owner·DB Owner가 공식 발행/매핑 범위와 원본 바이트 책임을 합의한 후에만 이후 S5/S7 단계에서 사용한다.
- 출력은 `state='held'|'blocked'`, `sourceAuthority='NOT_EVALUATED'`, `s5AtomicStorage/s7Delivery='DB_OWNER_REQUIRED'`, `canPersist/canDisclose/canPublish/canSell=false`만 반환한다. DB 원본/원문/해시/SourceUnit/Subject 식별자·Saju attestation·권한을 반환하지 않는다. 이는 기존 S3 후보 검증을 대체하거나 미승인 실 DB Writer, Reader/Records 공개 경로를 열지 않는다.

- `preflightSajuReaderAgainstCurrentRecordsV1`는 이미 인증된 Reader admission의 `scope.subjectId/readingId`로 **기존 Records Owner `getOfficialReadingRecord` 조회를 실제 호출**한 다음 위 SourceUnit 대조를 수행한다. 누락·현재 열람 불가·다른 Subject/Reading은 그 자리에서 `BLOCKED`로 반환하며, 새로운 SQL/조회 권한/HTTP 진입점을 만들지 않는다. 기존 Records의 archive read 정책과 Reader의 구매권 판단을 하나의 새 권한으로 합치지 않는다.
