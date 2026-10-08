# 명하 2B-2 — 서버 내부 두 슬롯 Preview 리허설 (HOLD)

> 상태: **source_provenance_not_exposed → HOLD**. 운영 상품, Official Reading 기록, 캐릭터, 결제 연결 금지. #1728 / #1730 후속.

## 실측 결과 및 접근

- `readBoundCurrentBirthProfileV1`은 검증된 subject identity evidence를 이용해 PostgreSQL 권한 컨텍스트 내부에서 현재 자기 Birth Profile과 리비전을 조회하고, 트랜잭션을 **종료한 후** 결과를 반환한다.
- `executeCurrentBirthProfileSajuReadingV1`은 해당 권한 조회 결과의 출생정보를 기존 Saju ProductHost request 형태로 변환한다.
- `createSajuPreviewReadingHttpAdapterV1`은 강제로 `/api/preview/readings`를 사용하며 source-owned v2 admission header 및 `preview` lifecycle header를 확인한다.
- Saju의 공개 `ProductReadingResponse v2`는 subject/revision/profile contentHash/Claim provenance를 한 번에 결속한 source-authorized 증빙을 제공하지 않는다. 이를 MyeongHa가 임의 계산·추정하여 만들어서는 안 된다.

## 구현

- `apps/api/src/saju-held-composite-preview-v1.ts`: HTTP route를 추가하지 않는 서버 내부 Preview 리허설 함수 `rehearseCurrentSubjectHeldCompositePreviewV1`.
- `test/saju-held-composite-preview-v1.test.ts`: 실제 어댑터 코드를 이용하는 합성 전송 테스트.
- 정해진 두 슬롯만 지원: `전체 사주`, `연애운`. 입력은 서버가 검증한 `verifiedEvidence`, 권한 있는 DB pool, Preview adapter config이며, 브라우저가 슬롯·출생정보·권한을 지정하는 인터페이스가 없다.
- 인증된 현재 출생정보를 한 번 읽고 동일한 `BirthProfileReadResponseV1`를 두 Reading 호출에 재사용한다. 순차 호출 후 출생정보를 **새 트랜잭션**에서 다시 읽어 profile ID, revisionId/No, 모든 원본 입력, self/archived 상태가 변경됐으면 모든 결과를 폐기한다.
- DB 트랜잭션은 Saju HTTP 호출 중 열어두지 않는다. malformed/미전달/중복 Response 또는 오류 시 전체 차단한다.
- 양쪽 Reading이 정상 Preview 형식을 갖춰도 `status=hold, reason=source_provenance_not_exposed`. `sourceAuthority/releaseAuthorization=NOT_EVALUATED`, `canExecute/canPublish/canSell=false` 고정.
- 반환값에 Reading 본문, birth detail, 원문 Claim이나 사용자의 민감한 값은 포함하지 않는다.

## 보장과 한계

**보장 가능한 것:** 서버 내부 Trusted Code에서의 인증된 현재 출생정보 조회(기존 경로), 같은 스냅샷 재사용, source-admitted Preview transport, 공개 응답 구조 확인, 사후 리비전 변화 검출, 중복 결과·부분 결과 차단.

**아직 보장하지 못하는 것:** public response 자체의 subject/revision pin, 해석 프로필 id/version/contentHash, 출처 근거·Claim coverage·의미 truth, 재회·시기 등의 합성 의미, 두 요청 사이의 완전 원자적 버전 스냅샷. A→B→A 전환이나 Saju source provenance 부족은 공개 응답만으로 검증할 수 없다. 따라서 성공한 리허설도 운영 상품으로 절대 승격하지 않는다.

## 후속 2B-3 선행조건

1. Saju source가 승인된 response↔subject/revision/profile/contentHash/provenance binding을 제공하거나, 기존 소유 증명을 식별하여 실측·계약화한다.
2. 전송이 각 Reading의 근거 식별자를 source-owned attestation으로 증명해야 2B-1 합성 검사를 운영 검증으로 대체할 수 있다.
3. 운영 SKU/Entitlement/Character 연결은 별도 트랙에서 승인. 본 단계 Production 출시 기능 없음.
4. 최초 연결 시 version drift, identity replacement, invalid attestation, source coverage partial, concurrent profile update에 대한 통합 검증 필요.

## 종료조건

- A: 두 Preview 요청이 동일한 권한 있는 Birth snapshot을 사용하고 종료 후 변화를 거부하는 테스트 통과.
- B: 웹/일반 원국/기록/DB 회귀 및 pinned CI 통합 전체 통과.
- C: source provenance 미제공 시 **항상 HOLD**, 운영 실행·상업 활성화·미검증 Claim 노출 없음.
