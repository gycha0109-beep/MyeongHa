# MyeongHa Core Visual System v0.1

> Product: **명하 / MyeongHa**  
> Scope: Core UI visual language / Global Shell / color tokens / ornament / navigation / surface hierarchy  
> Status: **Product Visual Baseline Candidate**  
> Date: 2026-08-31

---

## 0. Purpose

이 문서는 명하의 현재 확정 UI 시안에서 추출한 공통 시각 언어를 제품 수준의 구현 기준으로 고정한다.

명하의 UI는 다음 방향을 따른다.

> **현대적인 사주 서비스 위에 ‘기록을 펼쳐 읽는 서원’의 감각을 얇게 깐다.**

권장 감각 비율:

```text
현대 웹/앱 서비스 70
동양 기록서원 20
캐릭터 판타지 10
```

세계관 장식 자체가 목적이 아니다. 사용자는 먼저 기능과 정보 위계를 이해해야 하며, 명하의 세계관은 헤더·푸터·프레임·질감·인장·선 같은 디테일에서 발견되어야 한다.

---

## 1. Core Visual Principle

명하의 공통 시각 언어는 다음 다섯 축으로 정의한다.

```text
紙 Paper
= 공간

墨 Ink
= 정보

夜 Night
= 중요함 / 깊이

金 Brass
= 구조 / 장식

印 Seal
= 흔적 / 표시
```

한 줄 정의:

> **Paper / Ink / Night / Brass / Seal을 중심으로 한 Contemporary Archive UI.**

금지 방향:

```text
보라색 AI SaaS
RPG 캐릭터 도감
한복 쇼핑몰
궁궐 테마파크
무협 게임
샤머니즘 키치
과도한 동양 판타지 장식
```

---

## 2. Three-Layer Visual Architecture

UI는 세 층으로 분리한다.

```text
Layer 1. Brand Shell
헤더 / 하단 HUD / 글로벌 배경 / 기본 타이포 / 공통 프레임

Layer 2. Product Surface
홈 / 사주 / 대화 / 기록 / 마이 각각의 정보 표현

Layer 3. Character Atmosphere
백헌 / 세연 / 여울 / 서린 / 라현 / 미라 / 태겸 / 윤호 / 도윤의 개별 공간
```

### Hard Rule

```text
Character Atmosphere가 Brand Shell을 덮어쓰지 않는다.
```

캐릭터 화면에 들어가도 다음은 명하 공통 언어를 유지한다.

```text
Global header
Global bottom navigation
Global notification affordance
Base typography hierarchy
Base Paper / Ink system
```

캐릭터별 차이는 content surface에서 만든다.

```text
character background
surface tone
accent
lighting
texture
motion
conversation-space composition
```

목표는:

```text
백헌 앱 / 세연 앱
```

이 아니라:

```text
명하 안에서 백헌을 만남
명하 안에서 세연을 만남
```

이다.

---

## 3. Core Color Tokens

아래 값은 현재 확정 UI 시안을 기준으로 한 v0.1 구현 토큰이다. 이후 실제 기기/웹 대비 검증에서 미세 조정할 수 있으나 역할 자체는 유지한다.

### 3.1 Paper

```css
--mh-paper-base:   #F2E9DF;
--mh-paper-raised: #F7F0E7;
--mh-paper-muted:  #EDE1D4;
```

역할:

```text
앱 전체 배경
카드
헤더
하단 HUD
Reading surface
```

대면적 순백 `#FFFFFF` 사용은 기본적으로 피한다.

---

### 3.2 Ink

```css
--mh-ink-strong:  #242529;
--mh-ink-default: #3C3836;
--mh-ink-muted:   #766F69;
--mh-ink-faint:   #A39991;
```

역할:

```text
Strong  → 화면 제목 / 결과 핵심
Default → 일반 본문
Muted   → 보조 설명 / 날짜 / 상태
Faint   → 비활성 정보
```

완전한 디지털 블랙보다 따뜻한 먹색 계열을 우선한다.

---

### 3.3 Night

```css
--mh-night-900: #1D2129;
--mh-night-800: #252D3A;
--mh-night-700: #313A49;
```

