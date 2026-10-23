# Official Reader S4 — 복원 파생 데이터 격리·정리 인계·재실행 계약 v1

- 담당 경계: **기존 Privacy/DB Owner**, 계정 삭제·P30D 복구 정본 및 #2318. 이 문서는 추가 권한 또는 별도의 정책 승인이 아니다.
- 제품 정책: [S4 제품 결정](../architecture/OFFICIAL_READER_S4_PRODUCT_OWNER_PRIVACY_POLICY_DECISION_20261019_V1.md), [보호 원문 삭제·복원 설계](../architecture/OFFICIAL_READER_S4_PROTECTED_CONTENT_STORAGE_DELETION_RECOVERY_DESIGN_V1.md), [기존 개인정보 복원 절차](POSTGRES_PRIVACY_RECONCILIATION_REPLAY_V1.md).
- 코드 접점: `2230_official_reader_s4_restore_derived_quarantine_reason_contract_v1.sql`, `2200_official_reader_s4_offline_restore_ordinary_derivation_quarantine_v1.sql`, `2210`·`2220` 읽기 격리 정책, `official-reader-private-restore-reconciliation-v1.ts`, `official-reader-private-restore-quarantine-state-v1.ts` 및 `scripts/operations/replay-offprimary-reader-deletions-after-restore.mjs`.
- 현재 상태: **비공개 구현**, 신규 SQL 운영 미적용, 개인정보 Owner의 복원 인수 및 공식 Saju 운영 출처 미완료. 유료 생성·원문 조회·일반 복원 소비자·판매 공개는 계속 OFF.

## 1. 미정리 파생 기록이 발견된 경우

이미 격리된 PostgreSQL 백업에서 **기존 S4 복원 명령**을 시도하면, 삭제 대상 보호 원문을 지우는 동일 거래의 마지막 단계에서 S5 서버 안전 표시의 정확한 `subject_id × source_turn_id/source_message_id` 출처를 검사한다. 안전 표시의 출처는 **서버 작성 SYSTEM 메시지**이며, 같은 문장을 사용자가 직접 작성한 일반 메시지는 대상이 아니다.

`2230`은 카테고리별 PostgreSQL 제약명만 발생시키고, 복원 실행기는 개인 식별자/Row ID/원문/키/금액/영수증/건수 없이 아래 네 값 중 하나를 전달한다.

| `derivedCategory` | 현재 의미 | 기존 소유 경계 |
| --- | --- | --- |
| `ordinary_memory` | 일반 Memory Item에 보호 턴/메시지가 출처로 남음 | 기존 개인정보·계정 삭제/Memory 처분 |
| `ordinary_memory_proposal` | Memory Proposal에 보호 출처가 남음 | 기존 개인정보·계정 삭제/제안 기록 처분 |
| `ordinary_life_fact` | Life Fact에 보호 출처가 남음 | 기존 개인정보·계정 삭제/Life Fact 처분 |
| `ordinary_chat_outbox` | 일반 Chat Outbox/후속 분석 이벤트가 보호 출처와 결속됨 | 기존 개인정보·채팅/분석 이벤트 처분 |

- 알려진 카테고리: `restoreState=quarantined_derived_data`, `existingPrivacyOwnerCleanupRequired=true`, `resumeRequirement=owner_reconcile_then_rerun_same_isolated_restore`.
- 출처/DB 오류 등 식별되지 않은 차단: `restoreState=blocked_unclassified`, `derivedCategory=null`, `resumeRequirement=investigate_unknown_blocker_in_quarantine`.
- **두 상태 모두 복원 도구가 자동 정리·승인·재개하지 않는다.** 실패 종료 코드와 격리 상태가 유지된다.
- `MEMORY_ITEM_REVOKED`·`LIFE_FACT_REVOKED` 등 기존 철회 이벤트는 **현재 접근 차단**이지, 복원에서 확인되는 저장 행의 물리적 파기를 증명하지 않는다. 출처 행이 남으면 S4 격리는 계속된다. `memory_proposals`·일반 `outbox_events`에 대해 임의의 기존 삭제 명령을 지어내지 않는다.
- 위 구분은 특정 Record 삭제 권한을 부여하지 않는다. 실제 잔존물 식별과 적법한 정리 방식/감사 증거는 기존 Privacy/DB Owner 정본에 귀속된다.

