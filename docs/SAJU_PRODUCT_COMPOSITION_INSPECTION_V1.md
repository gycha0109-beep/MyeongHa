# 명하 사주 상품 조합 사전검사 v1 — 기존 브릿지 확장

> 상태: 구현 후보 / 연구·내부검증 전용. Product/Saju/Character/Commerce Production 권한 승격 없음.
> 담당 저장소: `gycha0109-beep/MyeongHa`
> 현재 계약: `apps/web/reading-detail-route.js`, `apps/web/reading-saju-engine-request.js`

## 목적

- 일반 사주와 향후 캐릭터 전용·프리미엄 상품의 **요청 구성 재사용성**을 먼저 확인한다.
- 기존 `ConsumerReadingRequestInput → ReadingIntent → DomainReadingProfile` 경로를 대체하지 않는다.
- 이 단계는 **웹 상품의 읽기 요청 구성이 가능한지** 검사하는 단계다. 명리 의미 존재·상품 출시·결제 권한을 판정하지 않는다.

## 변경 파일

- `apps/web/saju-product-composition-inspection.js`: 읽기 슬롯 설정을 기존 라우트/요청 어댑터에 투영하는 순수 함수
- `apps/web/saju-product-composition-inspection.d.ts`: 명시적 타입 계약
- `apps/web/saju-product-composition-inspection.test.ts`: 단일/복합/잘못된 구성/입력 결손/상업 권한 오용 회귀

## 작동 범위

| 계층 | 결정 가능한 내용 | 결정 불가능한 내용 |
| --- | --- | --- |
| Saju source | 명식·계산·의미·ReadingIntent·Claim·Evidence·승격 조건 | 개별 판매 가격·콘텐츠 경험 |
| MyeongHa 상품 구성 사전검사 | 기존 버튼을 통한 요청 슬롯들의 순서·필수/선택·입력 유무 | 해석 의미, 두 Reading 간 새로운 인과·기간 결론 |
| Character | 허가된 Grounding의 표현·관점·화법 | 새 운세 의미·재회 예언 |
| Commerce | 승인된 상품의 결제·이용 권한 | 사주 의미·출시 가능성 자동 추론 |

## 사전검사 결과의 해석

- `request_projection_complete`: 기존 입력 문법으로 요청을 구성할 수 있다는 **문법적 결과만** 의미한다.
- `requires_input`: 필수 슬롯에 필요한 명시적 입력이 없다. 해당 상품은 요청 단계에서 정지한다.
- `blocked`: 정의가 잘못됐거나 지원되지 않는 라우트/문법을 포함한다.
- 필수 슬롯은 모두 요청 가능하고 선택 슬롯만 입력이 없으면 선택 슬롯을 생략한다. 다만 **상품 정책상 해당 선택 슬롯 생략이 허용되는지는 별도 상품 승인 대상**이다.
- 반환되는 모든 결과는 `releaseAuthorization=NOT_EVALUATED`, `canExecute=false`, `canPublish=false`, `canSell=false`로 고정한다.
- 유료 가격, entitlement, 판매 여부, 공개 여부를 manifest 안에서 주입할 수 없다.

## 연구용 사례

### 1) General Natal

입력: `?topic=temperament&scope=original`

→ 기존 요청 어댑터가 `domain=general, readingText=전체 사주`를 만든다.

이 결과가 존재한다는 사실만으로 Product Reading 응답이 실제 의미 근거를 가졌다고 판단하지 않는다.

### 2) 세연의 첫사랑 재회 사주 — 상품 확장성 실험

필수 후보: `?topic=love` → `relationship / 연애운`

선택 후보: `?scope=year` → `general / 올해 운세`

이 두 요청의 조합은 **재회 가능성, 재회 시점, 상대 의사, 관계 회복의 인과관계를 해석할 수 있다는 뜻이 아니다**. 위 관계·연간 결과는 서로 다른 근거를 가지고 있으며, 결합으로 새로운 결론을 만들 수 없다. '재회'에 관한 특별한 의미가 필요하다면 Saju source에서 독립된 적격성 심사가 선행되어야 한다.

세연의 캐릭터 ID·관계 기억·서사·출력 권한은 이 검사기의 입력/출력에 없다. 캐릭터 파트는 기존 `CharacterGroundingBundle`·Perspective·Semantic Guard·Output Guard를 통해 별도로 구성한다.

## 검증 기준

1. `일반 원국` 요청 후보와 `연애+연간` 복합 요청 후보가 기존 요청 어댑터의 정확한 `domain/readingText/version`으로 나오는지 테스트
2. 궁합/질문형에 필수 입력이 없을 때 임의 값을 만들어내지 않는지 테스트
3. 지원되지 않는 기간·중복 라우트·중복 슬롯·미지 슬롯·임의 판매 설정 입력을 차단
4. 동일한 입력에서 동일한 순서와 결과를 얻는지 확인
5. CI에서 신규 테스트 및 웹 회귀 테스트 통과 확인

## 아직 하지 않는 일 / 추후 단계

- 새로운 `Product Mapper`, 해석 엔진, T8/T9/T10/T11 의미 계층을 만들지 않는다.
- 사주 원본 명식·Claim Graph를 프론트 상품 설정에 복제하지 않는다.
- 상품 설정을 DB SKU로 승격하거나 가격, entitlement, payment, 출시 여부에 연결하지 않는다.
- 실제 HTTP 요청·서버-side 정합성·동일 birth revision/source pin 확인은 다음 단계의 **승인된 서버 실행 계층**에서 검증한다.
- `ProductReadingResponse` admission, coverage, 프로필 버전/hash, 필수 슬롯 source-authority, 캐릭터 Grounding, 개인정보 접근 권한, 결제 lifecycle을 모두 만족해야 별도 출시 심사를 요청할 수 있다.

## 다음 구현 단계

1. 기존 일반 원국 실응답에 대한 Saju ProductReadingResponse source-owned admission/coverage/snapshot 검증과 프론트 표시까지 종단 간 고정
2. 두 개 이상의 허가된 Reading에 동일 subject/birth revision/engine version을 적용한 복합 실행 계약 추가(상품 차원의 의미 융합 없음)
3. 권한이 증명된 결과에 한해 1인 캐릭터 Grounding/rendering vertical slice 연결
4. 실제 프리미엄 상품은 개별 사주 의미/콘텐츠/상업 승인 후 별도 PR로 활성화

## 기존 소유권과의 관계

- `docs/SAJU_INTEGRATION_SPEC.md`: response admission / Production HOLD 유지
- `docs/COMMERCE_ENTITLEMENT_SPEC.md`: 상업 권한 독립 유지
- `docs/CHARACTER_C1_SAJU_SAFE_RENDERER_BASELINE.md`: 캐릭터 의미 변경 금지
- Saju 저장소 `docs/product/11-reading-intent-composition-contract.md`, `12-reading-profile-content-authorization-contract.md`: 기존 프로필 선택/검증 계약 재사용