Night는 명하의 Primary Depth Color다.

허용:

```text
핵심 CTA
현재 선택된 Global Navigation
주요 Reading Hero
관계적으로 중요한 단일 Hero
깊은 분석 Section Header
```

금지:

```text
모든 카드
모든 버튼
모든 제목 배경
모든 탭
모든 캐릭터 카드
```

원칙:

> **Night는 단순 포인트 컬러가 아니라 중요도와 깊이를 만드는 색이다.**

한 화면의 강한 Night surface는 기본적으로 1개, 많아도 2개를 넘기지 않는다.

---

### 3.4 Brass

```css
--mh-brass-strong:  #A98250;
--mh-brass-default: #B99A70;
--mh-brass-faint:   #D6C1A4;
```

역할:

```text
1px 외곽선
Divider 중심 장식
활성 카드의 작은 선
인장 테두리
선택된 기록의 모서리
작은 icon/glyph accent
```

금지:

```text
대면적 Brass fill
Gold gradient
광택 럭셔리 골드
```

Brass는 귀금속 표현이 아니라 **기록물의 얇은 구조와 공예 디테일**이다.

---

### 3.5 Seal

```css
--mh-seal-default: #823332;
--mh-seal-soft:    #A65A50;
```

역할:

```text
새 알림
인장
확정된 중요한 기록의 작은 marker
주의가 필요한 작은 상태
```

Seal을 일반 CTA 색으로 사용하지 않는다.

> **붉은색은 누르는 색이 아니라 찍히는 색이다.**

---

## 4. Background System

기본 배경은 단색 beige가 아니라 다음 조합을 사용한다.

```text
Paper Base
+
아주 약한 grain
+
극저대비 수묵 / 산수 / 식물 흔적
```

권장 decorative background opacity:

```text
2~6%
```

사용자가 즉시 "산수화가 있다"고 인식할 정도면 과하다.

목표 감각:

> 디지털 흰 화면이 아니라, 무언가 기록이 놓이는 표면처럼 느껴진다.

---

## 5. Global Header

Top-level 구조:

```text
┌────────────────────────────┐
│ Logo         현재 탭     알림 │
│                            │
│ ───────── ◈ ───────────── │
└────────────────────────────┘
```

구성:

```text
좌측   → 명하 로고 + 작은 인장
중앙   → 현재 Top-level destination
우측   → global utility
하단   → 얇은 divider + 작은 중심 장식
배경   → Paper + low-opacity ink wash
```

Top-level destination은 다음 5개를 유지한다.

```text
홈
사주
대화
기록
마이
```

### Detailed Screen Header

상세 화면은 반복 로고보다 문맥을 우선한다.

```text
←          Context Title          ⋯
```

예:

```text
대화 → 백헌 대화방
사주 → 2026년 흐름
기록 → 퇴사를 고민했던 이야기
```

상세 화면마다 명하 로고를 반복하지 않는다.

---

## 6. Bottom Navigation HUD

메인 IA는 고정한다.

```text
홈 / 사주 / 대화 / 기록 / 마이
```

### Inactive State

```text
Paper background
Ink outline icon
Ink label
```

아이콘은 대체로 1.5~2px의 담백한 outline을 사용한다.

### Active State

```text
Night panel
+
Paper/Brass icon
+
Paper 또는 Brass label
+
얇은 Brass inset border
```

활성 탭은 일반 탭보다 약간 위로 올라온 **작은 기록 패 / 판넬**처럼 보일 수 있다.

권장 visual lift:

```text
8~12px
```

단 FAB처럼 완전히 분리되어 떠 보이면 안 된다.

### Active Plate Shape

기본 구조:

```text
90% modern navigation button
10% MyeongHa archive detail
```

허용 디테일:

```text
작은 corner cut
얇은 inset border
하단 작은 물결 / 기록 문양
```

장식 형상이 navigation affordance를 방해하면 제거한다.

---

## 7. Border and Radius Rules

### Border

일반 카드:

```text
1px low-contrast Paper/Ink border
```

중요 카드:

```text
1px Brass Faint
```

Hero:

```text
Night surface
+ 1px Brass
+ 제한적인 corner ornament
```

