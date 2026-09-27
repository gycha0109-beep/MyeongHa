# TOPIC-FACE-005F-A — Face Voice + Delivery Authority

Status: implementation contract  
Tracking: #1349  
Watchtower-Track: topic-face

## Goal

Establish the Character-owned delivery authority required by the production Face renderer without widening Face semantic authority.

## Voice surface

Published Character voice continuity now supports:

- `general_chat`
- `saju_product`
- `face_product`

A Face-bearing runtime resolves the same published `speech` and `persona.communication` objects under the `face_product` surface.

No Face-specific Character voice override is created.

## Runtime invariant

`assertCharacterFaceVoiceRuntimeInvariantV1()` requires:

- admitted Face context;
- published Character voice authority;
- `surface === face_product`;
- active Character identity parity;
- active Character content-version parity;
- exact published speech object identity;
- exact published communication object identity.

## Delivery profile

The Face delivery profile is source-backed and may choose only code-owned bounded presentation controls:

- locale: `ko-KR`
- neutral fact style: `plain | soft_observation | compact`
- unavailable style: `direct | soft`
- code-owned safe reaction framing key
- code-owned safe follow-up framing key per authored question strategy

The profile cannot author arbitrary templates or arbitrary visible prose.

## Semantic boundary

The delivery profile contains no:

- thresholds;
- morphology classifications;
- personality/fate/wealth mappings;
- traditional Face promotion;
- relationship-owned Face meaning;
- provider prompt;
- Commerce fields.

It controls delivery form only.

## Named Character authoring

This slice defines the generic authority contract and engineering fixtures only.

No named Character Face delivery profile is published yet.

## Next

TOPIC-FACE-005F-B consumes the admitted delivery profile plus the deterministic Face Reading Plan and emits a bounded neutral Face utterance.
