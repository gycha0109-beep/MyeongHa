# SRC-36 — Character Presentation Identity Mapping Authority

> Status: **OPEN / BLOCKING authoritative canonical Character → browser presentation projection**  
> Domain: Character / Web Presentation  
> Scope: thread-bound Chat presentation and any browser surface that must project a server-authoritative canonical `characterId` into a presentation key/name/asset set

## 1. Gap

The repository has approved exact-nine canonical Character identities, but it does not yet have a governed Production mapping from those canonical identities to the browser presentation namespace.

This is not a missing canonical-ID problem.

The approved immutable #551 authoring authority materializes:

```text
seyeon
yeoul
seorin
rahyeon
mira
taegyeom
yunho
doyun
baekheon
```

The current browser presentation catalog uses keys including:

```text
seyeon
yeoul
seorin
rahyeon
mira
taegyeom
yunho
doyoon
baekheon
```

The concrete `doyun` canonical id versus `doyoon` browser key mismatch proves that the two namespaces are not generally interchangeable. Equality for other entries is coincidence unless a governed mapping explicitly binds them.

## 2. Existing safe authority

Source-backed and enforceable now:

- canonical Character ids are approved by the immutable Character authoring authority;
- owner-scoped Chat read returns the canonical thread Character id;
- thread identity outranks browser `?character=` hints;
- the browser Chat read DTO preserves canonical `characterId` while stripping unsolicited presentation metadata;
- the browser Reader Scene DTO preserves canonical `readerCharacterId` but projects only an identity-neutral generic presentation until this gap closes;
- Chat Hub relationship-thread surfaces require a canonical UUID `threadId` and remain presentation-neutral; static discovery cards stay presentation-only and cannot decorate an authoritative thread;
- the generic Reader presentation object does not mirror canonical `readerCharacterId` into a presentation `id`/key slot; canonical identity remains a separate top-level field.
- `CharacterPresentationIdentityAuthorityPortV1` defines a server-side mapping contract scoped to an already-resolved content bundle;
- the resolver fails closed on missing, duplicate, wrong-key, or wrong-bundle mapping rows.

## 3. Missing Production authority

The repository does not currently define:

- where `presentationKey` is stored for published Character content;
- how a pinned `contentBundleId + characterId` resolves to the browser presentation key;
- whether presentation name/title/portrait/room assets are returned by one server projection or independently resolved from published content;
- alias/compatibility semantics when a browser key differs from canonical id;
- lifecycle semantics for presentation-key changes across immutable bundles/releases;
- the Production storage/query adapter behind `CharacterPresentationIdentityAuthorityPortV1`.

`CharacterContentDefinition` currently contains canonical `characterId`, `displayName`, and asset-related slots, but no `presentationKey` field. The existing resolver explicitly leaves its Production storage/query binding undecided.

## 4. Prohibited shortcuts

Until this authority is resolved, do not:

- treat `presentationKey === characterId` as a general invariant;
- derive presentation keys from romanization, display name, URL spelling, CSS selectors, or asset filenames;
- map canonical `doyun` to browser `doyoon` by convention alone;
- let `chat-character.js` static data become canonical server identity authority;
- project thread-bound canonical ids into static Character names/portraits/room art merely because most strings currently match;
- accept client-supplied presentation metadata as authoritative for an existing thread;
- pass a browser `presentationHint` or arbitrary `resolvePresentation(readerCharacterId)` callback into a server-authoritative Reader Scene and treat it as governed presentation authority.
- copy canonical `readerCharacterId` into a browser presentation `id`/key field and later treat that field as presentation namespace authority.

## 5. Required source resolution

A reviewed authority must define at minimum:

1. the canonical mapping source for `contentBundleId + characterId → presentationKey`;
2. whether the mapping is immutable bundle content, a versioned server projection, or another explicitly governed source;
3. exact alias/compatibility behavior for existing browser keys such as `doyoon`;
4. the bounded browser presentation DTO, including which name/title/asset fields are authoritative;
5. bundle/release pinning semantics so an existing thread renders against its pinned Character presentation authority;
6. failure behavior when presentation material is absent or incompatible.

This gap does not authorize choosing one of those designs.

## 6. Verification gate after resolution

At minimum:

- canonical `doyun` resolves to the explicitly approved browser presentation identity without string inference;
- canonical ids whose presentation key happens to be identical still pass through the same authority;
- wrong-bundle, duplicate, missing, or mismatched mappings fail closed;
- `?character=` cannot override a thread-bound canonical identity;
- browser DTOs cannot inject name/title/asset authority;
- pinned thread content renders from the correct immutable/versioned presentation source;
- changing a future presentation alias does not mutate canonical Character identity.

## 7. Promotion boundary

```text
canonical Character identity / owner-scoped Chat read
→ enabled

thread-bound Chat message rendering with identity-neutral labels
→ enabled

Reader Scene rendering with identity-neutral Reader presentation
→ enabled

canonical Character → named/styled browser presentation
→ BLOCKED by SRC-36

Production Character publication
→ independently blocked by Character Gate B/C until its own authorities close
```
