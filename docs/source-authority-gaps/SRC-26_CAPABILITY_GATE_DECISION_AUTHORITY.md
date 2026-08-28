# SRC-26 — Capability Gate Decision Authority

> Status: **OPEN / BLOCKING for production-authoritative effective capability decisions and complete `GET /api/capabilities`**  
> Domain: Dialogue Orchestration / Capability / Saju / Character  
> Source authority reviewed:
> - `Usecase_re_reviewed_v2(1).md`
> - `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`
> - `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`

---

## 1. Gap

Primary source defines the final server-side Capability Gate as:

```text
CharacterCapability
+ UserConsent
+ SajuDomainAvailability
+ WorldState
+ ProductPolicy
→ allowed / rejected
```

and requires Planner/LLM proposals to be revalidated by the server before executable actions are committed.

The same source concretely defines relational authority for:

- bundle-pinned `CharacterCapability`;
- current `SajuDomainAvailability` through `saju_domain_runtime`;
- character `can_initiate` for character-triggered Saju participation;
- content bundle/version provenance used by existing capability projections.

However, the primary source does **not** define executable positive authority for `UserConsent`, `WorldState`, or `ProductPolicy`, nor the deterministic composition rule that turns all Capability Gate inputs into the final `allowed / rejected` decision.

Therefore the repository cannot production-authoritatively implement a complete Capability Gate, a complete `GET /api/capabilities` effective-feature projection, or a generic Planner execution authorization result without inventing product policy. This is `SRC-26`.

## 2. Source-complete boundary

The following existing boundaries remain source-safe independently of `SRC-26`:

### Character capability components

`character_capabilities` defines bundle-pinned participation declarations including:

```text
content_bundle_id
character_id
saju_domain
role
can_initiate
capability_version
```

Existing `qry_character_bundle_capabilities_v1` may expose those declared rows.

### Saju domain runtime components

`saju_domain_runtime` defines current operational state:

```text
saju_domain
availability = available | partial | unavailable
capability_version
required_engine_version
updated_at
```

Existing `qry_saju_domain_runtime_v1` may expose that runtime state.

### Combined raw components

`qry_character_bundle_saju_runtime_components_v1` may read bundle-pinned CharacterCapability together with current SajuDomainRuntime in one DB snapshot because it does **not** return a final `allowed`, `rejected`, or deny-reason decision. Missing runtime stays NULL rather than being reinterpreted as a policy result.

### Reading-session local prerequisites

`cmd_create_reading_session_v1` may continue to enforce source-backed local prerequisites already represented in the DB, including:

- requested Saju domain must have an operational runtime row and must not be `unavailable`;
- a requested character must have the matching bundle/domain capability;
- character-triggered initiation requires `can_initiate = true`;
- content-bundle provenance for the source turn/character must remain consistent.

These checks are **necessary local prerequisites**, not evidence that the entire global Capability Gate has been evaluated.

## 3. Missing UserConsent authority

`UserConsent` appears as an input to the source Capability Gate, but the primary source does not define:

```text
normative consent keys / inventory
which capabilities require which consent
subject-scoped consent persistence model
consent state enum
consent grant/revoke command semantics
consent version or policy version
missing-consent default behavior
whether consent is global, domain-scoped, character-scoped, feature-scoped, or action-scoped
historical consent provenance required for replay/audit
```

No ERD table/registry establishes this authority.

A generic boolean, arbitrary string-key map, profile flag, or client-supplied consent object would therefore be invented semantics.

## 4. Missing WorldState gate authority

`WorldState` appears as an input to the Capability Gate and source separately defines authoritative story/episode/world state concepts. However source does not define the generic Capability Gate contract that maps world state into executable capability allow/deny decisions.

Missing authority includes at least:

```text
which world-state facts are gate inputs
which aggregate/projection is authoritative for each input
world-state capability rule keys
comparison/operator semantics
precedence against CharacterCapability / consent / product policy
behavior when a referenced world-state key is absent
versioning/provenance of the evaluated world-state rule set
whether global world availability and per-character/episode state share one policy model
```

Do not infer a generic Capability Gate from episode transition conditions or Character Unlock rules. Those domains have separate source gaps where their positive transition/effect semantics are unresolved.

## 5. Missing ProductPolicy authority

`ProductPolicy` appears as an input to the source Capability Gate, but primary source does not define a normative ProductPolicy registry or executable policy artifact.

Missing authority includes:

```text
policy key inventory
feature/action → policy mapping
plan/platform/commerce/entitlement inputs, if any
policy precedence and deny semantics
policy version identity
rollout interaction
client-platform interaction
missing-policy default behavior
policy snapshot/provenance needed for replay or audit
```

Existing entitlement projections, product offers, purchase intents, content manifests, or platform strings must not be silently promoted into a generic ProductPolicy engine.

## 6. Missing composition / decision contract

Even if the three missing inputs were later represented, primary source currently does not define the executable composition contract for:

```text
input evaluation order
AND/OR/override semantics
hard deny vs soft/partial capability
`partial` Saju runtime propagation into feature capability
missing-input fail-open vs fail-closed behavior
precedence between operational availability and product policy
precedence between user consent and content/character declarations
deny/reason taxonomy
multiple simultaneous deny reasons
stable public capability key inventory
server response schema for effective capability decisions
policy/rule version returned to clients
snapshot requirements when a command is executed under a capability decision
```

