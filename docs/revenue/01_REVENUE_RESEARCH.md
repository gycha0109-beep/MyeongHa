# 명하 Revenue Research — Market / Competitor Baseline v0.1

> Product: **명하 / MyeongHa**  
> Track: Revenue Architecture / Unit Economics / Monetization Strategy  
> Status: **Research evidence — NOT product authority**  
> Research snapshot: **2026-08-30 KST**  
> Repository baseline: `main@6a0ad6487de57faa0e65b330d7a5fea89203b61a`

---

## 0. 문서 역할

이 문서는 외부 시장·가격·비용 자료를 보존하는 research ledger다.

이 문서가 직접 결정하지 않는 것:

- 실제 무료/유료 quota
- 실제 product/entitlement mapping
- 실제 payment rail
- 실제 AI provider/model selection
- 실제 analytics runtime schema
- 실제 캐릭터 관계 변화 규칙

구현 authority는 기존 문서를 따른다.

- `docs/COST_QUOTA_ABUSE_SPEC.md`
- `docs/COMMERCE_ENTITLEMENT_SPEC.md`
- `docs/ANALYTICS_EXPERIMENT_SPEC.md`
- Character / Saju authority docs

Revenue research가 이 authority들을 우회하지 않는다.

---

# 1. 현재 연구 질문

> 명하는 어떤 Revenue Architecture를 채택해야 초기에는 살아남고, 사용자가 늘수록 경제성이 좋아지며, 캐릭터 관계 경험을 훼손하지 않으면서 장기적으로 큰 사업이 될 가능성이 가장 높은가?

최소 동시에 봐야 하는 항목:

```text
Product value
× willingness to pay
× AI variable cost
× retention
× acquisition cost
× scalability
```

---

# 2. 현재 제품에서 경제적으로 다른 5개 층

현재 명하는 하나의 상품이 아니다.

| 경제 층 | 사용자 가치 | 비용 성격 |
|---|---|---|
| Saju Product | 근거 기반 해석 / 답 / 리포트 | 계산 + narrative, 반복 재사용 가능 |
| Relationship Product | 캐릭터와 지속 관계 | 대화량에 따라 AI 비용 증가 |
| Character/IP Product | episode / scene / voice / art | 콘텐츠 제작비 + 일부 inference |
| Personal Record Product | 기억 / 현세록 / 장기 연속성 | DB/retrieval/context 비용 |
| Social/Gift Product | 궁합 / 공유 / 선물 | 낮은 marginal cost + acquisition 가능 |

핵심 가설:

> Retention layer가 반드시 Monetization layer일 필요는 없다.

즉 캐릭터 관계를 무료 retention layer로 쓰고, Saju/Decision/Compatibility에서 돈을 받을 가능성을 별도로 검증한다.

---

# 3. Companion / Character AI — 확인된 시장 패턴

## 3.1 Kindroid

확인일: 2026-08-30

공식 문서:
- https://kindroid.ai/v2/docs/subscriptions/

확인된 내용:

- Free user에게 Lite 모델 **unlimited messages** 제공.
- Premium trial/subscription은 최신 모델, 여러 Kindroid, group chat, 더 많은 selfie, custom voice 등 고비용/고가치 기능을 확장.

해석:

> 기본 관계 대화를 반드시 message meter로 팔 필요는 없다는 실제 사례.

다만 Kindroid의 gross margin, payer conversion, CAC는 공개 확인되지 않음.

---

## 3.2 Zeta

공식 자료:
- https://zeta-ai.io/en/announcements/11785
- https://zeta-ai.io/en/Announcements/9343

확인된 내용:

- Zeta Pass subscription 존재.
- 2026-08-07부터 premium model piece cost:
  - koji: 5 Pieces / turn
  - luca: 10 Pieces / turn
- 회사는 참조 정보량 증가와 안정적 서비스 제공을 가격 조정 사유로 설명.

해석:

> core relationship experience와 expensive model compute를 분리하는 구조가 실제 운영되고 있다.

주의:

- Piece당 실제 소비자 원화 비용은 판매 pack/bonus에 따라 달라질 수 있으므로 단순 `5 Piece = X원`으로 고정하지 않는다.
- Zeta 서비스 단독 gross margin은 공개자료로 확인되지 않음.

---

## 3.3 CHAI

공식 FAQ:
- https://www.chai-ai.com/faq

확인된 내용:

- Pro: $159.99/year 또는 $9.99/week.
- CHAI MAX Monthly: $90/month.
- CHAI MAX Auto: generated tokens 기준 $0.66 / 1,000 tokens.

해석:

> 매우 헤비한 AI 사용자를 subscription 하나에 완전히 흡수하지 않고 compute metering으로 분리하는 실제 사례.

주의:

- 회사 자체 모델/GPU 관련 회사 발표와 audited financial statement는 구분해야 한다.

---

# 4. Subscription App Benchmark

## RevenueCat State of Subscription Apps 2026

Source:
- https://www.revenuecat.com/state-of-subscription-apps

확인된 주요 median:

| 지표 | AI apps | Non-AI |
|---|---:|---:|
| D35 download → paid | 2.4% | 2.0% |
| Trial start | 8.5% | 5.6% |
| 30-day RLTV / payer | $18.92 | $13.59 |
| Y1 RLTV / payer | $30.16 | $21.37 |
| Monthly plan Y1 retention | 6.1% | 9.5% |
| Annual plan Y1 retention | 21.1% | 30.7% |
| Refund median | 4.2% | 3.5% |

RevenueCat summary:

