# SRC-25 — Personal Record Type / Schema Registry Authority

> Status: **OPEN / BLOCKING for production-authoritative creation of new durable Life Fact / Character Memory values**  
> Domain: Personal Record / Life Fact / Character Memory  
> Source authority reviewed:
> - `Usecase_re_reviewed_v2(1).md`
> - `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`
> - `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`

---

## 1. Gap

Primary source requires durable personal records to use **bounded, versioned, validated record contracts** rather than arbitrary JSON.

For Life Fact, Use Case explicitly states:

```text
LifeFact.value must not accept arbitrary JSON
→ validate against a fact-type-specific versioned schema
→ unknown fact type or schema version must not be stored long-term
```

The source illustrates this with examples such as:

```text
employment_status/v1
relationship_status/v1
planned_event/v1
```

but labels those values as examples and does not define the final normative `LifeFactType` allowlist or the positive value schema for any type.

ERD v0.6 likewise defines:

```text
life_facts.fact_type       = versioned contract key
life_facts.schema_version  = required
life_facts.value_jsonb     = validated structured value

memory_items.memory_type      = versioned contract key
memory_items.schema_version   = required
memory_items.content_jsonb    = validated structured memory
```

and explicitly says Life Fact type/schema validation occurs against a versioned application contract registry before insert.

However the primary source does not provide the executable registry/schema content for either Life Fact or Character Memory. Therefore creation/acceptance commands cannot deterministically validate arbitrary new durable personal-record values without inventing product semantics. This is `SRC-25`.

## 2. Source-complete boundary

Primary source already fixes:

### Life Fact

- Life Fact is the authority for user-confirmed structured facts about current life;
- historical facts are preserved rather than overwritten;
- changed facts append a new same-type fact that supersedes the prior fact;
- `valid_from` / `valid_to` may describe temporal validity;
- provenance distinguishes `user_explicit`, `profile_edit`, and merge import;
- unknown fact type/schema version must not be durably stored;
- revoked and superseded facts are excluded from current context;
- supersession cannot branch and must remain same subject/same `fact_type`;
- raw value JSON is not itself authority unless it passed the approved type/schema validator.

### Character Memory

- Character Memory is durable structured relationship/conversation recall, not Birth authority and not a substitute for Life Fact;
- it has a versioned `memory_type` / `schema_version` contract;
- `content_jsonb` is validated structured memory;
- user approval is required for normal durable memory creation;
- source turn/message/character provenance is preserved where applicable;
- confirmed Life Fact/Birth input should be referenced semantically rather than copied wholesale;
- story/episode state must not be smuggled into Memory as an alternate authority store.

### Relational/read/revoke boundaries

The existing relational tables, owner/FK constraints, current-context reads, revoke commands, and Life Fact supersession lineage command can remain valid independently of the missing positive type registry **provided they do not claim to validate or authorize an unresolved new record payload**.

## 3. Missing Life Fact registry authority

Primary source does not define:

```text
final normative LifeFactType allowlist
schema document/validator for each LifeFactType + schemaVersion
allowed value enum/range/object fields for each type
required vs optional fields per type
canonical normalization rules
schema evolution/backward-compatibility rules
which schema versions remain writable vs read-only legacy
server capability/planner mapping from requestedLifeFactTypes to approved registry entries
```

Examples such as `employment_status`, `relationship_status`, and `planned_event` are useful product illustrations but are not a complete production registry.

## 4. Missing Character Memory registry authority

ERD requires `memory_type` to be a versioned contract key and `content_jsonb` to be validated structured memory, but source does not define:

```text
final normative MemoryType allowlist
schema document/validator per memory type/version
required structured fields
canonicalization/normalization
schema evolution and legacy-read behavior
which proposed values may be accepted as durable Character Memory
```

Free-form natural-language recollection examples do not establish a positive structured JSON schema.

## 5. Pack overreach to remove

The current Pack introduces this shape as if it were a usable source-backed registry contract:

