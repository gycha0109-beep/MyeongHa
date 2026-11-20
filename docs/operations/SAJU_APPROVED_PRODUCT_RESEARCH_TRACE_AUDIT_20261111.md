# 승인 사주 상품별 기존 연구 → 판정 규칙 → 출력 연결 감사 (2026-11-11)

> 성격: 기존 연구 전수 **상품 매핑 감사**. 새 명리 판정을 발명하거나 기존 연구를 Official로 승격하는 문서가 아니다. 이 파일만으로 실제 500명 재실행, 승인, 판매 준비 완료가 성립하지 않는다.
> 소스 비교 기준: Saju #2745 (`de90feb`, 7단계 품질), #2762 (`49af6ce`, 연·월), #2763 (`17a723d`, 두 명식), MyeongHa #3159 (`d72a243`, 카탈로그/Reader 샘플), #3174 (`6fe56d5`, 구매·발급 후보). 서로 다른 PR의 변경이 한 운영 브랜치에 통합됐다고 간주하지 않는다.

## 1. 분류 원칙

- **R(연구/판정 공백)**: 상품이 요구하는 명리 결론에 해당하는 규칙·방법론·적용 범위가 현재 근거로 성립하지 않음. 코드 연결만으로 해결 불가.
- **L(연결/공식화 공백)**: 기존 계산·Claim/Rule/Source·한국어 풀이 또는 연구용 실행은 있으나 검증된 Official Product Reading/증명/구매 발급/Reader 소비자 경로와 결속되지 않음.
- **Q(출력/품질 공백)**: 기존 근거는 있으나 특정 명식의 선정·표현 누락, 중복, 의미 구별, 모호성 노출, 실제 고객 가치가 미검증 또는 실패.
- **C(구성만)**: 별도의 명리 판단을 만들지 않고 기존 단품 결과를 조합; 각 구성의 R/L/Q가 승계됨.
- 연구용 상태 `complete`와 상품 판매 가능 상태는 다르다. 일치하는 규칙·문헌이 있어도 허가되지 않은 해석은 판매 근거가 아니다.

## 2. 승인 14개 구매 항목 전수 연결표

