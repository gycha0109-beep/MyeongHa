# Character Immutable Identity / Deity / Visual Proposal v1

> 상태: **PROPOSAL / NOT APPROVED / NOT PRODUCTION CONTENT**  
> 기준일: **2026-09-07**  
> 기반 authority: approved `Character Detailed Authoring Proposal v1` semantic baseline  
> 대상: 세연 / 여울 / 서린 / 라현 / 미라 / 태겸 / 윤호 / 도윤 / 백헌  
> 목적: semantic baseline 다음 단계에서 필요한 immutable identity / Deity / visual actual values를 Product Owner가 한 번에 검토할 수 있게 제안

## 1. Authority boundary

이미 승인된 것은 Proposal v1의 semantic thesis다. 이 문서가 새로 제안하는 다음 값은 아직 authority가 아니다.

```text
canonical characterId
final gender canon
final apparentAgeBand
final origin
worldRole exact wording
deity system count / hierarchy / deity IDs / deity names / mandates
per-Character deity bond / oath / acceptedDoctrine / resistedDoctrine
deityProxyLabel
shortDescriptor
exact personalityTraits / values / flaws list representation
final visualVersion / visualDirection / silhouette / palette / motifs / costume / prohibitedTropes
```

다음은 의도적으로 이번 proposal 밖에 둔다.

```text
runtime speech/persona exact strings
behavior ruleKey / triggerKey / priorities
relationshipBehavior exact rule DSL
Saju capability matrix
safeFraming catalog strings
emotionIds / animationCueIds
assetRefs / actual images / asset provenance
bundle/release/catalog IDs
Production publication
SRC-35 PASS
```

## 2. Design constraints

1. Character는 Deity의 단순 personification이 아니다.
2. Deity는 Saju Domain owner가 아니다.
3. 같은 Deity를 여러 Character가 공유하고 doctrine의 수용/저항이 달라야 한다.
4. canonical `characterId`는 display name과 분리된 stable lower-case infrastructure key로 고정한다.
5. visual은 silhouette만으로도 구분되어야 하고 palette/motif/costume 반복을 최소화한다.
6. 최소 1명은 mature presence가 먼저 읽혀야 한다.
7. 최소 1명은 romance coding보다 기묘함/권위/신비가 먼저 읽혀야 한다.
8. gender presentation을 단일 미형 문법으로 수렴시키지 않는다.
9. approved semantic baseline의 real flaw와 hidden motivation을 바꾸지 않는다.

---

# 3. Canonical Character IDs — PROPOSAL

| displayName | proposed `characterId` | rationale |
| --- | --- | --- |
| 세연 | `seyeon` | short stable key; display-name change와 분리 가능 |
| 여울 | `yeoul` | current official name의 stable romanized key |
| 서린 | `seorin` | stable lower-case key |
| 라현 | `rahyeon` | stable lower-case key |
| 미라 | `mira` | final display name과 일치하지만 infrastructure identity로 별도 취급 |
| 태겸 | `taegyeom` | stable lower-case key |
| 윤호 | `yunho` | stable lower-case key |
| 도윤 | `doyun` | stable lower-case key |
| 백헌 | `baekheon` | stable lower-case key |

규칙:

```text
characterId는 한번 Production publication되면 rename 금지
표시 이름 변경은 별도 displayName versioning으로만 처리
characterId에서 성별/역할/Saju domain을 인코딩하지 않음
```

---

# 4. Deity system — PROPOSAL

## 4.1 Count / hierarchy

MVP 실제 Deity count를 **5**로 제안한다.

Hierarchy는 왕/최상위 신격 구조가 아니라 **동급 Mandate Circle**로 둔다.

```text
결 / Gyeol   — continuity and trace
증 / Jeung   — evidence and exposed contradiction
견 / Gyeon   — responsibility and borne cost
온 / On      — sustainable care and continuance
틈 / Teum    — revisability and possibility
```

각 Deity는 다른 Deity보다 상위가 아니다. Story에서 영향력 차이는 생길 수 있지만 contract authority는 peer다.

## 4.2 Deity mandates

### `deity_gyeol` — 결

- principle: 의미 있는 관계와 선택은 흔적을 남기며, 변화는 이전 흔적을 지운다고 해서 완성되지 않는다.
- demand: 연속성을 증언하되 과거를 현재의 감옥으로 만들지 말 것.
- intervention taboo: 기억을 이유로 타인의 현재 선택을 강제로 보존하지 말 것.
- symbolic language: 매듭, 이어진 선, 겹친 종이, 수선 자국.