선택 상태를 두꺼운 금색 테두리로 표현하지 않는다.

### Radius

```text
Small control: 8px
Card: 10~14px
Large Hero: 16px
Bottom HUD: 14~18px
```

24~32px 수준의 pill-card를 기본 컴포넌트로 남용하지 않는다.

---

## 8. Typography Direction

세 종류의 역할을 분리한다.

### Brand / Display

```text
서예 / 붓글씨 계열
```

용도 제한:

```text
로고
인장
특수 Artifact title
```

### Heading

```text
명조 / serif 계열
```

주요 용도:

```text
화면 제목
Reading 핵심 제목
기록 제목
```

### Body

가독성이 높은 현대적인 body type을 사용한다.

모든 텍스트를 명조체로 만들지 않는다.

목표:

```text
고전적 분위기
≠
사극 UI
```

---

## 9. Ornament Budget

장식은 화면 면적을 점유하는 콘텐츠가 아니다.

화면 하나 기준 기본 예산:

```text
Large decorative element: 0~1
Medium decorative motif: 1~2
Small decorative detail: 2~5
```

예:

```text
Header 산수
+ Hero corner ornament
+ Footer 나뭇가지
```

가 이미 존재한다면 개별 카드마다 추가 매화/구름/금장 문양을 반복하지 않는다.

---

## 10. Global Shell vs Character Theme Tokens

공통 토큰은 캐릭터에 따라 변경하지 않는다.

```css
:root {
  --mh-paper: var(--mh-paper-base);
  --mh-ink: var(--mh-ink-default);
  --mh-night: var(--mh-night-900);
  --mh-brass: var(--mh-brass-default);
  --mh-seal: var(--mh-seal-default);
}
```

캐릭터는 별도 local atmosphere token만 가진다.

```text
--character-bg
--character-surface
--character-accent
--character-light
--character-texture
--character-motion
```

### Example — 백헌

```text
background   → deep navy / dark neutral
lighting     → warm lantern
texture      → wood / paper / night
accent       → muted brass
motion       → slow / weighted
```

### Example — 세연

```text
background   → warm cream
lighting     → natural daylight
accent       → muted peach / warm red
texture      → light floral / lived-in softness
motion       → light / approachable
```

두 경우 모두 Global Header와 Bottom Navigation은 명하 공통 Shell을 유지한다.

---

## 11. Main Five Tabs — Visual Role

모든 탭이 같은 카드 dashboard처럼 보이면 안 된다.

### 11.1 홈

질문:

> 오늘 명하에서 뭘 할까?

Visual role:

```text
가볍고 열린 Paper
Paper 비율 높음
Night 면적 적음
여러 entry의 위계를 명확하게
```

---

### 11.2 사주

질문:

> 내 사주를 제대로 읽는다.

Visual role:

```text
가장 구조적
Ink hierarchy 강함
얇은 grid / divider
Brass 구조선
Night는 핵심 결과에 제한
```

메인 5탭 중 **기록을 펼쳐 읽는 감각이 가장 강한 화면**이어야 한다.

---

### 11.3 대화

질문:

> 누구와 이야기를 이어갈까?

Visual role:

```text
관계가 가장 큰 면적을 차지
Character artwork 허용
Character local atmosphere 허용
Global Shell은 유지
```

---

### 11.4 기록

질문:

> 명하에서 무엇이 남았는가?

Visual role:

```text
Paper 중심
얇은 연결선
작은 Seal marker
세로 흐름
넉넉한 여백
```

조밀한 timeline dashboard처럼 만들지 않는다.

---

### 11.5 마이

질문:

> 내 정보와 이용 상태를 관리한다.

Visual role:

```text
가장 담백함
Paper
Ink
Compact row
최소 ornament
```

명하맛은 작은 divider, seal, 명식 motif 같은 디테일로 유지한다.

---

## 12. Approximate Visual Weight by Tab

아래 비율은 pixel 계산값이 아니라 화면의 **시각적 무게 제한**이다.

