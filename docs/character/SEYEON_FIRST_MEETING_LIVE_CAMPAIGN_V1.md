# Se-yeon First-Meeting Live Campaign V1

Status: PHASE S live first-contact operator campaign
Watchtower-Track: character-memory

## Purpose

Run the first real Se-yeon Production dogfood campaign from one verified Member
identity without allowing the operator to supply thread, Character, relationship,
release, bundle, or Memory authority.

The campaign reuses the approved Member Launch-Character thread-open authority
and then runs the existing `first-meeting-v1` Evidence V1 scenario.

## Command shape

```bash
npm run build

node dist/apps/api/src/seyeon-internal-first-meeting-campaign-cli-v1.js \
  --member-auth-user-id <verified-auth-user-id> \
  --run-id live-first-meeting-001
```

No `--thread`, `--character`, Guest identity, relationship state, content
binding, or Memory input is accepted.

## Thread preparation

The campaign calls the same server-side Member open authority used by
`POST /api/chat`:

```text
public.cmd_open_member_single_character_thread_v1
```

The Character is hard-pinned to `seyeon`.

The command either:

- creates the one allowed active single-character Se-yeon thread; or
- reuses the existing active single-character Se-yeon thread.

The campaign does not add any alternate create path and does not archive,
delete, reset, clone, or mutate an existing dirty thread for testing.

## Preparation verdict

After create/reuse, the Evidence inspector reads the authoritative state.

```text
READY_CREATED
READY_REUSED_EMPTY
NOT_RUN_PREREQUISITE
```

A thread is ready only when:

- the active participant shape is exactly one Character: `seyeon`;
- the authoritative thread stream contains zero messages;
- current Se-yeon relationship projection is absent;
- active Se-yeon relationship Event history is empty.

If the existing Member thread already contains messages or relationship history,
the campaign returns `NOT_RUN_PREREQUISITE` before any structured-provider
invocation.

Guest evidence is rejected before Member thread-open authority is called.

## Live execution

When preparation is ready, the campaign runs exactly the catalogued
`first-meeting-v1` ten-turn scenario through the existing Production dogfood
harness and Evidence V1 gate.

Evidence V1 remains responsible for:

- canonical Subject stability;
- thread/content binding stability;
- exactly two committed messages per fresh turn;
- unique turn/attempt/assistant message identities;
- committed assistant messages present in the authoritative stream;
- durable personal Memory item/grant delta = 0;
- non-regressing relationship revision use;
- exact final-turn committed replay;
- replay provider delta = 0;
- replay authoritative DB evidence delta = 0.

## Required server environment

```text
MYEONGHA_DATABASE_URL
MYEONGHA_DATABASE_PRINCIPAL
MYEONGHA_SUPABASE_URL
MYEONGHA_SUPABASE_API_KEY
MYEONGHA_GUEST_FINGERPRINT_SECRET
OPENAI_API_KEY
MYEONGHA_SEYEON_OPENAI_MODEL
MYEONGHA_SEYEON_OPENAI_TIMEOUT_MS   # optional
```

The CLI never prints credential values.

## Output

stdout is JSON containing:

- campaign version;
- thread preparation status/reasons;
- authoritative preparation snapshot;
- Evidence V1 technical verdict;
- ten user fixtures and committed Se-yeon replies when execution occurs;
- provider invocation counters;
- replay evidence.

This output is an operator artifact only. It must not be committed as a durable
Character Memory or repository transcript.

## Non-goals

- public Chat send activation;
- Guest thread creation;
- test-only relationship seeding;
- dirty-thread reset/archive/delete;
- automatic Character-quality judgment;
- durable personal Memory write;
- SRC-15, SRC-05, SRC-10, SRC-25, or SRC-30 resolution.

After a technical PASS, Character quality is reviewed separately against the
existing CF defect taxonomy.