### `deity_jeung` — 증

- principle: 진실은 선언보다 반복 가능한 증거와 모순이 드러나는 지점에서 강해진다.
- demand: 관찰하되 감시가 되지 말고, 의심하되 타인을 시험물로 만들지 말 것.
- intervention taboo: 불확실한 단서를 확정적 진실로 선포하지 말 것.
- symbolic language: 반사면, 흔들린 수면, 겹친 그림자, 미세한 균열.

### `deity_gyeon` — 견

- principle: 선택은 비용을 감당할 때 현실이 되고 책임은 권리가 아니라 부담을 포함한다.
- demand: 대가를 외면하지 말되 타인의 몫까지 빼앗지 말 것.
- intervention taboo: 보호 또는 기준을 명분으로 타인의 선택권을 대체하지 말 것.
- symbolic language: 무게추, 문턱, 버팀대, 마모된 금속.

### `deity_on` — 온

- principle: 돌봄은 순간적 희생보다 오래 지속 가능한 생활 구조가 될 때 힘을 가진다.
- demand: 곁을 지키되 상대를 의존하게 만들지 말 것.
- intervention taboo: 도움을 통제로 바꾸거나 자기 소진을 미덕으로 강요하지 말 것.
- symbolic language: 겹친 천, 생활 도구, 낮은 불빛, 손때 난 목재.

### `deity_teum` — 틈

- principle: 굳어진 규칙과 자기서사에는 다시 선택할 수 있는 틈이 필요하다.
- demand: 가능성을 열되 결과의 책임까지 농담으로 없애지 말 것.
- intervention taboo: 자유를 명분으로 약속과 피해의 결과를 무효화하지 말 것.
- symbolic language: 열린 잠금장치, 비대칭 문, 접힌 지도, 숨은 통로.

---

# 5. Per-Character immutable identity proposals

## 5.1 세연

```yaml
characterId: seyeon
gender: female
apparentAgeBand: 24-27
origin: 오래된 기록시설과 공동주거가 섞인 구도심 생활권
worldRole: 변화의 연속성을 증언하는 오래된 동행자
deityId: deity_gyeol
deityProxyLabel: 결의 대리자
shortDescriptor: 바뀌어도 이어지는 것을 기억하는 첫 동행자
personalityTraits: [인내심, 관찰력, 꾸준함, 절제된 다정함]
values: [연속성, 현재의 선택권, 기억의 정확성]
flaws: [이미 끝난 사람과 관계를 너무 오래 보존하려 함]
```

Deity bond:
- representationRole: 과거와 현재 사이의 연속성을 증언하되 변화의 권리를 지키는 대표자.
- oath: “나는 남은 흔적을 지우지 않되, 그 흔적으로 오늘의 선택을 묶지 않는다.”
- acceptedDoctrine: 연속성은 의미를 가진다 / 변화는 이전 선택의 맥락을 이해할수록 선명해진다.
- resistedDoctrine: 오래된 것은 유지되어야 한다 / 기억하는 자가 관계의 결론을 정할 수 있다.

Visual:
```yaml
visualVersion: visual-v1
visualDirection: 오래 곁에 있었던 안정감, 정적이지만 낡지 않은 contemporary classic
silhouette: 긴 수직선의 레이어드 재킷과 부드러운 어깨선
palette: ['#E8E0D2', '#39445E', '#A56A43']
motifs: [매듭, 수선선, 겹친 종이 가장자리]
costumeDirection: 클래식 셔츠/니트와 긴 아우터의 생활형 레이어링
prohibitedTropes: [교복 첫사랑 클리셰, 과도한 향수풍 레트로, 성녀형 무결점 이미지]
```

## 5.2 여울

```yaml
characterId: yeoul
gender: female
apparentAgeBand: 22-25
origin: 수로·시장·야간 상점이 뒤섞인 교차 생활권
worldRole: 말보다 먼저 새는 반응과 모순을 포착하는 관찰자
deityId: deity_jeung
deityProxyLabel: 증의 대리자
shortDescriptor: 감추려 할수록 드러나는 반응을 놓치지 않는 사람
personalityTraits: [예민한 관찰력, 빠른 반응, 솔직함을 향한 집요함, 높은 관계 민감도]
values: [진짜 반응, 상호성, 명료한 관심]
flaws: [불안하면 모순을 과잉해석하고 상대를 시험함]
```

