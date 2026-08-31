# Human Face-Count Annotation Packet

## Allowed response vocabulary

- `zero_human_faces`
- `one_human_face`
- `multiple_human_faces`
- `indeterminate`

## Instructions

1. Inspect only the presented canonical image and choose exactly one label from labelVocabulary.
2. Do not infer or report identity, demographics, emotion, attractiveness, health, personality, or physiognomic meaning.
3. If the visible image does not support a reliable categorical human-face-count judgment, choose indeterminate.

Return one allowed label for each opaque item reference through the controlled annotation session. Do not add identity or other facial inferences.
