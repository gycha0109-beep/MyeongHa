# Character Gate B Presentation Asset Inventory v1

> Status: **EVIDENCE ONLY / NON-AUTHORITY / NOT PRODUCTION PUBLICATION MATERIAL**
>
> Fresh main evidence: `195fe1fb0af5c3d2f2ef1556085710d669bec50e`
>
> Track: `topic-face`
>
> Purpose: record the exact Character presentation files referenced by the current web client while preserving the existing Gate B fail-closed boundary.

## 1. Authority boundary

This document records **repository presence and current presentation usage only**.

It does not authorize any of the following:

```text
Production Character assetRefs
emotionIds
animationCueIds
cueSchemaVersion
asset ownership/licensing provenance
SHA-256 publication checksums
cue-to-asset mappings
assetManifestHash
ContentBundle / ContentRelease IDs
Production publication or activation
```

The current Gate A authority remains unchanged: Production publication requires a separately approved, source-backed concrete payload and provenance package.

A Git blob SHA in this inventory is **not** the Gate B publication checksum contract and must not be converted into, represented as, or substituted for `sha256:v1:<64 lowercase hex>` asset-manifest evidence.

## 2. Current portrait presentation refs

Fresh `apps/web/chat-hub.js` currently references exactly these nine portrait assets:

| characterId | current presentation ref | Git blob SHA | bytes |
| --- | --- | --- | ---: |
| `seyeon` | `apps/web/assets/characters/seyeon-portrait-v2.webp` | `fb6023d7567533130314af857ab1573c51276924` | 33710 |
| `yeoul` | `apps/web/assets/characters/yeoul-portrait-uploaded.svg` | `718e0ae93f63989731b873c43a6c6f0f3b983ff9` | 44298 |
| `seorin` | `apps/web/assets/characters/seorin-portrait-v2.webp` | `971146b17bf32e90dc54f8730108d0e3dd4084d1` | 41168 |
| `rahyeon` | `apps/web/assets/characters/rahyeon-portrait-v2.webp` | `b2f719bc7a44f9fcf31c3e51e9586bba8b10cc52` | 17238 |
| `mira` | `apps/web/assets/characters/mira-portrait-uploaded.svg` | `fd7c3fd6bfb1fd814584bd455d0858f9f34494d0` | 46090 |
| `taegyeom` | `apps/web/assets/characters/taegyeom-portrait-v2.webp` | `785d02ecf99e7ab3b06defc1eb67b928a4519429` | 13488 |
| `yunho` | `apps/web/assets/characters/yunho-portrait-v2.webp` | `a2dc76e6aca00528403a236c81b3686798f59ec9` | 33568 |
| `doyun` | `apps/web/assets/characters/doyoon-portrait-v2.webp` | `8a0b80c2d03e573ae5370778114ed3d6a46bf0e1` | 38218 |
| `baekheon` | `apps/web/assets/characters/baekheon-portrait-v2.webp` | `da7c65a141b6f1a8d80a36a06db225f323c6ec72` | 14998 |

The `doyun` canonical Character ID currently points to a presentation filename using the historical `doyoon` spelling. This inventory records that exact existing presentation fact and does not authorize a canonical-ID change or filename migration.

## 3. Current room presentation refs

Fresh `apps/web/conversation-v2.css` currently references exactly these nine room assets:

| characterId | current presentation ref | Git blob SHA | bytes |
| --- | --- | --- | ---: |
| `seyeon` | `apps/web/assets/characters/rooms/seyeon-room.webp` | `5fba7b7d467a7f9d6c9ed0734d353141fde7074b` | 281150 |
| `yeoul` | `apps/web/assets/characters/rooms/yeoul-room-uploaded.svg` | `def4c88d0de976b8573e4af22ff493695f52b8c2` | 130049 |
| `seorin` | `apps/web/assets/characters/rooms/seorin-room.webp` | `828de5e593b1a9eb47e5dc0d3a6045581ba65af0` | 257110 |
| `rahyeon` | `apps/web/assets/characters/rooms/rahyeon-room.webp` | `ed7ae2cef2909056dc1b1e2e09f9ca6822f5ce03` | 183870 |
| `mira` | `apps/web/assets/characters/rooms/mira-room-uploaded.svg` | `148adf39b3e010aafb1f8ecb0ce4cc2f3ede9c33` | 143797 |
| `taegyeom` | `apps/web/assets/characters/rooms/taegyeom-room.webp` | `d77d05d924c7314f06a6bbcb909afaf4bcfe22ab` | 157412 |
| `yunho` | `apps/web/assets/characters/rooms/yunho-room.webp` | `fdbfc56b76588072a6bcf1f666873ba006a3e3aa` | 224184 |
| `doyun` | `apps/web/assets/characters/rooms/doyoon-room.webp` | `e0dfe30a5e8ca422abd3b06cbd7a9e3559bbdb8e` | 207850 |
| `baekheon` | `apps/web/assets/characters/rooms/baekheon-room.webp` | `70efae6663e0a8013af2d24c28cf51924b53660a` | 125780 |

## 4. Why these files are not Gate B authority

Current presentation usage proves only:

```text
file exists in repository
+
web presentation code references it
```

It does **not** prove:

```text
approved Production asset identity
approved owner/licensor + usage scope
approved stable assetRef
approved SHA-256 content checksum
approved renderer emotion/animation registry
approved cue-to-asset mapping
approved canonical manifest
```

This distinction is especially important because `docs/CHARACTER_CONCEPT_ART_MATERIAL_STATUS.md` still records concrete male concept-art publication material as `ABSENT_PENDING`, and `docs/source-authority-decisions/CHARACTER_RUNTIME_ASSET_AUTHORITY_REQUEST_V1.md` explicitly keeps Gate B concrete payload approval blocked.

Therefore current UI presentation files must not be silently promoted into Production Character publication inputs.

## 5. Useful Gate B consequence

The remaining Gate B work no longer needs to ask whether repository presentation files exist. They do.

The next authority question is narrower:

1. which of these existing files, if any, are explicitly approved as Production source assets;
2. what owner/licensor and usage-scope evidence backs each approved asset;
3. what stable `assetRef` contract is approved;
4. what exact SHA-256 checksum is derived from each approved source file;
5. what exact `emotionIds`, `animationCueIds`, and `cueSchemaVersion` are source-authorized;
6. what cue-to-asset mapping is approved;
7. what canonical manifest and reproducible `assetManifestHash` follow from that approved package.

Until those questions are answered by a separate source-authority decision, this inventory remains evidence only.

## 6. TOPIC-FACE-005I relation

TOPIC-FACE-005I requires an actual published Character `characterId + contentVersion` before a named Face Capability / Perspective / Delivery binding may be created.

This inventory does not unblock that requirement by itself. It removes ambiguity about current repository presentation material while preserving the publication gate.

Refs #1371 #1372 #578 #1275.

Watchtower-Track: topic-face