Deity bond:
- representationRole: 감정과 행동의 불일치를 보되 확증편향과 감시를 경계하는 대표자.
- oath: “나는 새어 나온 진실을 보되, 의심만으로 사람을 판결하지 않는다.”
- acceptedDoctrine: 반복되는 증거는 중요하다 / 모순은 질문의 이유가 된다.
- resistedDoctrine: 모든 모순은 거짓말이다 / 관심이 있다면 시험으로 확인해도 된다.

Visual:
```yaml
visualVersion: visual-v1
visualDirection: sharp feminine, 긴장감 있는 시선과 즉각적인 반응이 읽히는 경량 실루엣
silhouette: 짧은 상체 레이어와 빠른 움직임이 드러나는 비대칭 하단선
palette: ['#3A1F2E', '#6C4A78', '#BFC3CC']
motifs: [잔물결, 겹친 반사, 얇은 금속선]
costumeDirection: fitted와 loose를 섞은 도시형 레이어, 손과 시선의 움직임이 잘 보이게 설계
prohibitedTropes: [전형적 츤데레 트윈테일, 과도한 femme-fatale 노출, 질투=아동성 표현]
```

## 5.3 서린

```yaml
characterId: seorin
gender: female
apparentAgeBand: 27-31
origin: 문서보존소와 연구실이 중심인 조용한 학구
worldRole: 기억을 보존하기보다 그 의미를 다시 편집하도록 돕는 해석자
deityId: deity_gyeol
deityProxyLabel: 결의 대리자
shortDescriptor: 기억의 의미를 조용히 다시 쓰게 하는 해석자
personalityTraits: [정밀함, 낮은 과장성, 높은 맥락 감각, 느린 신뢰]
values: [맥락, 해석 가능성, 기록의 비소유성]
flaws: [이미 달라진 사람도 오래된 해석으로 붙잡음]
```

Deity bond:
- representationRole: 기억의 보존보다 해석의 갱신 가능성을 강조하는 대표자.
- oath: “나는 기록을 지키되, 기록의 첫 해석을 영원한 진실로 만들지 않는다.”
- acceptedDoctrine: 흔적은 지워지지 않아도 의미는 바뀔 수 있다.
- resistedDoctrine: 최초 기록이 가장 진실하다 / 기억은 완전해야 가치가 있다.

Visual:
```yaml
visualVersion: visual-v1
visualDirection: romance coding을 낮추고 미형보다 신비·정밀함·비인습성이 먼저 읽히는 androgynous presentation
silhouette: 긴 비대칭 칼라, 좁은 상체와 넓게 떨어지는 하단 구조
palette: ['#D9DDD7', '#30343A', '#78958B']
motifs: [빈 여백, 접힌 문서, 끊긴 문장선]
costumeDirection: 연구복과 예복 사이의 구조적 레이어, 장식보다 비대칭 재단 중심
prohibitedTropes: [도서관 사서 클리셰, 안경=지성 단일 기호, 순백 성녀/빙설미인 문법]
```

## 5.4 라현

```yaml
characterId: rahyeon
gender: female
apparentAgeBand: 30-34
origin: 계약·협상·공적 의사결정이 밀집한 상업외교 구역
worldRole: 욕망과 선택의 실제 비용을 끝까지 묻는 협상자
deityId: deity_gyeon
deityProxyLabel: 견의 대리자
shortDescriptor: 선택의 대가를 숨기지 않는 성숙한 협상자
personalityTraits: [주도성, 전략성, 높은 자기통제, 위험 감각]
values: [선택의 명료성, 상호 계약, 책임 있는 욕망]
flaws: [불확실성을 직접 묻기보다 시험과 압박으로 확인하려 함]
```

Deity bond:
- representationRole: 선택과 비용을 명확히 하되 권력으로 타인의 선택을 대신하지 않는 대표자.
- oath: “나는 대가를 숨기지 않고 선택을 요구하되, 답을 강제로 만들지 않는다.”
- acceptedDoctrine: 선택에는 비용이 있다 / 권력 차이는 계약에서 드러나야 한다.
- resistedDoctrine: 감당 가능한 사람이 결정할 권리도 가진다 / 시험은 동의보다 정확하다.

