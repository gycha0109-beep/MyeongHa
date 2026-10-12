# 공식 사주 Reader 구매·회수·채팅 T2 통합 상세 설계 v1

> 기준: 2026-10-12, \`#2006\` 검증 HEAD \`5127e8f07819f113efdc9e99f8d79ed28f97288e\`.  
> 분류: \`db-authority-core\`; 협의 주체 DB Authority / Commerce / Saju / Reader Runtime / Chat / Privacy / Product / Legal.  
> **상태: DESIGN PROPOSAL / PRIVATE IMPLEMENTATION ONLY / OWNER REVIEW REQUIRED / CHECKOUT·PAID CHAT·PUBLIC OFF.**  
> 본 문서는 제안 구현과 현재 구현을 엄격히 구분한다. 기존 migration·운영 호출 경로는 이 문서만으로 변경되지 않는다.

## 0. 결론과 구체적 산출물

**결정 후보:** 모든 공식 Reader 권한 영향 경로가 \`L0: canonical Subject×Product\`를 먼저 확보하고, 이미 공식 Reading이 정해졌다면 \`L1: canonical Subject×Official Reading×Reader\`를 이어 확보한다. 그 다음에만 Provider/Receipt/Grant·Birth·Thread/Turn/Attempt 행 잠금을 사용한다. **L0/L1 잠금 자체는 구매권이 아니며**, 잠금 이후 정확한 현재 구매권과 상품·사주·캐릭터·콘텐츠·출처를 다시 읽어야 한다.

**기존 코드와 다른 부분:** \`1790\`은 최초 구매에서만 L0를, \`1760/1770/1750\`은 추가 구매·회수·조회에서만 L1을 잡는다. 운영 Commerce Writer, 일반 Chat writer 및 결제사 취소 ingest까지 관통하는 통일된 진입점은 없다. 그러므로 오늘의 CI 녹색은 **통합 T2 안전성 증거가 아니다**.

최종 납품 단위를 다음 다섯 계층으로 고정한다.

1. **A: 잠금·원본 범위 결정:** read-only preflight → L0 → 필요 시 L1 → 모든 범위 재검증.
2. **B: Commerce 권한 적용:** 최초/추가 구매권, bind, 취소·만료·복구·중복/역순 이벤트 모두 검증된 동일 잠금 계약 아래 원본 Writer로 위임.
3. **C: Saju 근거:** 공식 Reading의 **실제로 존재하는 source-owned Grounding Unit**·필수 동반 근거·고지·불확실성·해시를 신뢰된 서버 증명으로 보유.
4. **D: 유료 결과 격리 및 T2:** 비공개 생성 → 새 DB 거래의 fresh 권한 판정 → 민감 본문·출처·안전 표시·시도 상태 **원자 확정** → COMMIT 성공 뒤 공개.
5. **E: RR-04 현재 권한 기반 조회:** 최신 유효 Assistant 확정 메시지와 보호 본문을 현재의 권한으로 읽고, 근거 단위로만 후속 질문 범위를 결정.

## 1. 현재 코드의 검증 가능한 사실과 가정의 분리

| 구분 | 확인된 자산 / 동작 | 정확한 제한 |
| --- | --- | --- |
| L1 | \`1740 internal_acquire_official_reader_scope_lock_v1\` | 회원×Reading×Reader 잠금. 모든 Writer 호출 보장 없음 |
| L1 조회 | \`1750 internal_qry_official_reader_locked_bundle_scope_v1\` | 현재 유효 Bundle **개수 판정**. Product/T2 최종 승인 아님 |
| 추가 구매 | \`1760\` 발급·bind 비공개 함수, #1996 | 기존 Reading이 하나로 확정된 추가 Reader에 한정 |
| Provider 회수 | \`1770\` 전체 기결속 범위 순서대로 잠금, #2001 | **미결속 최초 구매 Grant 회수 불가**, 실제 콜백 비연결 |
| Provider 브리지 | \`1780\` 취소 이벤트→회원 문맥→1770, #2004 | 직접 EXECUTE 권한 없음; 서명·이벤트 ingest/운영 호출자 없음 |
| L0 | \`1790\` 회원×Product 선행 잠금·최초 발급/결속, #2006 | 기존 추가 구매/회수/T2 미참여; 허가된 운영 진입점 없음 |
| 원본 Commerce | \`1080 internal_apply_entitlement_effect_v1\`, 영수증 capability effect writer | CAS·ledger·projection/outbox의 원본 소유; 기존 우회 진입점 잔존 |
| Reader bind | \`1220 cmd_bind_standard_reading_access_v2\`, \`1270\` current purchase-backed 조회 | 원본 binder는 Grant→Birth 잠금. Reader access 원장과 Reading 원본은 별개 |
| 일반 Chat | \`0220 cmd_commit_chat_turn_v1\` | 일반 메시지 \`body_text\`와 부수 효과/Outbox까지 확정, 민감 유료 원문 격리 미지원 |
| RR-03 / RR-04 | #1960 비공개 출처 테이블 / #1974 private follow-up 후보 | 둘 다 Draft; 신뢰된 출처의 실제 T2 저장/보호 본문/공개 조회 아님 |
| 지급과 법무 | \`MOBILE_READER_PRODUCT_OWNER_DECISION_20261012_V1.md\`, \`COMMERCE_DIGITAL_READING_REFUND_DISCLOSURE_POLICY_V1.md\` | 제품 방향만 승인; 법무·Commerce·Privacy·공개 승인 보류 |

현재 본선 Product migration과 #1960 출처 migration의 **\`1720\` 파일 번호가 충돌**한다. 기능을 합치는 것으로 해결하지 않으며 migration 번호·카탈로그·의존 순서를 독립 검증한다.

## 2. 불변식 (MUST / DENY)

**I01 회원:** 권한 판정은 정본 canonical Member 기준. \`1270\`에 존재하는 merged Guest 원본은 별도 매핑·폐기 규칙으로 한정하며 Guest ID와 Member ID 잠금 키가 갈라지면 차단한다.

**I02 사주:** \`standard_reading_official_bindings\`의 official Reading과 pinned Product·Birth revision·사주 domain·topic·period·variant·Product spec·domain capability·실제 \`reading_refs\` source hash가 유일하고 일치해야 한다. 요청/화면/모델의 Reading UUID를 진실로 사용하지 않는다.

**I03 Reader·구매권:** \`standard_reading_reader_access_grants\`의 독립 구매권 → \`entitlement_grants\` 현재 active 및 유효기간 → exact Reader/Bundle. 같은 Bundle 복수 유효 Grant는 허용 후보, 서로 다른 유효 Bundle은 AMBIGUOUS/DENY. \`replayed=true\`·결제 예정·환불 접수·과거 구매 이력은 현재 접근권이 아니다.

**I04 동시성:** 모든 권한에 영향을 주는 원본 Writer는 동일 Product L0 + 관련 Reading/Reader L1 잠금을 **Commerce/Grant/Birth/Thread 행 잠금 전에** 얻는다. 신규 Grant INSERT 팬텀도 이 범위를 반드시 통과한다. 잠금 없는 직접 Writer가 한 개라도 있으면 공개 권한을 주장하지 않는다.

**I05 시점:** 새 짧은 \`READ COMMITTED\` 거래. \`clock_timestamp()\`는 실제 잠금 대기 후 현재 판정에 사용한다. \`REPEATABLE READ\`/\`SERIALIZABLE\`에서 선점한 과거 스냅샷 사용 금지. 비공개 AI 생성(T1 이후)은 DB 거래·잠금을 유지하지 않는다.

**I06 출처:** Saju 원본이 발급한 Unit 실재성·해시·동반 범위까지 검증하지 않은 \`grounding_unit_...\` 형식 문자열/모델 텍스트·Chat \`grounding_refs_jsonb\`의 AI UUID는 근거가 아니다.

**I07 원문:** 유료 답변의 민감 원문은 일반 \`conversation_messages.body_text\`, \`chat_turn_attempts.generated_body_text\`, 일반 Memory/검색/요약/Outbox/Analytics/알림/Trace에 존재하지 않는다. UI에는 일반 채팅 내 **안전한 자리표시 메시지**만 보인다.

**I08 원자성:** 같은 T2 COMMIT에서 정확히 한 번의 공식 Assistant 본문, 대화 자리표시, 검증 출처, 시도·전달 상태가 상호 참조 가능하게 확정된다. 하나라도 실패하면 전부 롤백·공개 0.

**I09 공개:** HTTP/Stream은 T2 성공 커밋 이후에만 시작. COMMIT은 소비자에게 실제 제공 개시되었다는 법적 증거가 아니다. 이후 환불되면 서버 재열람·검색·후속근거 재주입 차단.

**I10 기본:** DB/Provider 오류·모호한 범위·서명/정책/역할 불명·대기 시간 초과 → FAIL CLOSED, 외부 이용 허용 없음.

## 3. 공통 잠금 프로토콜 v2 — 설계안

### 3.1 키와 정렬

- **L0 Product key** = \`(canonical_subject_id, official_standard_product_id)\`. 공식 사주 UUID 생성 전에 존재. \`1790\`의 현재 advisory namespace를 유지하며 확정할지 DB Owner 검토.
- **L1 Reading-Reader key** = \`(canonical_subject_id, official_reading_id, reader_character_id)\`. \`1740\`의 기존 네임스페이스 유지.
- 모든 명령은 L0 키를 \`(subject UUID, product UUID)\` 오름차순으로 정렬 후 **전체 획득**한다. 그 뒤 L1 키를 \`(subject UUID, Reading UUID, Reader text)\` 오름차순으로 정렬 후 **전체 획득**한다. L1을 먼저 잡은 트랜잭션에서 L0 취득 금지.
- 한 명령이 여러 Product/Reader/Reading 범위에 걸칠 가능성이 있으면 preflight에서 **전체 영향 집합**을 유도해야 한다. 일부만 잠그고 후속 범위가 나타나면 자동 확장하지 않고 **전체 롤백·새 트랜잭션 재시작**한다.
- 해시 충돌로 생긴 과잉 대기는 허용할 수 있으나 collision을 접근 허용 근거로 사용하지 않는다. 잠금 key 및 문자열 정규화 버전을 동시에 바꾸지 않는다.
- \`pg_advisory_xact_lock\`는 그 자체로 실제 SQL 행 잠금과 상호 제약을 강제하지 않는다. 따라서 모든 쓰기/최종 Reader 조회 진입점의 코드 감사와 운영 역할 ACL이 필수이다.

### 3.2 진입점별 잠금·행 작업 순서

| 경로 | preflight (읽기만) | L0 | L1 | 이후 원본 행 잠금·검사 | 허용 출력 |
| --- | --- | --- | --- | --- | --- |
| 최초 사주 Receipt 발급 | Receipt→Intent \`initial_reading\`→Product | 정확한 1개 | 아직 Reading 없음 | 원본 영수증/Entitlement 발급, 범위 재검사 | Grant 이력만 |
| 최초 사주 bind | Intent→Product + 선택 Reader + current Birth revision | 정확한 1개 | 아직 Reading 없음 | \`1220\` Grant→Birth 및 official Reading 생성, 범위 재검사 | exact Reading + Reader 결속 |
| 추가 Reader Receipt | verified 추가 Intent→기존 official Reading→Product/Reader | 정확한 1개 | 정확한 1개 | 기존 Receipt→Grant 발급 / 변경 탐지 | 구매권 이력 |
| 추가 Reader bind | Intent→기존 Reading→Product/Reader | 정확한 1개 | 정확한 1개 | 기존 \`1220\` binder, 원본 일치 검증 | Reader access 결속 |
| 현재 기결속 Provider 취소 | verified Event→Receipt→Grant→**모든** access 범위 및 Product | 영향 Product 전체 | 영향 Reading×Reader 전체 | 기존 \`1080\` CAS·ledger/outbox | revoke/expire 결과 |
| **미결속** 최초 Grant 취소 | verified Event→initial Intent→Product, Reading 미존재 확인 | 정확한 1개 | 없음 | 기존 \`1080\` 이벤트/Grant 적용, 이후 bind 금지 | revoke 결과 |
| 재권한 부여/복구 | 소유 Commerce 상태전이·결속 전/후 범위 유도 | 영향 Product 전체 | 영향 Reader 전체 | 승인된 Restore 원본, revision/order 검사 | Grant state |
| T2 유료 Assistant 확정 | 현재 Thread→공식 Reading→Product + Reader | 정확한 1개 | 정확한 1개 | Grant current→정본/정책→Thread/Turn/Attempt→원자 저장 | COMMIT 후 공개 후보 |
| RR-04 후속 조회·본문 재열람 | exact Subject/Thread/Reading/Reader→Product | 정확한 1개 | 정확한 1개 | 현재 access→출처·content provenance→보호 본문 | 현재 권한 있는 원문/근거만 |

**중요:** \`1770\`은 미결속 Grant를 거부하고 \`1780\`은 기존 운영 Commerce role에 실행권이 없다. 이 두 기능을 사용했다고 **환불 콜백 연결 완료라고 기록하지 않는다**. 추가 회수 경로는 DB/Commerce 동시 검토가 필요하다.

### 3.3 전역 교착 및 팬텀 방지

읽기 preflight는 잠금 없는 잠정 후보만 만든다. 같은 연결·같은 짧은 트랜잭션에서 L0 및 L1을 획득한 뒤 authoritative 범위를 **fresh statement**로 다시 읽는다. 여기에 새로 발생한 Product, Reading/Reader scope, 소유권 변화, 뒤늦은 Grant 추가, Birth revision 이동, Product policy 변경, Provider event 순서 변경이 있으면 DENY/ROLLBACK. 손상된 원본 상태를 이전 snapshot으로 보정하지 않는다.

최초 Reading과 추가 Reader가 같은 Product L0를 공유하도록 바꾸면 처음 생성하는 Reading이 Reader UUID 선택과 무관하게 직렬화된다. 이 때 현재 \`1220\`의 Grant→Birth/Reading 경로 및 \`0220\`의 Thread→Turn 경로에 **이미 선행 잠금을 잡은 외부 호출자가 있는지** 검사하여 \`row lock → L0/L1\` 역순을 차단해야 한다.

범위 변화가 반복되면 bounded retry + jitter를 서비스 레이어에 두되, 지급·환불 자체를 자동 재실행할 때는 기존 Receipt/Provider event CAS 및 멱등키를 재사용하고 새로운 유료 권한을 만들지 않는다. 타임아웃·교착·취소 응답의 사용자 노출은 안전한 실패 코드로 분리한다.

### 3.4 T2와 Refund의 순서 예시

\`\`\`text
T2 먼저: L0→L1→current grants 확인→원자 INSERT/COMMIT
           └ provider revoke는 대기, 그 후 revoke COMMIT
           └ 이후 서버 읽기/후속 질문은 revoke 상태라 DENY

revoke 먼저: L0→L1→1080 state 변경/COMMIT
              └ T2는 잠금 해제 후 fresh grants를 읽고 DENY
              └ 생성 중이던 유료 본문은 폐기, 공개 0

새 Grant 먼저: L0→L1→Grant INSERT/COMMIT
                └ 기다린 T2가 새 권한·Bundle 모호성을 fresh 판정

서로 다른 Product 영향이 있는 Provider effect:
    영향 Product 모두 정렬 획득 → 영향 L1 전부 정렬 획득
    → authoritative re-read → Commerce 효과 적용
\`\`\`

이 순서 검증은 **2개뿐 아니라 3개 이상의 DB 연결**에서 여러 Product/Reader 교차와 Thread 순서 역전을 포함해야 한다.

## 4. Commerce ingress·권한 상태 전이 상세 계약

1. **외부 진입/진실 경계:** 현재 PortOne v2 webhook 코드는 \`Transaction.Paid\`만 처리하고 나머지는 서명 검사 후 ignored. \`payment.cancelled\`이라는 DB 표준 이벤트는 provider 원문 type과 동일하다고 가정할 수 없다. DB 브리지에 전달하기 전 **서명·시간창·중복 이벤트 ID·provider API 조회·영수증/거래 번호·부분 취소 여부·결제 환경**을 분리 검증한 서버 소유 정규화 계층이 필요.
2. **분리된 파이프라인:** \`authenticate raw webhook\` → \`fetch provider state independently\` → \`persist verified cancellation evidence\` → \`resolve exact impacted Grant(s)\` → \`L0/L1 locks\` → \`apply 1080 effect with expected revision/order\` → \`commit\` → \`server outbox\`. 동일 webhook 반복·역순·오래된 취소의 원본 순서 규칙을 유지.
3. **실행 주체:** 사용자 Subject를 webhook JSON에서 수용하지 않는다. \`1780\`과 같은 소유자/권한 분리 전략은 별도 **최소 권한 Commerce 전용 worker**와 보안 검토가 필요하다. \`SECURITY DEFINER\`를 런타임·서비스·브라우저 역할에 곧바로 GRANT하는 접근 금지.
4. **독립 권한:** 서로 다른 Grant가 동일 Bundle을 허용하는 경우 하나를 취소해도 나머지가 살아 있으면 접근 유지. 서로 다른 Bundle이 동시에 유효하면 AMBIGUOUS/DENY. 최초 Grant 회수와 전체 구매 환불은 같은 사건이 아니며 각 결속된 Access/미결속 경로를 모두 처리.
5. **제공·법무:** 환불 접수, 환불 승인, provider 취소 확정, DB Grant revoke, 사용자 콘텐츠 실제 전달 증거는 별도 이벤트다. 내부 T2 COMMIT이 Legal 기준의 제공 개시를 자동 증명하지 않는다. 부분 환불/미제공 가분 부분/하자 청구에 대한 Commerce Owner 정책 확인 전 자동 거절·일괄 회수 금지.
6. **Cutover:** 기존 \`1080\` 원본 함수/영수증 직접 호출을 유지하면서 잠금 적용 완료라고 선언하지 않는다. 운영 호출 맵에서 모든 ingress·일괄 보정·관리자 수동 조정·재시도·restore job을 추적하고, 일반 Reader 권한 관련 직접 호출을 제한하는 ACL/내부 라우팅 및 regression test를 요구한다.

## 5. Saju Source Truth·실재 근거의 검증 계약 (S3)

일반 Chat의 AI grounding UUID와 Saju Unit Ref는 다른 ID 공간이다. RR-03 \`1720\`에 존재하는 \`internal_official_reader_source_refs_valid_v1\`의 정규식 확인은 \`grounding_unit_<24 lowercase hex>\` 모양만 검사한다. **출처 목록의 실재성·결속·필수 동반 근거·출력 정합성은 증명하지 않는다.**

별도 서버 소유 source manifest/proof를 설계한다. 저장 단위는 \`official_reading_id + reading_refs.response_hash + grounding_hash + projection_version + unit_manifest_hash\`로 원본 Saju 결과에 귀속시킨다. 각 Unit은 \`unit_id\`, 소유 domain/axis, \`source_span_or_canonical_claim_hash\`, companion Unit ID 집합, 필수 disclosure/ambiguity refs 및 적용 범위와 함께 검증 가능해야 한다. 사주 결과가 먼저 확정되고 immutable revision으로 고정돼 있지 않으면 HOLD.

**선택 검증:** 모델이 요청한 refs를 허용 목록에서 intersection 하는 것으로는 불충분하다. 모든 요청 ref가 source manifest에 존재해야 하고, Saju 소유 closure가 요구하는 companion/disclosure/ambiguity를 누락 없이 포함해야 한다. 검증된 deterministic Semantic Guard·Output Guard 버전/결과/원문 해시를 동일 admission artifact에 연결한다. 원본의 계산 ambiguity나 미확정 시각을 캐릭터 말투로 단정적으로 바꾸면 차단.

이미 존재하는 \`saju-held-source-proof-verifier-v1\`의 \`preview/held\` transport HMAC 결과는 코드 주석대로 **transport integrity verified only**이며 생산용 Reading·Commerce·판매·의미 출처의 허가가 아니다. 승인되지 않은 preview proof를 유료 T2 증명으로 승격하지 않는다.

## 6. 유료 본문 보호·일반 Chat 결합 상세 설계 (S4)

**제품 불변식:** 회원×캐릭터 일반 Thread 1개 유지. 유료 해설마다 새 일반 Thread를 만들지 않는다. 단, 이 Thread의 message row에 유료 원문을 저장하지 않는다.

추천 별도 저장 모델(이름은 제안, Privacy 미승인):
- \`official_reader_paid_message_contents\`: unique committed assistant message ID, Subject, Reading, Reader, source/provenance ID, encrypted/restricted protected body reference, body hash, created_at, deletion state. 원문 SELECT는 데이터베이스 내부 공개 함수 없이 최소 권한 서버 결합 경로만 허용.
- 기존 \`conversation_messages\`: 안전한 \`paid_official_reading\` placeholder 또는 단순 보호 표시만 보유. 본문/JSON payload/content_hash가 실제 유료 원문을 포함·동일 해시로 우회 조회하지 못하게 검증.
- \`official_reader_assistant_saju_provenance\`: RR-03 원본과 exact 메시지·Attempt·Turn·출처/해시를 연결하는 불변 감사 기반. 사용자/모델 임의 생성 ref를 insert하지 못하게 증명 경로가 선행.
- 보호 본문 URL/token, DB 암호화/키 관리, 압축·로그, 백업·삭제 및 복원 후 재노출 정책은 Privacy/Security Owner 심의로 확정. 현재 문서는 암호화 구현이 승인됐다고 주장하지 않는다.

**누출 경로 감사 의무:** \`0220\`의 \`generated_body_text\`, \`generated_message_payload_jsonb\`, Chat message body, Chat-outbox, world/relationship/memory side effects, 일반 summary·embedding·검색·알림·metrics·에러 trace·LLM 재요청 prompt·프론트 캐시/SSR. **하나라도 유료 원문을 보유하면 S4 미완료**. 현재 일반 \`cmd_commit_chat_turn_v1\`를 그대로 호출해 보호만 표시하는 방안은 허용하지 않는다.

채팅 화면은 message type·authorized server reference를 보고 공개 시점마다 권한을 다시 확인하여 보호 원문을 결합한다. 환불 뒤 placeholder는 유지해 시간순 대화 맥락은 보존하되 내용/미리보기/검색/재주입은 차단한다. 이미 클라이언트가 받은 본문은 기술적으로 회수할 수 없음을 정확히 고지한다.

## 7. RR-03 원자 T2 최종 확정 (S5)

\`\`\`text
T1 (no long DB lock):
  authenticate Member + exact Thread/Reader + candidate Reading
  → preliminary active Grant/Product/Release/Reading proof
  → source manifest checked
  → private AI generation and deterministic semantic/output guards
  → sensitive plaintext in restricted transient server boundary only

T2 (new short READ COMMITTED DB transaction, no early stream):
  0. verify server-owned one-use attempt, exact input/body/proof fingerprint
  1. authoritative Product key preflight → L0
  2. authoritative Reading/Reader key preflight → L1
  3. re-resolve entire scope, drift ⇒ rollback
  4. current exact Grant cardinality & clock_timestamp validity, Product
     eligibility, active canonical Member, pinned Thread release/bundle/
     revision and exact official Reading committed source response hash
  5. verify immutable Saju manifest membership/closure and guard pass
  6. lock Thread → Turn → Attempt in one documented row-lock order
  7. insert safe placeholder + restricted paid body + immutable RR-03 proof
     + attempt/turn commit state + limited safe outbox atomically
  8. authoritative message/attempt/body/provenance hash consistency check
  COMMIT → permit one protected response read with current authorization
\`\`\`

T2 진입 전에 확보한 \`T1\` weak-map one-use proof·모델 출력·브라우저 ID·preview transport proof는 위의 4~8단계를 대신하지 않는다. 별도 최종 저장 함수는 \`0220\`의 현재 일반 출력·부수 효과와 충돌하지 않도록 **paid 전용 원자 write path**를 설계하고, 기존 일반 Chat 공개 경로의 불변식은 유지한다.

**Idempotency:** \`(Subject, Turn, Attempt)\`의 one-final-commit, assistant message ID·원문 digest·정본 source ref·Release/Bundle·guard versions가 완전히 같아야 기존 결과 replay를 허용한다. 이미 확정된 다른 attempt/digest/Reading/Bundle은 CONFLICT/DENY. replay가 과거 내용을 읽어도 되는 새로운 권리가 아니므로 **현재 Grant를 다시 검사**해야 공개할 수 있다.

**오류:** 권한 없거나 Product drift 또는 refund 선행 → protected content INSERT 0, 새 assistant placeholder 0, provenance 0, outbox 0. DB 전송 실패/COMMIT 응답 분실 시 server-side receipt/committed status를 idempotent 조회하되 다시 공개할 때는 현재 권한 재검사. 생성 비용은 중복될 수 있으나 중복 사용자 인도·이중 과금이 발생해서는 안 된다.

## 8. RR-04 후속 질문·재열람 (S6)

- RR-04 #1974의 기존 후보는 \`conversation_messages.content_hash = provenance.utterance_hash\` 결속을 전제한다. S4에서 원문을 별도 보호하면 **이 동등식은 참이 아니므로** 재설계 필수.
- \`conversation_messages\` placeholder/Turn/Attempt ID → RR-03 proof → restricted paid body \`body_digest = provenance.utterance_hash\`를 정확히 연결한다. 일반 Chat body/hash를 민감 원문 대신 사용하지 않는다.
- **현재 권한 및 Product/Release/source hash**를 RR-04 질의 시마다 새 거래의 L0→L1로 재평가한다. 최신 committed assistant 후보가 부적격이면 이전 유효 본문을 찾아 자동 복구하지 않는다.
- 출처 Unit 1개 또는 불변 persisted focus가 명확하면 원본 Saju manifest에서 companion closure 재평가. 복수 Unit에 정확한 focus 없으면 \`clarification_required\`. 현재 source/proof가 사라지거나 권한 회수·다른 Bundle·다른 Reading·User/Reader 교차 발생 시 \`ACCESS_DENIED\` 또는 안전한 HOLD.
- 후속 질문은 보호 본문을 LLM memory에 마구 재주입하지 않는다. **현재 권한으로 다시 추출한 approved source-backed context만** 일회성 생성 입력으로 사용한다.

## 9. 운영 실패·권한·개인정보 계약

- **Roles:** PUBLIC/anon/authenticated/service_role 직접 SQL 권한 없음. Reader finalizer는 승인된 API 실행 주체와 좁은 DB entrypoint만 허용하고, refund worker는 분리된 서명·검증 소유자와 최소 권한 경로를 가진다. privileged function \`search_path\`, ownership, \`FORCE RLS\`와 audit event 형식은 보안 검토.
- **Privacy:** 유료 본문·immutable proof는 계정 삭제 이후 백업 복원, GDPR/KR 개인정보 보유·삭제 책임과 충돌하지 않도록 별도 분류. RR-03 승인된 삭제 계약만으로 신규 보호 원문 테이블의 삭제 승인을 간주하지 않는다.
- **Recovery:** 미완료/재생성된 권한, 유료 원문 복원, 취소 이벤트 replay, 사용자가 이미 받은 본문 관련 증거는 보존 등급을 구분. 1400–1450 운영 migration 복원 미검증(#1941)은 모든 신규 Production 적용 차단.
- **Observability:** lock wait/timeout, grant revision conflict, bundle ambiguity, verified-provider-event replay, source drift, T2 rollback, content reveal/HTTP delivery confirmation **건수와 추적 ID만** 기록. 원문, 민감 사주 프로필, payload, Source Unit 텍스트, 비밀/서명 기록 금지.
- **Kill switch:** Paid Reader eligibility/Checkout/Chat 서로 별도 OFF. 특정 gate가 실패하면 fail-closed 및 staging rollback; 이미 제공한 텍스트가 삭제됐다고 주장하지 않는다.

## 10. 구현 분할 / 검증 게이트 / 소유자

| 순서 | PR 책임·구현 계약 | 핵심 검증 | 종료/병합 차단 |
| --- | --- | --- | --- |
| D0 설계 승인 | 본 문서, row lock map, Product·Commerce·Reader·Privacy·Legal 결정 기록 | 관계자 책임과 경계·미결론 공개 | 추가 SQL/운영 공개 없음 |
| D1 global lock shared resolver | \`Subject×Product\` 외부 잠금 + 다중 Product 정렬 + L1 후속 잠금; 기존 \`1740/1790\` 재사용 검토 | 3+ connection Product/Reader 교차, new Grant phantom, deadlock 0 | 잠금 우회 경로 존재 시 HOLD |
| D2 initial/additional issue/bind refactor | \`1090/1220/1760/1790\` wrapper 공통 entrypoint, 정확한 최초/추가 분기 | first vs additional race, 1 Reading only, replay, Birth revision drift | Merchant·Intent·Grant 원본 불일치 |
| D3 Provider revoke/unbound/restore | \`1080/1770/1780\`에 canonical Product scope, 미결속 초기 취소 지원, trusted Event normalization + role gate | 2/3개 DB session refund-first/T2-first/issue-first, 역순·중복·부분 취소 | 실제 webhook/Provider 검증 미구현 시 Runtime OFF |
| D4 Saju provenance proof | 실제 Saju-owned Unit manifest/closure/semantic+output proof, 독립 schema PR, \`1720\` 충돌 해결 | 위조·누락·다른 Reading·해시 mismatch 수락 0 | preview-held 승격 금지 |
| D5 protected body + T2 finalizer | Privacy 분류된 보호 본문, safe placeholder, 원자 chat+proof commit, ACL | 환불 후 원문/AI memory/Outbox 접근 0, 부분 commit 0 | 일반 Chat \`0220\` 원문 누출 발견 시 HOLD |
| D6 RR-04/Reader/UI E2E | current rights+protected-body anchor, follow-up proof and exact delivery evidence | stale/latest invalid/rollback/cross-tenant/Bundle ambiguity; HTTP before COMMIT 0 | Product/Legal/Privacy/운영 승인 전 공개 OFF |

**D1~D6는 각각 독립 Draft PR**, 의존하는 코드들은 세로로 쌓되 나중 PR이 앞선 PR의 실패를 숨기지 않도록 정확한 부모 SHA·계층별 합성 검증을 유지한다. CI에는 PostgreSQL 15/17, DB catalog snapshot, Commerce Payment/Entitlement, Reader API/TS, Governance/Watchtower, 개인정보 삭제·격리 복원 실증이 필요하다.

### 최소 필수 경합 시나리오

1. 최초 Grant 발급 ↔ 최초 Reading 생성 ↔ 추가 Reader 구매: ID 생성 전후 동일 Product 직렬화, 공식 Reading 정확히 하나.
2. 초기 Grant 취소가 **bind보다 먼저**: 환불된 권한으로 공식 Reading 생성/유료 답변 확정 0.
3. 추가 Reader 영수증 발급 ↔ 회수: 서로 다른 신규 Grant INSERT 팬텀/같은 Bundle 독립 활성 권한/다른 Bundle 모호성 정확한 판정.
4. T2 ↔ 취소/재권한/만료 시각 이동: 잠금 선형화 위치와 freshness, rollback, 공개 0 확인.
5. 결제사 이벤트 동일·순서 역전·부분 취소·원본 거래 불명: 중복 효과 0·권한 부당 복구 0.
6. Provider가 2개 이상의 Reading/Reader/Product 범위에 영향을 줄 때 정렬된 모든 잠금 취득, 대기 시간 내 deadlock 0.
7. 가입 전 Guest→Member 병합과 Buyer/Reading Canonical Subject 불일치: 충돌 deny 또는 승인된 단일 정상화.
8. 보호 본문에 일반 Chat memory/summary/search/outbox 구독자가 접근 시도: Content 0 및 안전한 placeholder만 확인.
9. T2 성공 직후 회수와 HTTP/서버 재열람: 제공 증거는 별도 기록, 신규 서버 접근·후속 질문은 revoke 후 0.
10. Account deletion→Backup restore→reconciliation: 보호 본문·Proof 재노출 0.

## 11. 잠정 결정 및 반드시 답해야 할 질문 (Decision Register)

| ID | 질문 / 제안 방향 | Owner / 상태 |
| --- | --- | --- |
| Q1 | Product L0를 모든 Reader-mutating/write/read 경로의 가장 바깥 잠금으로 승격할지? 제안 **YES**, 동일 네임스페이스 유지 | DB+Commerce+Reader 승인 필요 |
| Q2 | 여러 Product를 동시에 건드리는 취소 이벤트의 영향 집합을 최초 조회로 완전히 알 수 있는지? 모호하면 일단 DENY | Commerce+DB 근거 필요 |
| Q3 | 미결속 Grant의 cancel/restore를 처음 Product L0로 처리할 DB 이벤트 경로는? \`1770\`으로 해결된 적 없음 | Commerce+DB 미구현 |
| Q4 | \`1780\`의 privileged DB owner 함수를 누가 최소 권한으로 호출할지? Provider 콜백 서명 검증/정규화와 구분 | Commerce+Security 미승인 |
| Q5 | \`1220\`의 specialist \`can_initiate\`와 일반 Standard eligible 정책 차이를 어느 Product spec revision으로 영속화할지? | Product+Reader 미확정 |
| Q6 | Saju-owned Unit manifest의 정확한 canonical byte/hash/closure 제공 형식은? preview-held는 충분하지 않음 | Saju+Reader 미확정 |
| Q7 | 유료 보호 본문 보관 방식·암호화·계정 삭제·복구·보유기간의 법적 분류는? | Privacy+Security+Legal 미승인 |
| Q8 | 일반 Chat World/Relationship/Memory side effect를 유료 T2에서 전부 배제/필터할 공식 API는? | Chat+Reader 미확정 |
| Q9 | RR-03 \`1720\` migration 번호 충돌과 #1974 연결을 어떻게 분리·재검증할지? | DB 검토 전 Merge HOLD |
| Q10 | 실제 제공 개시 증거(HTTP response, ack, retrievable state)와 재시도·환불 소유 계약은? | Commerce+Legal+UX 미확정 |

## 12. 검토 종료 기준

- **이번 문서의 납품 완료:** 모든 원본 Writer/Reader/T2 경로의 잠금 순서와 임시 출처/보호 본문 분리 계획, 실패 및 검증 증거를 **검토 가능한 명세로 저장**.
- **코드 구현 완료 아님:** 본 문서 자체는 SQL/TS 함수, 신규 Table, webhook, 실제 Provider 회수와 RR-03/04 T2를 생성하거나 활성화하지 않는다.
- **절대 출시 금지 조건:** 미구현 또는 우회 가능한 Grant writer, 미결속 환불, 미승인 Source Manifest, 유료 본문 일반 Chat 유출, 마이그레이션 충돌, Privacy/Legal 미승인, 운영 복원 증거 부족.
- **다음 작업:** D0 Owner 검토를 토대로 D1 전역 lock-entrypoint + D2 초기/추가 구매·bind 연결을 각각 비공개 PR로 진행. 구현 전에 Q1/Q2/Q3 및 \`0220\`과의 역순 lock map을 우선 확정한다.