```ts
interface VersionedRecordTypeDefinition {
  typeKey: string;
  schemaVersion: string;
  valueSchemaRef: string;
  allowedSources: readonly string[];
  retentionClass: string;
}
```

Primary source establishes the need for a versioned validator, but does not define this exact registry object or the fields `valueSchemaRef`, `allowedSources`, or `retentionClass` as the normative persistence/runtime contract.

The Pack may describe these as future implementation candidates only after source authority resolves the positive record registry. It must not use this invented interface to declare Life Fact/Memory creation source-complete.

## 6. Affected commands

### Blocked by SRC-25

Any production-authoritative path that creates a new durable record value and therefore must validate a positive type/schema, including at least:

```text
POST /api/life-record
POST /api/memory/proposals/:id/accept when proposal_kind=life_fact
POST /api/memory/proposals/:id/accept when proposal_kind=memory
any future direct durable Character Memory create/import path
```

`PATCH /api/life-record/:id` is only partly affected:

- the existing **supersession lineage/concurrency envelope** can be source-complete;
- creation of the superseding record's new value is production-authoritative only when the supplied `fact_type/schema_version/value_jsonb` is validated by an approved registry entry.

Merge-import creation is additionally subject to `SRC-24` for merge policy/action semantics.

Memory proposal acceptance also remains independently subject to existing proposal/grant blockers such as `SRC-05` and `SRC-10` where applicable.

## 7. Unaffected source-complete boundaries

`SRC-25` does **not** invalidate:

```text
life_facts / memory_items relational schema
owner/FK/source provenance constraints
Life Fact no-branch / same-type / no-cycle supersession structure
Life Fact revoke
Memory Item revoke
record access grant reads/revokes
current Life Record ledger read
current Memory Item read
current character record-context filtering of already-valid stored records
stored legacy record display/read when its schema is known to the consuming application
```

The distinction is between **representing/reading an already-authoritative stored record** and **authorizing a new durable value against an undefined positive schema registry**.

## 8. Implementation must NOT invent

Until `SRC-25` is resolved, do not:

- turn the Use Case example fact types into a closed production allowlist;
- accept arbitrary `fact_type` / `memory_type` strings;
- accept arbitrary JSON because the row has a `schema_version` field;
- define product semantics by ad-hoc Zod/JSON Schema files without source approval;
- treat `VersionedRecordTypeDefinition` from the Pack as primary source authority;
- silently coerce or normalize unknown fields/enum values;
- allow an LLM/planner to mint a new durable type key;
- use a generic `type:string + value:unknown` handler as the production persistence authority.

Unknown/unresolved type+schema pairs must fail closed and produce no durable Life Fact/Memory value.

## 9. Required source resolution

At minimum source authority should define:

1. normative Life Fact type inventory for the supported product scope;
2. positive schema per Life Fact type/version;
3. normative Character Memory type inventory;
4. positive schema per Character Memory type/version;
5. schema identity/versioning and immutable-artifact ownership;
6. writable/current vs legacy-read version policy;
7. validation and canonicalization rules;
8. allowed source/provenance constraints if they vary by record type;
9. compatibility behavior when an old client encounters a newer type/version;
10. planner/capability exposure rules for requestable Life Fact types.

If retention classes or a registry-level `valueSchemaRef` are required, source must define those fields rather than inheriting the current Pack's candidate shape by default.

## 10. Verification after resolution

At minimum:

- known type + known writable schema + valid value → accepted;
- known type + invalid value → no durable record;
- unknown type → no durable record;
- unknown schema version → no durable record;
- legacy read-only schema version → readable but not accepted for new writes according to approved policy;
- extra/unknown required fields follow the approved strictness contract;
- planner cannot request a type absent from the approved registry;
- LLM proposal cannot create an unregistered type/schema;
- concurrent same-lineage Life Fact supersession still permits only one branch;
- revoked/superseded record remains excluded from current context;
- accepted Character Memory remains structurally distinct from Life Fact/Birth/episode authority;
- schema/version provenance remains sufficient to interpret stored historical records deterministically.
