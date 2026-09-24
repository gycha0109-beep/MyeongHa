# SRC-34 — Chat Thread Creation Authority

> Status: **PARTIALLY RESOLVED**  
> Production status: **Member + Launch Character single-character create/reuse is authorized and implemented**  
> Still blocking: **Guest create/open, first-meeting side effects, archived-thread resume policy, multi-character creation, and future conditional/non-Launch Character composition**  
> Domain: Conversation / Character / Content / World  
> Resolution authority:
> - `docs/source-authority-decisions/CHARACTER_LAUNCH_MVP_AUTHORITY_V1.md`
> - `supabase/migrations/0970_member_character_thread_open_runtime_authority.sql`
> - `apps/api/src/chat-open-http.ts`

---

## 1. Resolution overlay

The original SRC-34 gap correctly identified that the relational model alone did not decide how a selected Character becomes one concrete owner-scoped Chat thread.

That gap was later **partially resolved** by the approved product authority `CHARACTER_LAUNCH_MVP_AUTHORITY_V1` on 2026-09-06.

For the MVP Member path, the approved rule is now:

```text
normal Member
+ Launch roster Character
→ current active default release/bundle
→ at most one active single-character thread per (Member, Character)
→ existing thread: reuse
→ no existing thread: create
→ concurrent/retried open requests converge on one logical active thread
```

This decision supersedes the earlier SRC-34 statements that treated all production-authoritative Character thread creation as blocked.

SRC-34 is **not fully closed**. The decision deliberately leaves several creation semantics outside the approved Member MVP slice.

## 2. Source-backed Member MVP authority

### 2.1 Character eligibility

The Launch roster is exactly:

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

All nine Launch Characters are available to normal Members from launch. The Member open command must still verify actual published/runtime availability from server-owned content authority; a browser `unlocked=true`, presentation card, or arbitrary caller Character id is not authorization.

Future conditional or non-Launch Character eligibility remains outside this resolution and continues to compose with the unresolved unlock authority.

### 2.2 Release/bundle resolution

For the Member MVP there is no cohort, percentage rollout, allowlist rollout, or subject hash.

```text
Member
→ current active default release
→ its content_bundle_id
→ pin that exact pair when a new thread is created
```

An existing thread keeps its pinned release/bundle when the global default later changes.

The detailed generic client/content compatibility evaluator remains a separate SRC-15 concern. SRC-34 does not authorize inventing a new comparator or fallback algorithm.

### 2.3 Reuse and concurrency

The approved logical aggregate is:

```text
(Member subject, Character, active single-character)
→ cardinality <= 1
```

Selecting the same Character again reuses the existing active thread. If no active thread exists, one is created.

Retries and concurrent opens must converge on the same logical active thread. The Member MVP therefore does not require a caller-visible idempotency key for this open operation.

### 2.4 Creation shape

A newly created Member single-character thread is required to:

- belong to the server-resolved canonical Member subject;
- use `thread_type = 'single_character'`;
- be active;
- pin the resolved active default release/bundle;
- create exactly one active primary Character participation for the selected Character;
- keep the participation bundle equal to the thread bundle;
- start without inventing first-meeting messages, World Events, Relationship Events, or outbox effects.

Those omitted side effects are omissions by explicit scope, not implied negative product decisions for future versions.

## 3. Current executable boundary

The production Member path is:

```text
POST /api/chat
→ authenticated identity evidence
→ server-resolved canonical Member subject
→ canonical Character id only
→ public.cmd_open_member_single_character_thread_v1
→ lock canonical Member subject
→ resolve active default release/bundle
→ verify Character published + currently available
→ detect existing active single-character thread
   ├─ exactly one valid thread → reuse
   ├─ none → atomically create thread + primary participation
   └─ duplicate/malformed state → fail closed
→ return { threadId, characterId, created }
```

The browser must not supply subject id, release id, bundle id, unlock state, thread ownership, or reuse policy.

