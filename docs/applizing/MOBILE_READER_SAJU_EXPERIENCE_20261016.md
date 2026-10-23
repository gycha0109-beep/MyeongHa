# Mobile Reader Saju Experience — implementation ledger (2026-10-16)

Watchtower-Track: applizing

## Target product flow
Saju tab → Reader selection → Reader-specific animated/video reading scene → hold the scene's final frame → server-authoritative step-by-step interpretation → completion → [Chat] [Records].

Records must provide official Reading details, source evidence, flow and terminology where those fields are **actually present in the stored artifact**. Chat follow-up must reference only a server-authorized Reader-to-Reading relationship, never an app-provided claim.

## Shipped candidate A — authorized Preview
- Preserve original member/guest Saju calculation and five currently approved Preview topics.
- Move Reader selection to the front of the Saju screen. Only Seyeon is selectable for preview, as before.
- Route approved topics into `/reading/scene`. Reject unknown Reader/topic and unapproved topics *before* any server call.
- Existing bundled Seyeon portrait and scene background power a **2D animated scene** with a held end frame; no video footage has been supplied or packaged, so **do not call this a rendered video clip**.
- Server-delivered Preview steps are read sequentially, with opt-in expansion of the source's supporting text / structure / notices. Neither a persona-generated extra claim nor a new Saju interpretation engine is introduced.
- Completion routes to the existing Chat hub or the already-authorized Reading archive tab. Chat is **ordinary Chat only**; no faux memory injection. Free Preview is **not** persisted to Official Reading records, and the completion UI says so.
- Listener invalidates old session results when credentials change; no cross-owner transfer, grant bypass or entitlement bypass.

## Pending B — full video / official Reader experience (not activated)
1. Approve and supply **Reader-specific cinematic asset(s)**: video clips, illustrated frames, or animation sprite atlas plus a documented final-frame image, performance and replay requirements. Replace the Preview 2D-motion substitute without breaking final-frame hold, error states or accessibility.
2. Wire the existing server-owned `ReaderInterpretation` pipeline after independently verified Official Reading, approved Reader/thread bindings, exact Grant/T2 and production release gates. `MOBILE_READER_INTERPRETATION_PUBLIC_V1` stays **false** until all prerequisites pass. Never use a selected portrait as Reader authority.
3. Complete official Reading archive detail: preserve original stored report, date, section-by-section claims, evidence, temporal flow, and glossary **only if supported by official response schema**. If schema lacks flow/glossary, inventory and approve canonical fields before rendering; do not invent terms or evidence.
4. Introduce auditable Reading→Reader Chat continuity only with server-verified reader, officialReadingId, owner/grant, and controlled scope. Do not write a synthetic "Seyeon knows this reading" memory. Default path remains ordinary Chat hub until authorized.
5. Tests: guest/member credential mutation during requests, absent or revoked grant, not-delivered responses, unapproved topics, replay and frame hold, archive access after sign-out, reader-specific knowledge isolation and paid-content replay.
6. Produce a fresh exact-main **Android** APK after mobile UI changes pass general and full Integration CI; real-device UX still requires acceptance.

## Rules
- Presentation Reader selection does not create any entitlement.
- Never store a free Preview in the Official Reading archive or present it as durable.
- No changes to DB role grants, RLS, SKUs, payment or source authority.
- The web's existing staged Preview view is a pattern for interaction, **not evidence** that the official Reader animation, saved report, or paid Reader interpretation has been activated.
