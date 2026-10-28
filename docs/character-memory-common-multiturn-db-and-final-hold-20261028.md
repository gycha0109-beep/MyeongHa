# 명하 공통 Character 다중 턴 — 실 DB 권한 점검 및 최종 공개 HOLD (2026-10-28)

Watchtower-Track: `character-memory`
작업 브랜치: `feat/character-memory/c08-local-one-call-shadow-v1`
범위: 연구용 Shadow의 기존 C1 Runtime 연결 / Production 미연결 / 유료 모델 호출 없음 / DB 쓰기 없음

## 1. 운영 Supabase 실제 점검

실제 프로젝트 `cnsfpcdiyofqvhpcegfc`에 대해 **읽기 전용 Catalog SQL**을 실행했다. 실행자는 Supabase SQL 도구의 `postgres`이며, 실제 애플리케이션 `myeongha_api_executor`로 사용자 대화 내용을 읽어 성공한 테스트가 아니다.

- `public.qry_chat_thread_runtime_binding_v1(uuid, uuid)`는 실제 배포되어 있으며 `SECURITY INVOKER`, `STABLE`이다.
- 해당 함수의 EXECUTE 권한은 `myeongha_api_executor=true`, `anon=false`, `authenticated=false`이다.
- PostgreSQL이 반환한 테이블 권한 및 RLS:

| Table | RLS | myeongha_api_executor SELECT |
|---|---|---|
| public.conversation_threads | enabled | true |
| public.conversation_messages | enabled | **false** |
| public.conversation_thread_characters | enabled | **false** |
| public.subjects | enabled | **false** |

- 관련 테이블에는 `myeongha_api_executor` 대상 SELECT RLS 정책이 존재하지만, RLS 정책은 테이블 GRANT를 대체하지 않는다.
- 현재 권한에서는 새 SQL의 `conversation_messages` 및 `conversation_thread_characters` 직접 읽기와 위 Security Invoker 함수 내부 권한이 충족되었다고 주장할 수 없다.
- **PostgreSQL EXPLAIN 성공:** 본 PR의 CTE SQL (활성 release/bundle/content_revision 추가)을 실제 프로젝트에서 `EXPLAIN (COSTS OFF, FORMAT TEXT)`로 컴파일. Function Scan 및 메시지/참여 캐릭터 Index Scan을 확인했다. 그러나 EXPLAIN은 실행자 접근 허가/실제 User Session Read 성공 증빙이 아니다.
- 작업 중 `GRANT / REVOKE / RLS / Migration / Schema` 변경은 하지 않았다. Production 사용자 메시지 본문 조회도 실행하지 않았다.

**판정: DB 문법·조회 계획 확인 / executor-identity 실제 조회는 ACL HOLD.** 별도의 권한 설계와 검증 근거 없이, 특히 기존 플랫폼 기본 ACL 이슈와 혼동해 운영 테이블 권한을 임의 변경하지 않는다.

## 2. 코드 구현

### C1 공통 DB Source Pin

`apps/api/src/postgres-character-thread-snapshot-shadow-v1.ts`
- 동일 SQL 읽기에서 `active_content_release_id`, `active_content_bundle_id`, `content_revision::text`를 확인한다. PostgreSQL bigint의 문자열 반환을 숫자로 강제 가정하지 않는다.
- DB 활성 ContentBundle과 Runtime `contentBundleId`가 불일치하면 Fail Closed.
- 검증된 Release/Bundle/Revision 조합만 snapshot port의 `readVerifiedContentBinding()`에서 반환한다. 실패한 조회 시 이전 성공 binding은 무효화.
- 기존 Subject/Thread/Character, 전체 message Count, 최근 원문·발신자·순서 검증과 C1 성격 설정을 계속 사용한다.

`apps/api/src/character-dialogue-continuity-authorized-shadow-v1.ts`
- 서버가 확인한 ContentRelease ID 및 Revision을 PUBLIC 연구 후보의 출처로 보존한다.

`apps/api/src/character-dialogue-multiturn-offline-shadow-v1.ts`
- Decider / Renderer / Independent Reviewer 단계 전후로 같은 Subject DB 원문을 재조회한다.
- 각 조회에서 최초에 확인한 ContentRelease/Bundle/Revision/Runtime ContentVersion이 바뀌면 검토 결과를 폐기한다.
- 출력은 여전히 `mayCommit=false`, `mayReveal=false`이며 메모리·관계 쓰기 없음.

### 공개 직전 경계

`apps/api/src/character-dialogue-pre-reveal-hold-shadow-v1.ts`
- 독립 검토가 끝난 후보를 받더라도 Reviewer의 정확한 대사·판단 Hash, 캐릭터, 현재 사용자 발화 근거, PUBLIC 범위, 기존 Cosmetic Guard 결과를 재검사한다.
- 새 Subject 소유 DB 조회를 1회 실행해 이전 후보의 **활성 Release·Bundle·Revision**이 그대로인지 검증한다.
- 최종 반환은 **HOLD 메타데이터만** 제공하고 대사 본문, 권한 토큰, HTTP 응답 또는 영구 Commit을 생성하지 않는다.
- 강제 요구: 서버 소유 Atomic Commit Receipt, 원본 개인기록/Grant 권한·철회 재검증, 전송시점 잠금 및 최초 HTTP Reveal 경계.
- 본 경로는 기존 R23/R24 보안 트랙의 원본 권한·송신 경계를 대체하지 않는다.

## 3. 오프라인 검증

- 기존 9명 C1 Authoring을 하나의 알고리즘에 입력한 다중 턴 Mock 테스트, 전 단계 DB 조회 검증 및 독립 Reviewer 실패 차단을 그대로 유지.
- 새로운 케이스: 같은 대화라도 Content Revision이 중간/최종 검토 사이에서 바뀐 경우, 다른 ContentBundle, 조작된 Candidate·검토 지문, 증빙 재조회 이전 액세스 차단, 반환 값의 `mayReveal=false`와 원문 미포함.
- 실제 모델 품질·일관성·개성은 여전히 실측 전이며, 개인기록 및 공식 사주/관상 출처 권한은 의도적으로 현재 PUBLIC 연구 범위 밖이다.

## 4. 후속 로드맵과 제한

1. **DB ACL/정식 Executor 트랜잭션 검증:** `conversation_messages`, `conversation_thread_characters`, `subjects`에 대한 SELECT 및 `qry_chat_thread_runtime_binding_v1` 실행에 필요한 실제 권한이 구조적으로 충족되는지 확인. 현재는 불충족. 운영 권한에 대한 임의 GRANT 금지.
2. **공통 운영 Commit/Reveal 연결:** 기존 권한 체계에서 검증된 Atomic Commit, 원본 Grant 및 source freshness, HTTP 전송시점 잠금 증거가 있는 경우에만 별도 Production 연결 가능. 이번 연구 코드에는 그러한 권한과 전송 엔진이 없다.
3. **다중 캐릭터 실모델 품질 실측:** 별도 비용 승인 전 실행하지 않는다.

**별도 플랫폼 이슈 #425 주의:** 2026-10-30 예정의 `supabase_admin` 기본 ACL 플랫폼 변경은 *신규 객체에 대한 기본 권한 경로* 관련이다. 이번 `myeongha_api_executor` 직접 테이블 SELECT 부족을 해결한다고 가정하지 않는다. Issue #425에 근거해 운영 권한을 변경하지 않는다.

이번 작업은 운영 반영/자동 병합 조건을 충족하지 않았다. PR은 연구용 Draft로 유지한다.
