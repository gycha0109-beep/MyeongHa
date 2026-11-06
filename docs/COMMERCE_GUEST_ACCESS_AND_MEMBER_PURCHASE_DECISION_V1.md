# 명하 Guest Free Access / Member-only Paid Purchase Decision v1

> Product: **명하 (MyeongHa)**
> Date: **2026-11-07**
> Decision: **P0-CM-05**
> Supersedes: Guest paid-purchase permissions in `P0-CM-04` and `COMMERCE_GUEST_PURCHASE_OWNERSHIP_DECISION_V1.md`
> Status: **DECIDED / CURRENT PRODUCT POLICY**

---

## 1. 결정

Guest는 로그인 없이 제한된 무료 사주 경험만 이용할 수 있다.

- 현재 무료 진입: **무료 오늘의 운세**
- 추가 예정 무료 진입: Product Owner가 추후 지정할 **무료 사주 상품 1종**
- 그 외 사주 상품을 Guest 무료 이용 대상으로 자동 간주하지 않는다.

**모든 유료 상품 구매에는 로그인이 필요하다.** Guest 세션은 유료 구매를 시작할 수 있는 계정 자격이 아니다.

## 2. Guest 무료 이용과 유료 구매의 경계

```text
Guest
  ├─ 무료 오늘의 운세                 → 허용
  ├─ 추후 지정할 무료 사주 상품 1종    → 지정 후 허용
  └─ 유료 상품 구매                   → LOGIN_REQUIRED
                                         ↓
                                  로그인 / 회원가입
                                         ↓
                                  활성 Member 확인
                                         ↓
                                  Purchase Intent
                                         ↓
                                  Payment Attempt
                                         ↓
                                  Provider checkout
```

무료 경험은 유료 결제의 0원 버전이 아니다.

```text
Free experience
→ existing free-access / reading flow
→ no paid Purchase Intent
→ no Payment Attempt
→ no provider checkout
```

기존 Commerce 계약의 `amount_minor > 0` 규칙을 유지한다. 무료 경험을 0원 Purchase Intent로 우회시키지 않는다.

## 3. 유료 구매 자격

유료 Purchase Intent와 Payment Attempt를 만들려면 서버와 DB가 다음 조건을 모두 확인해야 한다.

```text
subjects.kind = 'member'
subjects.status = 'active'
subjects.auth_user_id IS NOT NULL
subjects.merged_into_subject_id IS NULL
```

- 로그인하지 않은 요청은 `AUTH_REQUIRED`로 거부한다.
- Guest 세션으로 인증된 요청은 `LOGIN_REQUIRED`로 거부한다.
- Guest가 유료 상품을 선택하면 로그인/회원가입 안내를 제공하고, Member 인증이 끝난 뒤 구매 흐름을 재개한다.
- Member 인증 전에는 Purchase Intent, Payment Attempt, Provider handoff, 유료 권한을 만들지 않는다.

이 검사는 UI에만 의존하지 않는다. HTTP 경계와 DB 쓰기 경계에서 모두 적용한다.

## 4. 소유권 및 기존 기록

Commerce owner는 계속 서버가 해석한 canonical `subjects.id`다.

Guest에서 새 Member로 전환하는 기존 promotion은 동일한 subject를 유지한다. 따라서 무료 경험에서 만들어진 동일 subject의 기록을 새 owner로 복사하거나 재귀속하지 않는다.

P0-CM-04가 유효했던 과거에 생성된 Guest 소유 Commerce 기록이 있다면:
- Receipt/Event/Grant의 역사적 `subject_id`를 변경하지 않는다.
- 이 결정은 과거 기록을 삭제하거나 재작성하지 않는다.
- 다만 신규 Guest 유료 구매를 허용하는 근거로 사용할 수 없다.

## 5. 구현 영향

- Purchase Intent v2/v3: 활성 인증 Member만 허용.
- Saju Record 구매 Admission: 활성 인증 Member만 허용.
- Payment Attempt 생성: 활성 인증 Member만 허용.
- Guest가 유료 구매를 요청하면 안정적인 `LOGIN_REQUIRED` 응답을 반환한다.
- DB trigger가 내부 명령 경로에서 Guest 유료 구매가 생성되는 우회를 차단한다.
- Guest bootstrap 및 무료 오늘의 운세 경로는 이 변경으로 막지 않는다.

## 6. 이 결정이 승인하지 않는 것

- 추후 무료 사주 상품의 정확한 상품명/Product key/구현
- 유료 상품별 가격, Offer, Charge Terms 및 판매 활성화
- PortOne LIVE 자격증명, 실제 결제, 공개 Checkout route
- Production DB 적용 및 실제 판매 개시

`P0-CM-03`, PSP 운영 준비, Production 배포 gate는 기존 결정대로 별도 유지.

---

## 7. 검증 기준

| 상황 | 기대 결과 |
|---|---|
| Guest가 무료 오늘의 운세 이용 | 허용 |
| Guest가 추후 지정된 무료 사주 상품 이용 | 지정·활성화 후 허용 |
| Guest가 유료 상품 선택 | `LOGIN_REQUIRED` |
| Guest가 Purchase Intent API 직접 호출 | 거부, DB 미접속 |
| Guest가 Payment Attempt API 직접 호출 | 거부, DB 미접속 |
| DB 명령을 통해 Guest Purchase Intent 생성 시도 | DB 거부 |
| DB 명령을 통해 Guest Payment Attempt 생성 시도 | DB 거부 |
| 활성 Member의 유료 구매 | 기존 Commerce 검증 절차 진행 |
| 과거 Guest 소유 Commerce 기록 조회/보존 | 원본 owner/provenance 유지 |

**운영 DB 적용, LIVE checkout, 실제 판매를 승인하는 결정은 아니다.**
