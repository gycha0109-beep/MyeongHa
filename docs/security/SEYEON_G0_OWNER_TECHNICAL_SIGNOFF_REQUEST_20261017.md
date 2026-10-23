# 세연 G0 기술 승인 요청서 — 실제 Memory 1건 사용을 시작하기 전에

> Watchtower-Track: security  
> **현재 상태: 승인 요청 준비 / G0 기술 서명 0건 / G1~G3 HOLD**  
> 2026-10-17 · 운영 DB 변경·유료 모델·공개 활성화 권한을 부여하는 문서가 아님

## 1. 이미 승인된 것과 아직 아닌 것

- **Product Owner 제품 방향:** [Draft PR #1985의 2026-10-13 정책 승인 기록](https://github.com/gycha0109-beep/MyeongHa/blob/feat/seyeon-offline-granted-turn-consent-gates-v1/docs/security/SEYEON_G0_PRODUCT_OWNER_POLICY_APPROVAL_2026-10-13.md)에 제품 방향 승인 기재. **다시 사용자에게 제품 정책을 승인받지 않는다.** 이 승인만으로 DB/Security/Character가 기술 계약에 서명한 것은 아니다.
- **실제 기술 승인:** [#1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866) G0 체크박스 OPEN. Security + DB Authority + Character/Source Authority 각각의 검토와 승인 기록 필요.
- **실행 구현 자료:** [G0-D01~D10 계약](https://github.com/gycha0109-beep/MyeongHa/blob/feat/seyeon-offline-granted-turn-consent-gates-v1/docs/security/SEYEON_G0_PERSONAL_SOURCE_AND_DERIVED_DISCLOSURE_CONTRACT_V1_PROPOSAL.md), [Positive Pin DB 설계](https://github.com/gycha0109-beep/MyeongHa/blob/feat/seyeon-offline-granted-turn-consent-gates-v1/docs/security/SEYEON_G0_D03_G1_POSITIVE_PIN_DB_BLUEPRINT_V1_PROPOSED.md), [Owner별 Preflight·Stage Receipt 인수](https://github.com/gycha0109-beep/MyeongHa/blob/feat/seyeon-offline-granted-turn-consent-gates-v1/docs/security/SEYEON_G1_OWNER_SIGNOFF_AND_POST_PREFLIGHT_SOURCE_CLOSURE_V1_PROPOSAL.md). 모두 Draft/Proposal이며 승인된 API·DDL이 아니다.

## 2. 담당자에게 실제로 부탁할 결정 — 3개

| 승인자 | 쉽게 말하면 | 반드시 결정할 기술 사항 / D-ID | 미승인 시 |
| --- | --- | --- | --- |
| **Character + Source Authority (SRC-25)** | 세연에게 **어떤 종류의 기억을 읽게 할지** | S0의 **실제 허용 recordType/schemaVersion/projectorVersion 한 쌍**, 현재 발화·공개 Bible·**직접 Memory 1건** 이외 모든 History/Relationship/Reader/Saju/Preflight 파생 입력의 범위·provenance/D-01,D-02,D-08 | Positive Projector=[]; 미등록 타입·파생 문맥·DB 조회 HOLD |
| **DB Authority + Security** | 저장한 기억과 동의가 **철회되어도 새 동의로 옛 사용을 되살리지 않도록** | D-03 digest/Codec, 정확한 original Grant/Record 잠금·취소/재승인·subject-first lock order, 1640 zero XOR positive, Forward-only G1 SourceSet+Edge + Owner RPC, v2 **같은 트랜잭션** G2 Commit, legacy ACL/D-06,D-07,D-10 | Positive DB Pin/G2/운영 DDL 모두 HOLD |
| **Security + API + DB (Character 범위 확인)** | 철회된 기억으로 만든 답변을 **처음에도 다시도 보여주지 않도록** | D-04 비스트리밍/DB Reveal COMMIT 선형화 + late HTTP bytes, D-05/D-09 과거 답변·History·Worker 현재 권한; 최초 POST/Replay/GET, 실 PG 독립 2세션, 0-byte-deny | 최초 공개·Replay·History 503/no-store HOLD |

**제품 권고 초기 범위:** 현재 검증된 Member의 현재 턴 + 승인된 공개 Bible + **정확한 원본 Grant가 있는 Memory 1건(S0)**. 이것은 *제안된 첫 구현 범위*이며 Character/SRC-25의 실 타입 서명 전에는 어떤 가상의 Memory 타입도 허용 목록에 넣지 않는다. 장기적으로 다중 Memory·Life Fact를 허용한다는 기존 Product 방향과 모순되지 않는다.

**추가 범위별 명시적 제외 서명:** Reader/Commerce/Saju/Face/Peer는 S0에서 OUT_OF_SCOPE+FAIL_CLOSED(D-08)로 두고, 해당 Owner가 제외 경계를 확인해야 한다. Ops/Production DB Authority는 [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887) migration-history·동일 백업 복원·ACL/D-10을 별도로 승인한다. **운영 DB 변경 승인과 공개 출시 승인은 G0 기술 승인과 별도**이다.

## 3. 담당자는 아래 형식으로 회신

```text
G0 결정 ID: D-01 / D-02 / ... / D-10
판정: APPROVE | REVISE | OUT_OF_SCOPE+FAIL_CLOSED
검토자/담당 조직:
적용 범위: S0 직접 Memory 1건 / 그 외 명시적 제외:
실제 승인 recordType / schemaVersion / projectorVersion (D-01만):
정책/Codec 버전:
검토한 정확한 PR head SHA:
DB 카탈로그/마이그레이션 기준 SHA (DB 담당 시):
검증 링크 (PR, CI, 격리 PG 경합 등):
승인 시각:
```

**모든 항목을 위 형식으로 자동 APPROVE 처리하지 않는다.** 실제 검토한 Owner의 명시적 판정이 없는 D-ID는 계속 OPEN. Product Owner의 “오케이”를 Security/DB/Character 서명으로 재사용하지 않는다.

## 4. 승인 후 실행할 순서

1. R0 Owner 3개 축의 범위·타입·Codec·취소/전송 정책 결정과 정확한 증거 링크 확보.
2. R1/R2 격리 PostgreSQL·합성 Provider 실험 [Draft #1985](https://github.com/gycha0109-beep/MyeongHa/pull/1985) 결과를 현재 main과 검증하고 테스트 전용 SQL만 재사용. **Draft 전체 병합 금지**.
3. R3/R4 Forward-only **코드 변경 PR**: G1 positive original SourceSet Pin과 DB-owned Stage Receipt를 모델 이전에 설치, 1640 zero Pin 그대로 유지. 운영 배포는 별도 승인.
4. R5 G2: 1640 트리거 zero XOR positive, current original Grant/Record 잠금, 실제 v2 Commit 및 legacy bypass 차단 — **같은 DB 트랜잭션**.
5. R6 G3: 최초 HTTP, committed replay, 과거 GET, Reader/Worker 파생 경로에서 승인된 current-rights+Revoke 선형화와 비스트리밍.
6. G5 실제 2세션 PG/ACL/공격/비용 통합, #1887 원격 이력·백업/격리 복원 확인, G6 운영 출시 여부 별도 승인.

## 5. 지금의 안전 상태

- Production Projectors = `[]`, public/paid OFF, `authorizedForProduction=false`, `drReady=false`.
- S3-A/B/C 출처 조회 차단과 S2-D Replay/S5-A History/S5-B 최초 POST 503 차단 유지.
- **G0 APPROVED 아님, G1 양수 Pin/G2 atomic Commit/G3 Reveal PASS 아님.** 실제 Production 마이그레이션·백필/ACL/History 수리/유료 AI 호출 **0건**.
- [R2-G 역사적 actor 조사](https://github.com/gycha0109-beep/MyeongHa/issues/1887)는 과거 CLOSED_RISK_ACCEPTED 결론 재개 금지.
