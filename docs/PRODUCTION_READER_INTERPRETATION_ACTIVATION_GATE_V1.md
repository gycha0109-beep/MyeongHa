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

The Production wrapper checks activation before any Reader context, Official Reading authority, Memory authority, or Saju grounding transport is touched.

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
