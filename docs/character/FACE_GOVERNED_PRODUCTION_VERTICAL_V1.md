# TOPIC-FACE-005O — Governed Face Production Vertical

> Watchtower-Track: `topic-face`  
> Issue: #1714

## Goal

Close the server-only governed Face product chain by composing already-approved boundaries rather than creating new semantic authority.

```text
Saju governed Face transport
→ source domain result
→ admitted handoff + grounding + groundingRef
→ trusted Se-yeon base Character context
→ governed Face runtime admission
→ governed Character capability / perspective
→ immutable reading artifact
→ durable atomic commit
→ controlled reveal
```

## Production authority state

This orchestration does not activate Three-Divisions.

The real Saju source currently remains:

```text
face.reading.three_divisions
→ not_eligible
→ source_blocked
```

For that real blocked path the vertical must stop before:

- Character base-context resolution;
- renderer execution;
- artifact construction;
- durable commit;
- reveal.

The TEST ONLY eligible fixture proves contract continuity only.

## Caller boundary

The runtime request contains only product execution identity:

- subjectId;
- turnId;
- attemptId;
- requestId;
- topicKey;
- observationArtifactRef.

The request cannot provide:

- source authority;
- Face semantics;
- Character profiles;
- Character grounding;
- Character context;
- renderer output;
- commit receipt.

Those enter only through server-owned dependencies.

## Server-owned dependencies

The vertical accepts:

1. the production Saju governed Face transport;
2. a trusted Se-yeon base Character-context authority port;
3. a Character renderer port;
4. the durable governed Face commit port;
5. a server-owned suggested-action allowlist.

The production composition root reuses the existing Saju HTTPS origin/service bearer configuration.

## Eligible path

An eligible source must already have passed transport-level admission for:

- `sourceBinding`;
- governed interpretation handoff;
- source-owned governed CharacterGrounding;
- governed CharacterGrounding ref.

The vertical then:

1. resolves only Se-yeon's published Face profiles;
2. rejects mixed Saju, neutral Face, or pre-admitted governed Face base context;
3. admits the governed grounding into Character Runtime;
4. applies Se-yeon's governed Face capability;
5. preserves upstream interpretation order and maxUnits=3;
6. builds the immutable governed Face artifact;
7. calls the existing durable atomic commit;
8. reveals only after the exact durable receipt binds the artifact.

## Failure separation

`not_eligible` is a domain result and does not become an operational error.

Operational failures are staged as:

```text
receive
transport
context
render
artifact
commit_reveal
```

No stage falls back to neutral Face meaning.

## Commit / replay

The vertical delegates commit authority to the existing 005N durable commit contract.

Therefore:

- same turn + same artifact may replay the committed receipt;
- same turn + different artifact is rejected by commit authority;
- commit failure produces no controlled reveal;
- persisted material contains product-safe governed artifacts, not raw photo/landmark/embedding payloads.

## Acceptance

1. real blocked source invokes no Character context, renderer, artifact, commit, or reveal work;
2. TEST ONLY eligible transport reaches Se-yeon governed artifact generation without semantic translation;
3. exact source protected meaning survives into final output;
4. same-turn replay returns the same durable receipt and does not create another artifact;
5. source grounding tamper fails before Character context/commit;
6. durable commit failure never returns reveal;
7. unsupported topic identity fails before transport;
8. no raw biometric/identity material enters final output;
9. no public route is activated by this PR;
10. real positive Production activation remains dependent on upstream Saju source authority closure.
