# 사주 브릿지 최종 완료 실행 계획 — 8C-2B-2D (2026-10-10)

Watchtower-Track: saju-bridge

> 기준: MyeongHa `main @ a58523b75c0cdebe9203e8f2db686781d4106d7f` 확인, 3-03 구현 PR #1850/#1851/#1862 및 3-04-01 운영 런북 PR #1856 병합 확인.
> 이 문서는 운영 승인이나 Production 공개 허가가 아니다. 실제 Secret, DB GRANT, Supabase provisioning, Runner 실행, Commerce 활성화는 미실행/HOLD다.

## 1. 최종 완료 정의를 세 가지로 분리

1. **계약/코드 완료(현재 완료):** Permit V2, Registry, Target Evidence, 합성 서명 검증, PG15/17 격리 CI 계약 및 3-03 SHA 고정 통합 CI.
2. **브릿지 최종 완료(남은 목표):** 독립 신뢰 루트, 운영 대상의 실제 관찰, 권한이 제한된 Target Authority V2, 단일 격리 스테이징 rehearsal 및 검증·폐기·복구 기록 인수.
3. **정식 서비스 출시(별도 결정):** Saju 해석 Production authority, MyeongHa Subject/Birth 및 사용자 데이터 권한, 상품 Reading·UX, Entitlement/결제·배포 승인. 브릿지 완료는 이들을 자동 승인하지 않는다.

## 2. 순서와 독립 완료 게이트

| 단계 | 실제 산출물 | 통과 기준 | 검증 전 상태 |
|---|---|---|---|
| 3-03 (완료) | 3-03A/B 계약 및 #1862 Permit-scoped challenge 보완 | 승인 범위의 CI·squash·main 확인 | `SIGNED_ASSERTIONS_UNANCHORED` / 운영 HOLD |
| 3-04-01 (완료) | R01–R14 출처·철회·복구 런북 | 명세 및 기존 CI·병합 | 증빙 미수집 |
| **3-04-02 (착수)** | 별도 Root/key custody, durable registry revision floor, Permit-scoped one-use challenge의 설계·보안 검토 | 신뢰 입력 출처/권한/원자성/레이스/롤백/장애 테스트 계획이 독립 심사 가능; **운영 연결은 별도 승인** | root/key/durable store `NOT_VERIFIED` |
| 3-04-03 | R01–R14 독립 실환경 증빙 및 attestor-signed Evidence | 03A: 무권한 참조 인덱스/부정 검증; 03B: 승인된 실제 출처·서명·감사/환경/SHA 검증 | 03A 계약만으로 운영 검증 승격 금지 / 03B 미실행 |
| 3-04-04 | Target Authority V2와 기존 Runner 사이 좁은 실행 전 게이트 | 운영 증빙·승인·Permit·대상·시간·소비 상태를 신뢰 출처에서 재평가, 부정·장애 시 false; V1 boolean 포트 승격 금지 | 운영 승인 전 false |
| 2D-4 | 폐기형 Member/Birth로 격리 스테이징 한 차례 실행 및 증빙 보존 | 원자 Permit 소비, Auth/Subject Revision, Saju Preview Proof/HMAC/nonce, 결과/차단/수동복구·폐기 확인 | 별도 명시 승인 전 미실행 |
| **최종 인수(추가 제안)** | T01–T40 coverage 대응표, R01–R14, 한 차례 실행/롤백/감사 링크, exact-head CI, 운영 책임 인계 | 결손 항목 0개·중대 이슈 0건, 실환경 증빙 재검증 가능 | 불완전하면 브릿지 미완료 |
| **Production 전환(별도)** | Saju methodology/rule/pack/claim/profile/runtime/product/quality 각 승인 + MyeongHa DB/Auth/UX/Commerce 별도 gate | 각 소유 Authority가 독립 승인 | `canPublish=false`, `canSell=false` |

