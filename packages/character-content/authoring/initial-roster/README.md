# Initial Roster Authoring Payloads

These nine JSON files are the repository materialization of the approved C2 nine-character **draft** roster.

They mirror `packages/character-content/src/initial-roster.ts` exactly and are guarded by
`test/character-initial-roster-json-authoring.test.ts` so the typed draft and editable JSON
payloads cannot silently drift.

## Authority boundary

These files are **not Production-publishable CharacterContentDefinition bundles**.

The following remain intentionally unresolved and use `unresolved_source_authority` sentinels:

- source-authored gender canon;
- versioned visual canon;
- origin and apparent-age canon;
- deity identity / representation / doctrine bindings.

`productionPublication` therefore remains `blocked` for every payload.

`SRC-35_CHARACTER_ROSTER_DIFFERENTIATION_AUTHORITY.md` also remains OPEN/BLOCKING.
Exact payload differences are authoring evidence only; they do not establish an executable
Production roster-differentiation PASS threshold.

No bundle registration, release activation, runtime-catalog mutation, unlock mutation, or
Chat-thread creation is authorized by these files.
