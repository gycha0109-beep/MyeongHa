# SRC-15 — Client Capability / Asset Manifest Compatibility Decision Authority

**Status: BLOCKING BEFORE REMOTE CONTENT COMPATIBILITY VERDICT / ACTIVATION GATE FINALIZATION**

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

The same section requires an insufficient client capability to be handled by hiding unsupported content, using a compatible fallback asset/cue, or prompting an update, and states that remote content must not crash the app.

Use Case 12.1 additionally requires:

```text
apiContractVersion
minimumSupportedClientCapability
contentCapabilityVersion
```

and fixes the rule that remote content activates only when `minClientCapability` is satisfied. The final checklist separately requires remote content to pass both client capability and asset manifest compatibility before activation.

ERD v0.6 stores the relevant immutable bundle metadata as opaque fields:

```text
content_bundles.min_client_capability text
content_bundles.asset_manifest_hash text
content_bundles.cue_schema_version text
```

`artifact_ref` remains a private immutable artifact resolver key and is not part of the client-facing manifest contract.

## Missing authority

The source requires a compatibility decision but does not define the decision algorithm or the complete evaluator input. In particular, it does not specify:

```text
1. capability identifier grammar and ordering/comparison semantics
   - whether capability is semver, ordinal registry key, feature set, or another representation

2. client-supported capability input shape
   - one scalar version, a capability set, per-platform registry, or negotiated contract

3. asset compatibility comparison contract
   - whether assetManifestHash represents the required remote manifest, installed client inventory,
     a signed manifest identity, or another compatibility proof

4. cue compatibility semantics
   - how cueSchemaVersion relates to client capability and fallback cue support

5. fallback selection authority
   - which compatible fallback bundle/asset/cue is chosen and how that choice remains deterministic

6. final evaluator ownership
   - server, client, or a split protocol; including what evidence is persisted for an activation decision
```

The presence of two opaque strings such as `client-cap-v3` and `client-cap-v2` is not sufficient authority to infer lexical, numeric, semver, or ad-hoc ordering. Likewise, equality or inequality of two asset hashes is not by itself a defined asset-compatibility algorithm.

## Allowed implementation before resolution

The following bounded projection is source-backed and may remain active:

```text
qry_content_bundle_manifest_v1(content_bundle_id)
→ contentVersion
→ minClientCapability
→ characterIds
→ assetManifestHash
→ cueSchemaVersion
```

It provides the published compatibility inputs without making a compatibility verdict and does not expose `artifact_ref`, raw `manifest_jsonb`, release rollout internals, or other private authority.

## Forbidden claims before resolution

Until source authority defines the missing comparison/evaluator contract, implementation must not claim that it has completed any of the following:

```text
client capability satisfied / insufficient
asset manifest compatible / incompatible
cue schema compatible / incompatible
remote content safe to activate
fallback bundle/asset/cue selected authoritatively
forced-update decision derived authoritatively
```

A lexical comparison, numeric suffix parsing, semver coercion, direct hash equality rule, or hard-coded fallback order would be an implementation invention and is therefore prohibited.

## Source decision required

Source authority must define either a complete compatibility protocol or an equivalent governed contract covering at minimum:

```text
capability representation + comparator
client capability evidence/input
asset compatibility evidence/input + comparison rule
cue compatibility rule
fallback/update decision precedence
final evaluator ownership and deterministic result shape
```

Only after that decision may the compatibility verdict become production activation authority.
