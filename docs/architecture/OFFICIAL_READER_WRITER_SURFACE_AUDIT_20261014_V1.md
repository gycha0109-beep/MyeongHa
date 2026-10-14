# 공식 리더 이용권 Writer·관리자 우회 경로 1차 전수 조사 v1

> 기준일: 2026-10-14. 기준 부모 문서: [실제 취소·승인·운영 전환 상세 설계](./OFFICIAL_READER_CANCEL_PRODUCTION_CUTOVER_DETAILED_DESIGN_20261013_V1.md).
> 코드 기준: #2050 최종 HEAD `0dacf78c87fb90eeeed6f257b3b17ae20a3bd5be` 위 비공개 작업.
> 범위: 마이그레이션에 선언된 주요 권한 변경 함수 + 애플리케이션 소스의 **직접 식별 가능한 호출** + 실제 PostgreSQL 실행 역할.
> **이 조사는 실제 운영 DB의 모든 동적 호출·DB 관리자 권한을 입증하지 않는다. LIVE 결제·환불·이용권 회수 OFF.**

## 1. 조사 결과 요약

- 이전 `1890`은 위험 함수 7개를 일반 사용자·API·결제 서버·채팅 실행 역할에서 차단했다. 새 조사에서 `1830`의 **두 번째 관리자 권한 취소 wrapper `internal_execute_official_reader_verified_cancel_v2`**가 해당 7개 목록에서 누락된 사실을 확인했다. `1830` 자체에서 이미 PUBLIC/운영 역할의 EXECUTE를 회수하고 있었으므로, **이번 발견이 곧 운영 권한 노출 증거는 아니다**.
- `1090` 최초 Verified Receipt→Grant 발급과 `1220` 공식 Reading 결속은 실제 다른 상품 기능에서 공유하는 원본이다. 이들을 무작정 DROP/REVOKE하지 않는다. 회수 시의 잠금 규칙 미준수 가능성은 여전히 통합 보류 사유이다.
- `0964`의 `cmd_restore_entitlements_runtime_v1`은 구매 Grant를 다시 살리는 Provider refund restore가 아니라, 현 상태로부터 유효 이용권 projection을 재계산하는 명령이다. 일반 복구 접근 경로를 보존한다.
- 실 API의 `portone-v2-webhook-payment-completion.ts` 및 `commerce-provider-payment-completion-orchestration.ts`는 결제 완료에 중심을 둔다. 실제 취소 사건에서 승인형 회수 `1880`로 넘어가는 운영 작업자는 아직 없다.

## 2. 실제 코드 호출 관계

| 원본 함수 / 경로 | 직접 확인한 호출자 | 잠금·실행 관점 | 운영 전환 상태 |
| --- | --- | --- | --- |
| `1080 internal_apply_entitlement_effect_v1` | `1090`, `1770`, `1830`, `1850` | 원본 Provider/Receipt/Grant 행 갱신·불변 Event/Outbox. L0/L1 선행 강제 없음 | 1890 운영 역할 직접 EXECUTE 차단. 구 내부 함수는 존속 |
| `1090 internal_apply_verified_receipt_capability_effects_v1` | `1760`, `1790`, `1820` | 원본 Receipt 발급과 1080 호출. 기존 직접 경로에 L0/L1 미강제 | 신규 함수·권한 전면 전환 보류 |
| `1220 cmd_bind_standard_reading_access_v2` | `1760`, `1790`, `1820` | 원본 Reading/Reader 결속; 별도 Product 선행 lock 계약 필요 | 정상 업무 영향 때문에 전면 DENY 금지 |
| `1770 internal_apply_official_reader_provider_revoke_locked_v1` | `1780` | 과거 L1 우선 방식, 미결속 최초 구매 지원 불충분 | 기존 1890 직접 실행 차단 |
| `1830 internal_apply_official_reader_verified_cancel_scope_v2` | 같은 1830의 두 번째 관리자 bridge | 단일 취소 시 L0/L1 선행 후 1080 | 기존 1890 직접 실행 차단 |
| `1830 internal_execute_official_reader_verified_cancel_v2` | 명시적 API 운영 호출은 확인되지 않음 | **SECURITY DEFINER**, 과거 비공개 실행 bridge | 신규 1900에서 중복 방어 및 실제 운영 역할 호출 거부 시험 |
| `1850 internal_apply_official_reader_verified_cancel_batch_v1` | `1880` | 검증된 사건·영수증·권한 전체 범위에 Product L0→Reader L1, 최종 1080 | 비공개. 실제 취소·승인 직접 수집 경로 미연결 |
| `1880 internal_apply_reviewed_official_reader_full_cancel_private_v1` | 실제 운영 실행 호출자 없음 | 별도 승인 지문·정본 구매 재검증 후 1850, 1개 Grant만 | 비공개. 승인 진위 발행자 없음 |
| `1760/1790/1820`의 Receipt 발급·결속 wrapper | 서로 직접 원본 1090/1220 호출 | 서로 다른 과거 잠금 진입과 신형 D1 lock 공존 | 새 1900으로 앱 실행 계정 직접 접근 추가 차단. 구 코드 미삭제 |
| 앱 Commerce 트랜잭션 경로 | `postgres-commerce-internal-execution.ts`의 결제 전용 `SET LOCAL ROLE` | 현재 범용 결제 완료 역할 | **승인형 취소 실행자 역할로 재사용 금지** |
| `0964` Member entitlement restore | `entitlement-restore-command.ts` binding | 원본 Grant가 아니라 현재 projection 재계산 | 일반 복구 EXECUTE 보존 |

