# TOPIC-FACE-005H-C — Controlled Character Face Artifact Reveal

Status: implementation contract  
Tracking: #1364  
Watchtower-Track: topic-face

## Goal

Complete the Character Face artifact lifecycle so user-visible final output is returned only after atomic commit and exact receipt verification.

## Orchestration

```text
artifact build decision
    ↓
protected fallback?
    ├─ yes -> reveal forbidden
    └─ no
        ↓
atomic commit
        ↓
commit receipt
        ↓
receipt/artifact re-verification
        ↓
controlled reveal
```

## Protected fallback

A protected fallback build decision:

- performs no commit;
- exposes no artifact;
- exposes no final output;
- exposes only `face_output_unavailable`;
- remains `revealState = forbidden`.

## Commit-before-reveal

Artifact candidates must pass `commitCharacterFaceReadingArtifactV1()`.

The commit result itself remains:

```text
committed_not_revealed
forbidden_pending_controlled_reveal
```

Only this orchestration layer may transition the delivery state to:

```text
controlled_reveal_after_atomic_commit
```

## Receipt verification

Before delivery, the orchestration rechecks:

- turnId;
- artifactId;
- artifactHash;
- bundleHash;
- readingPlanRef;
- characterId;
- artifact lifecycle state;
- accepted final Face output.

Any mismatch fails closed before delivery.

## Replay

For the same logical turn and identical artifact:

- the existing committed artifact is replayed;
- no second commit occurs;
- the stored committed final output is revealed;
- `replayedCommittedTurn = true`.

A different artifact for an already committed turn is rejected.

## Delivery surface

The delivered orchestration result exposes:

- artifactId;
- committed finalOutput;
- commit receipt;
- controlled reveal state.

It does not expose the full pre-commit artifact payload as a user-facing surface.

## Failure

Commit/storage errors throw before delivery.

No result with `delivered` status can exist without a verified commit receipt.

## E2E

The acceptance suite closes:

```text
Face source grounding
→ runtime admission
→ capability
→ Perspective
→ Reading Plan
→ bounded renderer
→ Semantic Guard
→ Output Guard
→ immutable artifact
→ atomic commit
→ receipt verification
→ controlled reveal
```

It also covers fallback-no-commit, idempotent replay, committed-turn replacement rejection, forged lifecycle rejection, and privacy/metadata exclusions.

## Next

After TOPIC-FACE-005H, the safe next product slice is named Character Face profile publication/binding. Persistence adapters and API/UI transport can be added independently without changing the semantic or reveal authority chain.
