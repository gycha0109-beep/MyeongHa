# Se-yeon First-Meeting Live Execution V1

Status: PHASE S live execution infrastructure
Watchtower-Track: character-memory

## Purpose

Execute the governed Production `first-meeting-v1` campaign from GitHub
Actions without creating a public Chat send route or exposing Production
identity, DB, Memory, or provider credentials in evidence.

This layer does not judge Character quality. It produces a redacted transcript
and a technical Evidence V1 verdict for subsequent human/LLM review.

## Workflow

```text
[WT:character-memory] Se-yeon First Meeting Live Dogfood
```

File:

```text
.github/workflows/seyeon-first-meeting-live-dogfood.yml
```

The workflow is deliberately **not** triggered by pull requests.

Supported invocation:

1. explicit `workflow_dispatch` with confirmation
   `RUN_SEYEON_FIRST_MEETING_LIVE`; or
2. a push to the current PHASE S parent branch that changes only the dedicated
   trigger path:
   `.github/seyeon-first-meeting-live-dogfood.trigger`.

The workflow file is introduced without the trigger file. Merging the
infrastructure therefore does not itself execute a live 10-turn campaign.

## Production environment bindings

The GitHub `production` environment must provide:

```text
MYEONGHA_PRODUCTION_MEMBER_EMAIL
MYEONGHA_PRODUCTION_MEMBER_PASSWORD
MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID

MYEONGHA_DATABASE_URL
MYEONGHA_DATABASE_PRINCIPAL=myeongha_runtime
MYEONGHA_SUPABASE_API_KEY
MYEONGHA_GUEST_FINGERPRINT_SECRET

OPENAI_API_KEY
```

Repository/environment variable or secret:

```text
MYEONGHA_SEYEON_OPENAI_MODEL
```

Optional variable:

```text
MYEONGHA_SEYEON_OPENAI_TIMEOUT_MS
```

The Supabase origin is pinned in the workflow to:

```text
https://cnsfpcdiyofqvhpcegfc.supabase.co
```

No credential value belongs in the repository, trigger file, workflow input,
job summary, or evidence artifact.

## Identity derivation

The runner does not accept an auth user id as a workflow input.

```text
Production smoke Member email/password
→ /api/auth/sign-in
→ fresh access token
→ /api/me canonical Member subject verification
→ Supabase /auth/v1/user
→ verified auth user id
→ internal first-meeting campaign
```

The expected canonical Subject is checked against the existing governed
Production smoke secret before any dogfood execution.

## Runtime authority

The workflow requires:

```text
MYEONGHA_DATABASE_PRINCIPAL=myeongha_runtime
```

and then uses the same internal Production runtime and Evidence V1 composition
already implemented by the campaign.

It does not connect through the Supabase administrative database principal and
does not create an alternate elevated dogfood DB path.

## Provider readiness gate

Before the campaign runner can open or reuse the Member's Se-yeon thread, the
workflow performs one non-conversational OpenAI Responses request through the
same configured structured-provider adapter.

The probe:

- uses the configured `OPENAI_API_KEY`, model, origin, and timeout path;
- uses `store: false`;
- requires strict JSON Schema output `{"ready": true}`;
- contains no Member, Subject, thread, Character-memory, or conversation data;
- performs no PostgreSQL operation;
- performs exactly one provider request and has no implicit retry.

Any provider configuration, network, timeout, HTTP, refusal, or structured
output failure stops the workflow before the live campaign runner starts.

This gate reduces the risk of partially committing a ten-turn campaign because
of a bad provider key/model/configuration. It does not create a retry policy for
mid-campaign failures.

## Live execution

The runner builds the TypeScript runtime and executes:

```text
runConfiguredSeyeonFirstMeetingLiveCampaignV1
```

The campaign performs:

```text
Production Member thread open/reuse
→ clean Se-yeon preflight
→ first-meeting-v1 10 turns
→ post-turn/relationship workers
→ Evidence V1 postflight
→ exact final committed replay
```

A dirty reused thread produces `NOT_RUN_PREREQUISITE` before provider
execution. The workflow treats that as a non-PASS live run.

## Redacted evidence

The runner writes:

```text
$RUNNER_TEMP/seyeon-first-meeting-live-dogfood/evidence.json
```

and uploads it for seven days.

The redacted schema retains:

- preparation status and safe reasons;
- participant Character ids and content revision;
- message counts;
- Memory item/grant counts only;
- relationship-present flag and active Event kinds;
- technical verdict/reasons;
- scenario id, review focus, provider counters;
- user fixture text;
- actual Se-yeon assistant text;
- relationship stage/band/behavior visible to each turn;
- replay disposition, sequence number, and provider delta.

It removes:

- canonical Subject id;
- auth user id;
- thread id;
- content release/bundle ids;
- client turn ids;
- turn/attempt/message ids;
- Memory item/grant ids;
- Relationship Event ids;
- credentials.

The same redacted evidence is printed as one
`SEYEON_FIRST_MEETING_LIVE_EVIDENCE=...` log record so the result can be
reviewed without downloading a binary artifact.

## Workflow verdict

The job succeeds only when:

```text
preparation = READY_CREATED | READY_REUSED_EMPTY
AND
technical verdict = PASS
```

`NOT_RUN_PREREQUISITE`, technical `FAIL`, missing runtime configuration, or
unexpected execution errors fail the workflow.

Character-quality review remains a separate PHASE S verdict after technical
PASS.

## Trigger discipline

Do not commit the trigger file until the Production GitHub environment has the
required runtime/provider bindings and an actual live execution is intended.

A trigger value must match:

```text
fire-YYYY-MM-DD-vN
```

Changing that file is an explicit mutating live-run action because the campaign
may create the Member's one active Se-yeon thread and commit ten Chat turns.
