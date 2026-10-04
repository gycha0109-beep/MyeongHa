# Se-yeon Internal Live Dogfood V1

Status: PHASE S live-provider sanity implementation
Watchtower-Track: character-memory

## Purpose

This slice exposes the already-governed Se-yeon Production composition through
an internal CLI only. It exists to run 1–3 turn live sanity checks against the
configured PostgreSQL runtime and OpenAI structured provider without mounting a
public/browser Chat route.

## Boundary

The CLI accepts only:

- one already-verified member auth user id or guest token hash;
- one existing owned Se-yeon thread id;
- one client turn id;
- text;
- optional committed-replay verification.

It does not accept caller-owned relationship state, relationship bands,
memories, recent messages, bundle/release selection, governance verdicts, or
public client compatibility.

## Environment

The existing Production user-data runtime remains authoritative for database
and Subject resolution settings. Live provider configuration is supplied only
through server/operator environment variables:

- `OPENAI_API_KEY`
- `MYEONGHA_SEYEON_OPENAI_MODEL`
- optional `MYEONGHA_SEYEON_OPENAI_TIMEOUT_MS`

The API key is never included in the result or repository material. The CLI
does not expose an OpenAI origin override.

## Usage

After setting the existing Production user-data runtime environment and provider
environment:

```bash
npm run dogfood:seyeon -- \
  --member-auth-user-id <verified-auth-user-id> \
  --thread <existing-seyeon-thread-id> \
  --client-turn <fresh-client-turn-id> \
  --text "안녕하세요. 처음 뵙네요." \
  --verify-replay
```

Guest evidence may use `--guest-token-hash` instead of
`--member-auth-user-id`. Exactly one identity argument is required.

## Provider observation

The CLI wraps the Production structured provider with an observation-only
counter. It records only provider/model identity and invocation counts by
purpose:

- integrity classification
- disclosure classification
- turn interpretation
- dialogue render
- semantic review
- event extraction

No prompt, input payload, model output, credential, or chain-of-thought content
is recorded by the observer.

## Replay gate

With `--verify-replay`, the exact same internal request is submitted a second
time. The second result must be `committed_replay`, must reuse the same
assistant message identity, must not run post-turn or relationship workers, and
must add exactly zero structured-provider calls.

## Non-goals

- public/browser Chat activation
- new thread creation
- rollout or client compatibility authority
- durable personal Memory writes
- new relationship semantics
- SRC-15, SRC-05, SRC-10, SRC-25, or SRC-30 resolution
- long-run Character quality PASS declaration
