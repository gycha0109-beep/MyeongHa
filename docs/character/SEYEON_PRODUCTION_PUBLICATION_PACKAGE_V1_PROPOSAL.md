# Seyeon one-Character publication package v1 — Technical proposal

> 상태: **PROPOSED / NOT APPROVED / NOT PRODUCTION AUTHORITY**
>
> 범위: 세연 1명 독립 운영 게시 패키지를 만들기 위해 필요한 기술 식별자 제안
>
> 근거:
> - `SEYEON_BIBLE_RUNTIME_V0_2_V0_1_APPROVAL.md`
> - `SEYEON_CHAT_THEME_V1_APPROVAL.md`
> - `seyeon-chat-theme-v1.manifest.json`

## 1. 이미 승인된 사실

다음은 새 제안이 아니라 기존 승인이다.

- 세연 Runtime authority lane
- 세연 대표 초상화 `seyeon-portrait-v2.webp`
- 세연 웹/모바일 대화방 테마 v1
- 첫 버전은 정적 표현만 사용
- 세연 독립 active non-default 내부 운영 시험 방향
- 대화방 테마는 세연 실제 거주 공간 canon이 아님

## 2. 이번 제안의 목적

Production Character lane validator는 다음 concrete publication material을 요구한다.

```text
assetRefs
emotionIds
animationCueIds
assetManifestHash
cueSchemaVersion
minClientCapability
```

승인된 정적 세연 표현을 이 필드에 어떤 exact value로 옮길지 아직 source authority가 없으므로,
이번 문서는 그 값을 **승인 후보**로만 고정한다.

## 3. assetRefs 제안

새 URI scheme를 발명하지 않고, 이미 승인되고 저장소에 존재하는 exact repository path를 stable ref 후보로 사용한다.

```text
apps/web/assets/characters/seyeon-portrait-v2.webp
apps/web/assets/characters/chat-themes/seyeon-chat-theme-web-v1.webp
apps/mobile/assets/characters/chat-themes/seyeon-chat-theme-mobile-v1.webp
```

legacy `apps/web/assets/characters/rooms/seyeon-room.webp`는 포함하지 않는다.

## 4. 정적 표현 식별자 제안

승인된 “표정 전환 없음 / 애니메이션 없음 / 정적 표현”을 다음처럼 최소 표현한다.

```text
emotionIds      = ["neutral"]
animationCueIds = ["static"]
```

의미:

- `neutral`: 별도 authored emotional expression variant를 선택하지 않는 기본 정적 상태
- `static`: renderer motion을 실행하지 않는 정적 표시 상태

이 두 문자열은 현재 **제안값**이며 승인 전 Production authority가 아니다.

## 5. 호환성 식별자 제안

```text
cueSchemaVersion    = "character-static-presentation-v1"
minClientCapability = "character-chat-theme-v1"
```

- cue schema는 정적 표시만 허용하는 presentation contract를 뜻한다.
- client capability는 승인된 character chat theme asset을 표시할 수 있는 client를 뜻한다.
- 둘 다 opaque exact-match identifier로 취급하며 숫자/문자열 ordering을 추론하지 않는다.

## 6. 자산 manifest 제안

기계 판독 원본:

`docs/character/seyeon-publication-package-v1.proposal.json`

manifest에는 승인된 세 자산만 들어간다.

| 역할 | exact ref | SHA-256 |
| --- | --- | --- |
| 대표 초상화 | `apps/web/assets/characters/seyeon-portrait-v2.webp` | `d26c12da27f22c9877ea077b31810ed84ec1c14ece7778b410ff02fb5e4ee6c9` |
| 웹 대화방 테마 | `apps/web/assets/characters/chat-themes/seyeon-chat-theme-web-v1.webp` | `a48c2e7cd2df1b63c9c81fd097cb65ef304af653b8a68f027bfec438470fab52` |
| 모바일 대화방 테마 | `apps/mobile/assets/characters/chat-themes/seyeon-chat-theme-mobile-v1.webp` | `ba545f917394884502c5bc435df544296ea36a5c35319f52e01b7c2131906f4a` |

stable-key JSON 직렬화 후 SHA-256 후보:

```text
sha256:v1:ca769bd9b211e5d04f64128fea1fb2e3d1eca3f91d2d34c6fe14f39b62591a4d
```

이 hash 역시 제안 기술값의 일부이므로, 제안값이 변경되면 다시 계산해야 한다.

## 7. 승인 표면

Product Owner가 다음 exact package를 승인하면 이후 Production package 입력으로 승격할 수 있다.

```text
assetRefs:
- apps/web/assets/characters/seyeon-portrait-v2.webp
- apps/web/assets/characters/chat-themes/seyeon-chat-theme-web-v1.webp
- apps/mobile/assets/characters/chat-themes/seyeon-chat-theme-mobile-v1.webp

emotionIds:
- neutral

animationCueIds:
- static

cueSchemaVersion:
- character-static-presentation-v1

minClientCapability:
- character-chat-theme-v1

assetManifestHash:
- sha256:v1:ca769bd9b211e5d04f64128fea1fb2e3d1eca3f91d2d34c6fe14f39b62591a4d
```

## 8. 이번 제안이 승인하지 않는 것

- Production DB write
- ContentBundle ID / ContentRelease ID
- 실제 release activation
- global default 교체
- 일반 Member 공개
- 세연 실제 거주 공간 설정
- 다른 8명 publication material
- 새로운 표정/애니메이션 자산

승인 이후에도 별도로 세연 Canon→typed publication payload mapping과 publication gate 검증을 거쳐야 한다.

Watchtower-Track: character-memory
