# 명하 AI Security Trust Boundary v1 — P0-A / P0-B First Slice

> Repository: `gycha0109-beep/MyeongHa`
> Baseline: `main@4a9cf77468db466bab492a0c951a7c07f464c6e4`
> Tracking: Issue #1802
> Track: `security`
> Status: **PARTIAL IMPLEMENTATION — not an AI red-team / production security PASS**

## 1. Authority and scope

Keep the existing flow, without creating a parallel security runtime:

```
server-verified subject + thread + release
→ governed preflight / capability and disclosure admission
→ policy-filtered context / Saju grounding admission
→ Se-yeon interpreter / renderer structured provider
→ structural + semantic + Output Guard
→ atomic commit
→ controlled reveal
```

This slice adds one instruction/data separation safeguard **at the existing OpenAI Responses provider boundary**, and synthetic regression tests using a mocked response. It does **not** authorize new memory/projector scopes, agent communication, tool execution, LLM state mutations, or paid/Production activation.

Source responsibilities remain:
- Product subject and RLS/object ownership: MyeongHa backend.
- Private memory, disclosure, and Reader knowledge grants: server-side grants/read admission.
- Governed Saju interpretation/grounding: Saju producer and positive admission; LLM cannot invent a claim.
- Persona and dialogue behavior: version-pinned Character layer.
- Relationship, world, memory and entitlement writes: server-owned command authority.
- Model response: untrusted candidate; no direct tool/SQL/action authority.

## 2. Observed runtime code, not a complete security audit

| Surface | Evidence in repository | First-slice disposition |
| --- | --- | --- |
| Structured provider | `apps/api/src/openai-seyeon-structured-provider-v1.ts` sends server instructions and JSON-serialized input as a user-role message; `store:false`, strict JSON schema | Add explicit non-promotion instruction and test exact request framing |
| Interpreter/renderer/reviewer | `apps/api/src/seyeon-character-runtime-v2.ts` prepares structured requests and uses downstream guards | Keep output guards; injection text may still influence model and requires live tests |
| Private memory projection | `apps/api/src/seyeon-production-context-v1.ts` defaults to no positive personal-record projectors while SRC-25 is open | Do not turn on unresolved projectors |
| Chat atomicity | Production generation/validation/commit logic exists | No bypass or direct commit from provider response |
| Reading/Reader access | Reader-scoped knowledge and entitlement admission | Cross-Reader / cross-user negative E2E required |
| Council | Same grounding and bounded turns are specified | Peer output instruction laundering is a separate pending runtime audit |
| Face | Extractor/observation schema, ephemeral image default are specified | Vision/text-in-image injection remains for Face path validation |
| Output Rich Text | UI rendering details have not been exhaustively audited in this slice | Do not claim HTML/Markdown exfiltration protection |
| Abuse / cost | Per-subject usage telemetry exists and Cost Governor work is in progress | Do not invent numeric quotas without policy/evidence |

## 3. Attacker-controlled sources

```
direct user message                  DATA ONLY
recent conversation transcript      DATA ONLY
approved persisted memory summary   DATA ONLY (grant ≠ instruction)
relationship event summary          DATA ONLY
peer Character/agent utterance       DATA ONLY
untrusted retrieved text            DATA ONLY
uploaded image / OCR content        DATA ONLY
Saju grounding explanatory content  SEMANTIC DATA ONLY
```

The server's canonical subject resolver, authorization policy, deterministic action admission, schema registries, pinned Character instructions, and positive Saju admission retain their respective authorities. Text from the above sources must not override them. Role separation and additional provider instructions are **defense in depth, not a proof** against a model jailbreak.

## 4. Synthetic attack fixtures / expected result

The deterministic regression corpus covers: direct priority override, forged system message, persisted-memory instruction, peer-agent instruction, grounding payload, HTML/remote-image exfiltration, Unicode obfuscation. Acceptance is narrowly:
- attacker text is serialized only as JSON input under a user-role content element;
- it is never interpolated into the instruction parameter or tool description;
- output schema remains strict and `store` remains false;
- no tool array or tool-choice authority is added;
- provider metrics never copy instructions, user text or credentials.

The mock test proves **request construction only**. It does not prove that a live model obeys the data-only rule, that its natural-language output is benign, or that downstream sinks never execute attacker-controlled content.

## 5. Follow-on P0 execution boundaries

1. **Context Admission:** trace every actual Se-yeon call-site source through recent messages, grants, relationship history, Reader knowledge and authorized groundings. Verify source, owner, grant, version and destination with synthetic cross-subject / cross-Reader attempts. Only if a concrete leak appears, fix the actual retrieval/assembler seam.
2. **Memory Poisoning:** prove a persisted instruction cannot create new authority even across multiple turns; distinguish an approved user's quotation from an executable command. Compare before/after memory grants, retraction, new Reader and rotated content release.
3. **Agent/Council:** inspect the real deployed peer output path; require peer utterance to enter the next Character only as non-authoritative content. Test fabricated tool calls and unauthorized private retrieval.
4. **Output/action:** check every renderer of AI text for HTML/URL/image/Markdown exfiltration and every LLM proposal → persistence mutation. Guard before commit/reveal.
5. **Saju/Face:** test semantic/observation schema instruction-smuggling and protected rendering; do not duplicate their semantic authority.
6. **Cost:** verify active concurrent budgets/deadlines and unknown-usage settlement with actual operational policy, independently of client claims.
7. **Live evaluations:** holdout adversarial corpus by language, role spoofing, long multi-turn delayed attack, quoted data, memory/peer poisoning; run only on authorized test identities. Measure policy violations and false-positive refusal on benign requests.

## 6. CI and release evidence

- Keep test in existing `vitest run` suite; **no new workflow**.
- Confirm changed-file test/typecheck + exact-head CI and fresh merge-base before merge.
- Model/provider/prompt/runtime authority changes require replay of the same adversarial cases.
- Separate success of deterministic isolation from live model jailbreak resistance.
- No genuine credentials, birth inputs, chat transcripts, face images, or payment artifacts in fixtures or logs.

## 7. Completion labels

- **A — PASS**: exact changed SHA tests/CI verify the narrow request/metadata boundary.
- **B — HOLD**: real-model adversarial evaluation or downstream Council/Memory/Face/Reader E2E not yet performed.
- **C — FAIL**: any untrusted source promoted to instruction/tool authority, unauthorized data retrieval or state mutation, or unsafe pre-guard reveal.

This document only closes the **first-slice** contract if A is proven. It does not close P0 AI security overall.
