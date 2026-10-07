# Seyeon Chat Theme v1 — Product Owner Approval

> 상태: **APPROVED PRESENTATION THEME / NOT RESIDENCE CANON / PRODUCTION MUTATION STILL GATED**
>
> 승인일: **2026-10-07**
>
> 대상: 세연 전용 대화방 UI 테마와 정적 대표 이미지

## 1. Product Owner decision

현재 대화에서 Product Owner가 다음을 명시적으로 승인했다.

1. 기존 `seyeon-portrait-v2.webp`를 세연의 운영 대표 초상화로 사용한다.
2. 세연 대화방은 밝은 크림·아이보리·연한 베이지와 따뜻한 오후빛을 기본 테마로 한다.
3. 모바일용 세로 배경과 웹용 가로 배경을 각각 승인한다.
4. 첫 버전은 정적 표현만 사용하며 별도 표정 전환이나 캐릭터 애니메이션을 추가하지 않는다.
5. 세연은 향후 독립 활성 비기본 릴리스로 내부 실제환경 시험하는 방향을 승인한다.

## 2. Approved presentation assets

### Representative portrait

- repository path: `apps/web/assets/characters/seyeon-portrait-v2.webp`
- SHA-256: `d26c12da27f22c9877ea077b31810ed84ec1c14ece7778b410ff02fb5e4ee6c9`

### Mobile chat theme background

Approved source generation artifact:

- source file: `햇살_가득한_빈_벤치_독서_공간.png`
- source dimensions: 941 × 1672
- source SHA-256: `3a97b14928b83e916df12c68fbe94c70bd44544ff9b8a7f7fe0efd78e8b3e7d4`

Repository derivative:

- repository path: `apps/mobile/assets/characters/chat-themes/seyeon-chat-theme-mobile-v1.webp`
- web mirror: `apps/web/assets/characters/chat-themes/seyeon-chat-theme-mobile-v1.webp`
- dimensions: 720 × 1280
- SHA-256: `ba545f917394884502c5bc435df544296ea36a5c35319f52e01b7c2131906f4a`

### Web chat theme background

Approved source generation artifact:

- source file: `한옥풍_봄날의_햇살_가득한_독서_공간.png`
- source dimensions: 1672 × 941
- source SHA-256: `3f6a8a4fe9fe2ae166250df4d68f5f5e0edd8193e2b8f78b59a8618e07eecd10`

Repository derivative:

- repository path: `apps/web/assets/characters/chat-themes/seyeon-chat-theme-web-v1.webp`
- dimensions: 1440 × 810
- SHA-256: `a48c2e7cd2df1b63c9c81fd097cb65ef304af653b8a68f027bfec438470fab52`

The WebP derivatives are delivery optimizations of the approved images. They do not establish new visual canon.

## 3. Theme semantics

The approved theme is presentation-only.

```text
bright cream / ivory / light beige
+ warm afternoon light
+ restrained apricot/peach accent
+ calm botanical / paper-like atmosphere
```

It may be used behind Seyeon's chat UI, message stream, and presentation scene.

## 4. Explicit canon boundary

The chat theme **does not** establish or imply:

- Seyeon's literal residence;
- Seyeon's bedroom;
- where Seyeon sleeps or lives;
- furniture or architecture in Seyeon's canonical home;
- a shared visit/history between Seyeon and the user.

The previously existing `apps/web/assets/characters/rooms/seyeon-room.webp` is **not approved by this decision** and must not be used as Seyeon's approved chat-theme authority.

## 5. Static v1 boundary

The first theme version has no authored expression-switch or animation presentation.

Implementation may represent this as a single static visual state, but must not fabricate additional expression art, motion art, or emotional visual states.

## 6. Publication boundary

This approval supplies Seyeon-specific presentation authority. It does not by itself bypass repository publication controls.

Allowed next step:

```text
approved Seyeon runtime
+ approved representative portrait
+ approved Seyeon chat theme v1
→ Seyeon one-Character publication package preparation
→ active non-default internal Production test after publication gate verification
```

Not authorized by this document:

- replacing the global default release;
- exposing a Seyeon-only default Member launch;
- treating the other eight Characters as ready;
- bypassing DB/RLS/executor or immutable release verification.

Watchtower-Track: character-memory
