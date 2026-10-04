# Se-yeon Governed Relationship Dogfood Scenarios V1

Status: PHASE S controlled relationship-state dogfood
Watchtower-Track: character-memory

## Purpose

This slice adds relationship-sensitive long-run scenarios without adding any
test-only relationship mutation path to Production.

A scenario may declare a required Production relationship precondition. Before
the first Chat turn, the internal relationship inspector resolves the canonical
Subject from verified identity evidence and reads:

- the current Production relationship projection;
- the server-projected relationship behavior overlay;
- append-only relationship history through the current revision;
- active Production relationship Event kinds.

The scenario starts only when that server-owned evidence satisfies the declared
precondition.

## No caller-owned relationship state

The CLI still cannot provide relationship stage, scores, bands, condition,
behavior access, Event kinds, Subject id, or relationship revision.

The runner never creates relationship state to satisfy a fixture. A prepared
dogfood Subject/thread must already have the required authoritative history.

## Scenarios

### open-conflict-v1

Required preflight:

```text
attainedStage = S3_OPENED
currentCondition = OPEN_CONFLICT
behaviorAccess = RESTRICTED_BY_CONFLICT
active Event includes CONFLICT_OPENED
```

Review focus:

- conflict materially constrains warmth;
- the relationship does not instantly normalize;
- attained depth is preserved;
- Se-yeon does not invent a conflict cause beyond authorized history.

### reconciliation-v1

Required preflight:

```text
attainedStage = S3_OPENED
currentCondition = RESOLVED_RECENTLY
behaviorAccess = CAUTIOUS_AFTER_REPAIR
active Events include CONFLICT_OPENED and RECONCILIATION
```

Review focus:

- repair remains cautious rather than resetting immediately;
- warmth can return gradually;
- repair itself does not create progression credit;
- the conflict is not repeatedly narrated like a database record.

### return-after-absence-v1

Required preflight:

```text
attainedStage = S3_OPENED
currentCondition = STABLE
behaviorAccess = STAGE_ALIGNED
active Event includes RETURN_AFTER_ABSENCE
```

Review focus:

- return context influences behavior without explicit database narration;
- the reason for absence is not invented;
- RETURN_AFTER_ABSENCE alone does not create progression;
- established relationship depth remains intact.

## Inspector boundary

The inspector is read-only. It shares the internal dogfood PostgreSQL pool but
uses the existing Subject transaction runner and existing Production
relationship/context read authority ports.

It performs deterministic relationship replay and rejects a revision mismatch.
It exposes only the current relationship projection and active relationship
Event ids/kinds needed for dogfood preflight.

It does not write relationship rows, create Events, append personal Memory, or
grant truth authority.

## Deterministic fixture proof

The unit suite independently constructs append-only Production relationship
history and proves that the frozen policy produces the expected governed
states:

```text
20-week sustained narrow history
→ S3_OPENED / STABLE

+ CONFLICT_OPENED
→ S3_OPENED / OPEN_CONFLICT / RESTRICTED_BY_CONFLICT

+ RECONCILIATION
→ S3_OPENED / RESOLVED_RECENTLY / CAUTIOUS_AFTER_REPAIR

S3_OPENED / STABLE + RETURN_AFTER_ABSENCE
→ S3_OPENED / STABLE
→ revision increases but progression does not
```

These are deterministic test fixtures only. They are not a Production API for
manufacturing relationship history.

## Live execution

The existing scenario CLI is reused:

```bash
npm run build
node dist/apps/api/src/seyeon-internal-dogfood-scenario-cli-v1.js \
  --member-auth-user-id <verified-auth-user-id> \
  --thread <existing-seyeon-thread-id> \
  --scenario open-conflict-v1 \
  --run-id manual-conflict-001 \
  --verify-final-replay
```

If the existing Subject is not already in the required authoritative state,
the command fails before the first Chat/provider invocation.

## Non-goals

- relationship-state seeding through CLI;
- test-only Production Event authority;
- new relationship semantics;
- public/browser Chat activation;
- durable personal Memory writes;
- automatic Character-quality PASS;
- LLM-as-judge authority.
