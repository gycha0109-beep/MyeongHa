# 명하 Reader 상품 리모델링 v1 — Standard 공통 / Premium 캐릭터 전용 연결

> 상태: PRODUCT DECISION CAPTURED / 구현 후보 DRAFT / 승인 행 0·유료 공개 OFF
> Watchtower-Track: applizing
> 참조: Product #1999, Preflight #2005, v2 Binder 설계 #2003, 일반 사주 범용화 #1777, 공통 잠금 #1983→#2004

## 1. 제품 결정과 경계

**일반 사주(Standard)** 는 현재 제작한 공통 사주 상품이며, 공식 Reader 9명 누구나 **동일한 Product의 해설 주체로 선택할 수 있다**. 이는 각자의 전문 `character_capabilities.can_initiate`와 무관한 **상품 적격성**이다. 정확한 Subject·Reader·Purchase Intent·검증된 Receipt·독립 구매권 Grant·출판 Release·Unlock·Saju Source·A2/T2 권한이 필요한 별도 축은 그대로 유지한다. **9명 가능 ≠ 1회 구매로 9명 모두 무료 개방**이다.

**프리미엄 사주(Premium)** 는 나중에 만드는 **특정 캐릭터의 상품**이다. `premium_character_bound` + `targetReaderId`는 그 상품에서 어떤 Reader 하나가 대상인지 연결하는 관계이다. 전용 Product의 Reader 지정은 다른 캐릭터의 Standard/Product·해설 기능에 대한 **전역 접근 금지 규칙이 아니다**. 다른 Reader가 그 프리미엄 Product를 통해 결속할 수 없다는 것과, 다른 Reader에 대한 일반 이용 금지는 다르다.

- 상품 규칙: `standard_all_readers` 또는 `premium_character_bound(targetReaderId: OfficialReaderId)`.
- 과거 후보였던 `premium_restricted(allowedReaderIds[])`는 **이 미병합 정책 계약에서 폐기**한다. 목록 0개·복수·위장 Reader 허용은 사용하지 않는다.
- DB private approved policy는 Product/Spec/Domain/approved revision/withdrawal을 기존과 동일하게 소유한다. Standard는 대상 Reader null, Premium은 정확히 한 공식 Reader ID. Product별 승인 행은 여전히 0개로 시작한다.
- `targetReaderId`가 일치해도 **Product 선택 후보만** 반환한다. 프리미엄 실제 구매·권한 발급·전문 행동·Reader 공개는 별도 승인 전 HOLD한다.
- `character_capabilities.can_initiate`는 전문 행동과 캐릭터 전문성의 별도 권위이다. 모든 Reader×Domain 행을 true로 만들지 않는다. Standard 해설을 전문 권한으로 위장하지 않는다.

## 2. 저장·연결 구조

```text
Standard Saju Product (Product×Spec×Domain×approved revision)
  └─ standard_all_readers
        └─ 모든 공식 Reader (9명) 상품 적격성
              └─ Subject별 정확한 Grant/Reading/Reader 결속 및 공개 조건 별도

Premium Saju Product (Product×Spec×Domain×approved revision)
  └─ premium_character_bound
        └─ targetReaderId = 단일 캐릭터
              └─ 해당 Premium Product의 Reader 선택 후보
                    └─ 실상품/전문 기능/구매권/공개 승인 전에는 HOLD
```

**불변:** 일반/프리미엄 모두 원본 사주 증빙은 공식 엔진·공식 Reading authority를 따라야 한다. 특정 Reader의 해설은 Reader interpretation에 속하고 공식 Reading의 의미·계산 원본을 임의로 덮지 않는다. 일반 캐릭터 채팅·캐릭터 메모리·전문 행동 권한과 유료 사주 접근권을 합치지 않는다.

## 3. 실제 코드 변경 범위

| 계층 | 기존 후보 | 리모델링 |
|---|---|---|
| Product TypeScript Rule | `premium_restricted + allowedReaderIds[]` | `premium_character_bound + targetReaderId` |
| approved DB Rule (미병합 1770) | nullable `allowed_reader_ids text[]` | nullable `target_reader_id text`, Standard null, Premium 공식 Reader 1명 CHECK |
| DB Approved Rule port | 다중 ID 검증/배열 반환 | 단일 공식 Reader ID 검증/반환 |
| A1 Catalog/Unlock Product Gate | Premium 목록 멤버 검사 | Premium 대상 Reader와 정확한 일치 검사 |
| B1 v2 Preflight | Premium allowlist Reader도 HOLD | Premium target Reader도 HOLD |
| 테스트 | 목록/중복/다수 positive | 9×9 Standard, Premium 9개 대상 연결·교차 거절, 구형 배열 거절, DB CHECK 부정 |

이것은 **미병합 1770 마이그레이션 설계 대체안**이다. 이미 운영 DB에 적용된 버전을 재작성하지 않는다. 1770은 #2001과 버전 번호가 중복되어 소유자 합의·정식 번호 배정 전에 병합/배포할 수 없다. #1960의 기존 1720 충돌도 별도 소유자 작업이다.

## 4. CAP-B2 이후 단계의 수정 계약

1. **Owner/DB 선행:** #1999/#2001 번호 충돌 정리, Product 정책 승인/철회 동시성, 공식 Reader ID DB 정합성 및 변경 가능 범위 확정. 초기 official Reading 및 추가 Reader의 공통 잠금 키와 Commerce 발급·환불/회수 Writer 적용을 보증한다.
2. **B2 실제 Binder:** 기존 migration 1220을 수정하지 않고 새 forward-only private Writer를 만든다. 정확한 Standard 승인 규칙이 있으면 specialist `can_initiate` 검사 없이 일반 해설 **후보**를 판단하되 Receipt/Grant/Birth/Release/Unlock/Source/잠금 검사를 전부 통과한 경우만 실제 결속한다.
3. **Premium Binder:** Standard 분기를 재사용해 Premium 우회하지 않는다. 실제 개별 캐릭터 연결 Product·승인 Offer·가격·전문 Capability 및 별도 서비스 제공 계약 확정 이후 독립 구현·검증한다. 이 PR은 Premium 구매/결속을 열지 않는다.
4. **B3:** disposable PG15/17, Standard Reader×Domain 매트릭스, no-specialist-positive, Premium 정확한 target/other-deny, 정책 개정·철회/환불, 2-connection race, replay 및 immutable provenance 검사.
5. **B4~B5 / S3~S8:** 정확한 Reader·Grant·Saju Source·확정된 policy를 A2/A3/T2 및 RR-03/RR-04 후속 조회에 연결; Privacy 격리 및 운영 DR 복구, Product/DB/Commerce/Reader/Legal/Release 승인 후 별도 공개 결정.

## 5. 검증 및 출시 차단

- 승인된 일반 사주 **상품 적격성**과 실제 거래 **이용 권한**을 절대 혼동하지 않는다.
- Reader 전문 Capability를 프리미엄 단일 상품 연결과 혼동하지 않는다.
- 미승인 policy row 삽입, 임의 정식 SKU/Offer/가격 생성, public API 노출, 유료 채팅 본문 반환, 자동 환불 거부 모두 금지한다.
- 이 리모델링은 기존 미병합 #1999·#2005와 설계 #2003의 `premium_restricted` 설명을 **새 모델로 대체하는 제안**이다. 다른 트랙의 운영 결정을 임의 승인하지 않는다.
