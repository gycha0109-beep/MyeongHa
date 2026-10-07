# TOPIC-FACE-005K — Saju governed wire compatibility

The canonical `test/fixtures/saju-face-governed-v1.json` is copied unchanged from
Saju's 005K source test fixture, including the source authority receipt, execution
plan, semantic receipt and emitted handoff. Its `synthetic_contract_only` marker
and `test-only:` authority refs are deliberate. It is never imported by runtime.

`test/character-face-saju-governed-compatibility.test.ts` passes that exact object
to the current consumer validator. It performs no lens/direction mapping, no
metadata completion and no semantic rewrite. Selection uses source order and
the current three-unit bound. Protected text, conditions, qualifiers and refs
remain equal to the emitted source unit; tampered hash/receipt/source bindings
reject.

This proves wire compatibility only. It does not authorize Three Divisions,
connect an actual production provider, prove durable DB commit, or complete the
005M–005O vertical flow. The current source authority has no real eligible topic.
Source reconstruction/authorization-receipt validation must remain a trusted
server responsibility when 005M supplies the actual Saju provider. A consumer
content hash by itself does not establish source authorization.

Related source contract: Saju `docs/product/37-face-governed-interpretation-handoff.md`.
MyeongHa baseline inspected: `dd83b8b307e30c6982c6902c010037d266cb7322`.
