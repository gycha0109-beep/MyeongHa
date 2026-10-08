# 명하 Saju Composite Reading 2B — 합성 일관성 검사 계약 v1

> 소유: MyeongHa Product Integration. 상태: `synthetic_inspection_only` / Production·출시·판매 권한 **영구 미부여**.
> 관련: #1728, 사전검사 #1726, 일반 원국 화면 검증 #1729

## 현재 실측 계약

- 명하 `apps/api/src/saju-production-reading-execution.ts`는 이미 한 번에 한 Reading만 수행하며 출생정보를 `BirthProfileReadResponseV1`로 받는다.
- `apps/api/src/saju-production-reading-http-adapter.ts`는 authenticated Saju HTTP response의 source-owned `ProductReadingResponse v2` admission attestation 및 Preview lifecycle을 검사할 수 있다.
- Saju `ProductReadingResponse v2` public payload에는 user subjectId, Birth Profile revisionId, engine version, reading profile contentHash, raw Claim source identifiers를 한꺼번에 입증하는 완료된 증명 표면이 없다. 따라서 응답만 보고 동명식·동근거·production-ready로 인정하면 안 된다.
- 기존 공유 `projectProductReadingResponseV2`는 공개 상태/블록 문법을 검증하지만, 실제 해석 규칙의 진실성이나 출처 적격성을 검증하지 않는다.

## 이번 2B 구현

- `apps/api/src/saju-composite-reading-inspection-v1.ts`: 타입이 정의된 순수 함수 `inspectGovernedSajuCompositeReadingV1`
- `test/saju-composite-reading-inspection.test.ts`: 정상 합성 후보, 이종 subject/profile/revision/engine/source, 프로필 해시, 결손, 중복 Reading, 미허가 readingText, source evidence 누락, 권한 주입을 검사
- 새 라우트, 새 DB, 새 상품 매퍼, 새 Saju 계산/의미 엔진, 새 CI 워크플로 없음.

## input contract

- `mode: synthetic_inspection_only`, `productId/productVersion`
- 서버 실행이 향후 소유해야 할 `context`: `subjectId`, `birthProfileId`, `birthRevisionId`, `birthRevisionNo`, `engineVersion`, `sourceSnapshotRef`
- `slots`: 2~8개, 기존 **현재 Preview에서 허용한** `전체 사주`, `직업운`, `재물운`, `연애운`, `사업운` 텍스트 및 각 슬롯의 필수/선택·정확한 `profileRef {id,version,contentHash}`
- `results`: 각 슬롯의 `readingText`, `binding`, `profileRef`, `sourceEvidenceRef`, 기존 `ProductReadingResponse v2` 원문

**주의:** `context`, `profileRef`, `sourceEvidenceRef`는 현재 **합성 fixture에 기술한 문자열/값**이며 검증 함수 자체는 그것이 서버 또는 Saju에서 발급된 진짜 증거인지 확인할 수 없다. 서로 일치한다는 결과만 출력한다. 미래 운영에서는 서버가 사용자 인증·현재 출생 리비전·출처 및 의미 권한을 조회·검증하는 포트가 필요하다. 클라이언트가 `context`나 `sourceEvidenceRef`를 제공할 수 있도록 엔드포인트를 만들면 안 된다.

## output contract

| state | 의미 | 운영 권한 |
| --- | --- | --- |
| `consistent_fixture` | 제공된 합성 context와 각 Reading이 문법·식별자 수준에서 일치 | 없음 |
| `held_for_policy` | 선택 슬롯 결손 또는 non-delivered. 독립적인 상품 정책 없이는 제한 제공 불가 | 없음 |
| `blocked` | 필수 누락, 버전/출처 불일치, 미승인 읽기 또는 오류 | 없음 |

모든 반환에서 `sourceAuthority=NOT_EVALUATED`, `releaseAuthorization=NOT_EVALUATED`, `canExecute=false`, `canPublish=false`, `canSell=false`이다.
검사기의 성공은 **Production interpretation authority, Claim coverage 또는 source admission을 승인한 사건이 아니다.**
출력에는 Reading 텍스트/Claim을 넣지 않는다. 각 슬롯의 읽기 ID·응답 ID·프로필 ref·출처 식별자만 반환한다.

## 검증 규칙

1. 외부 필드가 주입된 manifest/context/slot/binding/result/profileRef는 잘못된 입력으로 거부한다.
2. 모든 Reading은 동일 subject, Birth Profile, revisionId+revisionNo, engineVersion 및 sourceSnapshotRef와 일치해야 한다.
3. 각 Reading의 `profileRef.id/version/contentHash`는 승인된 것처럼 가정하지 않고 **기대 ref와 일치**해야 한다.
4. `sourceEvidenceRef`의 존재와 식별자 형식을 확인한다. 진위·내용·원전의 승인까지 검증한 것으로 표시하지 않는다.
5. 기존 공유 `projectProductReadingResponseV2`를 사용하여 display-vocabulary와 상태 계약을 점검한다. non-delivered는 임의 승격 불가.
6. responseId와 readingId 중복 금지, 알 수 없는 슬롯 금지. 미승인 연간·월간 Preview request 금지.
7. 필수 슬롯의 누락/비전달은 차단. 선택 슬롯 결손/비전달은 `held_for_policy`로 보류하고 자동으로 완성 상품으로 표시하지 않는다.
8. 조합 중 신규 사주 Claim·재회 확률·시기·인과 관계 생성은 전혀 지원하지 않는다.

## 소유권/후속

- Saju 원전·T8/T9/T10/T11 연구 및 프로필 내용 권한: Saju
- Source-owned response admission/현행 HTTP 전송: Saju와 기존 명하 Saju adapter
- `Birth Profile` 소유권·개별 사용자 인증·실제 DB revision 조회: 명하 기존 Auth/Profile
- Character Grounding/Render: #932, Commerce: #1034. 본 PR에서 미접촉

### 다음 PR(2B-2) 최소 선행 조건

1. 실제 source-authorized profileRef/Claim coverage/해석 버전/출처 증명 포트를 식별하고, 없는 증빙은 **source gap**으로 기록.
2. 단일 subject·명식 리비전을 서버에서 단 한 번 확인하고 둘 이상의 Saju 요청에 같은 pin을 적용할 수 있는 검증된 서버 호출 경로 설계.
3. 응답마다 server-side verified revision/provenance binding을 대조. 실행 도중 현재 revision이 변경되면 재검증 또는 폐기.
4. Production Interpretation Authority HOLD 해제 전에는 실제 서비스 출시에 사용할 수 없으며, #1728 이슈/운영 게이트를 우회할 수 없음.

## 합격 조건

- A. 검사기와 합성 회귀 테스트 통과.
- B. 기존 일반 원국 2A·공식 기록 재열람 및 공통 CI 유지.
- C. 무조건 운영·상업 권한 미부여, 의미 통합 금지, 계약 공백 명시.
