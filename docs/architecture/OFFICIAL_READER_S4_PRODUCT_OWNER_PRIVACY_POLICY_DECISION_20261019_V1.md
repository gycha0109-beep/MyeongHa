# Official Reader S4 — 신규 유료 해설 개인정보 처리 제품 책임자 승인 결정 v1

- 결정일: **2026-10-19 (Asia/Seoul)**.
- 결정 출처: 이 ChatGPT 대화의 제품 책임자 직접 지시 — **“외부 업체는 일단 없다. 나머지는 승인”**.
- 적용 범위: [신규 S4 개인정보·법률 검토 제안서](OFFICIAL_READER_S4_PRIVACY_LEGAL_POLICY_APPROVAL_PROPOSAL_20261019_V1.md)의 **제품·개인정보 처리 방향 및 내부 운영목표**, D1·D2·D3·D5·D6 조건부 승인. D4는 **신규 보호 원문 처리 외부 업체 없음**을 전제로 *추가 외부 전송을 승인하지 않음*.
- 의사결정 등급: **PRODUCT_OWNER_APPROVED_POLICY / PRIVACY_TECHNICAL_ACCEPTANCE_PENDING / LEGAL_COMPLIANCE_REVIEW_PENDING / PUBLIC_OFF**.
- 이 결정은 특정 법률 전문가의 검토 완료·Privacy 실DB 인수 완료·독립 서비스 공급업체의 부재 검증·S5 저장 권한·운영 배포 또는 유료 판매 허가가 아니다.

## 1. 승인한 정확한 처리 정책

| 영역 | 제품 책임자 승인 결과 | 강제 경계 |
| --- | --- | --- |
| D1 보호 원문 분리 | **승인** — 유료 해설 전문·청크는 일반 Chat, AI Attempt, Outbox, Memory와 분리한 최소 권한 비공개 저장소만 허용 | 신규 테이블/FK·삭제 그래프는 별도 버전과 실DB 증거 필요. 제안서만으로 새 운영 DB 저장 불가 |
| D2 환불·만료·탈퇴·삭제 | **승인** — 그 해설에 대한 유효 권리가 소멸하면 새로운 생성, 서버 재열람, AI 재주입 즉시 차단. 목적 소멸한 원문은 지체 없이 파기 | **본 DB의 원문 파기 내부 목표: 파기 요건 발생 후 24시간 이내**. 법정 24시간 한도라는 주장은 하지 않음. 다른 정확한 유효 독립 구매권이 있는 경우 안전한 권리 재판정 필요. 법적 보존 사유는 적법성 확인된 최소 증빙만 분리 |
| D3 미확정 원문·민감정보·2차 처리 | **승인** — T2 미확정/실패 원문 영속 보관 금지; 유료 원문·발췌의 일반 Memory/검색/임베딩/요약 자동 적재 및 외부 AI 학습·마케팅 재사용 금지 | 법정 민감정보 포함 가능 질문은 기본 미수집/회피; 예외가 필요한 상품은 별도 적법한 처리 근거·고지/동의·심사 전 보류. AI 생성 사실 고지·표시 |
| D5 백업·운영 로그 | **승인** — 기존 P30D 백업 수명주기 유지, 삭제·권한 회수 후 복원 데이터의 재조회/AI 재주입 0. 보호 원문 없는 운영 로그만 허용 | **신규 일반 운영 로그 보존 상한: 90일**(내부 정책; 법정 기간 아님). 보안사고·법적 보존 기록은 별도 근거와 접근통제로 재분류. 기존 복원 전 비서비스/재조정 증빙 없으면 복구 데이터 공개 금지 |
| D6 이용자 고지·권리·판매 전 확인 | **승인** — 정확한 처리 항목/기간/파기/문의 경로, 생성형 AI 고지·표시, 개인정보 권리 행사 경로, 적법한 소비자 환불 정책을 출시 전 UX·약관·처리방침에 반영 | 14세 미만 등 연령 관련 법정 요건 및 실제 민감정보 수집 유무는 Legal 검토가 완료되기 전 해당 범위 활성화 금지. 최종 법률 적합성 또는 S7/S8 출시 승인은 별개 |
| D4 신규 외부 처리업체 | **현 시점 사용자 진술: 외부 업체 없음** — 신규 유료 해설 원문을 외부 업체에 전송/위탁하는 업무는 승인 범위에 **없음** | **외부 원문 전송, 국외 이전, 외부 AI API 호출, 외부 분석/로그/학습용 수탁 처리 전부 OFF**. 향후 도입 시 실제 수탁자·국가·보관·교육/재사용·계약·법적 이전근거를 별도 승인 |

## 2. 기존 승인과 절대 합치지 않는 부분

