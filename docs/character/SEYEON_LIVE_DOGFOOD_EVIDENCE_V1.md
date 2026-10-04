# Se-yeon Live Dogfood Evidence V1

Status: PHASE S execution evidence gate
Watchtower-Track: character-memory

## Purpose

This slice turns the internal scenario runner into an evidence-producing
technical validation boundary before live Character-quality review.

It does not add a public route, relationship mutation path, durable personal
Memory writer, or LLM-as-judge authority.

## Evidence flow

```text
verified identity
→ canonical Subject
→ PRE authoritative snapshot
→ scenario prerequisite gate
→ sequential Production scenario
→ POST-RUN authoritative snapshot
→ exact final-turn committed replay
→ POST-REPLAY authoritative snapshot
→ technical verdict
```

The scenario CLI now requires `--verify-final-replay` and routes through this
evidence layer.

## Authoritative snapshot

The read-only snapshot contains:

- existing owned thread binding;
- content release, bundle and revision;
- thread message count, max sequence and message ids;
- sender-type counts;
- current Memory Item ids;
- active Memory grant identities and Character ids;
- current Se-yeon relationship projection;
- active relationship Event ids/kinds.

Message bodies, Memory payload/content, provider prompts, model outputs other
than the normal scenario transcript, credentials, and chain-of-thought are not
added to the evidence snapshot.

## Clean-start scenarios

The following scenarios require both an empty authoritative thread stream and
an empty Se-yeon relationship before any provider invocation:

- `first-meeting-v1`
- `normal-accumulation-v1`
- `false-shared-memory-v1`
- `biography-injection-v1`

If the requirement is not met, the result is:

```text
NOT_RUN_PREREQUISITE
```

No Chat turn or provider call is made.

Governed relationship scenarios keep their existing server-owned relationship
preconditions.

## Technical PASS

A completed scenario is PASS only when all of the following hold:

- canonical Subject is stable;
- thread/content binding does not drift;
- each fresh turn has unique committed turn, attempt and assistant message ids;
- every committed assistant message exists in the authoritative thread stream;
- the stream grows by exactly one user and one Character message per fresh turn;
- relationship revisions used by sequential turns never move backwards;
- durable personal Memory Item/grant evidence is unchanged;
- exact final-turn replay returns `committed_replay`;
- replay reuses turn/attempt/assistant-message/sequence/commit-time identity;
- replay adds zero provider invocations;
- replay leaves the complete authoritative evidence snapshot unchanged.

Any violation produces `FAIL` with deterministic technical reasons.

Character quality is not part of this verdict.

## PostgreSQL authority

The stream evidence adapter binds to the existing read-only authority:

```text
public.qry_chat_thread_stream_v1(uuid, uuid, bigint)
```

Memory evidence uses the existing current-item and active-grant read
authorities. Relationship evidence uses the existing Production relationship
and history reads.

No migration is introduced.

## Live usage

```bash
npm run build
node dist/apps/api/src/seyeon-internal-dogfood-scenario-cli-v1.js \
  --member-auth-user-id <verified-auth-user-id> \
  --thread <existing-seyeon-thread-id> \
  --scenario first-meeting-v1 \
  --run-id live-first-meeting-001 \
  --verify-final-replay
```

The output contains the technical verdict, prerequisite/technical reasons,
scenario transcript evidence, and PRE/POST snapshots.

## Non-goals

- automatic Character-quality verdict;
- public/browser Chat activation;
- relationship-state seeding;
- durable personal Memory writes;
- new Memory schema authority;
- new relationship semantics;
- provider credential persistence;
- SRC-15, SRC-05, SRC-10, SRC-25, or SRC-30 resolution.
