# 명하 2B-3C-4 — 현재 Subject / Birth Revision 결속

> Watchtower-Track: saju-bridge
>
> 상태: **서버 내부 General Natal Preview 증빙 결속과 부정 테스트 구현**.
> Production Interpretation, 출시, 결제, 공식 Reading 저장, Public API: **HOLD**.
>
> 선행: [Saju #2423](https://github.com/gycha0109-beep/Saju/pull/2423)
> / [MyeongHa #1739](https://github.com/gycha0109-beep/MyeongHa/pull/1739)
> / 작업 이슈 [MyeongHa #1728](https://github.com/gycha0109-beep/MyeongHa/issues/1728).

## 1. Authority 및 실제 호출 순서

1. 서버가 이미 검증한 `VerifiedSubjectIdentityEvidenceV1`만 입력. Client `subjectId`, Birth ID, Revision, 원전 Claim ref, 상품 manifest, 결제 플래그 금지.
2. `readBoundCurrentBirthContextV1`는 기존 `executePostgresSubjectTransactionV1`에서 `public.begin_member/guest_subject_context_v1`, `public.qry_self_birth_profile_current_v1`, `public.qry_birth_profile_current_revision_v1`를 실행한다. canonical `ResolvedSubjectContextV1`와 `BirthProfileReadResponseV1`를 **동일한 DB 권한 트랜잭션에서** 획득한다. 기존 `readBoundCurrentBirthProfileV1` signature/결과는 변경하지 않는다.
3. 기존 `bindCurrentBirthProfileRevisionForSajuV1` → `buildSajuProductionReadingRequestV1`로 **오직 General Natal / '전체 사주'** 요청을 만든다. 이 요청이 Saju `parseProductHostReadingRequest`의 정규화 결과와 일치해야 한다. Lunar leap, solar leap omission, HH:MM 분해, null sex 생략 테스트 벡터를 고정한다.
4. 명하 서버에서 생성한 별도 CSPRNG nonce를 **동일 시도에만** 사용한다. 서버 내부 발급 포트 `issuePreviewProof({nonce,request})`는 Protected Preview proof issuance만 수행하며, 타 공개/Production path를 받지 않는다.
5. **원본 요청의 독립 clone**과 서버 nonce로 `verifySajuHeldSourceProofV1`를 수행한다. 응답에서 해시/nonce를 받아 expected value로 되돌려 사용하지 않는다. 동일 실행 Source material과 서명, payload/response/request hash, time, canonical ID, atomic nonce claim 검사가 통과해야 한다.
6. DB 외부 HTTP 동안 PostgreSQL 트랜잭션을 열어두지 않는다. `readBoundCurrentBirthContextV1`를 재호출해서 새로운 권한 트랜잭션에서 동일 Subject/Birth/currentRevision/input을 확인한다.
7. 모든 조건 통과 시 **서버 내부** `state=held`, `reason=source_transport_integrity_verified_only`와 pin된 최소 IDs 반환. 누락·drift·replay·오류는 `blocked`; Saju 원문/출생값 반환 금지.

## 2. 일치성 항목

- canonical `resolvedSubject.subjectId` 및 `subjectKind`
- `birthProfileId`, `profileKind='self'`, `archivedAt=null`
- `currentRevision.revisionId`, `revisionNo`
- `calendarType`, `birthDate`, `birthTime`, `timeKnown`, `isLeapMonth`, `sex`
- signed request/response hash, nonce, reading/response IDs, source registry/profile/evidence material (Saju HMAC 검증)

동일 birth input을 다시 입력하더라도 Revision ID 또는 번호가 달라진 경우는 차단한다. 프로필 아카이브, 소유자 전환, locator/current revision 불일치도 차단한다.

**Saju 서명에는 명하 Subject ID 또는 Birth Revision ID가 직접 포함되지 않는다.** 이 단계가 성립하는 것은 명하가 자신의 인증된 DB 조회와 outbound request/nonce의 기대값을 독립 고정하고 before/after 권한을 재검증하기 때문이다. 실제 공식 Reading 저장을 수행할 때에는 **최종 저장 트랜잭션 내 조건부 Revision 재검증**이 별도로 필요하다. Recheck 이후의 동시 변경을 이 코드만으로 막았다고 주장할 수 없다.

## 3. 보호 및 실패 경계

- `issuePort`는 서버 내부 보호 전용 포트이며 실제 외부 서비스 Origin/credential/key provisioning을 활성화하지 않는다.
- `verifierTrust.claimNonceOnce`는 반드시 모든 앱 replica가 공유하는 atomic durable store를 구현해야 한다. 테스트 `Set`은 Production에서 사용할 수 없다. 저장소 오류·재사용 시 차단.
- Saju가 발급한 proof wrapper는 공개 ProductResponseV2 또는 Character/Commerce에 추가하지 않는다.
- 정상 synthetic HMAC fixture도 `sourceAuthority=NOT_EVALUATED`, `releaseAuthorization=NOT_EVALUATED`, `canExecute/canPublish/canSell=false`를 변경하지 못한다.
- 서명과 검증이 성공해도 **Production Interpretation 근거/의미/Claim 범위에 관한 실 출처 권한은 별도**다.

## 4. 검증 및 후속

- Subject/revision/실제 입력 drift, 동일 입력 새 Revision, 보관 상태, 잘못된 nonce, wrong request, tampered response, 권한 플래그 상승, replay, 공유 저장소 장애, before/after 트랜잭션 종료 시점 회귀 테스트.
- 신규 CI workflows 또는 DB migrations 없이 기존 Work Track `saju-bridge` 일반 CI 및 SHA-pinned CI Integration 사용.
- 후속 2B-3C-5: 다중 Slot 서로 다른 nonce, 각 source proof, 동일 Subject/Birth Revision/Source scope 확인, swap/replay/adversarial integration.
- 배포 전 별도: 실제 Saju 보호형 발급기 기동 및 명하 HTTP connector, 서비스 인증 및 키 회전, PostgreSQL/Redis atomic replay 저장소, 운영 감사; 실제 출시·판매 허가가 아님.
