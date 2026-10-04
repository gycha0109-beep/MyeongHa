# Se-yeon Long-Run Dogfood Scenario Runner V1

Status: PHASE S long-run runner implementation
Watchtower-Track: character-memory

## Purpose

This slice reuses the internal Production dogfood runtime for sequential
multi-turn scenarios. It is an execution and observation tool, not a new
Character evaluator or semantic authority.

The runner keeps one configured Production harness and one provider observer
alive across a scenario so later turns read the actual committed dialogue and
relationship state produced by earlier turns.

## Scenario catalog

The initial catalog contains:

| Scenario | Turns | Review focus |
| --- | ---: | --- |
| `first-meeting-v1` | 10 | false familiarity, premature intimacy, initiative, counselorization |
| `normal-accumulation-v1` | 20 | continuity, repetition, relationship accumulation, non-romantic progression |
| `false-shared-memory-v1` | 8 | unsupported shared history must not become truth |
| `biography-injection-v1` | 8 | undefined family/romance/childhood biography must not be invented |

These fixtures provide conversation pressure only. Their text is not authority.

## Output evidence

Every turn reports:

- deterministic client turn id;
- user text and committed assistant text;
- relationship revision used for that turn;
- existing server-projected stage and relationship bands when present;
- post-turn decision;
- relationship apply revision evidence when present;
- provider invocation delta by purpose.

The final turn can be replayed once to assert zero additional provider calls.

The runner prints JSON to stdout only. It does not automatically write
transcripts into the repository or durable personal Memory.

## Live usage

Build first, then run one catalog scenario:

```bash
npm run build
node dist/apps/api/src/seyeon-internal-dogfood-scenario-cli-v1.js \
  --member-auth-user-id <verified-auth-user-id> \
  --thread <existing-seyeon-thread-id> \
  --scenario first-meeting-v1 \
  --run-id manual-001 \
  --verify-final-replay
```

Use a new `--run-id` for a fresh scenario execution. Reusing the same run id
intentionally reuses the same deterministic client turn ids and therefore
exercises committed replay semantics.

## Authority boundary

The scenario CLI cannot provide:

- Subject id;
- relationship stage, scores, or bands;
- recent messages;
- personal memories;
- content bundle/release;
- governance verdicts;
- public/client compatibility.

Those remain server-owned Production reads.

## Non-goals

- automatic Character-quality PASS;
- LLM-as-judge authority;
- durable transcript persistence;
- public Chat activation;
- personal Memory writes;
- relationship policy changes;
- relationship-state mutation or seeding. Governed conflict, reconciliation,
  and return scenarios are provided by the companion relationship dogfood
  slice and require pre-existing authoritative Production history.
