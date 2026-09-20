# Reader Knowledge — Official Reading Source Boundary v1

> Status: **IMPLEMENTED SERVER BOUNDARY / PRODUCTION CHAT INJECTION HOLD**  
> Date: 2026-09-21

## Purpose

This slice connects the already-modeled Official Standard Reading + per-Reader access authority to one server-only Reader Knowledge source resolver.

It does **not** treat the browser Reading handoff as authority.

## Authority flow

```text
server-resolved subject
+ canonical Reader character id
+ requested official Reading id
+ server evaluation time
        |
        v
internal_qry_character_standard_reading_access_v1
        |
        | exact Reader must currently hold exact purchase-backed access
        v
internal_qry_standard_reading_artifact_source_v2
        |
        | same subject + Reading + Reader + response provenance
        v
server-only Official Reading source snapshot
```

The resolver verifies the metadata/raw-source pair agree on:

- official Reading identity;
- Product identity;
- Reader identity;
- Reading contract version;
- immutable response hash.

A missing Reader grant, revoked/expired exact Grant, wrong subject, wrong Reader, wrong Reading, or authority disagreement fails closed.

## Explicit non-authority

The resolver does not accept these as Source Truth:

- `sessionStorage`;
- query-string `topic` / `scope`;
- client-carried Reading prose;
- aggregate entitlement without exact Reader access;
- another Reader's access;
- Preview Reading output.

## Production HOLD preserved

Migration 1220 intentionally revokes ordinary runtime EXECUTE on both INTERNAL source functions. This slice adds an application adapter but does not change those ACLs.

Therefore this PR does **not** activate:

- paid Standard Reading;
- Production Saju interpretation;
- public Character Chat Reading injection;
- a Chat turn-send contract;
- Preview → Official Reading promotion.

The next promotion step must first have a committed Official Reading and an explicitly authorized runtime execution path. Only then may this source be projected into the existing protected Saju/grounding Character context.
