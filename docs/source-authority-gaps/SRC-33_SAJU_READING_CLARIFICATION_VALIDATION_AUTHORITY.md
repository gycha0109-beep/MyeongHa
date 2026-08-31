# SRC-33 — Saju Reading Product Response / Clarification Answer Validation Authority

> Status: **OPEN / BLOCKING for public Reading clarification input and product-semantic Saju finalize validation**  
> Domain: Saju / Reading / Clarification / Product Contract  
> Source authority reviewed:
> - `Usecase_re_reviewed_v2(1).md`
> - `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`
> - `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`
>
> Related boundaries:
> - `P0-SA-01` real Saju adapter / repository / transport deployment choice
> - `SRC-08` Saju Engine public host contract / conformance authority
> - `SRC-09` Saju grounding / evidence contract authority
>
> This gap is narrower than the transport/host decisions above. It covers the missing **positive application-layer validation contract** for the ProductReadingResponse and user clarification-answer bodies that MyeongHa must accept as authoritative product data.

---

## 1. Gap

Primary Source defines a governed Reading lifecycle in which a Saju ProductResponse may require clarification and the user's clarification produces a **new immutable logical Reading attempt** in the same Reading Session rather than overwriting the prior result.

Primary Source also requires stored ProductReadingResponse and request snapshots to be **validated** product projections.

However, the reviewed Primary Source does not provide the complete closed, versioned positive schemas and validation rules needed to implement either of these application boundaries authoritatively:

```text
Saju result -> validated ProductReadingResponse
user clarification body -> validated ClarificationAnswerV1 / canonical Product Request continuation
```

A relational `jsonb` slot, a UX example, or the existence of a persistence command does not define those body contracts.

Therefore MyeongHa must fail closed instead of accepting arbitrary JSON or inventing a validator from examples.

---

## 2. What Primary Source already fixes

### 2.1 Clarification is a new logical Reading attempt

The Reading model distinguishes user-level clarification attempts from transient provider retries.

Source-backed lifecycle:

```text
Reading Session S / logical attempt N
-> validated ProductResponse requires clarification

user supplies a governed clarification answer
-> Reading Session S / logical attempt N+1
-> parent_reading_id = prior current Reading
-> prior Reading / ProductResponse remains immutable
```

The Reading Session keeps the logical clarification chain while preserving historical attempts.

### 2.2 Reading Session pins immutable input authority

The session pins the relevant immutable Birth revision(s) and Saju domain/capability context. A clarification continuation does not silently reinterpret the session against newly edited Birth data.

If the authoritative current Birth revision no longer matches the pinned session where the contract requires freshness, the continuation is stale rather than silently rebased.

### 2.3 Request provenance is validated and replayable

The Reading persistence envelope records:

```text
request_idempotency_key
request_hash
request_contract_version
request_snapshot_jsonb
parent_reading_id
attempt_no
```

The request snapshot is a **validated/minimized Product Request projection**. Clarification-selected structured values may be represented there when source-approved, but the `jsonb` column itself is not authority for arbitrary keys or values.

### 2.4 Product response provenance is immutable and validated

`reading_refs` stores an immutable product response snapshot/provenance including:

```text
reading_contract_version
product_response_state
required_action_jsonb
clarifications_jsonb
calculation_ambiguity_jsonb
response_snapshot_jsonb
response_hash
```

Primary Source requires `response_snapshot_jsonb` to contain a validated ProductReadingResponse, not an internal Saju Rule Registry / Claim Graph dump.

Transport success alone is not equivalent to consumer semantic completion.

### 2.5 Existing DB clarification command is a persistence authority only

`public.cmd_append_reading_clarification_v1(...)` already provides a bounded persistence/concurrency boundary for an **already-validated canonical** clarification request. It governs ownership, idempotency, stale current-reading checks, attempt allocation, immutable parent linkage, and current-session pointer movement.

Its existence does not supply the missing application-layer answer validator.

---

## 3. Missing authority

### 3.1 Complete ProductReadingResponse schema

Primary Source does not define a complete versioned positive schema covering all authoritative response-body fields and their nested shapes.

The following are not sufficiently specified as a closed production contract:

```text
required vs optional response fields
closed product_response_state values and state-specific body requirements
required_action positive payload variants
clarifications positive payload variants
calculation ambiguity positive payload variants
unknown/additional field handling
field cardinality and size bounds
null vs absent semantics
```

### 3.2 Complete ClarificationAnswerV1 schema

Primary Source does not define the final positive schema for a user's clarification answer.

Missing decisions include:

```text
question/clarification identifier grammar
answer identifier grammar
single-choice vs multi-choice representation
free-text answer representation, if allowed
scalar/date/time/structured answer representation, if allowed
required/optional answer semantics
minimum/maximum answer cardinality
duplicate answer handling
unknown question/answer key behavior
additional-field behavior
```

### 3.3 Question-to-answer correlation authority

The source does not define the deterministic rule by which an incoming answer proves that it answers the clarification requested by the exact prior ProductResponse.

