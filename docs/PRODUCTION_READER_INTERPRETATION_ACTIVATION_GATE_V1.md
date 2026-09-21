# Production Reader Interpretation Activation Gate V1

## Status

This gate is fail-closed and does **not** activate a public Reader Interpretation route.

The reviewed Hosted Reader Grounding Canary evidence is pinned to:

- Hosted Canary run: `35624392882`
- Saju source: `54667c70e46140b004d3b81c5797191538f6cbc3`
- MyeongHa source: `a2873e4546e5a7cea822ce9ccc2878f4de5e9711`
- Hosted Canary result: health PASS, authenticated grounding PASS, Reader Preview envelope PASS, wrong Bearer denied, revoked Reader denied before transport, Production mutation NONE.

## Activation modes

- `off`: default when configuration is absent. No Reader Interpretation Production execution is admitted.
- `internal_preview`: bounded authenticated cohort only. This is not public activation.

There is intentionally no `public` mode in V1.

## Internal preview requirements

`internal_preview` fails closed unless all of the following are present:

1. explicit policy version;
2. one to three lowercase SHA-256 subject hashes;
3. exact reviewed Hosted Canary run ID;
4. exact reviewed Saju source SHA;
5. exact reviewed MyeongHa source SHA.

Raw subject IDs are not accepted in the activation allowlist.

## Runtime order

For the canonical PostgreSQL execution path, identity is resolved to the transaction-bound
`subjects.id` first. The activation hash is evaluated from that canonical subject, not
from a browser value or upstream auth-provider identifier.

```text
verified auth evidence
→ canonical subjects.id transaction binding
→ internal-preview activation gate
→ Reader/thread/Reading/content/context authority
→ reviewed Character perspective admission
→ Saju grounding transport
→ bounded rendering + semantic guard
→ Reader Scene safe DTO
```

When the mode is `off` or the canonical subject is outside the cohort, the transaction
rolls back without constructing Reader context ports and without touching thread,
Official Reading, content, relationship, Memory, or Saju grounding authority.

After activation admission, the existing hardened Preview HTTP seam remains authoritative for:

- authenticated subject;
- browser request schema;
- thread / Reader / Reading binding;
- Official Reading access and artifact authority;
- pinned Character content release;
- relationship and Memory authority;
- Saju-owned grounding;
- admission/hash identity checks;
- reviewed Character perspective;
- bounded rendering;
- semantic-preservation fallback.

## HOLD boundaries

V1 does not:

- register or expose a public Production Reader Interpretation HTTP route;
- enable arbitrary subjects;
- add percentage rollout;
- change Official Reading Source Truth;
- move Saju semantic authority into MyeongHa;
- activate Commerce, Product Offers, Charge Terms, PortOne, or payment;
- add Se-yeon or Yeo-ul semantic mappings.

A future public activation requires a separate reviewed change and explicit approval.


## Production composition authority status

The composition boundary remains fail-closed where source authority is not yet complete.

- Reader Scene HTTP projection exposes only Character/domain plus segment `kind` and
  `text`; renderer IDs, Reading refs, plan refs, grounding unit refs, framing keys,
  disclosure refs, content hashes, and DB provenance are not browser DTO fields.
- Reviewed Character perspective admission happens before Saju grounding transport.
  A Reader without a reviewed perspective cannot trigger the cross-service Saju call.
- Production immutable Character/world artifact recovery is **not** synthesized from
  DB runtime metadata. `content_bundles.artifact_ref` is a private resolver key, but
  current source authority still blocks concrete Production Character asset payload
  approval/publication (Character Runtime Asset Gate B/C).
- Reader-granted current Life Facts are now re-read through the owner-scoped
  PostgreSQL authority introduced by PR #1201; caller/context-provider Life Fact
  injection is rejected before runtime assembly.
- Relationship rendering still requires source-backed
  `relationshipProjectionPolicy` plus an approved relationship-event window, and
  recent messages still require an approved server-owned message window. SRC-22
  remains open, so test thresholds, arbitrary limits, or invented empty history must
  not be promoted into Production composition.

Accordingly, this change hardens the composition order and browser projection but does
not claim a positive end-to-end Production Reader Scene until the immutable content
artifact and relationship projection authorities are source-complete.
