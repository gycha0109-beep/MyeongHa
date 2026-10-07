# TOPIC-FACE-005M-B — Saju governed Face production transport

> Watchtower-Track: `topic-face`  
> Issue: #1696

## Goal

Consume the Saju-owned governed Face handoff HTTP boundary from MyeongHa without creating a second semantic authority.

Transport flow:

```text
MyeongHa server
→ existing production Saju service origin/bearer
→ POST /api/face/governed-character-handoff
→ source attestation header
→ runtime envelope validation
→ trusted sourceBinding validation
→ admitCharacterFaceGovernedInterpretationHandoffV1()
→ admitted governed Face handoff
```

## Request boundary

MyeongHa sends only:

```text
topicKey
observationArtifactRef
requestId
```

The adapter does not send or synthesize:

- authority receipts;
- execution plans;
- methodology refs;
- semantic claims;
- publication decisions;
- lens or direction;
- protected meaning;
- Character identity.

## Source attestation

The adapter requires:

```text
x-myeonghwa-face-governed-handoff-admitted:
face-governed-handoff-runtime-v1
```

and body:

```text
schemaVersion = face-governed-handoff-runtime-v1
```

The trusted eligible envelope carries a separate `sourceBinding`:

```text
sourceContractVersion
sourceAuthorityRef
sourceResultHash
topicKey
authorizationReceiptRef
```

MyeongHa does not derive this binding from the handoff body.

The pinned source contract is:

```text
saju-face-governed-interpretation-source-v1
```

The first four fields are supplied as `expectedSource` to the existing MyeongHa governed handoff admission validator. `authorizationReceiptRef` is then compared against the admitted handoff.

## Domain vs transport failure

`not_eligible` is a valid domain result and is returned unchanged.

Examples:

```text
source_blocked
neutral_topic
publication_not_authorized
metadata_incomplete
```

Operational/source failures are errors and stay distinct:

```text
timeout
network failure
HTTP 4xx/5xx
invalid JSON/content type
missing source attestation
runtime schema mismatch
source runtime failed
sourceBinding mismatch
handoff admission rejection
```

No failure is converted into a neutral Face interpretation or Character fallback.

## Current production state

Current Three-Divisions source authority remains blocked, so the production transport currently resolves:

```text
face.reading.three_divisions
→ not_eligible
→ source_blocked
```

This is expected behavior.

The TEST ONLY Saju 005K canonical fixture is used only to prove that an eligible HTTP envelope can cross the transport boundary and be admitted without semantic mapping.

## Character capability boundary

Transport eligibility is not Character authorization.

Current MyeongHa Character Face capability authority supports only:

```text
face.discover.structure
face.discover.extended
```

`face.reading.three_divisions` is not currently in
`CharacterFaceSupportedTopicKeyV1` and is not authored into the Seyeon Face capability profile.

005M-B therefore does **not** add the traditional topic to Seyeon's capability.

Required future sequence:

```text
Saju source authority eligible
→ MyeongHa transport admission
→ explicit Character capability/topic authority
→ admitted Face runtime/grounding identity
→ governed Seyeon reading plan
→ 005N durable commit
→ controlled reveal
```

The Character capability change must be separately authorized; transport success alone cannot widen Character topic authority.

## Acceptance

005M-B is complete when:

1. the existing production Saju HTTPS origin and service bearer are reused;
2. the exact governed Face endpoint and attestation are pinned;
3. blocked source state is preserved as `not_eligible`;
4. eligible synthetic wire material passes the existing MyeongHa admission without translation;
5. sourceBinding tampering is rejected;
6. handoff tampering is rejected;
7. source runtime failure is distinct from domain ineligibility;
8. no Character capability, semantic meaning, persistence or reveal authority is widened.
