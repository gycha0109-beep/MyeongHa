# C08-G — Windows/Docker Desktop 로컬 PostgreSQL 17 검증

Watchtower-Track: character-memory

## 실행 범위와 준비물

- 개인 Windows PC의 Docker Desktop이 실행 중이고 `docker` CLI가 접근 가능해야 합니다.
- 저장소 루트에 **Node.js 24**가 설치되어 있어야 합니다. 외부 API 키·운영 DB 주소·비밀번호를 입력하지 않습니다.
- 실행 전 Docker가 로컬 전용 컨테이너를 생성한다는 점을 확인합니다. 스크립트는 명시적인 `--disposable-only` 옵션 없이는 실행하지 않습니다.

PowerShell에서 저장소 루트 기준으로 실행:

```powershell
node scripts/run-seyeon-c08-local-docker-pg17.mjs --disposable-only
```

## Windows CRLF 오류 대응 (C08-H)

집·학원 등 다른 Windows PC에서 `core.autocrlf=true`로 체크아웃한 경우, Docker PostgreSQL 17이 준비된 뒤에도 `set: pipefail: invalid option name` 또는 `

- `postgres:17.6` 이미지, 임의 이름의 일회용 컨테이너 생성.
- **`--network none`**, 포트 공개 없음, 운영 호스트/원격 DB/실사용자 데이터와 연결 없음.
- 저장소는 `/repo`에 **읽기 전용** 마운트. DB 파일은 별도 영구 볼륨에 저장하지 않고 컨테이너 삭제 시 함께 삭제.
- 고정된 **`myeongha_c08_local_case_1`** DB만 만들고, 이미 검토된 PG17 적용 범위(최대 1510 + 화이트리스트에 든 2개의 timestamped migration; 0860은 기존 PG17 검사 계약대로 제외)까지만 스키마를 초기화합니다. 운영 기준선 이상인 1520~1720 후보를 적용하지 않습니다.
- 성공/실패 여부와 관계없이 `docker rm -f`로 컨테이너 정리.
- **로컬 도커 실행은 아직 이 PR에서 실제 수행하지 않았습니다.** GitHub CI는 드라이버·로컬 안전 규칙을 정적으로 검사하며, SQL 스키마/권한 실제 통과 여부를 보장하지 않습니다.

## 시험하는 가설

| 시나리오 | 기대 |
|---|---|
| 인증 완료 회원의 활성 세연 단독 Thread + 현재 User 메시지 단 1건 | `active\|seyeon\|1\|t` |
| 다른 사용자의 Thread를 첫 사용자의 Subject 권한으로 조회 | 실패 또는 응답 0건; **허용되면 FAIL** |
| 1개 메시지 뒤에 본문이 가려진(redacted) 토막 메시지를 추가 | `active\|seyeon\|2\|f`; 삭제 흔적을 무시하고 첫 대화로 오판 금지 |
| DB 역할/RLS/API EXECUTE 권한/PG17 버전 다름 | `HOLD_...`로 종료 |
| 검증 후 메시지 건수 불일치 | `HOLD_...`로 종료 |

성공 시 마지막에 `PASS_C08_DOCKER_LOCAL_PG17_READONLY_CENSUS_SMOKE`를 출력합니다. 실패 시 `HOLD_C08_DOCKER_LOCAL_PG17`로 끝납니다.

## 실제 검증에서 반드시 별도로 남기는 HOLD

1. 이번 테스트는 **한 번의 트랜잭션 내 첫 1건 조회와 redacted/tombstone의 재조회**를 검증합니다. **실제로 두 독립 PG 세션에서 동시에 메시지를 보내는 경합·잠금·선형화 증명은 아닙니다.**
2. 로컬 docker PG17의 RLS 실행과 운영 Supabase RLS/role catalog가 완전히 동일하다고 볼 수 없습니다. Migration frontier와 운영 DB 권한 배포는 별도 승인 대상입니다.
3. C08-E SQL 후보는 Production 라우팅에 연결되지 않았습니다. C08-F의 `Census→Unified Preflight→Census→Dialogue→Reviewer`도 AI 모의 출력만 검증했습니다.
4. Memory/Life Fact Grant의 철회·재승인, 정확한 Pin·Commit·HTTP 최초 Reveal 보호 및 모델 품질·토큰 절감은 아직 별도 보안/사용성/비용 검증입니다.

검사 도중 문제가 발생하면 컨테이너 ID나 임시 비밀번호 대신 **마지막 `HOLD_...` 실패 코드와 해당 단계명**만 공유하는 것으로 충분합니다. 사용자 데이터나 DB 비밀번호를 업로드할 필요 없습니다.
\\r': command not found`가 발생할 수 있습니다. 이는 DB 실패가 아니라 Bash 파일 끝의 CRLF 문제입니다.

