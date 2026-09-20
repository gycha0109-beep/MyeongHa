# Official Reading → Character Grounding Bridge v1

> Status: **IMPLEMENTED SERVER COMPOSITION / PUBLIC CHAT INJECTION HOLD**  
> Date: 2026-09-21

## Purpose

This slice connects the server-authorized Official Standard Reading source to the existing Character Saju grounding contract without moving Saju semantic projection authority into MyeongHa.

The authority chain is:

```text
Reader access + Official Reading artifact
        |
        | DB/server authority (#1142)
        v
CharacterStandardReadingKnowledgeSourceV1
        |
        | immutable ProductReadingResponse snapshot
        v
SajuCharacterGroundingProjectionPortV1
        |
        | source-owned CharacterGroundingBundleV1
        v
MyeongHa admission
        |
        | exact Reading / engine / domain / response hash
        v
Character runtime grounding identity
```

## Fail-closed invariants

The bridge rejects:

- non-delivered ProductReadingResponse state;
- malformed/non-source response hash;
- a grounding bundle for another Reading;
- another Saju domain;
- another engine/response contract version;
- a different source response hash;
- a bundle whose body no longer matches its grounding hash;
- attachment to another active Character;
- attachment to a different active Reading.

## Semantic authority

MyeongHa does not derive grounding units from ProductReadingResponse fields.

The injected `SajuCharacterGroundingProjectionPortV1` represents the Saju-owned projector. The current Saju repository already owns `buildCharacterGroundingBundleV1`; a later transport slice may expose that projector over an authenticated service boundary.

## Explicit HOLD

This PR does not:

- add a public Chat route;
- relax the direct Saju runtime admission guard;
- grant runtime EXECUTE on migration-1220 INTERNAL Reading source functions;
- activate a Standard Reading Offer;
- promote Preview Reading output to Official Reading;
- invent a Character chat turn-send contract;
- reimplement Saju grounding semantics in MyeongHa.

The next slice is the authenticated MyeongHa → Saju grounding projection transport. After that transport is source-attested, it can be composed with this bridge and the existing bounded Character renderer.