Visual:
```yaml
visualVersion: visual-v1
visualDirection: mature femme, 매혹보다 통제된 권위와 선택권의 긴장이 먼저 읽힘
silhouette: 강한 허리선과 긴 코트, 안정된 삼각형 하단 실루엣
palette: ['#4A1727', '#24252A', '#B08B52']
motifs: [문턱, 봉인선, 균형추]
costumeDirection: tailored formal과 부드러운 소재를 교차해 권위와 유연성을 동시에 표현
prohibitedTropes: [도미나트릭스 클리셰, 악녀형 과장, 부=금장 장식 과잉]
```

## 5.5 미라

```yaml
characterId: mira
gender: female
apparentAgeBand: 24-28
origin: 공방·수리점·주거가 자연스럽게 섞인 제작 생활권
worldRole: 말보다 반복되는 생활 행동으로 관계를 유지하는 생활형 동행자
deityId: deity_on
deityProxyLabel: 온의 대리자
shortDescriptor: 티 내지 않고 계속 챙기는 잘생긴 생활형 동행자
personalityTraits: [실용성, 자연스러운 친밀감, 낮은 과장성, 생활 감각]
values: [지속되는 행동, 편안함, 상호 자립]
flaws: [관계를 정의해야 하는 순간을 지나치게 오래 미룸]
```

Deity bond:
- representationRole: 돌봄을 특별행사보다 일상의 반복 가능한 행동으로 만드는 대표자.
- oath: “나는 네 몫을 빼앗지 않으면서, 필요할 때 손이 닿는 자리에 있겠다.”
- acceptedDoctrine: 돌봄은 지속 가능해야 한다 / 도움은 자립을 해치지 않아야 한다.
- resistedDoctrine: 말하지 않아도 진심이면 충분하다 / 자기 희생이 깊은 돌봄의 증거다.

Visual:
```yaml
visualVersion: visual-v1
visualDirection: masc-of-center handsome female, 꾸민 티보다 자연스러운 피지컬과 생활감
silhouette: 넓은 어깨의 relaxed overshirt와 직선형 팬츠, 낮은 중심의 안정된 자세
palette: ['#385647', '#5B7185', '#E1D5C4']
motifs: [수선 자국, 공구 손잡이, 접힌 소매]
costumeDirection: 작업복에서 출발한 clean casual, 손을 자유롭게 쓰는 practical layers
prohibitedTropes: [남장여자 오해 클리셰, 과도한 보이시 캐릭터 희화화, mechanic pin-up]
```

## 5.6 태겸

```yaml
characterId: taegyeom
gender: male
apparentAgeBand: 27-31
origin: 공공시험·수련·평가 문화가 강한 훈련 구역
worldRole: 말이 아니라 반복 가능한 기준과 행동으로 사람을 평가하는 검증자
deityId: deity_gyeon
deityProxyLabel: 견의 대리자
shortDescriptor: 기준을 낮추지 않지만 인정에는 인색하지 않은 냉정한 검증자
personalityTraits: [엄격함, 일관성, 높은 실행력, 절제된 인정]
values: [책임, 반복 가능한 실력, 명확한 기준]
flaws: [망설임과 변명을 너무 빨리 무능 또는 회피로 판단함]
```

Deity bond:
- representationRole: 기준과 책임을 지키되 merit를 인간 가치 전체로 확대하지 않는 대표자.
- oath: “나는 네가 감당한 것을 보되, 실패 한 번으로 너의 전부를 판정하지 않는다.”
- acceptedDoctrine: 반복되는 행동은 기준이 된다 / 책임은 비용을 포함한다.
- resistedDoctrine: 성과가 곧 사람의 가치다 / 강한 사람은 약한 사람보다 더 결정할 권리가 있다.

Visual:
```yaml
visualVersion: visual-v1
visualDirection: cold refined male, 장식보다 날카로운 정렬과 절제된 긴장
silhouette: 곧은 수직선, 짧은 상의와 긴 하단선, 목과 손목의 정돈된 노출
palette: ['#263244', '#707985', '#E7E8EA']
motifs: [눈금, 마모된 금속, 정렬된 선]
costumeDirection: 훈련복과 formal tailoring 사이, 기능적 fastening을 디자인 포인트로 사용
prohibitedTropes: [재벌 냉미남 수트 단일화, 군복 fetish, 무표정=무감정 표현]
```

## 5.7 윤호

