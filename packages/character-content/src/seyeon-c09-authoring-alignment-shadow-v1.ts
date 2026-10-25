import { SEYEON_AUTHORED_PROJECTION_V2 } from './seyeon-authored-projection-v2.js';

/**
 * Shadow-only audit of the CURRENT authored documents.
 *
 * The legacy projection and fact-authority registry are consumed by production.
 * A source correction must not silently change grants or disclosure decisions.
 * This audit is not a replacement fact authority or a public biographical feed.
 */
export const SEYEON_C09_AUTHORING_ALIGNMENT_SHADOW_VERSION_V1 =
  'seyeon-c09-authoring-alignment-shadow-v1' as const;

export const SEYEON_C09_CURRENT_AUTHORED_SOURCES_V1 = Object.freeze({
  bible: Object.freeze({
    path: 'docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
    gitBlobSha: '5fddbce24c5606d888b64ab3c8dbf3256b65e04d',
    authority: 'DRAFT_NOT_PRODUCTION_AUTHORITY' as const,
  }),
  runtime: Object.freeze({
    path: 'docs/character/SEYEON_CHARACTER_RUNTIME_DRAFT_V0_1.md',
    gitBlobSha: 'd6bc911021e30aa70fde133c4350513008a721e7',
    authority: 'DRAFT_NOT_PRODUCTION_AUTHORITY' as const,
  }),
});

export type SeyeonC09FactStatusV1 =
  | 'DEFINED_IN_CURRENT_DRAFT'
  | 'AUTHOR_UNDEFINED'
  | 'WORLD_DEPENDENT';

export type SeyeonC09DisclosurePostureV1 =
  | 'PUBLIC_BEHAVIOR_ONLY'
  | 'SERVER_GATE_REQUIRED'
  | 'NO_FACT';

export interface SeyeonC09AuthoringAuditEntryV1 {
  readonly key: string;
  readonly status: SeyeonC09FactStatusV1;
  readonly sourceSection: string;
  readonly disclosurePosture: SeyeonC09DisclosurePostureV1;
  readonly staleLegacyUndefinedKey: string | null;
}

/**
 * Source-derived, conservative metadata only: NO values for private life,
 * family history, biography, authorized user memory or relationship events.
 */
export const SEYEON_C09_CURRENT_FACT_AUDIT_V1:
  readonly SeyeonC09AuthoringAuditEntryV1[] = Object.freeze([
  { key: 'identity.reference_age', status: 'DEFINED_IN_CURRENT_DRAFT', sourceSection: 'B1', disclosurePosture: 'SERVER_GATE_REQUIRED', staleLegacyUndefinedKey: 'exact_age' },
  { key: 'identity.exact_birth_year', status: 'AUTHOR_UNDEFINED', sourceSection: 'B1', disclosurePosture: 'NO_FACT', staleLegacyUndefinedKey: null },
  { key: 'identity.birthday', status: 'DEFINED_IN_CURRENT_DRAFT', sourceSection: 'B1', disclosurePosture: 'SERVER_GATE_REQUIRED', staleLegacyUndefinedKey: null },
  { key: 'identity.blood_type', status: 'DEFINED_IN_CURRENT_DRAFT', sourceSection: 'B1', disclosurePosture: 'SERVER_GATE_REQUIRED', staleLegacyUndefinedKey: null },
  { key: 'identity.mbti_self_report', status: 'DEFINED_IN_CURRENT_DRAFT', sourceSection: 'B1', disclosurePosture: 'SERVER_GATE_REQUIRED', staleLegacyUndefinedKey: null },
  { key: 'life.occupation_or_social_role', status: 'DEFINED_IN_CURRENT_DRAFT', sourceSection: 'B1/I4', disclosurePosture: 'SERVER_GATE_REQUIRED', staleLegacyUndefinedKey: 'occupation_or_social_role' },
  { key: 'life.current_living_base', status: 'DEFINED_IN_CURRENT_DRAFT', sourceSection: 'B1/I5', disclosurePosture: 'SERVER_GATE_REQUIRED', staleLegacyUndefinedKey: null },
  { key: 'life.independent_current_goal', status: 'DEFINED_IN_CURRENT_DRAFT', sourceSection: 'I1/I2', disclosurePosture: 'SERVER_GATE_REQUIRED', staleLegacyUndefinedKey: 'independent_current_goal' },
  { key: 'life.long_term_life_goal', status: 'DEFINED_IN_CURRENT_DRAFT', sourceSection: 'I2', disclosurePosture: 'SERVER_GATE_REQUIRED', staleLegacyUndefinedKey: 'long_term_life_goal' },
  { key: 'life.current_responsibilities', status: 'DEFINED_IN_CURRENT_DRAFT', sourceSection: 'I4', disclosurePosture: 'SERVER_GATE_REQUIRED', staleLegacyUndefinedKey: null },
  { key: 'family.structure', status: 'DEFINED_IN_CURRENT_DRAFT', sourceSection: 'I3/J2', disclosurePosture: 'SERVER_GATE_REQUIRED', staleLegacyUndefinedKey: 'confirmed_family_relationships' },
  { key: 'social.important_non_user_relationships', status: 'DEFINED_IN_CURRENT_DRAFT', sourceSection: 'I3', disclosurePosture: 'SERVER_GATE_REQUIRED', staleLegacyUndefinedKey: 'specific_friends_colleagues_family' },
  { key: 'past_romance.existence', status: 'DEFINED_IN_CURRENT_DRAFT', sourceSection: 'J4', disclosurePosture: 'SERVER_GATE_REQUIRED', staleLegacyUndefinedKey: 'past_romance' },
  { key: 'social.general_romance_view', status: 'DEFINED_IN_CURRENT_DRAFT', sourceSection: 'G1', disclosurePosture: 'SERVER_GATE_REQUIRED', staleLegacyUndefinedKey: 'general_romance_view' },
  { key: 'backstory.upbringing', status: 'DEFINED_IN_CURRENT_DRAFT', sourceSection: 'J1', disclosurePosture: 'SERVER_GATE_REQUIRED', staleLegacyUndefinedKey: 'confirmed_upbringing' },
  { key: 'backstory.important_past_events', status: 'DEFINED_IN_CURRENT_DRAFT', sourceSection: 'J3', disclosurePosture: 'SERVER_GATE_REQUIRED', staleLegacyUndefinedKey: 'important_past_events' },
  { key: 'backstory.secrets_regrets_unresolved', status: 'DEFINED_IN_CURRENT_DRAFT', sourceSection: 'J5', disclosurePosture: 'SERVER_GATE_REQUIRED', staleLegacyUndefinedKey: 'secrets_regrets_unresolved_problems' },
  { key: 'visual.self_view_of_appearance', status: 'DEFINED_IN_CURRENT_DRAFT', sourceSection: 'K1', disclosurePosture: 'SERVER_GATE_REQUIRED', staleLegacyUndefinedKey: 'self_view_of_appearance' },
  { key: 'visual.self_styling', status: 'DEFINED_IN_CURRENT_DRAFT', sourceSection: 'K2', disclosurePosture: 'SERVER_GATE_REQUIRED', staleLegacyUndefinedKey: 'fashion_or_self_styling' },
  { key: 'world.specific_city_institution_address', status: 'WORLD_DEPENDENT', sourceSection: 'B1/CURRENT UNDEFINED AREAS', disclosurePosture: 'NO_FACT', staleLegacyUndefinedKey: 'world_position' },
  { key: 'world.specific_family_or_ex_names', status: 'AUTHOR_UNDEFINED', sourceSection: 'B1/CURRENT UNDEFINED AREAS', disclosurePosture: 'NO_FACT', staleLegacyUndefinedKey: null },
  { key: 'person.public_personality', status: 'DEFINED_IN_CURRENT_DRAFT', sourceSection: 'A1-A4/H1/R11.1', disclosurePosture: 'PUBLIC_BEHAVIOR_ONLY', staleLegacyUndefinedKey: null },
].map((entry) => Object.freeze(entry)));

