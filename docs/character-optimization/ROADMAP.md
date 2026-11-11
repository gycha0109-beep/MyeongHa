# Character GEPA Offline Optimization — Implementation Roadmap

Authority: MyeongHa Character GEPA architecture v0.3 (2026-11-11). This document records the **new common GEPA track** and does not supersede Character Bible, Runtime, Memory, Relationship or production authorities.

## Final goal

A single offline optimization runner supports character-specific and shared expression slots, independent evidence for each character, approved OpenRouter model routing, bounded student/reflection/judge/holdout calls, private feedback, sealed final tests and explicit owner-controlled release. It does not fine-tune models or run GEPA for every user reply.

## Implementation steps / evidence

- [x] A (foundation, partial): standalone shared profile and multi-character run contracts; immutable hashes, distinct model/routing, allowed mutable slot only; 9 character IDs; Yeoul historical diagnostic bridge built and privately smoke-checked against reconstructed 288 ratings (72 DeepSeek; 36 positive). 17 synthetic Node tests. Original uploaded JSON raw bytes not authenticated; 24 review and 104-turn artifacts are not yet integrated, so full A remains incomplete.
- [ ] A completion: adapt Yeoul's private 288/24/104 outputs without changing totals; second-character synthetic profile through a stable versioned bridge.
- [x] B (foundation, partial): development/validation/holdout/long-horizon family collision checks; hard-gate metadata feedback; per-character no-regression; no text in cross-process metadata. Structural checks do not prove semantic equivalence or natural-language safety.
- [ ] B completion: existing Context Composer/Output Guard authority integration, dedicated R16 rubrics, scenario-family semantic review and private data access policy.
- [x] C (foundation, partial): Python offline plan preflight and GEPA installed API signature probe (no optimization execution); SQLite atomic reservation and unknown-charge retention tested locally. Does **not** implement a production-grade outbound egress gateway or confirm actual GEPA runtime compatibility.
- [ ] C completion: pinned compatible Python/GEPA dependency lock, genuine network-isolated GEPA fake evaluator execution, one controlled outbound-only gateway for all roles, private process and holdout mount isolation; prove bypass attempts fail.
- [ ] D: approved Yeoul review inputs, independent development/validation families, paid pilot plan including precise models, provider, spend cap, stop rules and owner decision.
- [ ] E: explicitly approved paid Yeoul DeepSeek optimization and separately sealed human-blinded comparison.
- [ ] F: characterize further characters individually before any shared optimization is promoted to their use.
- [ ] G: independently authorized versioned release and rollback; no silent updates to existing chats.

No paid experiments, model replacement, prompt publication or review approvals are granted by this roadmap. `ROADMAP_COMPLETE` not established.