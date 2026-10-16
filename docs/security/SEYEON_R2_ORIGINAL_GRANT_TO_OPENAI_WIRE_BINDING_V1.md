# 세연 R2 — 원본 Grant / SourceSet → 실제 OpenAI 직렬화 바이트 결속 증명 v1

> Watchtower-Track: security
>
> **OFFLINE-ONLY DEVELOPMENT CANDIDATE · NON-AUTHORITATIVE · G0 TECHNICAL SIGN-OFF HOLD**
>
> 2026-10-13 · [PR #1985](https://github.com/gycha0109-beep/MyeongHa/pull/1985) · [제품 Owner 정책 승인](./SEYEON_G0_PRODUCT_OWNER_POLICY_APPROVAL_2026-10-13.md) · [G0 D-03 Blueprint](./SEYEON_G0_D03_G1_POSITIVE_PIN_DB_BLUEPRINT_V1_PROPOSED.md) · [R2 실제 Adapter Wire 증거](./SEYEON_R2_REAL_OPENAI_ADAPTER_WIRE_BOUNDARY_PROOF_V1.md)

## 이번 단계에서 실제로 연결한 것

**원본 권한 확인 → 네트워크 직전 동일 데이터인지 확인**하는 개발용 통합 관측입니다. 새 SQL 운영 함수나 개인기록을 모델에 투입하는 허가는 아닙니다.

- **DB 근거:** `seyeon-offline-r2-db-source-set-binding-v1.ts`의 기존 `observeSeyeonOfflineR2DbSourceBindingV1`로 동일 Subject/Thread/Turn/Attempt, immutable SourceSet 1건/ordinal 0, Record ID, **Original Grant ID**, Record Type/Schema, DB `sha256:pg-jsonb:v1` pinned/current digest, original Grant active를 검사합니다. 이 값은 테스트에서 DB 재조회하거나 합성 fixture로 공급되므로 서명된 DB Owner 자격증명이 아닙니다.
- **현재 입력 출처:** `seyeon-offline-r2-provider-ingress-audit-v1.ts`를 사용해 두 Preflight 분류/Native Interpreter·Renderer·Reviewer의 실제 모델 입력 안에 S0 외 출처가 섞였는지 검사합니다. 분류 이후 3단계에는 `observeSeyeonOfflineR2PostPreflightClosureV1`의 합성 재조립 Context 전체 비교가 추가됩니다.
- **전송할 정확한 데이터:** 신규 `apps/api/src/seyeon-offline-r2-db-wire-binding-v1.ts`의 `observeSeyeonOfflineR2DbWireBindingV1`가 **실제** `openai-seyeon-structured-provider-v1.ts`의 `meteredBeforeDispatch`에 전달된 `serializedRequestBody`를 검증합니다. 모델, 서버 지침 + 정확한 untrusted-data 방어문, `user input_text` 이중 JSON 직렬화, Schema name/strict schema, 추가 필드 부재, UTF-8 바이트 길이/해시를 검사합니다. `canonicalJson`과 `JSON.stringify`, PG `jsonb::text`의 각각 다른 코덱을 구분합니다.
- **관찰 결과:** Original Grant Source observation + Attempt + selectedSourcesDigest + native request digest + 전송 직전 `sha256:utf8:v1` wire digest + stage/purpose를 버전 있는 **비서명 결속 지문** 하나로 계산합니다. 결과의 `permitsProductionProvider`와 `permitsProductionReveal`는 항상 `false`입니다.
- **모의 수신:** 기존 실제 Adapter의 `fetchImpl` 테스트 대체는 직전 Hook의 Request Body와 fake HTTP fetch의 `init.body`가 같은 문자열/바이트 지문인지 확인합니다. OpenAI 서버까지 TLS 통신을 해서 실제 수신한 증명은 아닙니다.

## 실제 추가 테스트

| 파일 | 통과해야 할 범위 | 비고 |
| --- | --- | --- |
| `test/seyeon-offline-r2-openai-wire-boundary-v1.test.ts` | Native Preflight 2 + 실제 출력 계보 Interpreter→Renderer→Reviewer 3 = **5번** 모두 DB Source observation에 결속, 가짜 fetch 바이트 동일성 | 합성 SourceSet/Record/Grant; 0 network |
| 같은 파일의 부정 회귀 | Revoke, 재발급 Grant ID, Attempt 바꿔치기, JSONB content digest 변경, SourceSet digest, type, Subject 불일치, DB observation read failure이면 **추가 fetch 호출 0** | 매 Stage 새 observation을 받는 개발용 Port |
| `test/seyeon-offline-r2-real-db-source-boundary-v1.test.ts` | 별도 CI 플래그로 활성화되는 실제 disposable PostgreSQL 실 SourceSet·Original Grant Row에서 **매 Provider before-dispatch마다 재조회** → actual OpenAI Adapter Serializer → fake fetch, revoke/content 변경 후 재시도 HOLD | 테스트 SQL 트랜잭션은 무조건 ROLLBACK. 환경 플래그 없으면 skip. Production SQL/Provider 호출 없음 |

정확한 GitHub HEAD에서 TypeScript + Character + DB Authority 테스트를 재확인해야 합니다. CI 이력이 없거나 이 실 DB 테스트가 `skip`이라면 그 범위를 **실제 DB PASS라고 기재하지 않습니다.**

## 주요 보안 한계와 차기 G1/G2 작업

1. **서명/권한 없음:** 이 모듈의 `observation`은 함수 인자로 전달됩니다. 원본 Grant가 ACTIVE라고 쓰고 SHA를 맞추더라도 호출자가 조작할 수 있습니다. 실제 서비스에서는 **DB Owner RPC가 직접 검증·발급한 결속 증거**와 같은 DB Transaction 내 원본 Row 잠금 및 현재 권한 재검증이 필수입니다.
2. **DB Pin 원자성 없음:** R1 SourceSet Sidecar 및 테스트용 `seyeon_positive_candidate` 함수는 기존 1640 Zero-Only / G2 실제 v2 Commit의 합법적 대체제가 아닙니다. 운영 적용·positive Provider 권한 없음.
3. **모의 HTTP 수신:** Adapter Hook와 `fetchImpl`까지 동작했음을 확인합니다. 실제 외부 Provider가 동일 바이트를 수신했음을 확인하거나 미승인 데이터의 외부 전송을 허락하지 않습니다.
4. **Revoke 경합:** 개발용 Hook의 DB 재조회와 실제 TCP 전송, PostgreSQL Commit 사이에 독립적 선형화가 없습니다. Fetch 직전 또는 Response 이후 Revoke 경합을 실 운영에서 금지하려면 D-04/D-06 Owner 동시성 계약과 실제 두 세션 DB 증거가 필요합니다.
5. **출처 범위:** S0 직접 Memory 1건/최초 현재 대화만 오프라인 검증합니다. 과거 대화, 요약, Relationship, Reader/Saju·결제 entitlement, 다른 캐릭터/상호 참조를 silently 제외하거나 권한을 자동 상속하지 않습니다. S0 1건은 검증 범위이지 제품의 영구 기억 제한이 아닙니다.
6. **로그·재시도:** 운영 모델 입력 원문/실 사용자 내용·Grant는 로그로 복제하지 않습니다. 실패·DB 부재·응답 형식 변조는 HOLD, 자동 유료 재호출 0.

**다음 실체 과제:** R0 D-01~D-10 해당 기술 오너의 서명 → R3 G1 positive immutable SourceSet+기존 1640 XOR 승인된 Forward migration → R4 실제 API 호출 전 DB Owner Pin-Commit/receipt → R5 G2 same transaction Grant recheck→Commit 및 revoke 경쟁 → G3 read/replay/history 권한. #1887 운영 DB 계보/DR 확인 전에는 운영 스키마 배포하지 않습니다.
