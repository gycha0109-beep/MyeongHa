# 명하 Reader 유료 해설 × 일반 채팅 — 제품 결정 v1 (2026-10-12)

> 결정 주체: 프로젝트 제품 소유자(사용자), 대화에서 네 가지 제품 원칙 전체 승인.
> **상태: PRODUCT DIRECTION APPROVED / DB·Commerce·Reader·Legal·Release TECHNICAL & LAUNCH HOLD / PUBLIC OFF.**
> 선행 증거: PR #1969 (실제 TS→PostgreSQL 합성 검증 및 병합 후 본선 CI PASS); 이 승인은 기존 정책 담당자의 서명·실제 결제·공개를 대체하지 않는다.
> 관련 이슈: #1823(D-05), #1827(T2·환불 경합), #1828(일반 Standard 적격성).

## 1. 승인된 사용자 경험·소유 경계

1. **일반 채팅은 canonical 회원 × 캐릭터당 채팅방 1개.** 동일 캐릭터의 여러 공식 사주를 새 채팅방으로 자동 분산하지 않는다. 기존 Web/모바일 일반 Chat history와 관계의 연속성을 우선한다. 이는 향후 DB/API 단일 Thread 규칙 확정을 요구하며 미승인 유료 Chat 경로는 열지 않는다.
2. **유료 해설 접근은 공식 Reading × Reader × 구매권별로 독립.** 같은 채팅방에서 사용자가 특정 사주를 명시적으로 선택하더라도 그 선택은 구매권이 아니다. 현재 active exact Grant, source hash/version, Product rule, pinned release/bundle, Thread binding을 서버가 검증한다. 다른 Reading의 raw source, revoke된 해설, 과거 유료 본문을 일반 Chat memory/retrieval/context에 섞지 않는다.
3. **기존 채팅방 bundle이 구매한 Reader bundle과 다르면 무단 변경 금지.** 현재 D-05-C는 rollback/DENY한다. 별도 pinned Bundle writer/reconciliation이 승인·검증되기 전 자동 전환·다중 Thread 선택·'최신 해설' 대체를 하지 않는다.
4. **일반 Standard 사주 해설 자격 ≠ 전문 행동 능력.** Product의 승인된 versioned Standard Reader eligibility와 Character/DB의 specialist `can_initiate`를 분리한다(기존 설계 C 후보를 제품 방향으로 채택). 상품별 출시·Reader catalog published/available/unlock·premium restricted·실제 DB bind와 A2/A3는 모두 별도 검증. 9명 자동 출판/전원 판매·Capability 위조·기존 SQL gate 무단 삭제 금지.

## 2. 공개·환불에 따른 유료 결과 정책

- 승인 방향: 짧은 사전 권한 확인(T1) → DB 연결을 붙잡지 않은 비공개 해설 생성 → 새로운 DB 거래에서 fresh Subject/Grant/Reading/policy/release 검증(T2) → 최종 승인 COMMIT 성공 이후에만 사용자 공개.
- **공개 기준 시점은 최종 승인 DB COMMIT 성공(L1 제품 선호 방향).** 해당 시점 전에 확정된 revoke/refund는 DENY하고 pending 결과는 노출하지 않는다. 그 직후 환불이 완료되면 이미 노출된 내용을 회수할 수 없지만, 새 유료 요청/서버 재열람은 현재 권한으로 다시 판정한다. 소비자보호 및 분쟁 처리 목적의 적법한 기록 보존·사실증명은 별도 계약.
- 한 Reader×Reading×bundle에 여러 독립 구매권이 있는 경우 유효한 하나가 남아 있으면 범위 접근 유지. 서로 다른 active Bundle이 둘 이상이면 exact-one 거부; 어느 쪽도 임의 채택하지 않는다.
- **DB 잠금 범위 제품 선호:** Subject×Official Reading×Reader 공동 직렬화 기준(R2-NEW 계열). 신규 테이블/행 잠금 모드/순서/Writer 변경은 DB·Commerce 승인 전 확정 아님. Birth Profile 잠금 후보는 기존 Binder Grant→Birth 경로와 deadlock 위험(DB-C5)이 있어 간단한 해결책으로 채택하지 않는다.
- T2 승인과 HTTP 응답 인도의 차이, 환불/클레임 법정 의무, 생성 원가·중복 생성·재시도·기록 보존은 Commerce/Legal/Reader/API의 이행 계약에서 확정. 조기 스트리밍 금지.

## 3. 환불 상업 정책 — 사용자 방향 승인 / 법무 출시 승인 보류