| 승인 항목 | 기존 명리 근거·판정 코드 | 한국어 결과/소비 경로 | 판정 |
| --- | --- | --- | --- |
| 1. 직업·커리어운 | T5 원국 십신 → 직업 T8, `career-natal-multifactor-report.ts`; 실제 위치·Rule/Source 기록 | 동일 보고서의 한국어 Reading guide 및 `natal-five-domain-multifactor-reader.ts`; 4종 Preview HTTP 샘플 존재 | **L+Q**. 자료·풀이 있음; Official 출처 검증/Reader 발급과 일부 부분풀이 품질은 별도 |
| 2. 사업운 | T5 → 사업 T8, `business-natal-multifactor-report.ts` | 한국어 report/guide 및 5분야 Reader; Preview 샘플 존재 | **L+Q**. 명식별 근거 있음; 일부 T8 부재 시 T5 부분풀이 연결·출력 점검 필요 |
| 3. 재물운 | `wealth-natal-multifactor-candidate.ts`의 출처 있는 복합 T8과 T5; `wealth-natal-multifactor-report.ts` | 한국어 report/guide 및 5분야 Reader; Preview 샘플 존재 | **L+Q**. 고정 500건 T8 389→484, 나머지 16은 직접 재성 T5 부족으로 T8 근거를 창작하지 않음 |
| 4. 나의 인연·관계운 | T5 → 본인 관계 T8, `relationship-natal-multifactor-report.ts`; **두 사람 T10과 다름** | 한국어 report/guide 및 5분야 Reader; Preview 샘플 존재 | **L+Q**. 개인별 관계 풀이 근거 있음; 실제 상담 품질/공식 출처 결속 별도 |
| 5. 올해의 사주 | `general-annual-reading-candidate.ts` T9 Rule/Methodology/Source, `general-annual-exploration-report.ts` 및 narrative profile | `temporal-research-menu-reading.ts`; #2762 보호된 Source 실행은 실제 연도·입춘 구간/원국/선택 T9 신호를 서명된 **연구 자료**로 전달 | **L+Q**. 기존 규칙·한국어 출력 존재. 공식 연운 종합판정/시기별 허용 범위와 고객 출처 지도는 미확정 |
| 6. 이번 달의 사주 | `general-monthly-reading-candidate.ts` T9 Rule/Methodology/Source, `general-monthly-exploration-report.ts` | `temporal-research-menu-reading.ts`; #2762는 요청 월과 두 절입 구간의 실제 근거·한국어 신호를 보호 경로에 연결 | **L+Q**. 기존 규칙·한국어 출력 존재. 공식 월운 판정/실제 Reader 전달은 미완료 |
| 7. 첫 상대 관계 비교 | `family-pair-source-scope-handoff.ts`의 두 명식 구조 관계와 R068/R069 원국 맥락; #2763 `compatibility-marital-day-branch-candidate.ts`의 **일지 육합·충 한정** 문헌 후보 | `compatibility-two-birth-research-runtime.ts` 및 비공개 근거 조회; 고객용 두 사람 T10 종합 해석 없음 | **R+L**. 계산과 부분 인자 있음. 두 명식 상호작용에 대한 근거·충돌 조정·종합 T10 권위 미성립 |
| 8. 두 번째 이후 상대 관계 비교 | 7번과 동일; 대상 명식·권한만 별도로 묶음 | 독립 상대별 Reading/권한은 #3174 구매·발급 후보 | **R+L**. 별도의 새 연구 상품은 아니나 7번 T10 결손을 그대로 승계 |
| 9. 나의 인연·관계운 + 첫 비교 | 4번 T8 + 7번 두 명식 근거 | 두 결과는 각각 판정/권한을 가져야 하며 단순 병치는 T10 아님 | **C(R+L+Q 승계)** |
| 10. 커리어·경제 | 1+2+3의 기존 출처 기반 T5/T8 | 세 독립 Product Reading 결과 조합 | **C(L+Q 승계)** |
| 11. 전체 사주 기본 | 1+2+3+4 (과거 별도 `general` 유료 메뉴 아님) | 네 독립 Product Reading 결과 조합 | **C(L+Q 승계)** |
| 12. 전체 사주 + 올해 | 11+5 | 네 원국 결과 + 구매 시 고정 연도 결과 | **C(L+Q 승계)** |
| 13. 전체 사주 + 이번 달 | 11+6 | 네 원국 결과 + 구매 시 고정 월 결과 | **C(L+Q 승계)** |
| 14. 전체 사주 + 올해 + 이번 달 | 11+5+6 | 구성된 여섯 독립 결과를 재사용 | **C(L+Q 승계)** |

**판정 제한:** 이 표는 확인된 PR/소스 및 과거 실행 기록의 *상품별 추적 가능성*을 정리한 것이다. 이번 감사에서 운영 API를 호출하거나 14개 구매 항목을 새로 재실행하지 않았다. 따라서 L/Q 해소 완료와 실제 개별 고객 품질 합격을 뜻하지 않는다.

## 3. 실제 근거의 추적 경로 및 증거

### 원국 네 단품

1. 기존 계산 `CanonicalSajuSnapshot` → 출처 있는 원국 T5 Claim·Rule·Methodology/Source → 분야별 T8 선정. T8 부족 시 기존 T5는 **부분 관찰**로만 노출.
2. `career-natal-multifactor-report.ts`, `business-natal-multifactor-report.ts`, `wealth-natal-multifactor-report.ts`, `relationship-natal-multifactor-report.ts`에서 실제 명식 위치, 선택된 Claim, Rule, 출처를 한국어 보고서에 연결.
3. `natal-five-domain-multifactor-reader.ts`에서 분야별 기존 연구의 문단·한계·근거를 표시. #2745 워크로그 작업 94~101은 T8이 없는 경우 이미 존재하던 T5를 화면에서 누락하거나 동일 문장을 중복 출력하는 **소비 경로 결함**을 실측·수정한 기록.
4. #3159는 실제 Saju Preview HTTP로 원국 네 항목을 확인했지만, 네 개의 짧은 Reader 재서술을 **유료 품질 불합격**으로 판정. 특히 응답 문장별 구체적인 계산 위치/출처·모호성 지도가 부족하다고 기록함. 이는 기존 계산/연구의 부재로 치환해서는 안 됨.

