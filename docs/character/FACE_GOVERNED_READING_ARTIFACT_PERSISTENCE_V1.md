# Governed Character Face Reading Artifact Persistence V1

> Track: `topic-face`  
> Issue: #1690  
> Status: implementation candidate

## Goal

Persist an already validated governed Character Face reading artifact durably before controlled reveal.

This layer does not create or reinterpret Face semantics.

```text
source-authorized Face interpretation
→ Seyeon governed plan/output
→ semantic_validated artifact
→ durable PostgreSQL commit
→ exact receipt verification
→ controlled reveal
```

## Persistence authority

The durable store is the generic:

```text
public.character_reading_artifacts
```

The table is not a Saju `reading_refs` or `reading_groundings` extension. Those tables belong to the Saju Reading lifecycle.

The artifact sidecar is bound to:

```text
subject
+ chat turn
+ exact validated attempt
+ artifact kind
```

V1 admits only:

```text
artifact_kind = face_governed_reading
```

through a narrow command.

## Durable identity

The committed row pins:

- artifact schema/id/hash;
- Character id;
- source result hash;
- source authorization receipt;
- Face bundle hash;
- governed handoff hash;
- reading-plan ref;
- final-output hash;
- validated immutable artifact JSON;
- authoritative turn/attempt;
- durable receipt id and commit timestamp.

The application revalidates the persisted artifact and durable receipt before reveal.

## Idempotency

The DB unique identity is:

```text
(turn_id, artifact_kind)
```

Rules:

```text
same turn + same immutable artifact
→ return the original durable receipt
→ no second row

same turn + different immutable artifact
→ reject
```

Replay identity is the logical turn + artifact, not the newly supplied retry attempt id. A successful replay therefore returns the attempt id of the original commit.

## First-commit gate

A first durable commit requires:

```text
turn.state ∈ {validated, committed, delivered}
attempt.state ∈ {validated, committed}
attempt belongs to exact turn + subject
```

This prevents unvalidated material from becoming durable authority.

## Immutability and account deletion

Ordinary UPDATE/DELETE is rejected by an immutable trigger.

Account deletion remains compatible with the existing approved destructive finalizer:

- the artifact owns exact Subject/turn/attempt FKs;
- turn/attempt FKs use deletion cascade;
- the immutable trigger permits DELETE only while the existing SECURITY DEFINER account finalizer is executing for the exact transaction-local Subject.

No ordinary runtime path gains delete authority.

## Least privilege

The API executor receives no direct table DML.

It can execute only:

```text
public.cmd_commit_character_face_governed_reading_artifact_v1(...)
```

The SECURITY DEFINER function is owned by a dedicated NOLOGIN role and re-checks canonical Subject context.

## Privacy

The DB command accepts only the governed artifact top-level schema and rejects raw biometric key families including:

- raw image/photo;
- raw landmarks/indices;
- face embedding;
- identity template;
- high-resolution crop.

The Character artifact is semantic/provenance material, not a face-image archive.

## Runtime boundaries

The existing synchronous InMemory commit port remains for contract/unit tests.

Production persistence uses a separate async durable boundary:

```text
CharacterFaceGovernedReadingDurableCommitPortV1
→ PostgreSQL adapter
→ durable receipt
→ commitAndRevealCharacterFaceGovernedReadingDurablyV1
```

This avoids pretending synchronous in-memory storage is production persistence.

## Synthetic fixture boundary

Current positive tests still use synthetic governed Face meaning solely to exercise the persistence contract.

They prove:

- artifact validation;
- PostgreSQL parameter/receipt binding;
- replay behavior;
- conflict failure;
- durable-commit-before-reveal.

They do not prove real traditional Face production authorization.

## Acceptance

005N closes when:

1. migration applies under repository DB checks;
2. same-turn same-artifact replay returns the original receipt;
3. replacement material is rejected;
4. committed rows are immutable;
5. account deletion can remove the subject-owned artifact only through the existing finalizer;
6. raw biometric payload keys are rejected;
7. PostgreSQL adapter reconstructs the exact artifact/receipt;
8. durable storage failure produces no reveal;
9. existing InMemory governed artifact tests remain green.
