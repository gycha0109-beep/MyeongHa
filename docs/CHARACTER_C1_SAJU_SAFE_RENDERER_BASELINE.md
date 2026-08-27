# Character C1 Saju-Safe Renderer Baseline

Status: **IMPLEMENTATION BASELINE — C1-F**  
Scope: Character Runtime Saju-bearing responses  
Authority: subordinate to `MASTER_SPEC_INDEX.md`, `AI_CHARACTER_RUNTIME_SPEC.md`, Saju public contract, and protected Reading provenance.

## 1. Why this baseline exists

`AI_CHARACTER_RUNTIME_SPEC.md` does not claim that a free-form LLM semantic-equivalence validator can prove preservation of Saju meaning. The production-capable baseline therefore must not depend on a renderer freely paraphrasing governed Saju text.

C1-F makes that boundary executable:

```text
Non-Saju turn
→ policy-filtered context
→ free character framing
→ Output Guard

Saju-bearing turn
→ policy-filtered context
→ provider selects framing keys only
→ server resolves pinned safe-framing text
→ protected Saju block/disclosure/ambiguity server injection
→ Output Guard
→ atomic commit
→ controlled reveal
```

## 2. Safe framing authority

Safe framing lives in the pinned Character Content bundle under `sajuProfile.safeFraming`.

Each entry contains only:

- stable key
- static human-authored text
- bounded purpose

Allowed purposes in v1:

- `record_transition`
- `current_life_question`
- `uncertainty_transition`
- `relationship_transition`

The catalog is versioned independently with `catalogVersion`.

## 3. Deliberate restrictions

A safe-framing entry cannot contain dynamic interpolation tokens.

The provider cannot submit:

- `framingBefore`
- `framingAfter`
- protected Saju blocks
- protected disclosures
- calculation ambiguity
- new Saju semantic text

For a Saju-bearing turn it may select only `framingBeforeKey` and `framingAfterKey`, plus already-bounded emotion/cue/proposals/actions.

The server resolves those keys against the exact pinned Character Content catalog before the existing structural/provenance Output Guard runs.

## 4. What this does not solve

C1-F is **not** a semantic-equivalence validator.

It does not prove that arbitrary model prose preserves Saju semantics. Instead, the baseline removes arbitrary visible model prose from the Saju-bearing seam.

Full free-form Character paraphrase remains blocked until a separate semantic-preservation validator/eval gate is designed, measured, and explicitly promoted.

## 5. General chat remains character-first

Ordinary non-Saju chat does not use the keyed restriction. It continues through the existing free character-framing Output Guard so the character can converse naturally from permitted canon, relationship projection, granted records, and recent context.

The restriction applies because a response carries Saju semantic authority, not because the character is generally scripted.

## 6. Acceptance invariants

C1-F must keep all of the following true:

1. A Saju-bearing orchestration cannot commit provider-authored visible framing text.
2. Unknown safe-framing keys fail closed.
3. Dynamic interpolation in published safe-framing content fails validation.
4. Safe-framing keys are unique across before/after placements.
5. Protected Saju blocks remain source/ref/hash pinned.
6. Protected disclosures and ambiguity remain server-injected.
7. Output Guard failure means no commit and no reveal.
8. Non-Saju chat retains free framing.
9. No Character Runtime path gains Saju semantic authority.
10. Provider/model selection remains outside this baseline.

## 7. Promotion rule

Real Character Content must provide reviewed `safeFraming` catalogs before it can be used for Saju-bearing production responses.

The current schema keeps the catalog optional only to preserve incremental development compatibility with pre-C1 fixtures. Runtime strict mode itself fails closed when a Saju-bearing authored character has no safe-framing catalog.
