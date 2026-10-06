# SRC-15 — Client Capability / Asset Manifest Compatibility Decision Authority

**Status: RESOLVED FOR MVP EVALUATOR CONTRACT / PRODUCTION ACTIVATION STILL BLOCKED BY CONCRETE ASSET AUTHORITY**

## Source-backed requirement

Use Case 11.2 defines the client-facing `ContentManifest` shape as:

```ts
interface ContentManifest {
  contentVersion: string;
  minClientCapability: string;
  characterIds: readonly string[];
  assetManifestHash: string;
  cueSchemaVersion: string;
}
```

The same section requires unsupported remote content to be hidden, replaced by an authorized fallback, or handled as update-required without crashing the app.

Use Case 12.1 additionally requires remote content to activate only when the minimum client capability is satisfied. The final checklist separately requires client capability and asset-manifest compatibility before activation.

ERD v0.6 stores the relevant immutable bundle metadata as opaque fields:

```text
content_bundles.min_client_capability text
content_bundles.asset_manifest_hash text
content_bundles.cue_schema_version text
```

`artifact_ref` remains a private immutable artifact resolver key and is not part of the client-facing compatibility contract.

## Historical authority gap

The original source did not define:

1. capability identifier comparison semantics;
2. client-supported capability evidence shape;
3. asset-manifest comparison semantics;
4. cue-schema compatibility semantics;
5. fallback/update precedence;
6. final evaluator ownership and deterministic result shape.

Therefore lexical comparison, numeric suffix parsing, semantic-version coercion, direct hash comparison, or hard-coded fallback order were previously prohibited as implementation inventions.

## Resolution

The MVP decision is now fixed by:

`docs/source-authority-decisions/CHARACTER_CLIENT_CONTENT_COMPATIBILITY_V1.md`

The resolved contract is:

- MVP target = current Production Web Client only;
- all compatibility identifiers are opaque and unordered;
- the server owns the final compatibility evaluator;
- client self-asserted compatibility booleans are not authority;
- the server-owned client profile provides explicit supported identifier sets;
- capability, asset-manifest hash, and cue-schema checks use exact set membership only;
- no lexical, numeric, semantic-version, prefix, or suffix inference is allowed;
- malformed compatibility evidence fails closed by hiding the remote content;
- asset-manifest mismatch hides the remote content;
- capability-only or cue-schema-only mismatch returns update-required;
- all three checks must pass before activation;
- automatic fallback bundle/asset/cue selection is not part of MVP authority;
- no new compatibility DB state is introduced.

The executable domain evaluator is:

`packages/domain/src/character-content-compatibility.ts`

## Remaining production blockers

Resolving this comparison protocol does **not** approve concrete Production asset values.

The following remain independently blocked until their own authority and evidence are complete:

- concrete Production `assetRefs`;
- concrete emotion and animation cue identifiers;
- concrete cue schema value;
- concrete asset-manifest hash and source provenance;
- asset ownership/licensing evidence;
- Production ContentBundle/ContentRelease publication;
- positive Member Chat Production activation;
- public Chat route activation.

The existing Gate B/C boundaries in
`docs/source-authority-decisions/CHARACTER_RUNTIME_ASSET_AUTHORITY_REQUEST_V1.md`
remain unchanged.

## Activation consequence

SRC-15 no longer blocks implementation because of an undefined comparator/evaluator protocol.

Production remote Character content must still fail closed until a separately approved concrete client profile and concrete asset package exist. A passing synthetic/unit-test profile is not Production activation evidence.

Watchtower-Track: character-memory
