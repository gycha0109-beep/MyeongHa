# TOPIC-FACE-005O — Governed Face production vertical v1

> Watchtower-Track: `topic-face`  
> Issue: #1714

## Purpose

This closes the server-only orchestration seam across already-authorized components.

```text
Production Saju governed Face transport
→ blocked OR admitted handoff + grounding + groundingRef
→ trusted Seyeon base Character runtime
→ governed Face runtime admission
→ Seyeon governed capability + existing perspective
→ immutable governed reading artifact
→ PostgreSQL durable atomic commit
→ controlled reveal
```

No new Face meaning is created in this layer.

## Production truth today

The real upstream authority for:

```text
face.reading.three_divisions
```

remains blocked.

Therefore the correct real production behavior is:

```text
transport
→ not_eligible / source_blocked
→ base Character runtime 0 calls
→ presentation 0 calls
→ artifact 0
→ DB commit 0
→ reveal 0
```

A blocked source is not converted to a fallback reading.

## Server-only authority

The vertical accepts only operational identifiers and the narrow Saju source request.

The caller cannot provide:

- semantic claims;
- Character profile/capability;
- Character runtime context;
- source authority or grounding;
- transport credentials;
- persistence authority;
- final reading text.

The composition root receives trusted server-owned dependencies:

- production Saju transport;
- trusted Seyeon base runtime provider;
- governed presentation provider;
- PostgreSQL durable commit port.

## Character boundary

Initial Character support is Seyeon only.

The base runtime must match the published Seyeon Character content identity.

The admitted governed runtime then enforces:

- source-owned governed CharacterGrounding;
- `face.reading.three_divisions` governed capability;
- `canInitiate=false`;
- existing Seyeon perspective;
- max 3 selected units;
- upstream semantic order preservation;
- existing delivery/voice/output guards.

## Persistence and reveal

The vertical reuses the 005N durable authority.

Same turn + same artifact returns the original durable receipt.

Same turn + different artifact is rejected by durable authority.

Controlled reveal occurs only after the returned durable receipt exactly binds:

- artifact id/hash;
- Character identity;
- source result;
- authorization receipt;
- Face bundle;
- handoff;
- reading plan;
- final output hash.

Commit failure cannot return a delivered result.

## Failure model

The orchestration returns exactly one of:

```text
blocked
failed
delivered
```

`blocked` is a source-domain decision such as `source_blocked`.

`failed` is an operational or validation failure with a bounded stage/code.

`delivered` requires durable commit followed by controlled reveal.

## TEST ONLY positive fixture

The positive end-to-end fixture is synthetic contract material only.

It proves the closed wire/runtime/persistence contract but does not establish real traditional Face production authority.

Tests cover:

- real production transport blocked path;
- fully authorized synthetic positive vertical;
- production composition root with PostgreSQL adapter;
- replay;
- same-turn replacement rejection;
- grounding tamper rejection before Character runtime;
- commit failure with no delivered result.

## Non-scope

- public route mounting;
- client-side Face authority;
- new methodology research;
- approval of missing upstream bridge bindings;
- activation of blocked Three-Divisions authority;
- raw photo/landmark/embedding persistence.
