# MyeongHa UX · Reading · Reader Knowledge Specification v1.1

> Status: **PRODUCT / UX AUTHORITY — REPOSITORY IMPLEMENTATION COPY**  
> Scope: Paid Reading, Reader Experience, Records, Reader Knowledge Isolation, Additional Reader Interpretation  
> Imported implementation basis: 2026-09-20  
> Production activation: **HOLD**

## 1. Core model

```text
Saju Engine
→ one official Reading Source Truth
→ selected Reader Interpretation / Access
→ Reader-specific delivery and follow-up conversation
→ official result stored in Records
```

The official Reading is Reader-independent. A Reader may reorder, explain, emphasize, simplify, use metaphors, and ask follow-up questions, but may not create new Saju facts, change official conclusions, use an unpurchased Reading scope, or borrow another Reader's access.

## 2. First purchase

```text
Standard Reading Product
→ first Reader selection
→ verified purchase / exact Grant
→ official Reading creation authority
→ selected Reader Interpretation / Access
→ Reader Reading Scene
→ follow-up conversation
```

The Reading row created for the official result must not encode the selected Reader as its Source Truth identity.

## 3. Additional Reader Interpretation

A second Reader for the same exact reusable official Reading is not a second official Saju analysis.

```text
existing committed official Reading
→ Additional Reader Interpretation purchase
→ exact new Reader access Grant
→ new Reader Interpretation identity
→ Reader-specific scene / explanation
→ follow-up conversation
```

Additional Reader purchase must not increment official Reading count.

Whether a stored Reading is reusable is decided server-side from exact authority including subject, Product/topic, Reading scope, immutable Birth revision, Product spec version, and domain capability version. A client-provided `readingId` is never sufficient.

## 4. Reader Knowledge isolation

Logical authority:

```text
subject
└─ official Reading A
   ├─ Reader Se-yeon: access O
   ├─ Reader Baek-heon: access O
   └─ Reader Yeo-ul: access X
```

Character Chat may retrieve only official Readings for which that exact Character currently has valid Reader access.

```text
current Character
+
active exact Reader access grants
→ allowed official Reading metadata/source refs
```

Aggregate entitlement, another Character's grant, general Memory, or a client-supplied Reader id must not widen this set.

## 5. Records authority

Records keep one official Reading entry.

Conceptual UI:

```text
재물 사주
2026.09.20

[공식 보고서 보기]

이 사주를 본 대리자
세연 ✓
백헌 ✓
여울 +
```

Per Reader, Records may expose “해석 다시 보기 / 대화하기”. A Reader without access may expose an “이 대리자에게도 들어보기” CTA only after an authorized Offer exists.

## 6. Official Reading vs Reader Interpretation

```text
Official Reading
= Saju Source Truth

Reader Interpretation
= presentation / explanation artifact
```

A stored Reader Interpretation never becomes a higher semantic authority and must not be reused as if it were the official Saju result.

## 7. Refund / revoke

Reader access is independent.

Example:

```text
official Reading: keep
Reader A exact purchase Grant: revoked
Reader B exact purchase Grant: active

result:
Reader A access = closed
Reader B access = open
official Reading = preserved
```

Historical immutable purchase/Reading provenance may remain under retention/deletion policy even when effective Reader access closes.

## 8. General Memory separation

Character Memory and official Reading Knowledge are different authorities.

```text
Character Memory
→ relational/conversational recall

Official Reading Knowledge
→ exact Reader-access-gated Saju Source Truth
```

Memory must not be used to reconstruct or bypass an unpurchased official Reading.

## 9. Commerce boundary

The first-Reading list-price decision already documented elsewhere does not activate checkout. The UX concept of a lower-priced Additional Reader Interpretation is a separate future Offer/Charge Terms decision.

This specification does not activate:

```text
Product Offer
Charge Terms
PortOne checkout
Entitlement fulfillment
Production Saju transport
Production Saju semantic authority
```

## 10. Implementation mapping

Current v2 target authority:

```text
standard_reading_delivery_policies
standard_reading_official_bindings
standard_reading_reader_interpretations
standard_reading_reader_access_grants

cmd_bind_standard_reading_access_v2
internal_qry_character_standard_reading_access_v1
internal_qry_standard_reading_artifact_source_v2
```

Legacy #1090/#1099 tables/functions remain immutable historical provenance and are not the target identity model for new Standard Reading runtime.

## 11. Required invariants

```text
same exact official Source Truth + different Reader
→ same official Reading id / response hash

additional Reader purchase
→ no new official Reading

unpurchased Reader
→ no Reader Knowledge

Reader A revoke
→ Reader A closed only

different subject
→ fail closed

same purchase replay
→ no duplicate Interpretation/access

raw stored ProductReadingResponse
→ internal source only until separately authorized
```