### 재물 500명 수치의 정확한 의미

- #2745의 고정 500건 T8 문단 선택은 **389 → 484건**, 미선택 **111 → 16건**. 이는 특정 T8의 근거 선택 수치이지 16명의 원국 계산 실패 또는 사주 서비스 전반의 연구 미존재를 뜻하지 않음.
- 미선택 16건은 해당 출처·직접 T5 근거의 부족을 구분하고 기존 T5 부분 풀이 경로를 보존. 임의로 새 T8 Claim을 만들어 분모를 채우지 않음.
- 최초 500명×8개 메뉴 감사에는 **두 명식 비교·배우자·가족·고민형**이 포함되지 않았고, 임의 birth-time-unknown·음력·윤달도 기본 고정 표본에 포함되지 않았음.

### 연·월운

- 연구 판정: `general-annual-reading-candidate.ts`, `general-monthly-reading-candidate.ts`의 T9 등록 의미와 실제 선택. 출력: 양쪽 `...exploration-report.ts`, `temporal-research-menu-reading.ts`, Narrative Profile.
- #2745는 T9 선택의 **의미 반복**과 실제 원국 T5 차이를 구분하며 500명 감사를 진행. 연운 131종/월운 128종의 실행 의미 서명은 품질 합격률이 아님.
- #2762는 실제 입춘·절입 경계, 구매한 서울 시기, 원국·대운 일부 관측, 문장별 Rule/Source를 서명된 연구 신호에 결속. 다만 명시적으로 Preview/HELD이고 허용되지 않은 현대적 사건·시기 추론을 공식화하지 않음.
- 다음 작업은 **기존 T9를 재연구하는 것**이 아니라 이미 선택한 T9/원국 관측을 공식 해석 단위와 Reader 문장별 근거로 정확히 연결할 수 있는지 검사하는 것. 그때 기존 근거가 도달하지 않는 구체적인 결론만 R로 분리.

### 두 사람의 관계 비교

- #2763의 근거: 실제 두 명식의 천간합·지지육합·지지충 구조적 매칭, 각 위치와 소스 해시. 직접 해석 후보는 Nam/Kim(2018)의 일지 육합·충 인자만으로 한정되고 현재 미검토.
- `family-pair-source-scope-handoff.ts`는 `EXACT_CROSS_CHART_T10_RULE_WITH_DIRECT_PAIRWISE_SOURCE_NOT_ESTABLISHED`, `TWO_PERSON_METHOD_CONTEXT_AND_CONFLICT_SETTLEMENT_NOT_ESTABLISHED`, `pairwiseT10Admitted: false`를 명시. 이는 다른 영역과 달리 **구체적인 연구·판정 범위의 미완성** 증거.
- R068(본인 관계), R069(배우자 관련), R070(가족)의 원국 연구는 이미 존재하지만 각각을 합쳐 두 사람의 인과적 궁합 결과로 승격하면 안 됨. 검토된 두 명식 T10 방법론 없이 서비스 전개·Reader 화법만 붙이는 것은 허용되지 않음.

## 4. 후속 처리 대상 — 연구 추가와 연결 수정 분리