> AI apps monetize earlier and generate more value per payer, but churn faster and refund more.

명하에 대한 의미:

- `AI이므로 subscription이 잘 팔린다`만으로는 부족하다.
- Relationship / Memory / Life Record가 실제 D30/D90/Y1 retention을 개선하는지 독립적으로 검증해야 한다.
- 캐릭터 시스템의 사업적 가치 = 단순 engagement가 아니라 **retention lift**로 측정해야 한다.

---

# 5. 현재 AI Model Cost Baseline

확인일: 2026-08-30

Official OpenAI references:
- https://developers.openai.com/api/docs/models/compare
- https://developers.openai.com/api/docs/models/gpt-5.6-luna
- https://developers.openai.com/api/docs/models/gpt-5.6-terra
- https://developers.openai.com/api/docs/models/gpt-5.6-sol

현재 가격 / 1M text tokens:

| Model | Input | Cached Input | Output |
|---|---:|---:|---:|
| GPT-5.6 Luna | $0.20 | $0.02 | $1.20 |
| GPT-5.6 Terra | $2.00 | $0.20 | $12.00 |
| GPT-5.6 Sol | $4.00 | $0.40 | $20.00 |

주의:

- Sol의 현재 가격은 OpenAI가 최소 2026-11-21까지 promotional pricing이라고 명시.
- 외부 가격은 언제든 바뀔 수 있으므로 production constant가 아니다.
- Revenue model은 provider/model 이름이 아니라 `effective KRW / completed turn` telemetry로 최종 판단한다.

비용 관찰:

```text
Luna input : cached input = 10 : 1
```

따라서 static persona/canon/instruction을 cache-friendly하게 유지하고, 전체 history 대신 relevant memory/context만 넣는 것이 경제적으로 매우 중요하다.

---

# 6. Infra / Payment Baseline

## 6.1 Supabase

Official pricing:
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users

2026-08-30 확인:

- Pro: $25/month.
- Auth MAU: 100,000 included.
- 초과 MAU: $0.00325 / MAU.
- Pro egress: 250GB included, 초과 $0.09/GB.

초기 해석:

> Stage 0~2에서는 Auth 자체보다 AI inference / payment fee가 unit economics의 훨씬 큰 변수일 가능성이 높다.

DB compute, storage, realtime, log drain 등의 실제 사용량은 별도 telemetry가 필요하다.

## 6.2 Web PG — Toss Payments public baseline

Source:
- https://www.tosspayments.com/about/fee

확인값:

- 신용/체크카드 일반: 3.4%
- 간편결제: 기본 3.4%, 일부 추가 수수료 가능
- 해당 페이지 표기 수수료 VAT 10% 별도
- 가입비/연관리비 존재, 계약형태에 따라 상이

실제 계약단가가 생기면 public baseline을 교체한다.

## 6.3 Apple

Source:
- https://developer.apple.com/app-store/small-business-program/

확인값:

- Small Business Program 자격 충족 시 paid apps / IAP commission 15%.
- 전년도 proceeds $1M 이하 또는 신규 개발자 등이 조건.
- 당해 proceeds가 $1M을 넘으면 이후 판매에 standard commission 적용.

실제 iOS monetization은 `P0-CM-01` 플랫폼 정책 matrix가 authority가 된다.

---

# 7. 현재 가장 강한 시장 반례

## 반례 A — `관계형 AI = 무조건 subscription-only`

거짓일 가능성이 높다.

시장에 이미 다음 조합이 존재한다.

```text
Free basic chat
+ subscription
+ premium compute / consumable
```

따라서 명하도 subscription-only를 기본 정답으로 놓지 않는다.

## 반례 B — `무료 chat = 무조건 적자`

거짓일 가능성이 높다.

cheap model + caching + bounded context로 effective cost/turn이 충분히 낮아질 수 있다.

단 실제 turns/user가 heavy-tail이면 다시 깨질 수 있으므로 평균이 아니라 P50/P90/P99 telemetry가 필요하다.

## 반례 C — `AI subscription은 retention이 강하다`

RevenueCat 2026 데이터와 반대.

AI app은 초기 monetization은 강하지만 장기 retention이 더 약했다.

따라서 명하는 캐릭터/기억/현세록의 retention lift를 별도로 증명해야 한다.

---

# 8. 아직 조사할 경쟁군

Research backlog:

### Companion
- Character.AI detailed tier/history
- Replika
- Nomi
- Talkie
- Crack
- LoveyDovey
- 2025~2026 신규 성장 companion

### Fortune / Astrology
- 포스텔러
- 헬로우봇
- 점신
- Co-Star
- Nebula
- The Pattern
- 일본 / 중국 상위 운세 앱

### Adjacent
- Love and Deepspace
- Tears of Themis
- Episode / interactive fiction
- dating apps
- meditation/wellness subscription
- counseling/coaching
- creator economy

각 조사에서 반드시 구분:

```text
공식 공개 수치
회사 발표
store price
제3자 추정
공개되지 않음
```

제3자 매출 추정을 audited fact처럼 기록하지 않는다.

---

# 9. Research Pass 1 결론

현재 가장 유력한 관찰은 다음이다.

```text
Basic relationship access
!=
Expensive compute access
!=
High-value decision / reading product
```

따라서 명하의 Revenue Architecture는 `message 하나 = credit 하나`보다 **Value Metering + Compute Metering** 쪽을 우선 검증할 가치가 높다.

그러나 이 결론은 `03_REVENUE_HYPOTHESES.md`의 가설이며 아직 production authority가 아니다.