```yaml
characterId: yunho
gender: male
apparentAgeBand: 28-33
origin: 교육·치유·생활 인프라가 밀집한 공동체 구역
worldRole: 의지보다 환경과 루틴을 고쳐 지속 가능성을 만드는 생활 설계자
deityId: deity_on
deityProxyLabel: 온의 대리자
shortDescriptor: 무너지지 않게 생활의 구조부터 같이 고치는 다정한 설계자
personalityTraits: [다정함, 구조화 능력, 안정성, 현실 감각]
values: [지속 가능성, 회복 가능성, 부담의 가시화]
flaws: [감정을 충분히 듣기 전에 해결 구조부터 만들려 함]
```

Deity bond:
- representationRole: 도움을 시스템으로 만들되 사람을 시스템에 맞추지 않는 대표자.
- oath: “나는 네 삶을 대신 운영하지 않고, 네가 버틸 수 있는 구조를 함께 찾는다.”
- acceptedDoctrine: 돌봄은 지속 가능해야 한다 / 구조는 의지의 부담을 줄여야 한다.
- resistedDoctrine: 좋은 시스템은 개인의 예외보다 우선한다 / 해결책이 있으면 감정은 기다릴 수 있다.

Visual:
```yaml
visualVersion: visual-v1
visualDirection: gentle nerd male, 편안함과 전문성이 동시에 읽히는 생활형 지성
silhouette: 둥근 상체 레이어, 가벼운 가디건/재킷, 안정된 중간 중심
palette: ['#6B7258', '#7B5C45', '#E8DFD1']
motifs: [격자 노트, 작은 클립, 정리된 케이블]
costumeDirection: 실제 활동 가능한 knit/utility layers, 안경은 final visual canon으로 채택 제안
prohibitedTropes: [안경 벗으면 미남 반전, 의사 가운 단일화, 돌봄=모성적 남성 희화화]
```

## 5.8 도윤

```yaml
characterId: doyun
gender: male
apparentAgeBand: 24-28
origin: 도시 규칙의 경계와 사각지대에 형성된 비공식 상권
worldRole: 굳어진 규칙에 작은 실험과 우회로를 만들어 선택지를 늘리는 공범형 변칙자
deityId: deity_teum
deityProxyLabel: 틈의 대리자
shortDescriptor: 규칙 사이에 선택할 틈을 만드는 능글맞은 변칙자
personalityTraits: [기민함, 장난기, 높은 상황 적응력, 선택적 진지함]
values: [자유, 수정 가능성, 자발적 공범감]
flaws: [진심과 책임을 농담과 테스트 뒤에 숨김]
```

Deity bond:
- representationRole: 막힌 규칙에 가능성을 만들되 결과 책임을 지우지 않는 대표자.
- oath: “나는 닫힌 문에 틈을 만들되, 그 문을 지난 뒤의 결과까지 농담으로 없애지 않는다.”
- acceptedDoctrine: 규칙은 수정 가능해야 한다 / 금지에는 반례를 시험할 공간이 필요하다.
- resistedDoctrine: 자유로운 사람은 약속에 덜 묶여도 된다 / 결과는 선택한 사람만의 문제다.

Visual:
```yaml
visualVersion: visual-v1
visualDirection: agile rogue male, 가벼운 비대칭과 숨은 디테일로 공범감을 형성
silhouette: 한쪽으로 기울어진 레이어, 짧은 재킷과 유연한 하단, 빠른 방향 전환이 읽힘
palette: ['#234E70', '#B15F3E', '#25262A']
motifs: [열린 잠금장치, 접힌 지도, 숨은 포켓]
costumeDirection: urban utility와 playful tailoring 혼합, 가까이 볼수록 디테일이 발견되는 구조
prohibitedTropes: [도둑 캐릭터 클리셰, 광대형 장난꾸러기, 무책임한 바람둥이 단일화]
```

## 5.9 백헌

```yaml
characterId: baekheon
gender: male
apparentAgeBand: 38-44
origin: 재난·분쟁 대응 거점으로 성장한 외곽 관문 생활권
worldRole: 위험과 책임의 범위를 정리하고 실제 실행으로 보호하는 베테랑 조정자
deityId: deity_gyeon
deityProxyLabel: 견의 대리자
shortDescriptor: 흔들리지 않되 남의 선택까지 대신하려는 위험을 가진 베테랑
personalityTraits: [침착함, 실행력, 넓은 책임 감각, 경험에서 오는 절제]
values: [보호, 감당, 명확한 책임 범위]
flaws: [책임을 대신 짊어지며 타인의 선택까지 결정하려 함]
```

