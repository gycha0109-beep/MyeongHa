# Seyeon initial Production publication bootstrap v1

Status: **AUTHORIZED FOR ONE-TIME PRODUCTION BOOTSTRAP**

Decision date: 2026-10-07

Scope: Production Character content bootstrap for the already-approved Seyeon runtime/presentation lane.

## Evidence

The governed read-only Production roster audit returned:

- active default release count: 0
- backing active bundle count: 0
- canonical Character count: 0
- active runtime catalog count: 0
- eligible Character count: 0

Therefore the Production Character content store is empty. No existing default release exists to replace.

## Decision

The Product Owner directed the Character/Chat track to finish the Seyeon production vertical slice after the empty-Production blocker was reported.

For this bootstrap only:

1. publish exactly one immutable Seyeon content bundle using the already-approved runtime authority and static presentation package;
2. create exactly one release for that bundle;
3. activate it as the **initial active default release**, because the lifecycle contract forbids activating a non-default release before any default exists and Member Chat open resolves the active default;
4. do not publish any of the other eight Characters;
5. fail closed if any Character bundle/release/runtime catalog row appears before execution.

This is an initial bootstrap, not a replacement of an existing global default.

## Exact publication material authority

Presentation values are unchanged from the approved Seyeon publication package:

- minClientCapability: `character-chat-theme-v1`
- assetManifestHash: `sha256:v1:ca769bd9b211e5d04f64128fea1fb2e3d1eca3f91d2d34c6fe14f39b62591a4d`
- cueSchemaVersion: `character-static-presentation-v1`
- emotionIds: `neutral`
- animationCueIds: `static`

Runtime capability projections are copied from the approved reviewed Seyeon typed runtime source. No new Saju meaning, personality, relationship mutation rule, Face semantics, or biography is introduced.

## Operational identities

These identifiers are publication identities only and do not create Character semantics:

- bundleId: `7439af18-36b3-495b-a87e-64fa4a3d2fef`
- releaseId: `6e126006-d953-43ec-b512-c15647584828`
- contentVersion: `seyeon-production-publication-v1`
- releaseKey: `seyeon-production-publication-v1`
- artifact: `docs/character/seyeon-production-publication-artifact-v1.json`
- artifact schema: `seyeon-production-publication-artifact-v1`
- contentHash: `sha256:v1:ff08ad287054db544ae354b1135e355a5223a8b0259148c0d3b76106cf6d2cdb`

## Non-authority

This decision does not:

- declare the exact-nine Character launch ready;
- publish another Character;
- fabricate missing Character canon;
- change Saju/Face truth;
- make relationship or memory writes an LLM authority;
- authorize later default replacement without a separate decision.

## First execution evidence

The first governed publication run reached the empty-Production and operator-role preflight before any publication command executed. It confirmed that the Production `postgres` deployment principal already holds membership in `myeongha_content_operator`.

That existing membership is deployment authority established outside this bootstrap. The bootstrap therefore uses `SET LOCAL ROLE myeongha_content_operator` and does not grant or revoke role membership. The failed first attempt performed no Character content mutation.

After bootstrap, the existing Production Member Seyeon one-turn smoke is the acceptance gate.

Watchtower-Track: character-memory