`3-04-02`의 상세 검토 기준: [SAJU_HELD_STAGING_INDEPENDENT_TRUST_CUSTODY_8C2B2D30402.md](./SAJU_HELD_STAGING_INDEPENDENT_TRUST_CUSTODY_8C2B2D30402.md).
3-04-03A 비권한 증빙 인덱스: [SAJU_HELD_STAGING_EVIDENCE_INDEX_8C2B2D30403A.md](./SAJU_HELD_STAGING_EVIDENCE_INDEX_8C2B2D30403A.md).
실환경 R01–R14: [3-04-01 운영 런북](./SAJU_HELD_STAGING_OPERATIONAL_EVIDENCE_RUNBOOK_8C2B2D30401.md).

## 2A. 무료 로컬 통합 검증 우선

실제 클라우드 검증을 진행하기 전에는 비용이 없는 로컬 환경에서 기존 합성·DB 통합 검증을 먼저 반복한다. [8C-2B-2D 로컬 우선 실행 경로](./SAJU_HELD_LOCAL_FIRST_VERIFICATION_8C2B2D.md)는 PG15/17의 실제 로컬 Permit V2 소비·RLS/경합 테스트를 Docker 내부 격리 환경으로 재현하는 절차다. 이 검증은 **운영 Root·독립 Auth·DB 3종·HTTPS/TLS/관리 평면 승인 증빙을 대체하지 않는다**. 별도 유료 인프라는 필요한 근거를 밝히기 전까지 생성하지 않는다.

## 3. 코드·운영 병렬화와 범위 제한

- 3-04-02의 **명세/테스트 포트**는 실환경 운영 권한 없이 미리 검토 가능하다. Root/KMS/저장소 생성·권한 부여는 별도 운영 결정 후 진행.
- 3-04-03의 독립 probe 설계와 3-04-04의 fail-closed 타입/부정 테스트는 병렬화 가능하나, **실접속/Runner 연결은 3-04-02의 운영 증빙 및 별도 승인을 선행**한다.
- 3-04-04가 성공해도 `2D-4`의 **개별 단일 실행 승인**을 대신하지 않는다.
- 가능한 한 기존 `apps/api/src/saju-held-staging-*`, `test/**`, `scripts/ci/**` 계약을 재사용한다. 새 실행 프레임워크, 새 CI 워크플로, 병렬 사주 해석 authority, 상품 자동 활성화 생성 금지.
- 품질/보안 검증은 변경 범위 CI → 최신 SHA 고정 통합 CI → squash → `main` 포함 확인 순서. CI PASS는 실환경 검증 PASS로 해석하지 않는다.

## 4. 인수 추적표

| 인수 축 | 근거 | 상태 |
|---|---|---|
| 서명/정적 신뢰 평가 | #1850 #1851 #1862 | 코드 완료 / 운영 비인증 |
| 운영 증빙 목록 및 중단 절차 | #1856, R01–R14 | 문서 완료 / 운영 미검증 |
| 개별 부정 시험 T01–T40 | 기존 합성 테스트 분산 | **개별 대응표 미완료** |
| 독립 Root 및 durable revision/challenge | 3-04-02 | 설계/운영 미완료 |
| 실환경 Auth·DB 3종·Saju Proof | 3-04-03A 접수 인덱스 계약 / 03B 실제 probe | 실제 연결·검증 미완료 |
| Target Authority V2 + Runner | 3-04-04 | 미연결 |
| 실제 격리 스테이징 1회 | 2D-4 | 미실행 |
| Production/Commerce | 별도 authority | 미승인 |

## 5. 변하지 않는 운영 경계

```text
stagingAdmission=HOLD
stagingConnection=NOT_VERIFIED
signerAuthority=NOT_VERIFIED
operationalEvidence=NOT_VERIFIED
sourceAuthority=NOT_EVALUATED
releaseAuthorization=NOT_EVALUATED
canRunOnce=false
canExecute=false
canPublish=false
canSell=false
```

상태값을 정적 문서/합성 Evidence/CI에서 자동 승격하지 않는다. 특히 `SIGNED_ASSERTIONS_UNANCHORED`는 운영 허가가 아니다.

## 6. 문서 업데이트 규칙

각 단계 PR은 이 표에 **계약 완료/실환경 미검증/운영 승인**을 따로 갱신하고 관련 SHA, 부정 테스트, CI run ID, 남은 실환경 의존성, 종료 조건(A/B/C 또는 D/E)을 기록한다. 동일 단계에 중복 책임 PR·중복 CI를 생성하지 않는다.
