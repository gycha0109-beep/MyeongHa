# TOPIC-FACE-005H-B — Atomic Character Face Reading Commit

Status: implementation contract  
Tracking: #1362  
Watchtower-Track: topic-face

## Goal

Commit an immutable Character Face reading artifact atomically while keeping reveal forbidden until a later controlled-reveal step.

## Commit authority

The commit layer receives only:

- logical turn ID;
- attempt ID;
- immutable Face reading artifact;
- commit port.

It does not receive or persist provider/model metadata.

## Pre-commit integrity

Before any write, the artifact is revalidated for:

- supported artifact schema/builder version;
- semantic-validated lifecycle state;
- `requires_atomic_commit`;
- `forbidden_before_commit`;
- accepted final Face output;
- exact finalOutputHash;
- exact Character/topic/bundle/plan/delivery/runtime-version bindings;
- deterministic artifactId.

## Commit receipt

A successful commit receipt binds:

- turnId;
- attemptId;
- artifactId;
- artifactHash;
- bundleHash;
- readingPlanRef;
- characterId.

Receipt/artifact mismatch fails closed.

## Idempotency

For an already committed logical turn:

```text
same artifact hash
-> replay existing committed artifact/receipt
-> no second commit
```

A different artifact for the same turn is rejected.

## Reveal boundary

A successful commit returns:

```text
commitState = committed_not_revealed
revealState = forbidden_pending_controlled_reveal
```

Commit success alone is not a user-visible reveal authorization.

## Failure

Storage errors, forged receipts, artifact tampering, or logical-turn replacement attempts fail closed.

No fallback artifact is synthesized.

## Next

TOPIC-FACE-005H-C will consume either an artifact-build fallback or a successfully committed artifact and perform controlled reveal only after exact receipt verification.
