# 세연 G0 — Product Owner 정책 방향 승인 기록 (2026-10-13)

> Watchtower-Track: security
>
> **Status: PRODUCT OWNER POLICY DIRECTION APPROVED / G0 TECHNICAL SIGN-OFF HOLD**
>
> 승인 출처: 프로젝트 사용자가 2026-10-13 대화에서 G0 재검토·쉬운 설명을 확인한 후 **"오케이 승인하겠다. 오너 권한 승인"**이라고 명시적으로 승인.
>
> 이 기록은 **사용자가 선언한 Product Owner 정책 승인**을 개발 원장에 반영한 것입니다. 대화 상대의 법적·조직적 신원이나 GitHub 계정 권한을 독립 인증했다는 뜻이 아니며, DB/Security/Character/Reader/Commerce/Saju/Ops 명의의 별도 기술 서명이나 G0 전체 완료를 대신하지 않습니다.

관련 근거:
- [G0 D-01~D-10 원본 계약 제안](./SEYEON_G0_PERSONAL_SOURCE_AND_DERIVED_DISCLOSURE_CONTRACT_V1_PROPOSAL.md)
- [G1 Owner 인수·Preflight closure 제안](./SEYEON_G1_OWNER_SIGNOFF_AND_POST_PREFLIGHT_SOURCE_CLOSURE_V1_PROPOSAL.md)
- [R0~R8 구현·검증 로드맵](../operations/SEYEON_G0_D03_G1_TO_G6_IMPLEMENTATION_ROADMAP_V1.md)
- [G0~G6 완료 판정 원장 #1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866)
- [P0 Grant Commit/Reveal #1843](https://github.com/gycha0109-beep/MyeongHa/issues/1843)
- [Reader 권한 #1827](https://github.com/gycha0109-beep/MyeongHa/issues/1827)
- [운영 DB 계보/DR #1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887)
- [Offline 후보 PR #1985](https://github.com/gycha0109-beep/MyeongHa/pull/1985)

## 1. 승인된 제품 정책 (범위: 세연 개인 기억·관계형 AI의 사용 원칙)

1. **현재 대화와 영구 기억 구별:** 사용자가 지금 대화에서 말한 내용은 해당 턴의 권한 범위에서 활용할 수 있지만, 별도 동의 없이 durable Memory로 승격하지 않는다.
2. **명시적 동의와 원본 권한:** 저장과 향후 모델 사용은 해당 데이터 유형의 동의·접근 권한을 따르며, 원본 Record/Grant를 서버 권한 근거로 삼는다. 사용자의 글이나 모델 출력은 Grant를 발급하지 못한다.
3. **다중 기억 확장 목표:** 여러 기억과 관계적 이해는 장기 제품 범위로 허용하되, 승인된 타입·스키마와 전체 원본 출처 추적을 요구한다. **S0의 직접 Memory 최대 1건은 임시 오프라인/제한적 검증 범위이지 영구 제품 제한이 아니다.**
4. **철회 즉시 향후 재사용 차단:** 철회된 원본에 의존하는 재투입·후속 공개·파생 관계 요약은 current-rights를 통과하지 못한다. 원본 Grant ID는 불변이며 재동의는 새 Grant이다. 새 Grant로 과거 Attempt를 되살리지 않는다.
5. **접근 차단과 물리 삭제 분리:** '세연이 잊기'는 해당 Character의 접근 권한 철회를 의미한다. 실제 기록 삭제·보존·계정 삭제·다른 캐릭터의 권한은 각자 별도 정책을 따른다. 철회된 원본이 섞인 과거 파생물은 재사용하지 않으며, 다른 유효한 출처만으로 재계산하는 **새 Attempt**는 별도 검증과 허가 하에만 가능하다.
6. **파생 출처 추적:** 과거 메시지, 모델 중간 출력, 최종 답변, Relationship 상태/이벤트, 후속 Worker에 사용한 원본 closure를 전이 추적한다. unknown/unattributed/불완전 closure를 empty로 간주하지 않는다.
7. **개인기록 응답 비스트리밍 우선:** 초기 개인기록 기반 응답은 streaming OFF. Product 정책상 권장하는 Reveal 공개 기준은 **DB Reveal 트랜잭션의 성공적 COMMIT**이며, 철회가 먼저 확정되면 공개 금지. 이미 공개 승인된 응답은 철회 후 네트워크 지연으로 도착할 수 있으므로 '이미 승인된 전송의 소급 회수 보장'은 주장하지 않는다. **DB/Security의 D-04 동시성 계약 확정 전 기술 승인 아님.**
8. **Legacy 재사용 보류:** 원본 출처가 검증되지 않는 과거 Assistant/User 메시지·파생 Relationship을 새 모델 Context에 재사용하지 않는다. 무조건 물리 삭제한다는 의미는 아니며 조회/내보내기 역시 해당 권한 검증에 따른다. 과거 NULL Pin은 검증된 0건이 아니다.
9. **Reader·Saju의 별도 권한:** 사주 구매/발행·Reader entitlement와 Character Memory consent를 자동 동일시하지 않는다. 최초 S0에서는 Reader/Saju/Face/Peer/외부 파생 ingress를 `OUT_OF_SCOPE + FAIL_CLOSED`로 다룬다. 장래 연동은 각 도메인의 동의·구매·취소 권한과 별도 Owner 계약이 선행되어야 한다.
10. **오류 시 안전한 새 동선:** 출처·Grant 확인에 실패한 **해당 응답/History 페이지는 전체 HOLD**한다. 일부 내용을 조용히 제거하고 성공 응답으로 위장하지 않는다. 내부 출처가 재사용되지 않는 **독립된 새 Attempt/새 대화**는 별도 권한 검증에 성공한 경우만 허용한다. 오류 때문에 기존 위험한 Attempt를 재생성하거나 추가 유료 Provider를 호출하지 않는다.
11. **안전한 운영 단계:** 실제 SourceSet Pin, 원자 Commit, current-rights Reveal, DB ACL/RLS·동시성 검증, Source-derived Provider wire 검증, 운영 백업/복원 및 공개 승인은 별도 Gate를 통과해야 한다.

## 2. D-01~D-10 의사결정 매핑

| ID | Product Owner 승인 방향 | 현재 기술/도메인 인수 상태 |
| --- | --- | --- |
| D-01 | 허용 목록의 타입/스키마, 명시적 동의, S0 단일 Memory는 임시 범위 | **OPEN:** SRC-25 실제 타입·버전·projector 등록 및 Source Authority/Character 승인 |
| D-02 | 원본·과거·Preflight·생성 출력의 전이 closure 추적; unknown HOLD | **OPEN:** 실제 Provider/Reader/worker 경계 전체 출처 graph, Security/Character 승인 |
| D-03 | DB raw / Node projected / final Context / Provider wire의 버전 있는 검증 분리 | **OPEN:** PG15/17 golden, codec, wire attestation의 DB/Security/Character 승인 |
| D-04 | 초기 non-streaming; Reveal DB 성공 COMMIT 기준 및 사후 네트워크 지연 가능성 허용 | **OPEN:** DB/Security 동시성·전송 구간 정식 계약 및 실증 |
| D-05 | 출처 없는 Legacy History/Attempt 재사용 금지; 삭제와 접근 차단 구분 | **OPEN:** DB/Security/API의 구 데이터 이관·조회 정책 |
| D-06 | 본래 Grant current-check와 실제 Assistant/Outbox Commit의 동일 트랜잭션 원칙 | **OPEN:** 운영 G1/G2 RPC/1640 XOR/legacy EXECUTE/lock order 검증 |
| D-07 | 철회·새 Grant·supersession·delete/merge 권한 구분; 원본 Grant 교체 금지 | **OPEN:** DB/Source Authority 보존·연쇄 무효화 계약 |
| D-08 | **S0: OUT_OF_SCOPE + FAIL_CLOSED**; Reader/Saju 권한은 후속 별도 승인 | **OPEN:** Reader/Commerce/Saju/Security의 명시적 범위 제외 서명 및 future ingress 승인 |
| D-09 | 해당 응답·History 전체 HOLD; 별도 검증되는 안전한 새 대화 동선 허용 | **OPEN:** Product/API/Security 오류·History/page·관계 UI 계약/검증 |
| D-10 | 최소 권한, forward-only migration, 운영 계보/DR 증거 이후에만 배포 | **OPEN:** DB/Ops/Security 운영 DB 카탈로그·ACL·복원 증거 |

**위 '승인 방향'은 Product Owner의 설계 원칙 승인**입니다. 각 D-ID의 공식 `APPROVE`/ `OUT_OF_SCOPE+FAIL_CLOSED` 최종 서명(해당 책임 팀·검토 SHA·카탈로그 SHA·검증 증거)은 아직 이루어지지 않았습니다. 이 표를 전체 D-ID 기술 승인이나 G0 완료로 취급하지 않습니다.

## 3. 즉시 허용 / 계속 차단

### 이 승인으로 진행 가능한 작업
- Product 정책 문서 고정, S0/후속 다중 기억의 범위 분리, 필요한 Owner 검토·테스트·코드 후보 보완.
- disposable PostgreSQL과 합성 모델을 사용하는 격리 검증 및 기존 PR의 제안 코드 개선.
- 정책-기술 D-ID 매핑, 부정 사례/동시성/Reader 경계 인수조건 문서화.

### 이 승인이 허용하지 않는 작업
- `G0 = COMPLETE/PASS` 또는 #1866 G0 체크박스 완료 처리.
- 새 Production DDL/ACL/migration 적용, 보안 우회·legacy SQL 권한 확대.
- positive `SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1` 활성화, Se-yeon 공개 route ON.
- 운영 개인 정보 모델 투입, 유료 실모델 호출, 실사용자 대화 기록 반입/재생성.
- Draft PR #1985 merge, G1~G6 PASS 선언, Reader/Saju entitlement 우회, G6 운영·배포 승인.

기본 상태: `Projectors=[]`, `routeMounted:false`, `WRITE_DARK`, Zero-Only 개인기록 정책 및 미승인 Provider 차단 유지.

## 4. 다음 Gate와 확인 기준

- **R0/G0 남은 인수:** D-01 실제 Source Registry, D-02/PF transitive closure 및 Preflight, D-03 codec/wire, D-04 race semantics, D-05/09 Legacy·UX, D-06 XOR/atomic lock, D-07 revoke/retention, D-08 도메인 Scope 제외, D-10 DR/roles를 각 책임 팀이 exact reviewed SHA/evidence와 함께 결정.
- **R1/R2:** 실제 Provider 출력의 파생 ancestry, Adapter wire payload/receipt, 0/1/N 확장 전 인수. 기존 synthetic 검증은 운영 권한으로 승격하지 않음.
- **O0 / #1887:** 운영 DB migration lineage와 동일 백업의 격리 복원 확인.
- **G1~G6:** 별도 구현·실 DB race·current-rights 공개·비용·운영 스모크 검증 후 각 Gate 승인.

**종료 판단:** 이 문서의 추가는 *사용자 Product Owner의 정책 방향 승인 기록 완료*를 의미합니다. **G0 기술 계약 및 G1~G6는 HOLD**입니다.
