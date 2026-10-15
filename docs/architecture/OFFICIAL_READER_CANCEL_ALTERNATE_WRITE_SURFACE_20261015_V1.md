# D3e27 — 결제·이용권 7개 테이블의 대체 쓰기 경로 점검

**2026-10-15 / 검토 상태: Draft / HOLD.** 운영 Supabase 고객/구매 데이터는 조회·변경하지 않았으며 Production 키·데이터베이스 권한·배포·실제 결제/환불도 변경하지 않았습니다.

## 1. API 키에 관해 정리된 사실

- 2026-09-02 `Production User-Data Bindings` GitHub Actions [#33626188510](https://github.com/gycha0109-beep/MyeongHa/actions/runs/33626188510) 정상 종료. 해당 배포 설정 코드 `.github/workflows/production-user-data-bindings.yml`은 Supabase의 **활성 `type == "publishable"`** 키를 선택하고 `sb_publishable_` 접두어를 강제하여 `MYEONGHA_SUPABASE_API_KEY`를 Vercel Production **sensitive** 변수로 등록했습니다.
- 프로젝트 소유자는 **최초 등록 이후 해당 변수를 변경한 적이 없다고 확인**했습니다. 따라서 사람의 변경 이력과 최초 성공한 GitHub 작업을 결합하면 사용자 설명과 초기 일반용 키 설정이 일치합니다. 단, 이 사실은 비밀값의 현재 실효 버전을 서비스 프로세스 내부에서 기계적으로 직접 확인했다는 뜻은 아닙니다.
- `vercel env run -e production`은 Vercel이 12개의 Secret 값을 로컬로 가져오지 못한다고 거부하였고, PowerShell의 JS 인라인 명령도 인용부호 문제로 실패했습니다. 이 명령은 키를 판정하지 못했습니다. **재실행하지 말고 .env 파일·키 붙여넣기를 요구하지 않습니다.**
- 일회성 진단 PR [#2130](https://github.com/gycha0109-beep/MyeongHa/pull/2130)은 병합 없이 종료했으며 진단 전용 변경 6개 파일을 모두 원상복구/삭제하여 부모와의 최종 변경 파일 수 **0개**로 확인했습니다. 영구 적용되지 않은 진단 프로세스를 재활성화하지 않습니다.

## 2. 실제 명하 Supabase PostgreSQL의 권한 메타데이터 (읽기 전용)

대상: `cnsfpcdiyofqvhpcegfc`. 조회 결과 아래는 실제 고객 데이터가 아닌 `pg_catalog` 역할·함수·테이블 권한 및 뷰 참조 메타데이터입니다.

- `service_role`은 `NOBYPASSRLS` **아님**: `BYPASSRLS=true`인 API 역할이며 직접 로그인은 불가능합니다. 따라서 **RLS만 활성화하는 조치는 이 역할의 직접 테이블 쓰기 권한을 제거하지 못합니다.**
- `service_role`은 여전히 `commerce_account_links`, `commerce_provider_events`, `commerce_receipts`, `entitlement_events`, `entitlement_grants`, `entitlements`, `purchase_intents` **7개 모두의 SELECT/INSERT/UPDATE/DELETE 유효 권한**이 있고 RLS는 모두 비활성화되어 있습니다.
- `commerce_payment_attempts`와 `purchase_intent_reader_selections`은 현재 `service_role`의 직접 SELECT/INSERT/UPDATE/DELETE 유효 권한이 **없습니다**. 위 7개 범위와 혼동하지 않습니다.
- `myeongha_runtime`, `myeongha_worker_runtime`은 `service_role`이나 `pg_write_all_data`의 멤버가 아니며, `myeongha_runtime`은 보호된 테이블에 직접 INSERT 권한이 없습니다.
- 7개 테이블명을 **함수 본문에서 직접** 참조하며 `service_role`이 실행할 수 있는 `SECURITY DEFINER` 함수는 현재 검색 결과 **0건**입니다. 보호 테이블을 참조하는 **업데이트 가능한 뷰 중 service_role에 쓰기 권한이 있는 후보**도 **0건**입니다.
- 일부 `SECURITY INVOKER` 함수에는 `service_role` 실행 권한이 남아 있습니다(예: `cmd_create_purchase_intent_v1`). 이 권한만으로 소유자 권한을 얻는 것은 아니지만, 간접 호출 및 트리거·동적 SQL 영향은 별도 검증 대상으로 유지합니다.

이 실사는 **DB 테이블·함수·뷰 메타데이터**만 확인했습니다. PostgREST Data API 실제 노출 설정, 네트워크 접근성, 함수의 전이적 호출 그래프, 모든 외부 서비스의 권한 사용처, 토큰 수탁, 실제 환불/복원 결과를 확정하지 않습니다.

## 3. 자동 시험 및 실패 검출

- `scripts/security/official_reader_cancel_service_role_alternate_writes_readonly.sql`: 운영에도 안전한 `SELECT` 한 문장으로 보호 대상 7개, 인접 제한 테이블 2개, `service_role` 직접 쓰기 권한 수, 참조 함수 중 `SECURITY DEFINER + EXECUTE` 후보 수, 갱신 가능한 뷰 쓰기 후보 수의 **집계만** JSON으로 반환. `cutover_authorized=false`를 고정합니다. **실제 운영 연결로 실행해도 권한이나 행을 변경하지 않습니다.**
- `test/db/official_reader_d3e27_alternate_writes_guard.sh`: 정확히 세 종류의 폐기형 CI 로컬 PostgreSQL DB와 `CI=true`, `PGHOST=localhost`, `PGUSER=postgres`를 요구합니다. D3e23 테스트에서 **REVOKE한 후**, 7개 SELECT 유지 및 쓰기 없음, 추가 2개 쓰기 없음, 대체 쓰기 후보 0건을 검증합니다.
- 테스트가 폐기형 DB에만 가짜 `SECURITY DEFINER` 함수를 잠시 생성하고 `service_role`에 실행 권한을 부여해, 카탈로그 감사가 **반드시 위험 후보 1건을 검출**하는지 확인합니다. 이 함수는 호출하지 않으며, 즉시 DROP한 뒤 0건으로 복귀하는지도 검증합니다. 실제 결제·실제 고객 행 사용 없음.
- 이전 구매·검증된 유료 Reader 취소·2건 원자 취소의 세 복제 DB 시험에 위 점검을 추가하되 **원래 결제/취소 테스트 스크립트 본문은 수정하지 않습니다.** 기존 63건의 직접 DML 거부 시험과 정상 구매/취소 회귀 검증도 유지합니다.

## 4. 다음 단계와 운영 조건

운영 GRANT/REVOKE 또는 RLS 상태 변경은 이 PR에서 진행하지 않습니다. 운영 전환은 **일반 사용자 및 Worker 접속 계정의 실제 세션·TLS 검증, 운영 서비스 계정 사용처/예외 감리, 기존 유료 취소·환불·복구 전체 계약과 차단 시 롤백 검증, DBA/Commerce/보안 담당자의 명시적 승인**을 충족해야 합니다. 이 단계에 승인이나 실제 운영 DB 변경 권한이 포함되었다고 가정하지 않습니다.

**D3e27 결과의 의미:** 직접 일반 DML 7개를 막은 뒤 **직접 SQL과 알려진 함수/뷰 후보**의 우회가 없는지를 좀 더 강하게 검증합니다. 임의로 호출하는 다른 경로 전체를 부정하는 절대적 무결성 보장은 아닙니다. **HOLD / NO MERGE / NO DEPLOY / NO LIVE ACL CHANGE.**
