# SRC-36 — Character Presentation Identity Mapping Authority

> Status: **RESOLVED / IMPLEMENTED exact-name mapping**  
> Domain: Character / Web Presentation  
> Decision: canonical Character id and browser presentation key use the same approved English identifier for the exact-nine roster.

## 1. Approved product rule

```text
seyeon   → seyeon
yeoul    → yeoul
seorin   → seorin
rahyeon  → rahyeon
mira     → mira
taegyeom → taegyeom
yunho    → yunho
doyun    → doyun
baekheon → baekheon
```

This is explicit product authority, not romanization inference. The legacy browser spelling `doyoon` is retired as an identity key. Existing asset filenames may retain `doyoon` as a file-path detail; filenames are not Character identity authority.

## 2. Runtime boundary

- owner-scoped server reads still provide canonical `characterId` / `readerCharacterId`;
- the browser projects a named presentation only after receiving one of the approved exact-nine canonical ids;
- URL `?character=` remains presentation/discovery input only and cannot override thread authority;
- Chat mutation continues to use canonical thread/server authority, never the presentation key;
- unknown Character ids fail to generic/neutral presentation rather than being romanized or guessed.

The shared browser mapping is `apps/web/character-presentation-identity.js`.

## 3. Independent gates

This resolves the identity namespace question. Character publication/assets remain independently governed by Character Runtime Asset Gate B/C. Relationship thresholds remain governed by SRC-22.

## 4. Verification

- all nine canonical ids resolve by exact equality;
- `doyun` is the only Character identity key for 도윤;
- `doyoon` is not accepted as Character identity;
- thread-bound canonical identity outranks URL presentation hints;
- browser mutation payloads do not regain Character authority;
- unknown ids remain fail-closed.
