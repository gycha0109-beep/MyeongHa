# Official Reading → Protected Character Saju Context v1

> Status: **IMPLEMENTED SERVER PROJECTION / PUBLIC PRODUCTION USE STILL GATED**  
> Date: 2026-09-21  
> Saju public-contract pin: `gycha0109-beep/Saju@913e01778d3e998e133c7ac3165f9fbe089b52a0`

## Purpose

This slice consumes the exact Official Reading source already admitted by
`resolveCharacterStandardReadingKnowledgeV1` and projects only its user-facing,
source-owned ProductReadingResponse text into the existing Character protected-Saju
context seam.

The Character does not calculate, infer, summarize, or replace Saju meaning here.

## Accepted source

Only the pinned public response contract is accepted:

```text
myeonghwa-product-reading-response-v2
```

The stored Reading provenance and snapshot must agree on:

- Reading contract version;
- Product response state;
- official Reading identity.

Only `delivered` and `delivered_with_fallback` snapshots are consumable.

## Projection rules

Exact public ProductReadingResponse text is mapped as follows:

- paragraph / key point / comparison / timeline / fact table / source hint
  → protected Saju segment;
- Reading disclosures
  → protected Saju disclosures;
- Reading ambiguity blocks and calculation ambiguity
  → Character calculation ambiguity.

Every protected text item is pinned to:

- the exact Official Reading id;
- an exact source path;
- a server-computed SHA-256 content hash.

Unknown block types fail closed.

`delivered_with_fallback` is conservatively projected as partial coverage.

## Non-authority

This boundary does not consume:

- `sessionStorage`;
- URL `topic` / `scope`;
- client-carried Reading prose;
- Character-authored Saju conclusions;
- Preview Reading output.

## Remaining gate

This implementation intentionally does not remove the existing Production gate in
`assembleCharacterRuntimeContext`. Public Saju-bearing Character execution remains
blocked until the upstream Saju/Product authority gates are explicitly promoted.

The purpose of this slice is to make the server-authoritative data path concrete so
that, once promotion is legitimate, Chat can receive exact protected Official Reading
content rather than browser handoff text.
