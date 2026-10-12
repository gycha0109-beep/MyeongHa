# Rahyeon Bible v0.5 / Runtime v0.2 Typed Binding Decision

> State: AUTHOR-REQUESTED TYPED RUNTIME IMPLEMENTATION — non-production publication
> Character: `rahyeon`
> World/Bible authority: approved Bible PR #1989, main blob `efba51048247704add8bbc19032afdd5a333aa06`
> Runtime instance: merged PR #1995, main blob `6cbc395f5b2e732dff7a1017b95b39c4fad504bc`
> Reviewed source commit: `af5400cb1cf1a04eb3c4ff3c20e2dcb321f26ac9`
> Track: character runtime typed integration

## Adopted typed scope

1. Replace obsolete `runtime-authoring-v1.ts` Rahyeon speech, persona, behavior, questions, Saju framing, and relationship behavior. Preserve the separately governed Saju capability domains and never introduce new Saju claims.
2. Register a versioned Rahyeon runtime authority lane with exact Bible, Runtime, and typed projection provenance. This lane is an **authored runtime source**, not a public production publication or release entitlement.
3. Register Bible-anchored biography facts with authority / knowledge / disclosure metadata. Open or World-dependent names, precise addresses, and unrecorded events remain unassertable.
4. Build typed turn-context selection over an already assembled and governed `CharacterRuntimeContextV1` and disclosure decision. Relationship bands remain server-owned, and the public fact allowlist does not expose private biography.
5. Keep the existing Seyeon-only production chat route, model provider, memory/ledger and cost controls unchanged. Production Rahyeon chat requires a separately reviewed character publication, subject binding, runtime execution, provider, event/outbox, and admission contract.

## Guards

- Life context is only selected by turn, never fully injected.
- Factual existence of previous romances does not grant detailed biography disclosure.
- `照` and `은영` do not fabricate hidden evidence, declassify private records, or modify Saju/Face truths.
- A relationship score alone does not declare love; flirting does not grant private source access.
- No new NPCs, actual daily meetings, locations, legal authority, or relationship milestone is inferred.

## Acceptance

- TypeScript and unit/regression tests on authoring, authority lane, fact registry, context composer and preflight.
- General CI, Governance, Web Gates and staged CI Integration Verify green prior to merge.
- No production deployment implied by a passing typed integration test.