| 분류 | 적용 대상 | 선행해서 할 구체적 작업 | 완료 증거 |
| --- | --- | --- | --- |
| **L-1** | 원국 4개·연·월 | 기존 Preview/Research 실행의 Claim→Rule→Source→명식 위치→한국어 문단 매핑을 각 실제 선택 단위마다 검증된 공식 응답 계약/발급 검증기에 보존 | 실제 한 건의 source-approved Product Reading과 동일 근거를 소비한 Reader 결과. 단순 HTTP 200 또는 구조 검사는 불충분 |
| **Q-1** | 원국 4개 | #2745에서 확인된 미선택 T8과 원본 T5 누락·중복·모호성 표현을 기존 500건 및 경계 명식으로 추적. 4종 Preview 샘플의 추상적 문장을 실제 위치·조건 근거와 대조 | 실제 출력·명식·선택 규칙·출처·다른 명식과의 의미 차이·보류 사유를 함께 보존 |
| **L/Q-2** | 연운·월운 | #2762 보호 T9·입춘/절입·원국 신호를 구매 시기와 연결하고, 실제 출력과 단위별 source의 동일성을 검증 | 선택 시기와 출처 일치, 구간별 실제 한국어 해석, 허용 범위 밖 단정 없음 |
| **R-1** | 관계 비교 | 기존 R068/R069/R070·구조 매칭과 #2763 일지 후보의 적용 가능 범위를 대조해 **두 사람 사이의 실제 T10 직접 출처·방법론과 충돌 조정**이 누락된 결론만 특정. 기존 방법론으로 채울 수 없는 칸은 추가 문헌 검토 | 두 명식의 실제 T10 단위마다 독립 출처/계산 위치/허용 해석/한계/반례 검토. 없으면 그 결론만 보류 |
| **C-1** | 패키지 5종·관계 복합 | 구성 단품의 실제 Reading/Grant를 각각 재사용. 중복 문장/권한과 타인 명식의 혼선을 별도 확인 | 모든 구성 풀이가 누락 없이 같은 명식/시기/상대방에 귀속되고, 없는 종합판정은 생성하지 않음 |

## 5. 이번 작업의 범위와 미수행 사항

- **수행**: 승인 상품 14개 항목별 연구·규칙·출력 코드/PR 대조, 기존 500건 성과와 제외 대상 분리, 연구 R와 연결 L·품질 Q 및 조합 C를 개별 판정.
- **미수행**: GitHub 원격 CI 재실행, 500명 신규 추론 실행, 실제 고객 데이터/운영 DB 조회, 실모델 생성·실결제, Production 공식 권한 승격 또는 배포. 이 감사는 소스 리뷰이며 새 실측 결과가 아니다.
- **참조 정책**: 2026-11-06 승인 카탈로그(Saju `docs/product/approved-catalog-and-bundles-2026-11-06.md`); 기존 Saju `docs/ROADMAP.md` 7단계 품질과 #2745 워크로그; Saju #2762/#2763; MyeongHa #3159/#3174. Saju의 7단계 로드맵을 변경하거나 별도 품질 단계를 임의 추가하지 않는다.

## 6. 증거 링크

- [Saju 품질 개선 #2745](https://github.com/gycha0109-beep/Saju/pull/2745) — 고정 500명, 원국·연월 T5/T8/T9, 누락/중복/의미 검증 기록.
- [Saju 시간 근거 #2762](https://github.com/gycha0109-beep/Saju/pull/2762) — 실제 연도·월/절입, 보호된 Source 서명과 연구 신호.
- [Saju 두 명식 근거 #2763](https://github.com/gycha0109-beep/Saju/pull/2763) — 구조적 상호작용과 일지 후보, T10 보류.
- [Saju 승인 카탈로그](https://github.com/gycha0109-beep/Saju/blob/feat/saju/reading-coverage-seven-stage/docs/product/approved-catalog-and-bundles-2026-11-06.md).
- [MyeongHa 상품·Reader 초기 대조 #3159](https://github.com/gycha0109-beep/MyeongHa/pull/3159) — 4종 실제 Preview 샘플과 유료 품질 불합격 근거.
- [MyeongHa 구매·권한·발급 #3174](https://github.com/gycha0109-beep/MyeongHa/pull/3174) — 14개 구매 항목 스코프, 비공개 발급/Reader·결제 경계.

**현재 결론**: 원국 단품·연월운을 근거 없이 ‘연구 부족’으로 통칭할 수 없다. 기존 연구 실행/한국어 출력이 확인되며 주요 미해결은 공식 소비 연결과 실제 읽기 품질이다. 두 명식 관계 비교에는 명시적인 T10 직접 종합 해석 권위 공백이 있다. 패키지는 이 결과를 그대로 승계한다.