/**
 * Reports the stale assumptions instead of modifying the active production
 * registry. Removing an active AUTHOR_UNDEFINED entry would change production
 * behavior, so that requires an independently gated migration.
 */
export function auditSeyeonC09CurrentAuthoringAlignmentV1() {
  const legacyUndefined = new Set<string>(SEYEON_AUTHORED_PROJECTION_V2.undefinedFields);
  const staleUndefinedKeys = SEYEON_C09_CURRENT_FACT_AUDIT_V1
    .filter((entry) =>
      entry.status === 'DEFINED_IN_CURRENT_DRAFT' &&
      entry.staleLegacyUndefinedKey !== null &&
      legacyUndefined.has(entry.staleLegacyUndefinedKey))
    .map((entry) => entry.staleLegacyUndefinedKey as string);
  return Object.freeze({
    version: SEYEON_C09_AUTHORING_ALIGNMENT_SHADOW_VERSION_V1,
    scope: 'SHADOW_ONLY_NOT_PRODUCTION_FACT_AUTHORITY' as const,
    currentSources: SEYEON_C09_CURRENT_AUTHORED_SOURCES_V1,
    legacySourcePinsDiffer: Object.freeze({
      bible: SEYEON_AUTHORED_PROJECTION_V2.source.bible.gitBlobSha !==
        SEYEON_C09_CURRENT_AUTHORED_SOURCES_V1.bible.gitBlobSha,
      runtime: SEYEON_AUTHORED_PROJECTION_V2.source.runtime.gitBlobSha !==
        SEYEON_C09_CURRENT_AUTHORED_SOURCES_V1.runtime.gitBlobSha,
      factRegistry: SEYEON_AUTHORED_PROJECTION_V2.factAuthority.sourceBible.gitBlobSha !==
        SEYEON_C09_CURRENT_AUTHORED_SOURCES_V1.bible.gitBlobSha,
    }),
    legacyUndefinedButDefinedInCurrentDraft: Object.freeze(staleUndefinedKeys),
    publicLivingStateSourceSections: Object.freeze(['A1', 'A2', 'A3', 'A4', 'H1', 'R3', 'R4', 'R5', 'R6', 'R11.1'] as const),
    mayGrantNewDisclosure: false as const,
    mayDeclareProductionCanon: false as const,
    mayModifyActiveFactRegistry: false as const,
  });
}