C08-H 수정 버전부터는 **원본 Windows 체크아웃을 변경하지 않고**, Docker 컨테이너의 임시 공간 `/tmp/myeongha-c08-case`로 `test/db`를 복사하여 그 안의 모든 `.sh` 파일만 LF로 변환합니다. `supabase` 원본은 읽기 전용 심볼릭 링크로 사용합니다. 출력에 `C08_DOCKER_SHELL_LINE_ENDINGS_NORMALIZED`가 찍히면 전처리가 실행된 것입니다.

GitHub의 수정 PR이 `main`에 병합된 뒤 집 PC의 저장소 루트에서 아래처럼 실행합니다.

```powershell
git switch main
git pull origin main
node scripts/run-seyeon-c08-local-docker-pg17.mjs --disposable-only
```

※ `git config --global core.autocrlf`를 변경하거나 수동으로 전체 파일 줄바꿈을 바꿀 필요는 없습니다. GitHub CI에서 수행하는 것은 CRLF 전처리의 회귀 테스트와 정적 안전성 확인이며, 로컬 Docker의 실제 SQL 전체 통과는 사용자가 실행한 출력으로 별도 판정합니다.

## 스크립트의 고정된 안전 경계

- `postgres:17.6` 이미지, 임의 이름의 일회용 컨테이너 생성.
- **`--network none`**, 포트 공개 없음, 운영 호스트/원격 DB/실사용자 데이터와 연결 없음.
- 저장소는 `/repo`에 **읽기 전용** 마운트. DB 파일은 별도 영구 볼륨에 저장하지 않고 컨테이너 삭제 시 함께 삭제.
- 고정된 **`myeongha_c08_local_case_1`** DB만 만들고, 이미 검토된 PG17 적용 범위(최대 1510 + 화이트리스트에 든 2개의 timestamped migration; 0860은 기존 PG17 검사 계약대로 제외)까지만 스키마를 초기화합니다. 운영 기준선 이상인 1520~1720 후보를 적용하지 않습니다.
- 성공/실패 여부와 관계없이 `docker rm -f`로 컨테이너 정리.
- **로컬 도커 실행은 아직 이 PR에서 실제 수행하지 않았습니다.** GitHub CI는 드라이버·로컬 안전 규칙을 정적으로 검사하며, SQL 스키마/권한 실제 통과 여부를 보장하지 않습니다.

## 시험하는 가설

| 시나리오 | 기대 |
|---|---|
| 인증 완료 회원의 활성 세연 단독 Thread + 현재 User 메시지 단 1건 | `active\|seyeon\|1\|t` |
| 다른 사용자의 Thread를 첫 사용자의 Subject 권한으로 조회 | 실패 또는 응답 0건; **허용되면 FAIL** |
| 1개 메시지 뒤에 본문이 가려진(redacted) 토막 메시지를 추가 | `active\|seyeon\|2\|f`; 삭제 흔적을 무시하고 첫 대화로 오판 금지 |
| DB 역할/RLS/API EXECUTE 권한/PG17 버전 다름 | `HOLD_...`로 종료 |
| 검증 후 메시지 건수 불일치 | `HOLD_...`로 종료 |

성공 시 마지막에 `PASS_C08_DOCKER_LOCAL_PG17_READONLY_CENSUS_SMOKE`를 출력합니다. 실패 시 `HOLD_C08_DOCKER_LOCAL_PG17`로 끝납니다.

## 실제 검증에서 반드시 별도로 남기는 HOLD

1. 이번 테스트는 **한 번의 트랜잭션 내 첫 1건 조회와 redacted/tombstone의 재조회**를 검증합니다. **실제로 두 독립 PG 세션에서 동시에 메시지를 보내는 경합·잠금·선형화 증명은 아닙니다.**
2. 로컬 docker PG17의 RLS 실행과 운영 Supabase RLS/role catalog가 완전히 동일하다고 볼 수 없습니다. Migration frontier와 운영 DB 권한 배포는 별도 승인 대상입니다.
3. C08-E SQL 후보는 Production 라우팅에 연결되지 않았습니다. C08-F의 `Census→Unified Preflight→Census→Dialogue→Reviewer`도 AI 모의 출력만 검증했습니다.
4. Memory/Life Fact Grant의 철회·재승인, 정확한 Pin·Commit·HTTP 최초 Reveal 보호 및 모델 품질·토큰 절감은 아직 별도 보안/사용성/비용 검증입니다.

검사 도중 문제가 발생하면 컨테이너 ID나 임시 비밀번호 대신 **마지막 `HOLD_...` 실패 코드와 해당 단계명**만 공유하는 것으로 충분합니다. 사용자 데이터나 DB 비밀번호를 업로드할 필요 없습니다.
