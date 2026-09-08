# Character Concept-Art Material Status

Status: operational inventory only; this document does not create Character canon or Production publication authority.

## Current male concept-art material state

The authored text visual direction remains unchanged for the approved male Characters below, but concrete concept-art files are currently treated as absent/pending publication material:

| characterId | displayName | concrete concept-art material |
| --- | --- | --- |
| `taegyeom` | 태겸 | `ABSENT_PENDING` |
| `yunho` | 윤호 | `ABSENT_PENDING` |
| `doyun` | 도윤 | `ABSENT_PENDING` |
| `baekheon` | 백헌 | `ABSENT_PENDING` |

`ABSENT_PENDING` means no concrete asset reference may be fabricated to satisfy the Production bundle. It does not revoke or modify the existing immutable text visual authoring.

This status does not make any claim about the readiness of the five female Characters' concrete art packages.

## Publication boundary while material is absent

Production publication must remain fail-closed for a Character until concrete source-backed values are supplied for all of the following publication material:

- asset references for the actual renderer/concept-art package;
- renderer emotion IDs;
- animation cue IDs;
- bundle cue schema version;
- immutable asset-manifest provenance and its versioned hash.

Engineering fixtures or placeholder strings are not substitutes for these values.

## Handoff when art is finalized

When concrete art is delivered, the publication handoff should provide the real files/references and provenance first. The Character-content Production validator can then verify that the material slots are non-empty before the existing bundle/release lifecycle is used.

No future image, emotion ID, animation cue ID, asset reference, checksum, provenance record, or manifest hash is approved by this status document.
