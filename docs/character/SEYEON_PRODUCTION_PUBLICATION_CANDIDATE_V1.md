# 세연 단일 캐릭터 운영 게시 후보 v1

> 상태: **승인 후보 / 운영 권한 아님 / 게시 금지**
>
> 기준 본선: `523d7eaee9ecd83ccb50a77a4027b9e4a14b3753`
>
> 범위: 세연 1명만 독립 운영 게시 레인에 올리기 위한 최소 자산·연출 후보를 재현 가능한 형태로 고정한다.

## 1. 이미 승인된 것

세연은 이미 별도 Runtime 권한 레인을 가진다.

- 캐릭터 식별자: `seyeon`
- 표시 이름: 세연
- 세연 Bible/Runtime 승인 문서:
  `docs/source-authority-decisions/SEYEON_BIBLE_RUNTIME_V0_2_V0_1_APPROVAL.md`
- 독립 Runtime 레인:
  `packages/character-content/src/runtime-authority-lane-v1.ts`
- 단일 캐릭터 게시 검증 경로:
  `packages/character-content/src/production-character-lane-v1.ts`

따라서 다른 8명의 Runtime이나 자산 완성을 기다릴 필요 없이 세연만 독립 게시 후보를 만들 수 있다.

## 2. 정확한 자산 후보

현재 웹에서 실제 사용하는 세연 자산 중 최소 게시 후보는 두 개만 잡는다.

| 역할 | 공개 자산 경로 | 저장소 원본 | 바이트 | SHA-256 |
| --- | --- | --- | ---: | --- |
| 초상화 | `/assets/characters/seyeon-portrait-v2.webp` | `apps/web/assets/characters/seyeon-portrait-v2.webp` | 33710 | `d26c12da27f22c9877ea077b31810ed84ec1c14ece7778b410ff02fb5e4ee6c9` |
| 방 배경 | `/assets/characters/rooms/seyeon-room.webp` | `apps/web/assets/characters/rooms/seyeon-room.webp` | 281150 | `85c513008ebc3ac19766ea2520c2894e44e6a5e7def149b91ae46e346f1835be` |

이 두 파일의 현재 Git blob 식별자도 기계 검증한다.

## 3. 최소 정적 연출 제안

현재 세연 웹 화면은 정적 이미지 기반이므로 첫 운영 시험에서 별도 표정 이미지나 애니메이션을 새로 만들지 않는다.

승인 제안값:

```text
emotionIds      = [neutral]
animationCueIds = [idle]
cueSchemaVersion = static-character-cue-v1
minClientCapability = web-static-character-v1
```

이 값들은 **이번 문서에서 승인된 운영값이 아니다.**

의미는 단순하다.

- `neutral`: 추가 표정 자산 교체 없이 현재 정적 화면 사용
- `idle`: 별도 애니메이션 실행 없이 현재 정적 화면 유지
- 이후 실제 표정/애니메이션 자산을 만들면 새 버전으로 확장

## 4. 자산 매니페스트 후보

기계 판독 원본:

`docs/character/seyeon-production-publication-candidate-v1.json`

매니페스트 해시는 다음 규칙으로 재현한다.

1. `manifest` 객체의 키를 재귀적으로 정렬한다.
2. 배열 순서는 문서 순서를 유지한다.
3. 공백 없는 UTF-8 JSON으로 직렬화한다.
4. SHA-256을 계산한다.

후보 결과:

`sha256:v1:5eaeea8c41ba9cc6cb1aac898b4fe70cc08bee49de5af99693030724a72db3c7`

## 5. 게시 방향

후속 승인 시 목표는 다음 하나다.

```text
세연 1명 콘텐츠 묶음
→ 독립 단일 캐릭터 게시 검증
→ active non-default 릴리스
→ 기존 전체 기본 릴리스 변경 없음
```

일반 회원에게 자동 배포하거나 기본 릴리스를 세연으로 교체하지 않는다.

## 6. 승인 전 금지

이번 후보를 저장소에 병합해도 다음은 금지한다.

- 운영 DB 쓰기
- 실제 콘텐츠 릴리스 활성화
- 기본 릴리스 교체
- 일반 회원 세연 공개
- 다른 8명의 자산 값을 이 후보에서 파생
- `neutral` / `idle`을 승인 없이 운영 권한으로 간주

## 7. 다음 승인 표면

운영 게시 전 제품 소유자가 승인해야 할 값은 정확히 다음이다.

- 세연 자산 경로 2개
- 두 자산의 운영 사용 승인
- `neutral`
- `idle`
- `static-character-cue-v1`
- `web-static-character-v1`
- 위 매니페스트 해시
- 세연 비기본 활성 릴리스 게시 권한

그 승인 이후에만 실제 세연 ContentBundle/ContentRelease를 생성한다.

Watchtower-Track: character-memory
