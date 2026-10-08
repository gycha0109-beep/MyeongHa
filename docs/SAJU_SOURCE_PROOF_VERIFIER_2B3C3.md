# 명하 2B-3C-3 — Saju Preview Source Proof 서버 검증기

> Watchtower-Track: saju-bridge
>
> 상태: **독립 검증기 + 테스트 구현. 실제 Subject/Birth Revision 결속, 외부 HTTP 호출 활성화, Production 공개·판매: HOLD.**
>
> 선행: [Saju #2418](https://github.com/gycha0109-beep/Saju/pull/2418), [Saju #2423](https://github.com/gycha0109-beep/Saju/pull/2423) (검증 대상 발급 계약). 목표: [MyeongHa #1728](https://github.com/gycha0109-beep/MyeongHa/issues/1728).

## 정확한 경계

`apps/api/src/saju-held-source-proof-verifier-v1.ts`의 `verifySajuHeldSourceProofV1(envelope, trust, context)`는 명하 서버에서 **독립적으로 구성한** expectation과 Saju의 server-only response envelope를 비교한다.

- HMAC SHA-256, `myeongha/saju/source-transport-proof/v1\\0` 도메인 분리, deterministicContentHash 규칙(UTF-8 JSON canonical object key sort, undefined/nonfinite 처리)을 Saju v1과 일치시킨다.
- `issuer`, `audience`, `keyId`, 32바이트 이상 secret은 명하 서버 전용 신뢰 설정에서만 공급. HTTP 응답이나 브라우저/상품/캐릭터 필드에서 신뢰 설정을 구성하지 않는다.
- `expectedNonce`, `expectedRequestBody`는 인증된 명하 서버의 실행 컨텍스트로부터 독립 결정한다. Saju가 반환한 값이나 사용자가 보낸 해시를 expectation으로 재사용하면 검증이 무효가 된다.
- 기존 shared `projectProductReadingResponseV2`로 공개 응답 shape/상태를 검사하되, schema admission만으로 source authority를 부여하지 않는다.
- Source proof wrapper/payload/material 정확한 키, Preview lifecycle, issued/expires + 15초 허용 시계 오차, 본문 digest/reading 및 response identity, MAC timingSafeEqual 검사 후에만 `claimNonceOnce`를 호출.
- `claimNonceOnce`는 전 replica/프로세스를 포괄하는 **원자적 공유 저장소**로 필수 주입한다. 확인 거부·저장소 장애·누락 시 항상 blocked. `issuer:audience:nonce`가 소비 키이고 proof 만료까지 고유성을 유지해야 한다.
- 검증 결과는 Reading 원문이나 출생정보를 반환하지 않고, 최소 Source 식별자만 `verifiedSource`로 노출한다. 이 정보도 서버 전용이다.

## 계약 불변

```
state = held | blocked
transportIntegrity = VERIFIED | NOT_VERIFIED
sourceAuthority = NOT_EVALUATED
releaseAuthorization = NOT_EVALUATED
canExecute = false
canPublish = false
canSell = false
```

HMAC은 **서버 전송 출처/바이트 무결성**이지 Saju Claim 의미의 Production 허가가 아니다. synthetic 정상 fixture도 운영 해석·상품 판매를 승인하지 않는다. Saju 의미의 권한은 Saju 소유이며, 명하의 Subject·현재 Birth Profile Revision·소유권 검증은 명하가 담당한다.

## 미연결 영역 및 후속

1. 본 PR은 기존 Preview/Production 엔드포인트 또는 공개 API에 붙지 않는다. 호출자에게 key/nonce/digest를 입력하게 하는 라우트도 만들지 않는다.
2. 2B-3C-4에서 서버가 현재 Subject 및 Birth Revision을 인증하고 해당 revision에서 산출한 정규화 Birth/Reading 요청과 nonce를 pin한다. proof 검증 전후 revision drift 검사를 별도 수행한다.
3. Redis/PostgreSQL 등의 전역 atomic nonce claim, issuer key rotation/secrets provisioning, 실제 Saju protected HTTP 발급 호스트 운영 결선은 독립된 배포 검증을 거친다.
4. Composite 각 슬롯은 **서로 다른 nonce 및 독립적인 source proof** 검증을 요구하며 새 Saju Claim 합성을 금지한다.
5. 테스트의 `Set` 기반 claim은 **테스트 더블**이며 Production 배포 가능 구현이 아니다.
6. 임의 Production activation, Character, Commerce, 신규 CI workflow 수정 없음. 기존 품질/회귀 및 SHA-pinned 통합 CI를 재사용한다.

## 검증

정상 Saju 계약 동등 MAC/응답/nonce 검증, 동일 proof 재검증(replay), payload/body/증빙/profile/키/대상자/ttl/clock/lifecycle/권한 상승/내부 shape 오염/공유 저장소 장애를 각각 거부한다.
