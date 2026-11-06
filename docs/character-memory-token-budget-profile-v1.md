# Provider-neutral Model Token Budget Profile v1

> Watchtower-Track: character-memory  
> Status: CORE CONTRACT IMPLEMENTED / REAL MODEL PROFILE AND PRODUCTION WIRING HOLD  
> Date: 2026-11-07

## Purpose

Phase 2 defines one provider-neutral boundary between the exact serialized model request, a trusted model-specific token-count adapter, and the existing Cost Governor. It does not select a real model, activate a provider, reserve money, or dispatch inference.

## Profile contract

\`packages/domain/src/model-token-budget-profile-v1.ts\` defines a server-owned profile containing:

- exact provider and model identifiers;
- policy and pricing/rate-card versions;
- context-window, maximum-input, and maximum-output token ceilings;
- reserved input headroom;
- maximum serialized request bytes;
- token-count adapter ID/version and exact supported request format.

The maximum input ceiling includes the reserved headroom. Every adapter must return a conservative certified input upper bound that already includes the exact headroom declared by its profile. The output ceiling is held aside independently and must equal the cap sent to the Provider.

## Exact request boundary

\`certifyModelTokenBudgetV1\`:

1. validates the profile and the exact counter/model/request-format/headroom binding;
2. checks the actual UTF-8 byte length of the immutable serialized request;
3. rejects unsupported request formats, oversized requests, or an output cap mismatch before counting;
4. passes the exact same serialized body and byte length to the approved count adapter;
5. fails closed for count errors, missing counts, invalid counts, or an exceeded input budget;
6. returns a redacted receipt bound to model, policy, pricing, adapter, request format, byte count, input upper bound, headroom, and output cap.

The receipt never includes the raw prompt, request body, Subject, API key, or provider response. This contract has no database, reservation, dispatch, or model-call side effects. The caller must only invoke the existing Cost Governor after certification succeeds.

## Existing OpenAI adapter reuse

\`apps/api/src/seyeon-model-token-budget-profile-v1.ts\` binds the existing official Responses input-token counter to the provider-neutral profile.

The supported format is deliberately narrow: native OpenAI Responses text input with JSON Schema output. The existing counter rejects gateway options, tools, images, unsupported fields, model drift, body-byte mismatch, malformed receipts, timeout, and token overflow. Its reserved headroom and the profile are built from the same server configuration.

This adapter remains explicit opt-in. Creating the binding does not make a network request. Counting is performed only when the server calls the certification function.

## Cost Governor binding

The profile carries the exact \`pricingVersion\` and \`policyVersion\`. The existing Seyeon Cost Governor continues to quote and reserve against its server-owned policy and rate card; this work does not create a second cost ledger or change reservation state transitions.

## Deliberate holds

- O-C1-07 model/provider selection is not treated as resolved by this contract. No real model profile or production model identifier is added.
- No model profile is registered in the four-Character Production runtime.
- No new Provider adapter is registered for an unsupported provider.
- No character-count multiplier, bytes-to-tokens heuristic, or undocumented estimate is allowed.
- The existing PR-04D2 opt-in, operational-cost, latency, provider compatibility, and Production ENFORCE holds remain.
- Existing PR-04B/04C cost-ledger operational gaps and legacy-path isolation remain separate gates.
- No paid Production evaluation or inference is activated.

## Verification

- Generic contract tests cover exact UTF-8 bytes, adapter/model/headroom mismatch, request-format mismatch, output-cap mismatch, oversized requests, unavailable/failed/invalid counts, and budget overflow.
- Offline OpenAI binding tests prove the exact native request is counted, the declared headroom is added, the price/model identity is preserved, and binding construction itself makes no HTTP request.
- Existing PR-04D2 tests continue to cover exact count/generation body parity, fail-closed before DB admission/provider generation, and the actual provider output cap.