The formula establishes the **required inputs**, not a complete executable algorithm.

## 7. Affected surfaces

### Blocked by SRC-26

The following cannot be declared production-authoritative as final effective capability decisions until the gap is resolved:

```text
complete GET /api/capabilities effective feature/action allow-reject output
generic Planner → executable action Capability Gate result
any reusable `isAllowed(feature, subject, character, worldState, ...)` policy engine
any command path that claims the local DB capability checks alone satisfy the complete source Capability Gate
stable client-facing deny-reason contract derived from the unresolved gate
```

A service may still expose source-backed raw component projections, but must not label those components as the complete effective decision.

## 8. Unaffected source-complete boundaries

`SRC-26` does **not** invalidate:

```text
character_capabilities relational authority
saju_domain_runtime relational authority
qry_character_bundle_capabilities_v1
qry_saju_domain_runtime_v1
qry_character_bundle_saju_runtime_components_v1
content-bundle provenance reads
local reading-session domain availability checks
local character can_initiate checks
existing current entitlement reads
existing Character Unlock current projection reads
```

It also does not prevent a caller from failing closed when a required unresolved gate input cannot be authoritatively evaluated.

The distinction is between **reading/enforcing a source-defined prerequisite** and **claiming to compute the complete global Capability Gate**.

## 9. Relationship to other open authorities

`SRC-26` is independent from, but may compose with, other gaps:

### SRC-15 — Client/content compatibility

`SRC-15` determines compatibility semantics between client capability and content. It does not define UserConsent / WorldState / ProductPolicy or the complete global gate.

### SRC-16 — Content rollout resolver

`SRC-16` determines which content release/bundle a subject/cohort resolves to. It does not define final effective feature/action authorization.

### SRC-17 — Episode transition evaluator

Episode transition/effect semantics are not a substitute for generic WorldState gate semantics.

### SRC-18 / SRC-21 — Commerce and entitlement mutation

Product→entitlement mapping and entitlement-event application do not by themselves define ProductPolicy. Existing effective entitlement **reads** remain usable as components where a future source-approved policy explicitly references them.

### SRC-23 — Character Unlock condition/world event

Character Unlock mutation semantics are distinct from the generic Capability Gate. Current stored unlock projection can be read, but source must explicitly define whether/how it participates in a particular effective capability rule.

## 10. Pack / implementation must NOT invent

Until `SRC-26` is resolved, do not:

- create a closed `UserConsent` enum or arbitrary consent-key map from examples;
- add a generic ProductPolicy registry/schema without source approval;
- interpret arbitrary story/episode JSON as generic WorldState gate input;
- use `available && can_initiate` as the complete Capability Gate;
- infer that an active entitlement automatically means a feature is globally allowed;
- infer that missing policy/consent/world state means allow;
- invent deny-reason codes and advertise them as source-backed;
- return B71 component rows under an `allowed` or `effectiveCapability` field;
- let Planner/LLM output create new gate keys or policy rules;
- treat rollout/client compatibility rules as if they resolve the missing ProductPolicy/consent/world-state authority.

Where an execution path requires the unresolved final gate, it must remain disabled or fail closed rather than fabricate the missing rule.

## 11. Required source resolution

At minimum source authority should define:

1. normative UserConsent inventory and persistence/ownership model;
2. consent grant/revoke/current-state semantics and versioning;
3. normative WorldState inputs that may participate in capability decisions;
4. authoritative source/projection for each WorldState input;
5. normative ProductPolicy inventory/artifact model;
6. feature/action/character/domain → required gate-input mapping;
7. deterministic composition, precedence, and missing-input behavior;
8. treatment of `available | partial | unavailable` in effective feature decisions;
9. relationship to Character Unlock, entitlement, rollout, and client compatibility where relevant;
10. stable effective-capability output keys and deny/reason contract if exposed externally;
11. policy/rule version/provenance needed for audit or command snapshots;
12. behavior when a current policy version changes after an already-stored Reading/chat/action was produced.

## 12. Verification after resolution

At minimum:

- same authoritative gate inputs → deterministic same decision under same policy version;
- CharacterCapability missing → cannot execute that character/domain action;
- `can_initiate = false` → character-triggered initiation denied where applicable;
- Saju runtime `unavailable` → Saju execution denied;
- Saju runtime `partial` → only source-approved partial behavior exposed;
- required consent absent/revoked → decision follows approved consent policy;
- world-state precondition unmet → decision follows approved world policy;
- product-policy precondition unmet → decision follows approved product policy;
- multiple deny inputs resolve with approved precedence/reason contract;
- missing required gate input follows explicitly approved fail behavior;
- rollout/client incompatibility composes according to SRC-15/SRC-16 resolution rather than being silently conflated;
- current entitlement/unlock projections affect decisions only where the approved ProductPolicy/gate mapping says they do;
- Planner proposal cannot bypass server gate revalidation;
- B71 raw component projection remains unchanged and does not synthesize a final decision;
- executed command provenance records the approved policy/capability version where source requires replay/audit determinism.
