# FR-51 authority decision

## Decision

FR-51 selects the FR-35 `neutral.face.chin_inferior_contour` anatomical scope class as:

`central_inferior_soft_tissue_chin_boundary`

This resolves the broad scope question only. It does not resolve exact lateral endpoints, dense curve geometry, canonical 2D extraction, provider mapping, or traditional equivalence.

## Evidence admitted

Traditional transmitted witness evidence:

- `頦為地閣` in the transmitted `神相全編六〈神異賦〉` witness.
- `地閣在承漿之下，頤頦之間` in the same transmitted witness.
- `地閣為頦` repeated in the same page context.
- `地庫在兩頤` elsewhere in the same transmitted text, preserving bilateral 頤 under a different traditional label.
- the same text separately discusses `重頤豐頷`, further preventing the whole broad lower jaw/cheek area from being silently collapsed into 地閣.

Historical anatomical corroboration:

- `御纂醫宗金鑒` identifies `地閣骨` with `頦` / `下巴骨`, corroborating chin-region terminology without proving a soft-tissue landmark equivalence.

Modern neutral geometry:

- Zupan et al. 2022 distinguishes midline Menton and bilateral Menton-side points from separate bilateral Gonion landmarks.
- Windhager et al. 2019 defines a materially broader lower-jawline construction running from Otobasion inferius to Menton.

Together these sources support selecting a central inferior chin boundary scope instead of the full ear-to-Menton lower jawline.

## Explicit non-equivalences

FR-51 does not assert:

- `地閣 == soft-tissue Menton`;
- `地閣 == selected neutral curve`;
- `Menton-side == traditional 地閣 edge`;
- `left/right Menton-side == exact FR-35 endpoints`;
- `FR-50 three-point scaffold == dense FR-35 curve`;
- `Otobasion inferius -> Menton lower jawline == FR-35 chin_inferior_contour`;
- `Gonion` or `Otobasion inferius` is a required FR-35 endpoint;
- `FACE_OVAL == reviewed chin contour`;
- MediaPipe index `152 == Menton`;
- any production 三停 / F1 / F6 / geometry promotion.

## Consequence

The blocker changes from:

`exact anatomical extent of FR-35 chin_inferior_contour unresolved`

to:

`central inferior soft-tissue chin boundary selected as the scope class; exact left/right endpoint rule and dense curve construction remain unresolved`.

That is a scope adjudication, not a provider or traditional-semantic equivalence decision.
