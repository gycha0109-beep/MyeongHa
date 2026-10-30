# Reading AI 비용 비공개 원장 설치 — 2026-10-30

기존 A4 비용 원장·Writer RPC·개별/월간 조회 RPC를 Production에 설치했습니다. Saju 호출 결속이나 실제 비용 수집을 활성화한 것은 아닙니다.

- Project: `cnsfpcdiyofqvhpcegfc`
- 실제 migration: `20261030015858_admin_console_reading_ai_cost_foundation_v1_20261030`
- 적용 파일: `apps/admin/database/production-reading-ai-cost-foundation-manual-v1.sql`
- 기존 후보: `reading-ai-call-cost-offline-v1.sql`. 설치를 재실행하지 않습니다.

## 실제 수정과 설치

실제 PostgreSQL 실행에서 `RETURNS TABLE(call_id ...)`의 출력 변수와 `ON CONFLICT(call_id)`가 충돌해 INSERT가 실패했습니다. 충돌 대상을 기본키 제약 `reading_ai_call_cost_events_v1_pkey`로 명시해 수정했습니다. Production 함수 3개의 본문은 이 수정을 반영한 기존 후보와 동일합니다.

비로그인 최소 권한 Source와 별도 로그인 Writer를 분리했습니다. Source에는 실행 시도의 ID/Reading/Subject/시작 시각 4개 컬럼 조회와 자체 비용 원장만 허용합니다. Writer는 기록 RPC만 실행하고 비용 테이블 직접 읽기/쓰기·고객 테이블 변경은 허용하지 않습니다. Reader에는 제한된 조회 RPC만 부여하며 기존 public/운영 허용 컬럼은 178개 그대로입니다. 새 역할의 로그인 비밀은 없습니다.

관리형 비슈퍼유저 계정에서 필요한 소유권 이전은 트랜잭션 안의 임시 SET/CREATE로 처리하고 제거했습니다. 일반 사용자 역할·기존 Worker·Reading 실행 상태·도메인 불변식은 변경하지 않았습니다.

## 검증과 남은 결속

- 폐기형 PG17.6의 실제 DB에서 기록·동일 호출 재실행·사용량 미확인 실패 호출·월 집계·Writer 직접 조회 거부 통과. 합성 시나리오의 알려진 추정액과 미측정 호출은 분리됐으며 모두 롤백했습니다.
- Production에서 실제 RPC가 존재하지 않는 실행 시도 결속을 거부하고 Writer 직접 SELECT도 차단함을 롤백 검증했습니다. Reader 월간 RPC 실행과 설치 후 카탈로그를 확인했습니다. 비용 원장은 0행이고 고객 Reading/실행 시도에는 합성 데이터를 넣지 않았습니다.
- 공급사 호출 전체 관측·명하/Saju 요청 매핑·청구/환율은 미검증입니다. 기존 월간 응답의 `coverage=provider_events_only_unverified`, 전체 추정/확정/KRW 비용 null을 유지합니다. 원장 행 수를 실제 Reading 생성 0건·비용 0원으로 해석하지 않습니다.
- Supabase advisor의 `rls_enabled_no_policy` INFO가 이 전용 원장에 있습니다. 기존 계약은 RLS로 일반 역할을 기본 차단하고, 비로그인 테이블 소유자의 제한된 SECURITY DEFINER RPC로만 접근합니다. Writer/Reader의 직접 테이블 권한은 없습니다. 관련 원리: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

`SajuReadingProviderBindingAuthorityV1.resolve()`에 필요한 실제 요청 → DB Reading/실행 시도 매핑 정본은 여전히 없습니다. 이 설치로 Production Interpretation HOLD를 해제하거나 식별자 동등성을 가정하지 않습니다. 안전한 전용 Writer 자격증명과 권위 있는 호출 전달 결속이 남았습니다.
