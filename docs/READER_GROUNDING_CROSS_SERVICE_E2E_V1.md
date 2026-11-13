# Reader Grounding Cross-Service E2E V1

## Purpose

This gate proves the first executable cross-repository path from an authorized MyeongHa Official Reading into Saju-owned Character grounding and back into bounded Reader Preview rendering.

It does not activate the public Reader Interpretation route, Product Offers, Charge Terms, PortOne, or payment.

## Pinned Saju authority

The workflow checks out Saju commit:

- `b17896099a4919124dfa67ed6f0ada265e460501`
- merge of Saju PR #1143

That revision owns the authenticated `POST /api/character-grounding` contract and admission attestation.

## Executed path

```text
MyeongHa Official Reading authority
→ MyeongHa HTTP grounding adapter
→ real HTTP + service Bearer
→ Saju production process
→ Saju /api/character-grounding
→ source-owned CharacterGroundingBundleV1
→ admission attestation
→ MyeongHa identity/hash admission
→ Baekheon reviewed perspective
→ bounded renderer
→ semantic preservation guard
→ Reader Preview envelope
```

## Positive evidence

The E2E requires:

- a delivered ProductReadingResponse fixture accepted by the real Saju host
- exact Official Reading identity round-trip
- exact response contract / engine / domain identity
- Saju-computed source-response hash
- Saju-computed grounding hash
- admitted Reader perspective
- bounded semantic realization in the final Reader Preview envelope

## Consultation shadow — source-bound offline evaluation extension (2026-11-08)

The cross-service suite now also exercises the **same authenticated Saju projection** as input to the new Character consultation shadow path:

- An already-admitted, official-identity Saju-grounding unit becomes the ONLY allowed prompt source.
- A fake, non-network AI candidate echoes the admitted official meaning; a fake independent evaluator produces a source/candidate-hash-matched verdict.
- The internal private comparison callback records provenance + candidate, while the resulting Reader Preview envelope must stay identical to the no-shadow output.
- Revoked Reader grants block BOTH the Saju projection and the consultation AI candidate.
- The Saju host is a real locally launched server; however the delivered Reading input is a **synthetic regression fixture** and the AI response is a stub. This proves service contract wiring, NOT genuine personal Saju reading quality, production domain authority, approved model performance, or paid-model admission.

## Negative evidence

The E2E also proves:

- wrong service Bearer is rejected by the real Saju host with HTTP 401
- revoked Reader access fails before the cross-service projection port is called

Existing unit/contract suites remain authoritative for malformed admission headers, identity mismatch, caller authority injection, unsupported domains, and protected fallback behavior.

## Runtime boundary

The workflow uses an ephemeral local Saju process and an ephemeral bearer. No production secret is required.

The Saju revision is pinned deliberately. Advancing the pin is a reviewed integration-authority change, not an automatic dependency update.

The job timeout is seven minutes so this gate cannot become an unbounded CI wait.