1. 기존 [P0-PR-01](../operations/ACCOUNT_DELETION_FINALIZATION_POLICY_V1.json)의 2026-09-19 회원 삭제 및 P30D 복구 계획·구매/결제/Entitlement 증빙 **P5Y** 승인, 기존 데이터 그래프 지문을 **수정하지 않음**. 법정 거래 이력 보존을 유료 해설 전체 원문 보존권으로 확대하지 않음.
2. [RR-03 #1884의 2026-10-11 Owner 결정](https://github.com/gycha0109-beep/MyeongHa/issues/1884#issuecomment-6103479019)의 신규 출처 이력 sidecar **DELETE**와 탈퇴·복원 제한은 이미 승인된 범위로 인정. **신규 유료 본문·청크·파생물 저장소의 그래프/정본에 그 서명을 자동 재사용하지 않음.**
3. 기존 보관 정본의 `destructiveRuntimeAuthorized=false`, `authoritativePrivacyReconciliation=false`, `drReady=false`를 허위로 변경하지 않음. 다른 issue에서 확인한 한정된 복원 성공을 새 S4 보호 원문에 대한 복구 승인으로 확대하지 않음.
4. **이미지·모델·호스팅·결제·계정 등 현행 기술 의존 서비스**가 실제로 존재하는지에 대해서는 Owner의 "외부 업체 없음" 진술만으로 기술 감사가 끝나지 않음. 특히 기존 PortOne 결제 연동 및 Supabase/호스팅 등 **기존 서비스 인프라의 제3자 관계를 부재로 확정하지 않음**. 새 보호 원문이 실제로 접촉하는 모든 경로를 데이터 흐름 감사로 확인하기 전, "위탁/국외 이전 법적 검토 불필요"라고 판단하지 않음.

## 3. 법률·보안 확인은 아직 필요한 별도 인수 조건

- 개인정보 보호법 제15·21·23·26·28조의8·29·30조 및 아동 관련 규정 적용 여부, 전자상거래법의 소비자보호·거래증빙, 생성형 AI 고지 규정 검토를 **상품과 실제 운영 아키텍처에 맞춰 법무 책임자가 확인**. 제품 승인 ≠ 법률 적합성 확정.
- 24시간 파기 목표는 **본 DB 원문 파기** 기준이며 기존 P30D 백업이 삭제 후 보관될 수 있는 문제를 자동 해결하지 않음. 복구 후 서비스 차단→삭제/회수 이벤트 재조정→실DB 비재노출, 필요시 암호학적 삭제의 적용 가능성까지 증명할 것.
- 90일은 원문·생년월일·개인질문·증명 원문 없는 일반 운영 로그 **최대값**이다. 어떤 로그가 반드시 90일 유지되어야 한다는 의미가 아님. 법정 보관 분류·사고 보존은 별도.
- 신규 저장소의 목적·개인정보 항목·정확한 DB/FK 그래프 버전·DELETE 분류·실제 사용자 요청/다른 Grant의 권리범위·RLS FORCE/역할 ACL·파생물/모델 주입 통제 및 삭제/복원/백업 검증이 확정되기 전 **정식 S4 인수 PASS 금지**.
- 신규 출처 Saju [#2410](https://github.com/gycha0109-beep/Saju/issues/2410)의 실제 Production 발행 증빙, S5 동일 거래 T2 권한 검증, 별도 Commerce/Legal S7 소비자 고지 및 S8 출시 승인은 **모두 독립 게이트**.

## 4. 승인·증빙 상태 레지스터

```text
Decision date: 2026-10-19 (Asia/Seoul)
Decision source: Product Owner direct chat statement
Owner authorization for policy: APPROVED (D1 D2 D3 D5 D6)
D4 actual new external providers: NONE DECLARED BY USER; NOT INDEPENDENTLY AUDITED
External paid-body data transfer: NOT AUTHORIZED
Internal paid-body primary deletion target: <=24 hours from valid deletion trigger (product policy)
New non-content operational-log upper limit: 90 days (product policy)
Existing Commerce legal record retention: P5Y (unchanged)
Existing backup lifecycle: P30D (unchanged; restoration non-reexposure still gated)
New protected-data classification: POLICY APPROVED; EXACT SCHEMA/GRAPH NOT IMPLEMENTED
Existing RR-03 provenance deletion owner approval: REUSED ONLY FOR ITS ORIGINAL SCOPE
Legal review/sign-off: PENDING
Actual infrastructure subprocessor/dataflow audit: PENDING
Privacy RLS/FK/populated-row deletion/restore acceptance: PENDING
Saju Production attestation and S5 T2: PENDING
Production DB migration: NOT AUTHORIZED
Paid body persistence / external AI transfer / public reveal / payments: OFF
Issue #2318: OPEN until technical/legal acceptance evidence
```

## 5. 다음 기술 작업 범위 (이번 승인으로 가능한 것)

- 새 유료 보호 데이터의 **비활성화된 설계·정책 명세·격리 합성 테스트**를 준비하고, 기존 일반 Chat·Commerce·Reader SQL Writer와 격리 설계.
- 외부 원문 반출/암묵적 로그·AI/Memory 재주입 경로의 정적·동적 감사, 실제 수탁자 인벤토리 확인. 외부 공급자 0이라는 주장만으로 활성화 금지.
- 정확한 새 DB schema/FK/DELETE·복원 계약과 Owner 인수 검증을 문서화. **이 결정문을 기점으로 S5 데이터베이스 운영 마이그레이션/유료 원문 T2 활성화를 즉시 진행하지 않음**.

**최종 판단:** 신규 S4 **제품 정책은 사용자 승인**, **법률·실제 개인정보 삭제/복원·외부 처리 인프라·출처 및 최종 저장 기술 검증은 미완료**. 개인정보 [#2318](https://github.com/gycha0109-beep/MyeongHa/issues/2318)은 구현 인수 완료 전까지 열어 둡니다.