| 탭 | Paper | Night | Character / Other |
|---|---:|---:|---:|
| 홈 | 80% | 10% | 10% |
| 사주 | 75% | 15% | 10% |
| 대화 | 50~65% | variable | 25~40% |
| 기록 | 85% | 5% | 10% |
| 마이 | 90% | 5% | 5% |

---

## 13. Motion / Interaction Language

명하는 빠르고 현대적인 인터랙션을 기본으로 한다.

```text
Tap response
→ 100~160ms

Card reveal
→ 180~240ms

Record detail
→ restrained vertical reveal

Character Hero
→ subtle ambient movement only
```

금지:

```text
실제 두루마리가 길게 펼쳐지는 연출
1초 이상 먹물 번짐
반복 꽃잎 particle
금빛 particle 폭발
```

사용성이 연출보다 우선한다.

---

## 14. Product Copy and Visual Tone

UI copy는 기능을 이해할 수 있어야 하며, 세계관 어휘가 사용성을 방해하면 안 된다.

권장:

```text
분석하기 → 읽어보기
저장 → 기록에 남기기
이전 분석 → 지난 읽기
채팅 시작 → 이야기하기
대화 계속 → 이야기 이어가기
```

금지 수준:

```text
별의 문을 열어 운명의 서를 펼칩니다
```

Visual language와 동일하게 copy도:

```text
현대 서비스 구조
+
얇은 명하 언어
```

를 따른다.

---

## 15. Acceptance Criteria

새 UI 또는 시안을 만들 때 최소 다음을 검증한다.

```text
A. 이 화면이 무슨 화면인지 3초 안에 알 수 있는가?
B. 가장 중요한 행동이 하나 보이는가?
C. 홈/사주/대화/기록/마이가 서로 다른 성격을 가지는가?
D. Paper / Ink / Night / Brass / Seal 역할이 깨지지 않는가?
E. Night가 중요도보다 장식 목적으로 남용되지 않았는가?
F. Brass가 금장 장식으로 과해지지 않았는가?
G. 수묵/꽃/전통 문양이 콘텐츠보다 먼저 보이지 않는가?
H. Character Theme가 Global Shell을 침범하지 않는가?
I. 모바일에서 장식이 유효 영역을 불필요하게 잡아먹지 않는가?
J. 멀리서 보면 현대 서비스, 가까이 보면 명하인가?
```

---

## 16. Decision Register

### DECIDED

```text
D-VIS-01
명하의 core visual language는 Paper / Ink / Night / Brass / Seal이다.

D-VIS-02
기본 배경은 warm paper이며 순백 대면적 사용을 피한다.

D-VIS-03
Night는 primary depth / importance color이며 한 화면에서 제한적으로 사용한다.

D-VIS-04
Brass는 fill이 아니라 line / border / ornament 중심으로 사용한다.

D-VIS-05
Seal red는 CTA가 아니라 marker / stamp / notification 용도다.

D-VIS-06
Global Header와 5-tab Bottom Navigation은 Brand Shell authority다.

D-VIS-07
Character theme는 content surface를 바꾸지만 Brand Shell을 덮어쓰지 않는다.

D-VIS-08
세계관은 설명형 UI가 아니라 저대비 배경, 인장, 선, 프레임, 질감으로 얇게 노출한다.

D-VIS-09
전통 장식보다 정보 위계와 사용성이 우선한다.

D-VIS-10
메인 5탭은 동일한 dashboard layout을 공유하지 않고 각자 다른 visual role을 가진다.
```

### OPEN

```text
O-VIS-01
실제 production font family와 fallback stack.

O-VIS-02
WCAG 대비 테스트 후 세부 Ink / Brass token 조정.

O-VIS-03
웹 large-screen shell에서 header/footer density 조정.

O-VIS-04
각 캐릭터 local atmosphere token 상세 확정.

O-VIS-05
정식 component library의 ornament primitive 범위.
```

---

## 17. Final Principle

> **명하맛은 화면 면적으로 먹는 것이 아니라 디테일로 먹인다.**

> **멀리서 보면 현대적이고 고급스러운 사주 서비스이고, 가까이 보면 모든 화면이 기록을 읽고 사람과 함께 남기는 곳이라는 하나의 언어로 만들어져 있어야 한다.**