Guest callers are not silently upgraded into this Member authority. The current HTTP boundary rejects the Guest path.

## 4. Still unresolved under SRC-34

The following remain outside the approved Member MVP create/reuse slice.

### 4.1 Guest thread create/open

No Guest creation policy is established here. Do not copy the Member policy onto Guest subjects.

### 4.2 First-meeting side effects

Still unresolved:

```text
automatic first-meeting message
World Event
Relationship Event / initialization
outbox/domain event
other first-contact durable effects
```

The current Member open command intentionally creates none of these.

### 4.3 Archived thread semantics

The decision does not establish whether selecting a Character with an archived prior thread should resume it, restore it, or create a new thread under a future lifecycle policy.

### 4.4 Multi-character creation

Multi-character thread creation remains outside this authority.

### 4.5 Future conditional / non-Launch Characters

Launch 9 are default-available for Members. Future Characters that require unlock/world-state conditions still need the relevant source authority and must not inherit Launch eligibility automatically.

## 5. Composition with other source authorities

```text
CHARACTER_LAUNCH_MVP_AUTHORITY_V1
→ closes the Member Launch-9 create/reuse decision needed by this slice

SRC-15
→ generic Production Web Client/content compatibility evaluator remains separate

SRC-16
→ closed for Member MVP by uniform active-default rollout

SRC-23
→ not required for Launch 9; still relevant to future conditional Characters

SRC-27
→ release lifecycle is only partially resolved; thread open may consume the
  approved active default but must not invent publication/retirement authority

SRC-34
→ partially resolved for Member Launch-9 single-character create/reuse
```

Closing the Member open slice does **not** authorize Reader → Chat continuation by itself. Reader/Reading continuation must separately satisfy its own Reading identity, Reader/Character authority, and publication/runtime gates.

## 6. Implementation invariants

Implementation must not:

1. accept a browser-supplied subject as ownership authority;
2. accept browser-supplied release/bundle ids for Member thread creation;
3. treat Character row existence alone as availability;
4. create more than one logical active single-character thread for one Member + Character;
5. silently choose among duplicate/malformed existing threads;
6. rebind an existing thread when the global default release changes;
7. copy the Member policy to Guest creation;
8. invent first-meeting World/Relationship/message/outbox effects;
9. invent archived-thread resume behavior;
10. extend Launch-9 default availability to future conditional Characters;
11. use this decision as authorization to activate Reader → Chat continuation before its separate gates close.

## 7. Verification gate

The Member MVP open path must continue to verify:

- unauthenticated caller → deny;
- Guest caller → deny for this Member command;
- caller cannot choose another subject;
- unknown/unpublished/unavailable Character → deny;
- forged client release/bundle/unlock inputs cannot override server authority;
- no active default release/bundle → fail closed;
- new thread pins the approved active default release/bundle;
- thread and primary participation commit atomically;
- participation Character/bundle matches the created thread;
- existing valid active thread is reused;
- duplicate or malformed active state fails closed;
- concurrent/retried opens converge on one logical active thread;
- later default release changes do not silently rebind the existing thread.

## 8. Promotion boundary

```text
existing owned Chat thread read
→ production-capable

Member + Launch-9 single-character create/reuse
→ production-capable
→ CHARACTER_LAUNCH_MVP_AUTHORITY_V1
→ cmd_open_member_single_character_thread_v1

Guest Character thread create/open
→ BLOCKED

first-meeting durable side effects
→ BLOCKED / separately unresolved

archived-thread resume policy
→ BLOCKED / separately unresolved

multi-character create/open
→ BLOCKED / separately unresolved

future conditional Character create/open
→ requires its unlock/world/content authorities

Reader → Chat continuation
→ NOT authorized by SRC-34 alone; remains gated by Reader/Reading runtime authority
```

SRC-34 therefore remains a live gap document only for the unresolved creation scopes above. It must no longer be interpreted as a blanket prohibition on the approved Member Launch-9 single-character create/reuse path.