## 2. 기존 절차에서의 정리 후 재실행

1. **격리 유지:** 실제 Reader 유료 원문 API·Reader 보호 컨텍스트·일반 Memory/Search/Summary 복원 소비자를 비활성화하고, 운영 DB가 아닌 격리 복원 환경에서만 작업한다.
2. **기존 Owner 정리:** 백업 시점 이후의 승인된 삭제·회수 이벤트를 [기존 PostgreSQL 개인정보 재조정 절차](POSTGRES_PRIVACY_RECONCILIATION_REPLAY_V1.md)와 [계정 삭제 처분 정책](ACCOUNT_DELETION_FINALIZATION_POLICY_V1.md) 범위에서 재적용한다. 그 절차가 허용하지 않는 물리적 삭제·Proposals/Outbox 처분은 미승인으로 유지하며, 새 실행 권한을 만들지 않는다.
3. **같은 명령을 다시 실행:** 기존 `replay-offprimary-reader-deletions-after-restore.mjs`의 기존 격리 실행 확인 문자열을 사용한다. 신규 `--force`, `--skip`, 운영 자동 시작, 브라우저/환경변수 예외는 없다. 실행기는 모든 외부 tombstone manifest를 먼저 대조하고 환불→계정 삭제를 **하나의 롤백 전용 DB 사전거래**에서 먼저 확인한다.
4. **재검사:** 정확한 기존 복원 SQL과 S4 파생물 검사를 재실행하며, 진짜 삭제를 끝낸 뒤에도 같은 범위를 다시 **롤백 전용**으로 재검사한다. 하나라도 실패하면 새 성공 결과를 만들지 않는다.
5. **최대 인정 범위:** `restoreState=protected_body_tombstone_replay_only` 혹은 `no_protected_body_tombstones`와 `postReplayQuarantineRecheck` 상태만 산출한다. 둘 다 **전체 개인정보 재조정 성공, DR Ready, Owner 복원 인수, 판매/조회 활성화가 아니다.**

## 3. Privacy/DB Owner 인계 조건

| 조건 | 증거 소유자 | 재개 전에 필요한 사실 |
| --- | --- | --- |
| 기존 DB·백업 복원 출처 및 외부 삭제 원장 | 기존 DB/복원 Owner | 복원 백업 기준점, 백업 외부 최신 삭제/취소 원장, 누락·변조 없음 |
| 기존 개인정보/계정 삭제 처분 및 보존 | Privacy/DB Owner | 정확한 그래프·보존 정책 내 파생 기록 정리, 일반 서비스에 재조회/AI 재주입 없음 |
| S4 한정 복원 도구 | 현재 구현 | 격리에서 외부 tombstone 재처리, 롤백 사전·사후 검사가 모두 통과. 기록/키 식별자는 운영 보고에서 제외 |
| 일반 Reader·세연 검색·요약 재개 | 해당 기존 Owner | 별도 개인정보 복원 인수 및 기존 운영 런타임 게이트 충족. S4 기술 결과만으로 통과 금지 |
| 공식 Saju 출처·S5/S6 및 판매 | Saju/Privacy/Commerce/DB 기존 소유자 | 해당 트랙의 미완료 승인·출처·배포 인수. 이 문서는 승인하지 않음 |

`existingPrivacyOwnerAcceptancePending=true`, `restoreCompletionApproved=false`, `ordinaryRestoreConsumersEnabled=false`, `publicReaderServiceEnabled=false`는 기술 재처리가 끝나도 그대로 유지한다. 개인정보 #2318과 기존 DR 인수 조건은 독립 블로커이다.

**운영 행동 제한:** 이 구현은 개인정보 파생 원문을 조회·표시·정리·삭제하지 않으며, 외부업체에 문의하지 않고 자동 운영 재개·새 실행 권한·새 결제/LLM 호출·새 승인 절차를 도입하지 않는다.
