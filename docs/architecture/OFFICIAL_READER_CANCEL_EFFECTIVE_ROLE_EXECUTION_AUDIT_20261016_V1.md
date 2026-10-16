# D3e28 — Official Reader 취소: 실제 실행 역할·함수 EXECUTE·트리거 메타데이터 감사

> 2026-10-16 KST · Commerce / Official Reader · **Draft / HOLD / NO MERGE / NO LIVE CUTOVER**
>
> 상위 근거: `OFFICIAL_READER_CANCEL_PRODUCTION_CUTOVER_DETAILED_DESIGN_20261013_V1.md` §13 step ①, §14 T17–T19 및 `OFFICIAL_READER_CANCEL_ALTERNATE_WRITE_SURFACE_20261015_V1.md` (D3e27).
> 부모: [#2137](https://github.com/gycha0109-beep/MyeongHa/pull/2137) HEAD `241e48d649e98fccdd60215da01c5ca0b995bb4b`.
> **이 문서는 고객·결제·이용권 행 없이 운영 PostgreSQL 17.6.1의 pg_catalog를 읽기 전용으로 조사한 시점 증거입니다.** 설치된 서비스의 연결 비밀, Data API 공개 설정, 실제 취소 실행은 검증하지 않았습니다.

## 1. 이번에 확장한 범위

D3e23은 7개 Commerce/Entitlement 보호 테이블의 `service_role` 직접 DML과 63건의 SQLSTATE 42501 부정 검사를 다뤘고, D3e27은 테이블명을 **직접** 참조하는 SECURITY DEFINER 함수 및 수정 가능 뷰 후보를 조사했습니다. 이 작업은 그 검사를 다시 만들지 않고 다음 누락을 좁힙니다.

- DB LOGIN에서 `SET LOCAL ROLE` 대상으로 이어지는 회원권 및 `USAGE` 상속을 별도로 목록화합니다. `MEMBER`는 PostgreSQL 버전 간 보수적 경로 후보이며 실 배포 자격의 증거가 아닙니다.
- 직접 테이블 DML이 없는 앱 LOGIN이 **실행 역할로 전환한 이후** INSERT/UPDATE/DELETE를 새로 얻지 않는지 검사합니다.
- 기존 구매·결제 완료·이용권 복구 및 비공개 취소 핵심 함수의 존재 여부, SECURITY DEFINER, owner, 각 역할의 **실효 EXECUTE**를 같이 조사합니다.
- 보호된 7개 테이블의 사용자 정의 트리거 → 호출 함수 OID 연결을 보존합니다. 함수 본문 실행 의미나 간접 호출의 무해함을 증명하지 않습니다.

코드: `scripts/security/official_reader_cancel_effective_role_execution_readonly.sql`. 전체 SQL은 읽기 전용 단일 `SELECT`이며 결과에 `cutover_authorized=false`를 고정합니다.

## 2. 실측 (2026-10-16 03:00:33 UTC)

대상: Supabase 프로젝트 `cnsfpcdiyofqvhpcegfc` / PostgreSQL 17.6.1.

| 관측 | 실제 결과 | 판정 |
| --- | --- | --- |
| 보호 테이블 | 7/7 존재 | baseline 확인 |
| `service_role` 직접 DML 가능한 보호 테이블 | **7/7** | 운영 REVOKE 전까지 **HOLD** |
| `myeongha_runtime`, `myeongha_worker_runtime`, `myeongha_api_executor`, `myeongha_commerce_internal_executor`의 보호 테이블 직접 DML | **0건** | 해당 좁은 권한 범위만 PASS |
| 상기 앱 역할에서 `postgres` 또는 `service_role`로 향하는 회원권 | **0건** | 카탈로그 후보 범위만 PASS |
| `myeongha_runtime` 회원권 | `myeongha_api_executor`, `myeongha_commerce_internal_executor` | 기존 코드의 `SET LOCAL ROLE` 경로와 일치 |
| `myeongha_worker_runtime`의 상기 두 실행 역할 회원권 | 발견 안 됨 | Worker 일반 역할 분리 관측 |
| `authenticator` → `service_role` 회원권 | 존재; 별도 PG17 읽기 전용 점검에서 SET 가능 확인 | Supabase PostgREST 역할 전환의 정상 후보. API 키 접근/노출 입증 아님 |
| 이름으로 추적한 함수 | 12종 중 **9종 존재**, 비공개 취소 3종 미존재 | 운영 마이그레이션 미적용; HOLD |
| 7개 테이블 사용자 정의 트리거 | **13개**, 모두 SECURITY INVOKER | 트리거 연결 식별. 안전성 판정 아님 |

`service_role`은 BYPASSRLS이므로 RLS만으로 7개 테이블의 직접 DML이 차단되지 않습니다. `postgres`는 LOGIN/BYPASSRLS/CREATEROLE을 가진 별도 관리자 경계입니다. 이 감사로 관리자의 실제 사용 이력 또는 데이터 접근을 증명하지 못합니다.

### 추적한 실효 함수 실행권 (관리자 owner 자체의 권한 제외)

| 함수 | 실행 가능한 관측 역할 | 함수 성격 |
| --- | --- | --- |
| `cmd_create_purchase_intent_v2`, `v3` | `myeongha_api_executor` | SECURITY DEFINER |
| `cmd_create_payment_attempt_v1` | `myeongha_api_executor` | SECURITY DEFINER |
| `cmd_persist_verified_payment_evidence_v1` | `myeongha_commerce_internal_executor` | SECURITY DEFINER |
| `cmd_restore_entitlements_runtime_v1` | `myeongha_api_executor` | SECURITY DEFINER, 별도 restore owner |
| `internal_apply_entitlement_effect_v1`, `internal_apply_verified_receipt_capability_effects_v1`, `cmd_bind_standard_reading_access_v2`, `internal_finalize_account_deletion_db_v1` | 조사한 비관리자 7개 역할에서는 EXECUTE 없음 | 호출이 불가능하다는 전역 증거가 아님 |
| `internal_apply_official_reader_verified_cancel_batch_v1`, `internal_apply_reviewed_official_reader_full_cancel_private_v1`, `internal_execute_official_reader_verified_cancel_v2` | 운영 DB에 없음 | 로컬 SQL 마이그레이션/테스트만으로 운영 실행 준비를 주장할 수 없음 |

위 목록은 의도적으로 정한 함수들만의 **bounded catalog snapshot**입니다. 모든 `pg_proc` 호출 그래프나 dynamic SQL 실행·관리자 직접 DML 경로를 열거했다는 뜻이 아닙니다.

## 3. 코드 호출 경계와 미확인 영역

| 구간 | 소스에서 확인 가능한 진입·역할 | 미확인 / 경고 |
| --- | --- | --- |
| 일반 API / 구매 Intent / 결제 Attempt | `node-postgres-subject-pool.ts` 로그인 검사, `postgres-subject-execution.ts`의 실행 컨텍스트, `postgres-purchase-intent-create-v3.ts`, `postgres-payment-attempt-create.ts` | 실제 배포 연결 사용자 및 pool/client 외부 호출 전수는 별도 |
| 결제 완료 / 영수증·Grant | `commerce-provider-payment-completion-orchestration.ts` → `postgres-commerce-internal-execution.ts` → `SET LOCAL ROLE myeongha_commerce_internal_executor` → `cmd_persist_verified_payment_evidence_v1` | 운영 런타임에서 실제 해당 LOGIN 사용하는지 미확인; 범용 결제 역할을 취소 실행자로 재사용 금지 |
| 복구 | `entitlement-restore-command.ts` → `cmd_restore_entitlements_runtime_v1` | Grant/provider refund restore 아닌 projection 재계산; 권한 무차별 회수 금지 |
| 계정 삭제 | `node-postgres-account-deletion-worker-pool.ts`의 별도 principal 검사·worker 역할 | 다른 worker/DBA 수동 운영 접속의 실제 설정 미확인 |
| 승인된 유료 취소 | 1850/1880/1950 후보의 테스트-only 경로 | 운영 함수 3종 미존재, 실신원 승인·권한 게이트 미연결. 실행 절대 금지 |
| 1080/1090/1220 구형 Writer | 기존 `OFFICIAL_READER_WRITER_SURFACE_AUDIT_20261014_V1.md` 및 정적 호출 그래프 검사 | 간접 함수/trigger 경로, owner 직접 SQL과 세션 경합 완전 입증 아님 |

특히 `authenticator`의 `service_role` 회원권만으로 public REST에 테이블이 노출됐다거나 유출된 키가 있다는 결론을 내릴 수 없습니다. Data API 설정, 실제 고객 접속 권한, 키 보관과 운영 관리자 세션은 각 소유자의 별도 승인·증거가 필요합니다.

## 4. 신규 격리 시험

`test/db/official_reader_d3e28_effective_role_acl_guard.sh`는 기존 D3e23의 **세 폐기형 로컬 DB에서만** D3e27 이후 실행됩니다. 필수 가드: `CI=true`, `PGHOST=localhost`, `PGUSER=postgres`, 정확한 세 DB 이름.

1. 이전 시험에서 `service_role` 직접 DML이 REVOKE된 baseline에 대해, 앱 로그인/실행 역할 4종의 보호 테이블 DML이 0이고 elevated role 회원권도 0인지 확인.
2. **테스트 DB에서만** `GRANT INSERT ON public.entitlement_events TO myeongha_api_executor` 주입. 로그인 자체에 직접 INSERT가 없어도 전환 대상 실행 역할에 위험 권한이 생기는 경우를 포착해야 함.
3. `REVOKE`로 모의 권한 제거. `observed_at`만 제외한 전체 감사 JSON 정렬 snapshot이 정확히 같아야 함.
4. 기존 Purchase / reviewed full cancel / 2-event atomic cancel 테스트 본문은 유지. D3e23/D3e27의 거부·정상 기능 시험도 함께 유지.

**검증 상태:** read-only SQL 운영 PostgreSQL 17 실행 PASS. 새 격리 부정 시험 및 PostgreSQL 15/17 CI 결과는 **정확한 신규 HEAD가 PASS하기 전까지 미확인**.

## 5. 다음 안전한 단계

- Dynamic SQL/간접 함수·트리거 체인과 `SECURITY DEFINER` search_path/owner 권한 감사 범위를 실제 DB OID 그래프로 보강.
- 전체 API/Worker/관리자 작업에서 로그인 `session_user`, effective role, `SET ROLE`, 배포 실행 이미지·수동 보정 경로의 소유자 확인. 비밀값이나 고객 행을 열람하지 않는 독립 증거 사용.
- 폐기형 DB에서 role privilege 원복, 신규 Grant/취소 경합, 중복 취소/롤백과 정상 구매 회귀를 연결.
- DB Security / Commerce / Legal / Privacy / Release owner의 서명 승인 전까지 7개 테이블 운영 ACL 변경, 관리자 role 발급, 실제 PortOne 취소·유료 기능 활성화는 **HOLD**.

**최종 판정: D3e28의 감사 보강은 오프라인 Draft 후보이며, 운영 전환의 승인·직접 함수 경로 완전성·고객 데이터 안전을 입증하지 않습니다.**
