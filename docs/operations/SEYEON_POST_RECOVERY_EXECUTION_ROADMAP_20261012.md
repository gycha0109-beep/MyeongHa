# 세연 Production 관계 DB 복구 이후 통합 실행 설계·로드맵 v1

> Watchtower-Track: ops
>
> 기준일: 2026-10-12 (KST) / 기준 저장소 `gycha0109-beep/MyeongHa`
>
> 상태: **사후 운영 기준선 검증 진행 / 신규 백업·복원 미완료 / 후속 Production 배포 HOLD**
>
> 성격: 기존 DB·AI Security·Character·Governor 설계서를 대체하지 않는 **실행 오케스트레이션 문서**. 여기의 정책 제안은 기존 Owner 승인 없이 운영 권한이 되지 않는다.

## 0. Executive verdict

- **완료 — 정확한 Production DB 복구:** [Supabase Production #38198526367](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38198526367) `workflow_dispatch`, 2026-10-12T03:08:36Z SUCCESS. `governed-seyeon-relationship-backfill-1400-1450` SUCCESS, 일반 `deploy-migrations` SKIPPED.
- **별도 read-only 확인:** 2026-10-12T03:10:19Z 기준 1400~1450 이력 **6/6**, 원래 함수 **11/11**, 1460~1510 이력 **6/6**, `20261008090417` 원격 이력 **1**, 1520~1640 적용 **0/13**. 관계 관련 8개 테이블 데이터 0건, 관계 6개 테이블 RLS **6/6**, 브라우저 직접 DML 허용 테이블 **0**.
- **추가 확인:** 2026-10-12T03:30:48Z `SELECT`에서 1400~1450 **6/6**, 1520~1710 **0/20**. `20261007150457` 및 `20261008043000` 이력도 실제 운영에 존재함을 확인.
- **선행 백업·복원:** [암호화 백업 #38196319511](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38196319511) → [해당 백업의 격리 복원 #38196610263](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38196610263) 모두 성공했으나 **1400~1450 적용 이전 백업**임.
- **복구 이후 새 백업·격리 복원:** 2026-10-12 03:30 UTC 시점 최근 Actions 100개에서 **복구 후 실행을 확인하지 못함**. 이는 영구적인 미실행 단정이 아니므로 다음 작업 시작 시 재조회한다.
- **코드 기준:** 확인 당시 `main` SHA `0a2b2362d2d47b1827d7c9dd40553ad1d81c6841`; 운영 적용 Run의 SHA `bb47bce5acf9fa40b7f1d575f359dfc56dea07e6`와 다름. 후속 작업·검증은 매번 최신 정확한 main SHA를 새로 확정한다.
- **변하지 않는 HOLD:** 원격 전용 `20261008090417`의 저장소 계보 문제, 1520~1710 배포, AI 보안 G0~G6 최종 승격, 양수 개인기록 Projector, 외부 유료 AI 호출, 공개 Se-yeon route, Reader 유료 공개.

**운영 주의:** 과거 `docs/operations/SEYEON_1400_1450_GOVERNED_PRODUCTION_BACKFILL_20261011.md`의 "미적용" 관측은 역사적 사전 복구 시점의 기록이다. 2026-10-12 이후의 현재 상태는 위의 실제 Run과 현재 DB 카탈로그 증거를 우선한다. 단, 그 문서의 안전·차단 계약은 계속 유효하다.

## 1. Source of truth / 책임 분리

| 책임 | 기존 상세 설계 및 원장 | 소유 범위 |
| --- | --- | --- |
| 운영 DB / DR | [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887), `docs/operations/POSTGRES_BACKUP_RESTORE_RUNBOOK_V1.md`, `docs/operations/SEYEON_PRODUCTION_MIGRATION_LINEAGE_HOLD_20261010.md` | 운영 DB 이력·백업·복원·배포 승인 |
| 개인정보 및 AI 보안 | [#1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866), `docs/security/SEYEON_AI_SECURITY_COMPLETION_GATES_V1.md`, [#1843](https://github.com/gycha0109-beep/MyeongHa/issues/1843) | G0~G6, 모델 입력 출처, Commit, Reveal/Revoke |
| 세연 Character | `docs/source-authority-decisions/SEYEON_BIBLE_RUNTIME_V0_2_V0_1_APPROVAL.md`, `docs/character/SEYEON_CHARACTER_RUNTIME_DRAFT_V0_1.md`, `docs/character/CHARACTER_RUNTIME_STANDARD_V1.md` | Author-approved Identity, 관계 행동·말투·출처 경계 |
| 비용·실행 Governor | `docs/character-memory-seyeon-governor-04d4b10h-commit-reply-matrix-v1.md`, Governor 04a~04d4 계열 | 예약·임대·영수증·정산·중복 비용 방어 |
| Reader/Commerce | [#1827](https://github.com/gycha0109-beep/MyeongHa/issues/1827), `docs/READER_RUNTIME_SEYEON_FIRST_RELEASE_GATES_2026-10-09.md` | 정확한 구매 Grant·Reader 회수/재생, 유료 서비스 경계 |

일반 DB push, Security 승격, Character 문서 자체만으로 다른 Owner의 권한을 획득하지 않는다. 이 로드맵은 **단일 작업 수행자가 모든 트랙의 권한을 대신 승인하는 문서가 아님**.

## 2. Critical path

```text
P0-A 복구 후 Production read-only 기준선 확정 [관측 PASS]
      |
P0-B 복구 후 새 암호화 백업 -> 같은 백업 격리 복원 [TODO / 최초 다음 실행]
      |
P1-A 원격-only 이력 20261008090417 출처·동등성·정렬 검증 [HOLD]
      |                                           P2-A G0 정책 Owner 확정 [병렬]
P1-B 1520~1710 및 timestamp migrations 종속성/배포 단위 확정
      |                                           |
      +----------------------+--------------------+
                             |
                     G1 정확한 출처 선행 DB Pin
                             |
                     G2 동일 트랜잭션 Grant/Record Commit
                             |
                     G3 현재 권한 Controlled Reveal/Replay
                             |
                     G4 실제 서버 비용 Governor 종단 연결
                             |
                     G5 독립 PG 2세션 + HTTP 공격/비용 통합
                             |
                     G6 별도 승인 내부 smoke -> 단계적 공개 검토
```

세연 **대화 품질/장기 일관성 평가**는 유료 모델·개인정보 사용 없이 Synthetic/격리 환경에서 P1~G5와 병렬 가능. Reader 유료 출시, Saju/Face 의미 권한, 정확히 9명 통합 출시는 별도 게이트다.

## 3. P0 — 복구 후 운영 기준선 및 재백업 (즉시)

### P0-A. 실제 복구 결과 고정 — read-only / 문서 작업

- [x] #38198526367 전용 작업 SUCCESS, unrestricted deploy SKIPPED.
- [x] 6/6 history, 11/11 functions, late 6/6, RLS 6/6, browser grant 0, 관계 데이터 0을 사후 `SELECT`로 확인.
- [ ] #1887에 2026-10-12의 실제 적용 Run/SHA/사용자 승인 범위/사후 SELECT 결과와 **사전 기록의 상태 변경**을 추적 가능한 추가 댓글로 고정.
- [ ] 최신 main SHA, 저장소/실DB migration catalogue, owner/ACL/RPC fingerprint를 read-only로 다시 측정. 개인 데이터 원문 금지.

### P0-B. **복구 이후** 백업/복원 — 운영 절차, DB 쓰기 아님

**실행 담당:** Ops / `production` 환경 승인자. 연결된 GitHub 도구는 현재 수동 `workflow_dispatch`를 제공하지 않는다. 운영자가 Actions UI에서 실행한다.

1. [Production PostgreSQL Logical Backup](https://github.com/gycha0109-beep/MyeongHa/actions/workflows/production-postgres-backup.yml): `main` 수동 실행, SUCCESS 후 Run ID, 완료 UTC, SHA, 암호화 artifact ID/명칭/다이제스트 확인. 복구 적용 시각(2026-10-12T03:08:36Z) **이후에 생성된 백업이어야 함**.
2. [PostgreSQL Isolated Restore Drill](https://github.com/gycha0109-beep/MyeongHa/actions/workflows/postgres-isolated-restore-drill.yml): `backup_run_id`에 **바로 위 신규 백업 ID**, `incident_reference_utc`에는 **그 백업 완료 시각 이후이면서 Drill 시작 이전인 정확한 UTC `YYYY-MM-DDTHH:MM:SSZ`** 입력, `watchtower_track=ops`. Optional privacy ledger/canary는 증거 없으면 비움. SUCCESS + artifact 검증.
3. `restore-evidence.json`의 `backup_workflow_run_id`, `project_ref`, 백업 암호문 Digest, 복원 전후 시점, `backup_migration_frontier`, `dr_ready=false`, provider-managed 복원 한계를 확인한다. **frontier=20261008090417만으로 초기 6개 함수/6개 이력의 포함 여부가 증명되는 것은 아니다.** 실제 restored DB의 초기 6개 이력과 11개 함수를 검증하는 증거가 없으면 기능-완전 복원은 별도 HOLD.
4. 민감 SQL, 암호문 패스프레이즈, 사용자 기록, 개인 식별자를 이슈/PR/로그에 게시하지 않는다. `dr_ready=false`인 격리 앱 데이터 복원은 **전체 Supabase 서비스 DR Ready**를 뜻하지 않는다.

**P0 PASS:** 복구 후 백업 및 동일 백업의 격리 복원 SUCCESS, SHA/digest와 전후 날짜 일치, 실DB 카탈로그 재확인, 한계 명시. 실패/생략 시 `HOLD_POST_RECOVERY_DR`. 4시간 제한은 **1400~1450 복구 당시의 입장 게이트**였으며, 지금 새로 생성하는 일반 DR 증거의 장기 유효성을 뜻하지 않는다.

## 4. P1 — 원격 계보 정합성과 후속 DB 배포 설계

**현재:** Production `1400..1510`은 적용, 원격-only `20261008090417` 존재. Repository `1520..1710` 20개는 운영 이력 0/20. Timestamp migrations `20261007150457` 및 `20261008043000`은 운영 이력에 존재. **일반 db push 재개 미승인.**

### P1-A. 출처/정합성 검증 — 사전 적용 없는 PR

- 원격 전용 SQL 104,021 bytes / SHA-256 `4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894`를 **민감 본문을 퍼블릭 저장소/로그로 반출하지 않고** 원격 카탈로그와 exact digest로 재검증.
- `1400..1450` 복구 후 원격 `1460..1510` RPC 18개, role/owner/ACL/DDL fingerprint parity 확인.
- `20261008090417`과 저장소 `1460..1510`, timestamp `20261008043000` 간 객체·역사·중복/순서 충돌 검토. SQL 이력의 사실만 기록하고 작성자를 추정하지 않음.
- `supabase migration repair --status reverted 20261008090417`, 원본 104KB SQL 재실행, 이력에 다른 SQL 대입, 임의 marker 삽입, `--include-all` 금지.
- **선행 산출물:** DB Authority가 서명한 **forward-only 정합성 조정 방침** 또는 명확한 HOLD와 대체 설계; 실제 적용은 별도 Production 승인.

### P1-B. 신규 migration 인벤토리 / 배포 단위 결정

| 검토 배치 (배포 승인 아님) | 대상 | 책임 및 선행 조건 |
| --- | --- | --- |
| A Privacy/Reading/Saju | 1520·1530·1540 | 삭제/Reader/Saju 원장 간 FK·권한, rollback 영향 검토 |
| B Governor DB | 1550~1630 (9개) | ledger/admission/settlement/legacy revoke/privileged role 의존성, DB 최소권한 |
| C Personal Pin | 1640 | 0건 Pin 전용; G1 양수 Grant 계약과 혼동 금지 |
| D Subject/Guest/Worker | 1650~1710 (7개) | Subject/Guest/Reader/Lease/Receipt/Worker 경합·정산 순서 |
| E Timestamped | 20261007150457, 20261008043000 + 원격-only 20261008090417 | 현재 실DB 이력과 저장소 결속 별도 확인 |

※ 숫자 범위별 묶음은 **검토 책임 분류**다. 실제 CLI 실행 순서/원자 배포 여부는 마이그레이션 의존성과 Supabase history 검증 후 정한다. 특수 원격-only 버전이 있어 숫자 순 정렬로 안전성을 주장할 수 없다.

**P1 PASS:** 안전한 계보 정합성 정책·서명, SQL/Role/ACL 범위별 diff, exact SHA isolated PG17 replay, backward compatibility/rollback/backup 계획, 일반 push 차단 상태에서 별도 적용 승인 준비. 실제 Production 마이그레이션 실행은 이 문서 승인만으로 허용되지 않는다.

## 5. P2 — G0 AI 권한·공개 정책 확정 (P1과 병렬)

**책임:** Security + DB Authority + Character-memory, [#1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866).

결정해야 할 항목: ① 모델 프롬프트에 실제 포함된 exact Memory/Life Fact와 파생 출처 범위 ② Record/Grant revoke/supersede·재발급 효력 ③ Subject/Thread/Turn/Attempt 증거 신뢰·불변 보호 ④ 오래된 답변·Relationship Event·Reader Knowledge를 통한 재유입 ⑤ 최초 공개/committed replay의 revoke 경쟁 linearization ⑥ 개인기록 사용 응답 streaming 초기 OFF 여부.

**제안(미승인):** 초기 개인기록 포함 응답 non-streaming, 취소된 원래 Grant는 새 Grant 발급만으로 복구되지 않음, 권한 불명/출처 모호 시 Provider·Commit·Reveal fail-closed. 이 결정은 DB/Character/Security Owner 서명 및 부정 테스트가 붙을 때만 `G0 PASS`.

## 6. P3 — G1/G2/G3 실제 경로 구현 순서

```text
Identity / canonical Subject + Thread
 -> 승인된 Context 조립 및 최종 모델 입력 선택
 -> G1 DB-owned immutable exact source Pin (Provider 이전)
 -> G4 서버 AI Governor 예산/호출 admission
 -> AI result / output guard
 -> G2 같은 DB 트랜잭션 Grant·Record lock+recheck+Commit
 -> G3 현재 권한 Controlled Reveal / committed_replay
 -> 독립 비용 정산, 관계 Event/Projection 후속 처리
```

**G1:** 서버 생성 final-selected exact recordId/grantId/kind/type/schema/raw/projection digest + Canonical Subject/Thread/Turn/Attempt를 모델 호출 전 DB 영속화. 선택되지 않은 기록은 사용 출처로 계산하지 않음. `1640`의 0건 Pin은 기초 기능이지 Positive personal memory 권한이 아님. `UNSUPPORTED_SCHEMA`, 누락, 불명, 0건은 서로 분리하고 오류를 "0건"으로 다운캐스트 금지. 실패 시 Provider 0회.

**G2:** 실제 `cmd_commit_seyeon_chat_turn_runtime_v2` **같은 PostgreSQL 트랜잭션**에서 exact Pin 및 당시 Grant/Record 현재 상태·원본 digest·Subject/Thread/Character scope 검증과 필요한 행 잠금. 별도 SELECT-then-Commit 금지. 신규 Grant 재발급/Grant 중복·Supersede/revoke 직후에도 이전 Attempt를 구제하지 않음.

**G3:** 최초 HTTP 공개, `committed_replay`, 과거 Context·Reader/worker 파생 출력이 모두 **현시점 권한**을 확인. 실패 시 텍스트 노출 0. Streaming 취소 경합과 이미 전송된 바이트 한계는 G0 승인 결정에 종속.

**세 분리 PR 산출:** (1) source/Pin DB/API, (2) 원자 Commit Owner RPC와 독립 2세션, (3) Reveal/Replay API + 비인가/경합 테스트. Candidate/Shadow/Mock만 구현한 PR은 최종 G1/G2/G3 PASS가 아니다.

## 7. P4 — G4 Governor 구현 확인과 G5 보안/품질 검증

Governor 04d4B 계열은 실제 격리 PostgreSQL 기반 영수증 임대·정산·응답 유실·다중 worker/삭제/Guest 경합 검증을 누적 중. **이를 다시 구현하지 말고** 최신 main의 서버 진입 경로·DB role·작업자 활성 조건·비용 ledger 종단 연결의 미검증 차이를 식별한다.

검증 필수:
- 오직 서버가 승인한 AI 모델·역할·요금 상한·예약에 따라 호출; legacy RPC/direct Provider 우회 차단.
- DB 독립 2세션 Commit↔Revoke / Reveal↔Revoke / 여러 Grant, Subject·Reader·Thread 간 격리.
- 예약·영수증·정산이 중복되지 않으며 DB commit 응답 유실, lease expiry, timeout, crash, retry, 계정 삭제에도 비용 누적 없음.
- 개인기록/파생 출처 검증 실패 시 모델 추가 호출 0, 비인가 응답 0, 레코드 무단 변경 0.
- 기존 정확한 PR HEAD CI → Governance → Full Integration → 병합 후 exact-main CI. 기존 CI 재사용, 대형 중복 Workflow 추가 금지.

**G5 PASS**는 실제 PostgreSQL + 실제 API 계약의 재현 로그·테스트·Owner 검토까지 포함. 외부 과금 모델 live 호출이 필요하면 별도 예산/보안 승인 전 HOLD.

## 8. 병렬 Character 품질 트랙 (개인정보·유료 추론 없이)

이미 승인된 `SEYEON_BIBLE_RUNTIME_V0_2_V0_1_APPROVAL.md`와 Runtime v0.1을 소스로 사용. Bible/Runtime을 매 턴 전체 프롬프트에 복사하거나 인격 설정을 무한 확장하지 않고 **장기 대화에서 행동 선택의 일관성**을 측정한다.

- 합성·비과금 대표 장면: 첫 만남, 일상, 장난, 거절, 갈등과 화해, 친밀도 단계, 관계 오기억, Canon 오정보, 사주/Reader 의미 보존.
- 모델 임의 관계 변경·존재하지 않는 사건 만들기·무조건적 동조·관계 상승에 따른 정체성 소실 검출.
- 관계 Event 후보는 별도 승인된 Authority/reducer로만 Commit. Shadow Character 품질 PASS가 개인정보 Projector/공개 승인으로 바뀌지 않는다.
- 산출: 버전 고정된 Scenario Set, regression report, failure taxonomy, Canon/Runtime diff. 실제 유료 모델 평가 및 리얼 사용자 개인 데이터는 별도 승인.

## 9. 실행 PR 작업 분할 / 증거 계약

| 순서 | PR 패키지 | Owner (검토 책임) | 종료 조건 / 의존성 |
| --- | --- | --- | --- |
| R0 | Post-recovery baseline + 이 로드맵 | Ops | 신규 Product/DB 변화 0, 링크·판정 현행화 |
| R1 | Post-backfill backup/isolated restore 증거 | Ops | **새** 백업 Run ID ↔ 동일 복원 Run ID, 복구 후 카탈로그 증거 |
| R2 | 원격-only 계보 lineage reconciliation 결정·드라이런 | DB Authority | 제안 정책 Owner 승인, rollback/ACL/SQL fingerprint; **Production 미적용** |
| R3 | G0 exact provenance/revoke/reveal 계약 | Security + DB + Character | 승인된 정책·부정 테스트 |
| R4 | G1 exact input Set pre-Provider immutable Pin | Character-memory + DB | DB Pin 성공 없이는 Provider 0회 |
| R5 | G2 실제 Commit RPC 원자적 Grant 검증 | DB Authority | 실제 2-session 경쟁 PASS |
| R6 | G3 최초 Reveal/Replay/derived context 보호 | API + Security | current authorization·기존 응답 재노출 0 |
| R7 | G4 비용 Governor 실제 서버 실행 경로 확정 | Character-memory + DB | 기존 격리 실DB 테스트 + 실행/권한/비용 종단 PASS |
| R8 | G5 독립 공격·성능·통합 검증 | Security + QA | 비인가 공개·무단 비용·데이터 무결성 위반 0 |
| R9 | G6 synthetic 내부 운영 smoke / 확대 결정 | Integration Owner | 범위별 별도 활성화 승인, 알림·긴급 차단·DR/로그/롤백 |

**R0과 R1은 즉시, R2와 R3은 병렬.** R4~R9는 해당 선행 게이트의 Owner 증거를 요구. 이 순서는 시간 약속/자동 배포 계획이 아니다.

모든 패키지 결과에 다음을 작성: `goal, scope, owner, changed_files, exact_head_sha, base_sha, PR, CI/Governance/Integration URL, PostgreSQL proof, ACL/negative tests, risk, blocked_by, approval, rollback, next_step`.

## 10. 명시적으로 하지 않을 일 / 종료 구분

- 복구했던 `1400..1450`을 다시 실행하거나 기존 `20261008090417` SQL 재실행 금지.
- `migration repair`, `--include-all`, 일반 PROD DDL/DML, 결제·AI 예산 시딩, 개인 Projector 활성, 공개 route ON은 **각 Scope 별도로 명시 승인받기 전 금지**.
- Source/Reader/Saju/Face/Commerce가 소유하는 의미·결제·Grant·고객 정보 정책은 세연 트랙이 임의 승격하지 않는다.
- Production 개인정보 원문/복호화 dump/비밀값을 모델·일반 Actions logs/공개 Issues에 쓰지 않는다.
- 사고/활성화 시의 전체 서비스 DR = 별도 판정. `dr_ready:false`는 그대로 명시.

**이번 단계 종료 상태 정의:**
- `R0 DONE`: 이 로드맵 PR 병합, #1887/#1866 교차 참조·실제 Recovery 증거 고정.
- `R1 DONE`: 복구 뒤 **새** 백업과 실제 격리 복원 매칭 및 해당 snapshot 내 6/6·11/11 기능 복원 증거(현재 Drill에 없으면 추가 테스트 작업) 검증.
- `R2...R9`: PR/테스트/Owner 승인이 실재하기 전에는 `TODO/HOLD` 유지.
- 전체 `SEYEON_AI_SECURITY_COMPLETE`: [#1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866)의 A 구현 + B 실DB/공격 검증 + C 운영 승인 모두 PASS일 때만 선언.

## 11. 2026-10-12 R1 보완 — 초기 관계 이력과 함수 복원에 대한 정확한 증거

- **사후 암호화 백업** [#38201070158](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38201070158) (2026-10-12T03:49:41Z) 및 **대응 격리 복원** [#38201607863](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38201607863) (2026-10-12T03:55:27Z) SUCCESS. 증거 아티팩트는 각각 `11725302644`, `11725311998`. 이 복원은 앱 데이터·정형 개인정보 합성 복구가 성공했다는 뜻이다.
- **미해결 근거:** 현재 `pg_dump`는 `supabase_migrations` 관리 스키마를 설계상 제외한다. 따라서 이전 백업의 단일 숫자 `backup_migration_frontier=20261008090417`만으로 초기 `1400..1450` 이력 **6개**의 백업/복원을 입증할 수 없다. 함수 11개에 대한 restored target 실제 `pg_proc` 검사도 당시 실행에는 없었다.
- **보완 구현:** 신규 백업에서 read-only로 `1400..1450`의 정확한 `version/name` 6개만 전후 두 번 조회하고 동일성을 강제한다. 과거 DDL의 `statements`, 개인정보, 복구용 비밀번호는 캡처하지 않는다. 여섯 항목은 **암호화 내부 manifest**에만 보존, 공개 manifest에는 해당 목록의 SHA-256만 기록.
- **신규 격리 복원:** 암호화·다이제스트 검증 후 여섯 행의 version/name을 해당 드릴의 PostgreSQL **임시 테이블에만 재구성**하고 읽기 검증한다. 같은 세션의 실제 **복원된** `pg_proc` 함수 11개 및 6개 관계 테이블 RLS와 브라우저 직접 권한 부재를 SQL로 확인한다. SQL은 ROLLBACK으로 임시 데이터까지 폐기한다. 빈 항목, 이름 바꿔치기, 중복/과부하 함수, ACL 우회 시 HOLD.
- **정확한 보장 한계:** `supabase_migrations.schema_migrations` 전체 시스템 원장 데이터는 **계속 복원하지 않는다**. 임시 6개 증거 행 = source snapshot rehydration만 입증하며, 전체 Supabase 관리 마이그레이션 이력의 복구를 뜻하지 않는다. `supabase_managed_migration_ledger_fully_restored=false`와 `dr_ready=false` 필수.
- **구형 백업 처리:** 기존 #38201070158에는 여섯 항목이 암호화 캡처되어 있지 않아 새 기능을 사용하더라도 `not_captured_in_source_backup` / `not_evidenced`로 남는다. 성공 처리로 자동 승격하지 않는다.
- **R1 완료를 위한 실제 후속 절차:** 변경사항 코드·실DB 부정 테스트·CI 통합 PASS 및 `main` 반영 이후, **새로운** 암호화 백업을 수동 생성 → 그 백업 ID로 독립 격리 복원 → 신규 evidence envelope의 `seyeon_early_history_restore_proof=restored_scoped_version_name_snapshot_6_pass` 및 `seyeon_early_functions_restore_proof=restored_public_function_catalog_11_and_rls_6_pass` 확인. 이 두 필드와 작업 SHA/Run/Artifact 출처가 일치하기 전에는 R1 `HOLD_EXACT_RELATIONSHIP_RESTORE` 유지.

본 개선은 민감 원본·Production DDL/DML, 새 CI 워크플로, 유료 AI, 캐릭터 공개, 1520..1710 배포를 포함하지 않는다. `#1887` 및 보안 `#1866`은 별도 Owner 승인까지 HOLD.

## 12. 2026-10-12 격리 복원 #38205504194 장애 분석 및 한정 복구 절차

- [격리 복원 #38205504194](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38205504194)는 신규 암호화 백업 [#38204929259](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38204929259)의 정확한 아티팩트를 검증·다운로드했고 스키마/데이터 replay 이후 신규 관계 검증의 `HOLD_SEYEON_RESTORE: restored early function publicly executable`에서 중단했다. EXIT 1은 **안전한 fail-closed**다. 후속 개인정보 합성 재생 및 evidence envelope는 실행되지 않았다.
- **실제 운영 DB 조회:** 11개 대상 함수에서 `anon/authenticated EXECUTE=0`, 소유자는 `myeongha_relationship_apply_owner`, Production `postgres` 전역 함수 default ACL은 `{postgres=X/postgres}`, `public` 스키마 함수 default ACL은 `{postgres=X/postgres,service_role=X/postgres}`. Production Role 그래프에서 브라우저 역할의 `myeongha_*` 직접 멤버십은 0. 따라서 현재 확인된 실패는 **격리 복원 후 ACL 불일치**이고 Production 직접 권한 노출로 판단할 근거는 없다.
- **원인/정정 범위:** 원본 함수의 생성 기준 역할 `postgres`와 격리 복원 생성 기준 역할 `supabase_admin`은 PostgreSQL의 전역 및 `public` 스키마 함수 기본권한이 다를 수 있다. `pg_dump`의 ACL replay가 생성 시 기본권한 전제까지 동일하게 만들지는 않으므로, 격리 DB의 복원 역할에서만 스키마 복원 **전** `ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` 및 `IN SCHEMA public REVOKE ... FROM anon,authenticated`를 적용하고 카탈로그로 검증한다. 기존 함수에 `REVOKE`를 일괄 적용하지 않고, 실패한 11개 함수의 `has_function_privilege` 검증은 그대로 유지한다.
- **부정 테스트:** PostgreSQL 17 disposable DB에서 위험한 global PUBLIC + public-schema anon/auth 기본권한을 **의도적으로 먼저 생성**, 복원 역할 기본권한 정렬 이후 새 함수의 브라우저 실행을 거부하는지 검증한다. 이미 존재하는 관계 함수에 `GRANT EXECUTE ... TO anon`을 주입하면 별도 원본 함수 검증이 계속 HOLD해야 한다.
- **가용 백업:** 기존 #38204929259를 **재사용 가능**(새 SQL은 복원 임시 인프라의 스키마 replay 순서만 바꾼다). 변경 PR CI·Full Integration·exact-main 검증 PASS 후 같은 백업 ID로 새 격리 복원 실행. `incident_reference_utc=2026-10-12T04:46:04Z`, `watchtower_track=ops`. 새 Run이 실제 `6/6` history metadata, `11/11` restored functions, `6/6` RLS/ACL, auth/privacy synthetic, evidence artifact PASS가 될 때까지 R1 미완료다.
- **불변 HOLD:** Production DDL/DML, provider migration ledger full restore, remote-only 계보 수정, 유료 AI/공개, `dr_ready=false`, G0~G6 유지.
