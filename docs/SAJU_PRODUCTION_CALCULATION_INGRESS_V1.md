# Saju Production Calculation Ingress V1

Status: **implemented consumer boundary; calculation authority only**

## Producer authority

This ingress is pinned to the merged Saju producer contract at:

- repository: `gycha0109-beep/Saju`
- producer merge: `8ff3348531dcb4cbe1c4a3152261fe4c53e3fd87`
- HTTP response schema: `myeonghwa-production-calculation-http-v1`
- runtime: `myeonghwa-production-calculation-runtime-v1`
- authorized calculation policy: `myeonghwa-production-civil-midnight-v1`
- authority record: `docs/decisions/ADR-0006-production-calculation-default-v1.md`

The producer exposes this through its calculation-only `POST /api/calculations` boundary.

## MyeongHa ingress contract

`packages/domain/src/saju-production-calculation-ingress.ts` accepts an unknown producer response together with the MyeongHa Birth Profile revision that initiated the calculation.

It fails closed unless all of the following hold:

1. the producer HTTP schema and runtime are exactly the supported V1 values;
2. the authority metadata is the ADR-0006 production default;
3. the snapshot policy is the governed civil-midnight production policy;
4. snapshot provenance repeats that governed policy identity;
5. the returned birth input matches the bound MyeongHa birth revision for calendar type, date, time certainty/time, leap-month flag, and sex;
6. the same-version top-level and snapshot object shapes do not contain undeclared fields;
7. the four pillar facts crossing the ingress conform to the supported fact-state shape.

The returned MyeongHa artifact is:

- `myeongha-saju-production-calculation-ingress-v1`
- `kind = saju_calculation_evidence`
- `semanticAuthority = calculation_only`
- `interpretationAuthorized = false`

## Deliberate non-goals

This boundary does **not**:

- authorize production interpretation;
- produce a MyeongHa `Reading`;
- write `reading_refs`;
- inject calculation evidence into Character runtime context;
- accept narrative text or provider-authored interpretation;
- expose the producer's raw birth input downstream;
- retain unconsumed/open-ended producer internals such as normalized diagnostics, derived-fact payload extensions, datasets, or reading-like fields.

The existing `docs/SAJU_INTEGRATION_SPEC.md` Reading integration authority remains separately governed. In particular, calculation-only availability does not resolve the ProductReadingResponse / `SRC-33` interpretation-validation authority gap.

## Next integration step

A later execution adapter may perform the authenticated HTTP call and feed its response into this ingress. Persistence or Character/Reading use must be designed as a separate authority step; this V1 artifact must not be treated as interpreted Saju meaning.
