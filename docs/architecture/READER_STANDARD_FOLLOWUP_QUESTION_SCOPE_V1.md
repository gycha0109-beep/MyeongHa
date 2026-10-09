# A3-ι Official Reader Chat V2 — bounded natural-language follow-up admission

**Status:** internal-only candidate selector. Public Chat remains OFF. No generation or DB commit.

## Scope

- Accept **only** closed-form Korean requests to clarify the **last committed semantic-guard-passed answer** (for example, "그 부분을 조금 더 쉽게 설명해주세요." or "방금 본 직업 해석을 조금 더 설명해 주세요." for an admitted career Reading).
- Bind the decision to a server-minted V2 preflight, source-owned verified Grounding, DB-owner validated prior answer Anchor, exact Reader/Reading/Thread/Subject scope, selected Unit closure, protected disclosures, ambiguity and hashes.
- A positive result is a `bounded_explanation_candidate` or `protected_only_candidate`, never a response-generation grant. Positive decisions are server minted and structural clones are refused.
- A question mentioning another domain, a new calculation period, a comparison with another person's Saju, arbitrary recommendations, mixed intent, unrecognized phrasing or prompt injection goes to HOLD.
- Unavailable current DB-owned Anchor, mismatched source or revoked grant never gets an answer; the adapter supplied by A3-θ remains unused in production until the DB owner implements its source-verified query and atomic writer.

## Design constraints

This is **not** a general natural-language intent understanding engine. The allowlist intentionally produces false negatives, because lexical confidence is not authority to synthesize a purchased interpretation. Future broader chat requires independently proven question scope and bounded semantic/output guards. An LLM classifier, if added later, can only propose a target to a source-owned authority checker; it may not mint Unit refs, choose a Reading, change time period or declare a grant.

## Tests and gate

The local test suite includes exact prior-reference positive cases, cross-domain, period change, multi-intent, hidden Unicode, prompt injection, absent DB anchor, ambiguous focus, protected-only mode and structural forgery negatives.

**A:** Internal classifier builds, tests pass, no public route.
**B:** DB function, free-form classifier, renderer/guards and final atomic Commit remain HOLD.
**C:** Any evidence selection without server-issued preflight/grounding and committed, scoped DB anchor is a release blocker.