- **단건 맞춤형 디지털 해설**은 법령상 요건을 갖추어 콘텐츠의 실제 제공 개시 *이후* 단순 변심 청약철회를 제한하는 방향을 채택한다. 별도 후속 대화권/유료 상담/다회 이용권 등 가분적 미제공 부분을 '해설 제공 개시' 하나로 자동 소진시키지 않는다.
- 결제완료·Intent 생성·외부 AI 요청·내부 결과 생성·DB 승인 COMMIT만으로 소비자에게 **디지털 콘텐츠 제공이 개시됐다고 단정하지 않는다**. 서버의 실제 제공·이용 가능 시점 증거 정의와 약관 적용은 법무·Commerce 확정 필요.
- **고지·시험 사용/충분한 상품 정보·법정 환불 예외**가 갖춰지지 않았다면 자동 환불 불가 처리 금지. 취소·환불 접수 자체를 숨기거나 구매보다 더 어렵게 만들지 않는다.
- 하자/미제공/중복결제/계약 불일치/법정 청약철회/미개시 가분 부분 등은 별도 처리한다. '디지털 상품이므로 무조건 환불 불가', '동의했으므로 모든 법적 권리 포기'라는 문구 금지.
- 결제 전 표시·동의 버전 및 실제 제공 시점 감사 증거는 민감한 Reader 원문이나 사주 출처를 로그에 남기지 않고 최소화한다.
- 상세 문구, 판단 매트릭스, 출시 법정 조건: `docs/COMMERCE_DIGITAL_READING_REFUND_DISCLOSURE_POLICY_V1.md`.

## 4. 코드·데이터 구현 경계

**현재 존재하는 것:** 기존 Member×Character Chat opener/Thread, read-only D-05 locator, dormant 첫 Thread 생성 후보, 정확한 구매권/Release mismatch 시 원자 rollback, 실제 PostgreSQL 합성 테스트(PR #1969); DB Grant revoke·phantom·Birth 잠금 실패 가능성의 격리 검증.

**아직 없거나 승인되지 않은 것:** 운영 Product policy source/#1828 DB bind 수정, Paid Reader 공개 HTTP, 새 T1/T2 선형화 및 공동 잠금 Writer, 운영 환불 Provider 구현, Paid result/기록 저장 계약, 법무 승인된 결제 전 고지·증빙, 실제 saleable Offer/checkout, Saju Production 승인.

기존 migrations 1130/1150/1220/1270 수정 금지(필요하면 forward-only). 새 Grant table 불필요. Guest→Member promotion과 기존 과거 결속 이력을 새 구매권으로 해석 금지.

## 5. 책임과 순서

| 단계 | 소유자 | 납품 조건 |
| --- | --- | --- |
| P0 | Product/Legal/Commerce | 해설 단건과 후속 상담 상품 구획, 가격·제공/미리보기·환불 고지문·제공 개시 증거에 서명; 상업용 문구는 이 단계 이후만 표시 |
| P1 | Product/DB/Reader | approved versioned 일반 Standard 정책을 실제 binder와 일치시키고 exact catalog/unlock/release/Grant 조합을 실제 DB에서 검증 (#1828) |
| P2 | DB/Commerce | scope-anchor 선택, 모든 bind/revoke/새 구매권 writer의 **공통** 잠금 순서와 fresh clock·deadlock·timeout·RLS·ACL 회귀 (#1827) |
| P3 | Reader/API/Records | T1→비공개 생성→T2 COMMIT→비스트리밍 공개 및 paid 결과 저장·재열람/환불 후 접근 계약; 실제 PostgreSQL 동시성 |
| P4 | UX/QA/Release | 서버가 반환한 exact Reading×Reader 해설 선택, 가입/재진입/환불 후 UI, 법정 취소 경로, 실제 스테이징 E2E와 kill switch |

## 6. 수락 시나리오

- 동일 회원이 세연 일반 채팅 → 공식 Reading A 구매/선택 → 동일 세연 채팅방 재사용; 다른 Reading B 권한 없이 B 본문 노출 0.
- A 환불 이후 기존 일반 Chat 기록 유지, A 해설 원본/유료 재조회 및 기억 재주입 차단. B를 독립 구매했다면 B 권한은 유지.
- 구매한 pinned bundle과 기존 Chat default Bundle이 다르면 신규 Thread 쓰기 0, 변경 0, 명확한 불가 상태.
- 동일 bundle 복수 Grant 중 하나 revoke 뒤 다른 active Grant 유지; 다른 active bundle 2개면 권한 거절.
- T1 뒤 환불 COMMIT → T2 DENY, 결과/대체 fallback 공개 0; T2 뒤 환불은 후속 신규 접근 차단.
- 새 Grant/Reader access INSERT와 T2 경쟁, 교착 및 순서 역전, 만료·Session 변동·읽기 권한 상실을 실제 독립 PostgreSQL 연결로 검증.
- Standard 9×9 합성 성공은 실출판·구매·상품 적격성의 증명이 아님; 미승인 정책/잠김/미출판 Reader·premium 기능 거절.
- 미리보기·청약철회 정보 고지가 없는 결제, 제공 시작 영수증이 없는 '환불 불가' 자동 판정, 미제공 부분의 일괄 환불 차단은 허용하지 않음.

## 7. 변경 통제

이 문서는 **제품 소유자 방향 결정 기록**으로서 #1823의 D05-A 및 제품 동작 논의를 종결 방향으로 좁힌다. 그러나 #1827·#1828 및 Legal·Commerce·DB·Reader/Release 기술 검증·승인을 해결했다고 주장하지 않는다. 각 트랙의 승인과 실제 E2E 전까지 `Reader PUBLIC OFF`, `Offer/checkout OFF`, `Paid response OFF` 유지.
