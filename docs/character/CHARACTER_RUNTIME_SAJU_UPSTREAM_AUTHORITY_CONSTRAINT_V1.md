# Character Runtime Saju Upstream Authority Constraint v1

> 상태: **NORMATIVE CONSTRAINT ON PROPOSAL / NOT PRODUCTION PUBLICATION**  
> applies to: `CHARACTER_RUNTIME_AUTHORING_PROPOSAL_V1.md` §5 / §16 and all Character `sajuProfile` candidates  
> authority sync source: `docs/SAJU_PRODUCT_INTERPRETATION_INVENTORY_V1.md` at main `c46799277261da35bfc39f199907654c52d1a5bc`

## 1. Why this constraint exists

Current MyeongHa authority inventory explicitly records:

```text
GENERAL_NATAL_PRODUCTION_AUTHORITY = BLOCKED
Production methodology authority   = NO
Production rule authority          = NO
Production interpretation pack     = NO
Decision                           = NO_BUILD
```

It also establishes that General Natal semantics must preserve the exact upstream source condition and must not promote broad whole-chart Ten-God presence directly into consumer personality/work/money/relationship claims.

Therefore Character runtime authoring cannot create, imply, or restore semantic authority that the upstream Saju domain does not possess.

## 2. Normative interpretation of Character capability fields

For this proposal package:

```text
CharacterCapabilityContent.role
CharacterCapabilityContent.canInitiate
CharacterSajuProfileContent
CharacterSajuSafeFramingCatalogV1
```

mean only:

```text
presentation / questioning / routing behavior
WITHIN an already-authorized upstream Saju execution boundary
```

They never mean:

```text
permission to execute a blocked Saju product/domain
permission to promote research methodology/rules
permission to synthesize semantics not authorized upstream
permission to convert raw Ten-God presence into General Natal conclusions
permission to bypass ReviewAttestation / registry / claim-schema gates
```

## 3. `general` domain clarification

The §5 candidate matrix may assign `general` as `primary`, `secondary`, or `commentary` for Character differentiation.

That assignment is **latent routing metadata only** while General Natal production authority is blocked.

Even where §16 proposes:

```text
primary → canInitiate=true
```

runtime eligibility must be interpreted as:

```text
canInitiateEffective =
  characterCapability.canInitiate
  AND upstreamDomainIsProductionAuthorized
  AND requiredMethodologyRulePackIsAuthorized
  AND current product/release entitlement allows execution
```

Accordingly, with the current #554 authority state:

```text
General Natal upstream production authorization = false
→ effective General Natal initiation = false
```

No Character can make it true.

## 4. Semantic precedence

Precedence for Saju-bearing Character output is:

```text
upstream Saju methodology/rule/claim authority
> product/release execution authority
> Character capability routing
> Character persona/speech/safe-framing presentation
```

If upstream evidence is insufficient or the methodology is blocked, the Character must not fill the gap with persona, symbolism, warmth, decisiveness, relationship context, or remembered user facts.

## 5. General Natal-specific prohibitions

Until the General Natal authority inventory is closed, Character output must not use Character style to present these as production-authorized General Natal conclusions:

```text
generic whole-chart Ten-God family presence
→ personality certainty
→ aptitude certainty
→ work/career conclusion
→ money/wealth conclusion
→ relationship conclusion
```

A source citation alone does not repair an over-broad producer condition.

## 6. Safe-framing relationship

The fixed safe-framing candidate strings in the runtime authoring proposal are **non-semantic wrappers**. They can constrain tone and uncertainty language, but cannot validate or authorize the underlying interpretation.

```text
safe-framing PASS
!= semantic authority PASS
```

## 7. Decision-gate amendment

Any Product Owner approval of the runtime authoring proposal package approves Character differentiation values **subject to this upstream authority constraint**.

It does not approve General Natal semantics or make General Natal saleable.

## 8. Current result

```text
Character runtime Saju differentiation proposal   REVIEWABLE
General Natal methodology/rule authority          BLOCKED
General Natal effective Character initiation      BLOCKED
Character safe-framing as semantic substitute     FORBIDDEN
Production Character publication                  STILL SEPARATE GATE
```