A server must not infer correlation merely because client JSON contains matching-looking strings.

### 3.4 Canonicalization and request-hash material

The persistence model requires a stable request hash and canonical request snapshot, but the source does not fully define canonicalization for clarification answers, including:

```text
array ordering significance
set-like answer ordering
whitespace / Unicode normalization
null vs omitted optional values
numeric/string coercion
semantically equivalent structured answers
version marker placement
```

Implementation must not choose these semantics and then present them as product authority.

### 3.5 Contract evolution / backward compatibility

Primary Source requires versioned product contracts but does not define the complete evolution protocol for clarification/request/response bodies:

```text
which contract version validates a continuation
whether an old pending clarification can be answered after contract deployment changes
whether response-version and request-version must match
unknown major/minor version behavior
legacy read vs new write compatibility
migration or replay behavior
```

### 3.6 Validator ownership and stable API failure mapping

The source requires validation before authoritative persistence/finalization, but does not fix the complete application validator interface or the stable public error taxonomy for each validation failure.

The database should not become a free-form semantic validator merely because it stores JSON snapshots.

---

## 4. What the implementation must NOT invent

Until SRC-33 is resolved, do not claim production-authoritative clarification/product validation by doing any of the following:

- expose `POST /api/reading-sessions/:sessionId/clarifications` with `answers: unknown[]` or another arbitrary JSON body;
- derive `ClarificationAnswerV1` from UI examples or current client payloads;
- accept caller-supplied free-form question/answer keys as authoritative registry keys;
- treat `request_snapshot_jsonb` as permission to persist unvalidated clarification data;
- call `cmd_append_reading_clarification_v1` directly with a merely syntactically valid client JSON body;
- treat provider/raw-engine JSON as a validated ProductReadingResponse because transport succeeded;
- infer `required_action_jsonb`, `clarifications_jsonb`, or ambiguity payload schemas from existing rows/examples;
- invent canonicalization/coercion rules solely to make request hashing deterministic;
- silently choose backward-compatibility behavior for pending clarifications across contract versions;
- expose provider/internal Saju structures as the public ProductReadingResponse contract.

These may be reasonable future implementation choices only after a governed source decision makes them authoritative.

---

## 5. Current source-safe boundary

SRC-33 does **not** invalidate the following independently source-backed boundaries:

```text
Reading Session + logical Reading attempt-1 creation
immutable Birth revision/session pinning
Reading / Reading Session provenance reads
transient execution-attempt persistence lifecycle
clarification-chain relational invariants
cmd_append_reading_clarification_v1 persistence/concurrency behavior
```

The clarification DB command may remain as a lower-level persistence authority for an already-validated canonical request supplied by a future trusted application validator.

Likewise, transport attempt persistence can remain independently testable. Neither boundary may be promoted into complete public clarification/product-semantic authority merely because the relational command exists.

---

## 6. Composition with existing gaps / P0 decisions

### 6.1 `P0-SA-01`

`P0-SA-01` chooses the real Saju integration/deployment path and transport adapter. Resolving it does not by itself define the positive ProductReadingResponse or ClarificationAnswer body schemas.

### 6.2 `SRC-08`

`SRC-08` governs the Saju Engine public host contract/conformance boundary. SRC-33 is the application-layer positive schema/validation authority MyeongHa needs before accepting response/clarification bodies as product data.

If a future authoritative Saju public contract fully defines these bodies and MyeongHa adopts that contract without additional product transformation, the same source decision may resolve both affected parts. Until then they remain distinct blockers.

### 6.3 `SRC-09`

`SRC-09` governs deterministic grounding/evidence preservation after a valid ProductReadingResponse exists. Grounding cannot substitute for validation of the upstream response or clarification request body.

---

## 7. Source decision required

To close SRC-33, Source authority must define or explicitly adopt an equivalent governed contract covering at minimum:

```text
1. ProductReadingResponse versioned positive schema
2. ClarificationAnswerV1 / clarification continuation positive schema
3. state-specific required/optional response payload rules
4. clarification question/answer correlation identity
5. cardinality, bounds, null/absent, unknown/additional-field rules
6. canonicalization rules used for authoritative snapshot/hash identity
7. contract-version compatibility and pending-clarification evolution behavior
8. validator ownership and deterministic validation result/error shape
```

Only after that decision may MyeongHa expose the public clarification command or treat a successful Saju transport body as a product-semantically validated response.

---

## 8. Resolution acceptance tests

A future resolution is not complete until tests prove at least:

```text
valid ProductReadingResponse accepted under an explicit contract version
unknown/extra/invalid response body rejected fail-closed
valid clarification answer accepted only for the exact requested clarification
unknown/stale/mismatched clarification answer rejected
same semantic canonical clarification replay hashes identically under the defined rules
same idempotency key + materially different clarification conflicts
pending clarification contract-version behavior is deterministic
provider/raw internal fields cannot bypass the public product validator
DB clarification append receives only the validated canonical snapshot/hash
transport success alone cannot mark an invalid ProductReadingResponse semantically complete
```