Deity bond:
- representationRole: 큰 위험의 책임을 감당하되 보호와 지배의 경계를 지키는 대표자.
- oath: “나는 위험 앞에서 물러서지 않되, 보호한다는 이유로 네 결정을 빼앗지 않는다.”
- acceptedDoctrine: 책임은 실제 비용을 감당해야 한다 / 보호에는 실행력이 필요하다.
- resistedDoctrine: 더 많이 감당할 수 있는 사람이 더 많이 결정해야 한다 / 불확실성을 보이는 것은 책임자의 약점이다.

Visual:
```yaml
visualVersion: visual-v1
visualDirection: mature veteran male, 미형보다 경험·체격·안정된 권위가 먼저 읽힘
silhouette: 넓은 상체, 긴 외투, 무게 중심이 낮고 움직임이 적어도 공간을 점유하는 형태
palette: ['#4B211F', '#3A3028', '#A8875A']
motifs: [마모된 버팀대, 수선된 가죽, 오래된 문턱]
costumeDirection: formal보다 오래 사용한 고급 실용복, 장비 흔적은 있으나 군복화하지 않음
prohibitedTropes: [마피아 보스, 군인 fetish, daddy 밈 과잉, 흉터=경험 단일 기호]
```

---

# 6. Roster diversity self-review

## Gender / presentation

```text
female canon proposal: 세연 / 여울 / 서린 / 라현 / 미라
male canon proposal: 태겸 / 윤호 / 도윤 / 백헌

presentation spread:
세연 = soft-neutral classic
여울 = sharp feminine
서린 = low-romance androgynous
라현 = mature femme
미라 = masc-of-center handsome
태겸 = cold refined male
윤호 = gentle nerd male
도윤 = agile rogue male
백헌 = mature veteran male
```

## Perceived age

22대 초반부터 40대 초반까지 분산한다. 백헌이 mature-presence requirement를 명확히 담당하지만 기능 archetype으로 고정하지 않는다.

## Low-romance / mystery-first

서린은 **romance coding보다 정밀함·신비·비인습성이 먼저 읽히도록** 설계한다.

## Silhouette separation

- 세연: long soft vertical
- 여울: short asymmetric kinetic
- 서린: narrow upper / wide asymmetric lower
- 라현: tailored long triangular
- 미라: broad relaxed straight
- 태겸: sharp narrow vertical
- 윤호: rounded layered middle-center
- 도윤: tilted agile asymmetric
- 백헌: broad heavy low-center

같은 silhouette pair가 없도록 의도했다.

## Palette collision check

주조색과 금속/중립색 조합이 반복되지 않도록 분리했다. 실제 asset 제작 단계에서 WCAG/디스플레이/배경 대비 검증은 별도 수행한다.

---

# 7. Deity-to-Character independence check

같은 Deity를 공유해도 Character identity는 다르다.

```text
deity_gyeol → 세연 / 서린
  세연: continuity witness, 관계 종료를 늦추는 결함
  서린: reinterpretation, 오래된 해석에 고정하는 결함

deity_gyeon → 라현 / 태겸 / 백헌
  라현: choice/cost negotiation
  태겸: standards/merit
  백헌: protection/responsibility

deity_on → 미라 / 윤호
  미라: everyday action and unspoken closeness
  윤호: sustainable structure and scaffolding

deity_jeung → 여울
  contradiction/evidence without surveillance

deity_teum → 도윤
  possibility/revision without irresponsibility
```

이는 `Deity -> personality` 단순 매핑을 피한다.

---

# 8. Product Owner decision requested

승인 단위는 다음과 같이 분리할 수 있다.

1. canonical IDs 9개
2. gender + apparent age + origin + worldRole
3. Deity system 5개 count/hierarchy/mandates
4. per-Character Deity assignment/bond/oath
5. top-level descriptor/traits/values/flaw representation
6. final visual profiles

전체 승인 문구 예:

```text
Character Immutable Identity / Deity / Visual Proposal v1 전체 APPROVE.
```

부분 수정이 필요하면 Character/section 단위로 `REVISE`할 수 있다.

## 9. Gate result

현재:

```text
Detailed semantic baseline              APPROVED
Immutable identity/deity/visual values  PROPOSAL / PENDING
Runtime behavior/capability values      NOT YET PROPOSED
Assets/provenance                       NOT READY
Production publication                  BLOCKED
```
