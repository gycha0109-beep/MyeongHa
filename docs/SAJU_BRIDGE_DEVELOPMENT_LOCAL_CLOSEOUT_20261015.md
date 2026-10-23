# 사주 브릿지 개발·로컬 검증 종료 기록 — 2026-10-15

Watchtower-Track: saju-bridge

> **결론:** `DEVELOPMENT_AND_LOCAL_ACCEPTANCE_CLOSED` — 지금까지 계획·구현한 사주 브릿지 **코드·합성/폐기형 CI·Windows Docker 로컬 인수 작업을 종료**한다. 새로운 "배포" 트랙을 만들지 않는다. 실제 격리 스테이징 구성, 독립 운영 보안 증빙 및 일회 실행·출시 승인은 **같은 saju-bridge 작업의 운영 게이트**로 남겨두되, 별도 환경/승인이 준비될 때까지 `HOLD`다.
>
> 이 명칭은 **작업 관리용 종료 판정**이지 기존 런타임 신뢰 상태값, GitHub 배포 승인 또는 실제 서비스 배포 성공을 뜻하지 않는다. **"사주 브릿지 전체 최종 완료"나 "Production 출시 승인"으로 인용 금지.**

## 1. 종료한 범위와 재현 가능한 근거

| 인수 축 | 확인된 상태/근거 | 주장하지 않는 것 |
|---|---|---|
| 코드/계약·격리 CI | 3-01 Permit V2, 3-02 PostgreSQL 소비, 3-03 Registry/Target Trust, 3-04-01/02 설계 및 SO-1~SO-3B P0 계약, 기존 보호된 Saju Proof 연결·부정 검사; [완료 로드맵](./SAJU_HELD_STAGING_COMPLETION_ROADMAP_8C2B2D.md) | 운영 Root/Signer/Attestor 실제 출처 검증이나 사용 허가 |
| Docker Phase 1–4H | [Phase 4H PR #2092](https://github.com/gycha0109-beep/MyeongHa/pull/2092), [Docker CI #38539255532](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38539255532), [전체 CI #38540349736](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38540349736) PASS | 실제 외부 스테이징 리허설이나 독립 감사를 완료했다는 주장 |
| Windows Phase 5 | [PR #2103](https://github.com/gycha0109-beep/MyeongHa/pull/2103): 사용자 제출 Windows 전체 로컬 15개 Phase **PASS**, 오류 주입 및 fail-closed, 일회용 Docker 자원 완전 삭제, 보고된 exit 0. 사용자 실행 MyeongHa SHA `2ddb1d4fe3f7101244ee3a628b2d1a6a7f6bc1f5`, 검증용 Saju SHA `cd0acf9abd447826ccaefba56112d046e560ee04` | 원격 호스트 감사·서명된 운영 증거. Windows OS 빌드·Docker Desktop GUI 버전 미제출 |
| Windows 원본 로그 식별 | 사용자 제공 `saju-phase5.log` UTF-16 LE 630행, SHA-256 `6f9a42d407897f89a26a9d0be31f1bbb722bd7d2058d5b9cd7dbb651a4b500e6`. 원본 로그는 GitHub 저장소에 업로드하지 않음. Node v24.20.0 / Docker 29.8.2 / Compose v5.5.1 | 로그 내 독립 서명된 런타임/하드웨어 원격 증명 |
| 운영 준비 P0 | [PR #2106](https://github.com/gycha0109-beep/MyeongHa/pull/2106), [고정 HEAD 통합 CI #38670723515](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38670723515) 11/11 PASS; S01–S06 사전 결정 게이트 정리 | 실제 운영 리소스·비용/권한 승인 완료 |
| 로컬 증빙/운영 격차 | [PR #2109](https://github.com/gycha0109-beep/MyeongHa/pull/2109), [통합 CI #38687044849](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38687044849) 11/11 PASS; [SO-4 R01–R14 격차표](./SAJU_SO4_SUPABASE_ISOLATION_P0.md#4a-2026-10-15-로컬-docker-재사용-우선--실환경-미보유-확인-및-r01r14-격차-인수) | R01–R14 운영 `VERIFIED` |

- **인수된 로컬 검증은 반복하지 않는다.** 새로운 결함, 변경된 코드/환경 또는 수정된 요구사항이 있을 때에만 관련 범위를 다시 검증한다. 추가 Phase 4I, 목적 없는 합성 "신뢰" 엔진, 중복 Docker 전체 검증을 만들지 않는다.
- **검증 한계:** 로컬 테스트 성공은 코드/격리 실패 차단을 보여주지만, 실제 별도 클라우드 계정의 IAM·TLS·독립 감사/키 관리·철회/복구 정책을 증명하지 않는다.
- **기존 공급자 설계:** [SO-4 Supabase-first](./SAJU_SO4_SUPABASE_ISOLATION_P0.md) 토폴로지는 계획 단계에서 선택돼 있다. 별도 스테이징 서버·보안/백업 인프라는 보유하고 있지 않으며, 과거 읽기 전용 Supabase 목록은 신규 리소스 존재/현재 비용을 증명하지 않는다. 현재 Production 및 별도 Refund 프로젝트의 전용 스테이징 전환은 금지한다.
- **기존 R/T 추적표:** [SO-3B 자체 R01–R14/T01–T40](./SAJU_SOLO_OWNER_SO3B_R_T_COVERAGE_MATRIX.md)는 *해당 하위 범위* 추적 계약이며 전체 프로젝트 최종 T01–T40을 검증 완료했다고 주장하지 않는다.

## 2. 종료 시점의 범위 예외·미완료 항목

**작업 범위 밖의 선택적 개선:**

- [PR #2000](https://github.com/gycha0109-beep/MyeongHa/pull/2000) — Docker Desktop Engine 중단/Windows 컨테이너 모드에서 사전 오류를 명확히 하는 **선택적 로컬 도구 개선안**. 종료 검토 당시 미병합이고 병합 충돌 및 기존 고정 HEAD 통합 CI 실패가 확인되었다. 이 수정은 **현행 main에 포함되지 않으며 이번 로컬 인수 PASS의 필수 조건이 아니다.** 충돌을 숨기거나 이 PR을 병합 완료라고 주장하지 않는다. 필요하면 별도 결함 재현과 최신 기준 CI 통과 후 처리한다.
- 정상 완료된 Windows Phase 5의 로그·독립 SHA·정리 확인을 더 요구하지 않는다. 향후 신뢰할 수 있는 실제 운영 환경을 만들 때에는 로컬 검증 보고를 운영 attestation으로 복사하지 않는다.

**실제 스테이징/운영 관련 잔여 게이트 (같은 saju-bridge 트랙):**

1. **3-04-02(D):** 독립 관리 보안 계정/Root key custody, SPKI pin 출처, Registry durable revision floor·철회, Owner 행위별 인증, Operator/Challenge 키·원장·감사 증빙 **R01–R04**.
2. **3-04-03B:** 별도 스테이징 Auth, Subject/Nonce/Admission 세 DB, Saju HTTPS·Proof/키·독립 attestor·배포 SHA·폐기형 회원·복구의 실제 **R05–R14**. 사용자 인증·환경·비용·기한 승인 및 읽기 전용 권한 없으면 접속/검사 불가.
3. **3-04-04:** 정확한 대상·사용자 의도·Permit·Challenge·신뢰 출처를 fail-closed 재평가하는 **Target Authority V2** 운영 게이트; 기존 V1 boolean 포트의 직접 Runner 승격 금지.
4. **2D-4:** 별도 명시적 P3 승인 후 딱 한 번의 격리 스테이징 rehearsal, 감사·폐기·수동 복구. **정식 Production/Commerce 출시는 또 다른 독립 승인**.

위 항목은 이번 개발·로컬 종료 조건이 아니며, **준비된 환경이나 새 명시적 운영 승인이 없는 동안 임의로 실행하지 않는다.** 신규 유료 리소스, Root/KMS/서명키·Secret 생성, DB GRANT, 실제 Auth/Proof probe, Runner·판매·배포 트리거는 금지. 인간 책임자 한 명을 전제로 계정/키/감사 권한을 분리하는 [Solo Owner 설계](./MYEONGHA_SOLO_OWNER_SEGREGATED_AUTHORITY_ARCHITECTURE_V0_1.md)를 적용한다. 서비스 ID 두 개를 사람 두 명의 독립 승인으로 취급하지 않는다.

## 3. 작업 인계 및 재개 규칙

- **독립 "배포" 트랙 생성 없음.** 기존 [Issue #1871 — 실제 스테이징 운영 승인·R01–R14](https://github.com/gycha0109-beep/MyeongHa/issues/1871)은 **OPEN / OPERATIONS_HOLD** 상태로 유지한다. 이 이슈를 개발 검증의 실패/미완료로 해석하거나 운영 증빙 없이 닫지 않는다.
- **재개 트리거:** Owner가 격리 스테이징 대상과 계정/비용 한도·폐기 시각을 정하고 실제 보안 계정·관리 평면/키 custody 및 행위별 인증·권한에 대한 별도 승인을 제공한 때. 그때 기존 [운영 런북 S01–S06](./SAJU_HELD_STAGING_OPERATIONAL_EVIDENCE_RUNBOOK_8C2B2D30401.md)을 **재사용**해 R01부터 진행한다.
- **재개 시 반드시 확인:** 최신 두 저장소 SHA, 계획/Manifest digest·정책 revision, 과거의 로컬 PASS와 실제 증빙의 구별, Key/Root purpose·분리, 승인 범위·TTL·예산·자동 폐기, 부정 테스트 및 exact-head 통합 CI, 사고 시 복구/중단 책임.
- **종료/실행 판단 분리:** 코드/로컬 인수 `CLOSED`; `rootAuthority/signerAuthority/stagingConnection/operationalEvidence=NOT_VERIFIED`; `stagingAdmission=HOLD`; `sourceAuthority/releaseAuthorization=NOT_EVALUATED`; `canRunOnce/canExecute/canPublish/canSell=false`; `automaticRetry/automaticCompensation=false`.
- 향후 운영 진입·출시/결제 승인을 이 문서 또는 PR 병합으로 추론해서는 안 된다.

**종료 판정:** `SAJU_BRIDGE_DEV_LOCAL_CLOSED_OPS_HOLD` — **개발·로컬 Docker 작업은 마감, 실제 배포/운영 인프라 검증 및 출시 권한은 미완료.**