이 표의 '호출자 없음'은 **보이는 소스·인식 가능한 정적 이름 기준**이다. 동적 SQL, 운영 관리자 수동 SQL, 원격 작업자, 배포된 과거 이미지 또는 연결 앱까지 없음을 의미하지 않는다.

## 3. 이번 차단 보완

- 신규 `1900_official_reader_private_writer_surface_closure_v1.sql`는 `1890`이 아직 명시적으로 포괄하지 않은 **8개 비공개 발급·결속·회수 함수**를 함수 OID로 조회하고, 예상치 못한 동일 이름의 오버로드가 존재하면 실패한다.
- PUBLIC의 기본 함수 실행권부터 회수한 뒤 anon, authenticated, service_role, `myeongha_api_executor`, `myeongha_commerce_internal_executor`, `myeongha_seyeon_chat_runtime_owner`의 직접·상속 EXECUTE를 검사한다.
- 특히 관리자 권한으로 동작할 수 있는 `internal_execute_official_reader_verified_cancel_v2`를 실제 `SET LOCAL ROLE` 전환 후 호출하는 부정 시험을 추가했다.
- `cmd_bind_standard_reading_access_v2`, `cmd_restore_entitlements_runtime_v1` 같은 운영 일반 명령은 **본 패치에서 권한을 무차별 회수하지 않는다**. 별도 Member 복구 EXECUTE 보존 시험이 존재한다.
- 이 마이그레이션은 **함수 접근권만 변경**한다. 결제·환불을 수행하거나, 테이블 데이터를 고치거나, 새 운영 실행자에게 권한을 주지 않는다.

## 4. 정적 호출 그래프 검사 계약

`scripts/ci/official-reader-writer-call-graph.mjs`:

1. 현재 저장소의 `supabase/migrations/*.sql`에서 알려진 함수 선언, 직접 SQL 호출, 함수를 통한 중요한 Grant/Event/Projection 변경 힌트를 수집한다.
2. API·웹·모바일·어드민·packages의 애플리케이션 소스에서 **위험 비공개 함수를 직접 참조**하는 신규 경로가 있으면 검사를 실패시킨다.
3. 주요 원본/비공개 SQL 함수의 **이미 파악된 호출 파일 관계**를 허용목록으로 보존한다. 새 미승인 SQL 호출자·차단 이후 추가된 직접 함수 GRANT는 실패 처리한다.
4. 모의 파일로 정상 호출/미승인 신규 SQL 호출/위험 앱 호출 분류 시험을 진행한다.
5. `--report`는 파일·줄 번호와 해당 기초 DML 힌트를 출력한다. 이것은 정적 검사용 참고 목록이지 운영 DB에서의 실행 사실이 아니다.

**알려진 제약:** 정규식 기반 호출 탐색은 실행 중 만들어진 동적 SQL, PostgreSQL 함수 내부의 간접 호출, 외부 운영 관리자, 트리거·메타데이터·최신 운영 이미지 전부를 찾지 못할 수 있다. DML 힌트는 소스 본문 수준이며 실제 실행 순서의 증거가 아니다. 반드시 PostgreSQL Catalog/실 역할/3세션 경합·로그 감사와 결합해야 한다.

## 5. 시험 및 릴리스 경계

- 신규 `test/db/official_reader_private_writer_surface_closure.sh`: 비공개 함수 8개 단일 서명, PUBLIC 및 6종 운영 역할의 권한 거부, 실제 5종 `SET LOCAL ROLE` 실행 부정, 일반 Member projection 복구 권한 보존을 검증한다.
- 기존 `test/db/official_reader_cancel_legacy_writer_execution_fence.sh`, `official_reader_cancel_reviewed_atomic_bridge_private.sh`, 1850의 여러 Grant 원자 회수/rollback 시험은 동일 전체 PostgreSQL 검사에서 재실행한다.
- `run_authority_core.sh`에 정적 호출 그래프·자체 오용 시험 및 추가 역할 실검사를 등록한다.
- **완료 판정**: 새 정확한 HEAD에서 PostgreSQL 15/17·코드·콘텐츠·관리 규칙 등 필요한 전체 검사가 통과하고, 앱 코드 새 직접 우회 참조가 0개이며, 일반 Member 복구가 보존된 경우.
- **미완료/P0**: 원본 `1080/1090/1220/0220`의 모든 운영 호출자 전환, DB 소유자/배포 자격과 직접 DML 우회 관리, 운영에서의 정본 role/GRANT 실측, live 취소 인입, 실제 2인 승인 신원 증명, 다중 Grant/부분 환불, T2 유료 공개.

## 6. 다음 작업 순서

1. 운영 실제 역할·배포 이미지·수동 보정 작업의 읽기 전용 목록과 함수 사용 현황을 확보한다. 특히 DB 소유자·마이그레이션 계정의 일반 운영 사용을 금지할 정책·로그 계약을 확정한다.
2. 정상 Paid 경로를 변경하지 않는 **취소 이벤트 내구 접수·정규화 (권한 변화 0)** 작업을 별도 작업으로 구현한다.
3. 독립 PortOne GET의 영속 증명, 승인 발행자 실신원 인증, 전용 회수 실행자 순으로 구현한다. Commerce/Legal/Privacy/DB/Release 승인 전 실서비스 회수 OFF.

이 문서는 **코드 상 확인한 사실/시험 범위**를 바탕으로 작성했다. 운영 SQL 프로덕션 상태를 실측했다는 주장이 아니다.
