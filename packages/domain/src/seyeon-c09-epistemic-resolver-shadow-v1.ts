export const SEYEON_C09_EPISTEMIC_SHADOW_VERSION_V1 =
  'seyeon-c09-epistemic-shadow-v1' as const;

export type SeyeonC09KnowledgeLevelV1 =
  | 'unaware'
  | 'heard_of'
  | 'basic'
  | 'practiced'
  | 'proficient';

export type SeyeonC09KnowledgeSourceKindV1 =
  | 'canon'
  | 'approved_character_fact'
  | 'user_taught_verified'
  | 'public_verified'
  | 'experience';

export type SeyeonC09KnowledgeRequestKindV1 =
  | 'general_question'
  | 'technical_execution'
  | 'learning_offer';

export interface SeyeonC09KnowledgePolicyShadowV1 {
  readonly characterId: 'seyeon';
  readonly topicKey: string;
  readonly policyVersion: string;
  readonly authoritySourceRef: string;
  readonly domainPolicy: 'ambient' | 'bounded' | 'authority_only';
  /** Missing policy entry NEVER implies unaware. */
  readonly baseline: 'not_recorded' | 'explicit_unaware' | 'heard_of' | 'basic' | 'practiced' | 'proficient';
}

export interface SeyeonC09KnowledgeEvidenceShadowV1 {
  readonly evidenceId: string;
  readonly characterId: 'seyeon';
  readonly topicKey: string;
  readonly sourceKind: SeyeonC09KnowledgeSourceKindV1;
  readonly authorityRef: string;
  readonly verifiedByServer: true;
  readonly awareness: Exclude<SeyeonC09KnowledgeLevelV1, 'unaware'>;
  readonly visibility: 'character_shared' | 'user_private';
  /** Required for user-private, forbidden for character-shared. */
  readonly subjectId: string | null;
  /** BOTH sharing approval and privacy review are required before a user-taught fact is common. */
  readonly approvedForCharacterSharing: boolean;
  readonly privacyReviewed: boolean;
  readonly learnedAt: string;
  readonly validAt: string;
  readonly supersededAt: string | null;
}

export interface SeyeonC09KnowledgeDecisionShadowV1 {
  readonly version: typeof SEYEON_C09_EPISTEMIC_SHADOW_VERSION_V1;
  readonly characterId: 'seyeon';
  readonly subjectId: string;
  readonly topicKey: string;
  readonly policyVersion: string;
  readonly asOfTurn: string;
  readonly requestKind: SeyeonC09KnowledgeRequestKindV1;
  readonly domainPolicy: SeyeonC09KnowledgePolicyShadowV1['domainPolicy'];
  readonly baseline: SeyeonC09KnowledgePolicyShadowV1['baseline'];
  readonly characterKnowledgeLevel: SeyeonC09KnowledgeLevelV1 | 'unspecified';
  readonly sourceScope: 'ambient' | 'character_shared' | 'user_private' | 'none';
  readonly responsePermission: 'normal' | 'partial' | 'learn' | 'withhold';
  readonly allowedEvidenceIds: readonly string[];
  readonly claimBoundaries: readonly ('no_unverified_expertise' | 'no_private_source_disclosure' | 'no_unverified_learning_history')[];
  readonly permitsKnowledgeCommit: false;
}

export class SeyeonC09EpistemicShadowErrorV1 extends Error {
  constructor(readonly code: 'KNOWLEDGE_POLICY_INVALID' | 'KNOWLEDGE_EVIDENCE_INVALID') {
    super(code);
    this.name = 'SeyeonC09EpistemicShadowErrorV1';
  }
}

const LEVELS: readonly SeyeonC09KnowledgeLevelV1[] =
  ['unaware', 'heard_of', 'basic', 'practiced', 'proficient'];
const SOURCES: readonly SeyeonC09KnowledgeSourceKindV1[] =
  ['canon', 'approved_character_fact', 'user_taught_verified', 'public_verified', 'experience'];

function validKey(s: unknown, max = 256): s is string {
  return typeof s === 'string' && s.trim().length > 0 &&
    s.length <= max && s === s.trim();
}

function epoch(s: unknown): number {
  if (typeof s !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(s)) return Number.NaN;
  const ms = Date.parse(s);
  return Number.isFinite(ms) && new Date(ms).toISOString() === s ? ms : Number.NaN;
}

function rejectPolicy(): never {
  throw new SeyeonC09EpistemicShadowErrorV1('KNOWLEDGE_POLICY_INVALID');
}
function rejectEvidence(): never {
  throw new SeyeonC09EpistemicShadowErrorV1('KNOWLEDGE_EVIDENCE_INVALID');
}

/**
 * Deterministic, read-only projection from SERVER-VERIFIED knowledge evidence.
 * Evidence must already have passed the original DB/Canon authority gates;
 * this function does not authenticate a client or independently verify facts.
 */
export function resolveSeyeonC09KnowledgeDecisionShadowV1(input: Readonly<{
  policy: SeyeonC09KnowledgePolicyShadowV1;
  subjectId: string;
  requestKind: SeyeonC09KnowledgeRequestKindV1;
  asOfTurn: string;
  evidence: readonly SeyeonC09KnowledgeEvidenceShadowV1[];
}>): SeyeonC09KnowledgeDecisionShadowV1 {
  const p = input.policy;
  if (!p || p.characterId !== 'seyeon' || !validKey(p.topicKey, 128) ||
      !/^[a-z][a-z0-9_.-]*$/u.test(p.topicKey) ||
      !validKey(p.policyVersion) || !validKey(p.authoritySourceRef, 512) ||
      !['ambient', 'bounded', 'authority_only'].includes(p.domainPolicy) ||
      !['not_recorded', 'explicit_unaware', 'heard_of', 'basic', 'practiced', 'proficient'].includes(p.baseline) ||
      !validKey(input.subjectId) ||
      !['general_question', 'technical_execution', 'learning_offer'].includes(input.requestKind) ||
      !Number.isFinite(epoch(input.asOfTurn))) rejectPolicy();
  if (!Array.isArray(input.evidence) || input.evidence.length > 64) rejectEvidence();

  const asOf = epoch(input.asOfTurn);
  const seen = new Set<string>();
  const selected: SeyeonC09KnowledgeEvidenceShadowV1[] = [];
  for (const e of input.evidence) {
    if (!e || !validKey(e.evidenceId, 512) || seen.has(e.evidenceId) ||
        e.characterId !== 'seyeon' || e.topicKey !== p.topicKey ||
        !SOURCES.includes(e.sourceKind) || !validKey(e.authorityRef, 512) ||
        e.verifiedByServer !== true || !LEVELS.includes(e.awareness) ||
        e.awareness === 'unaware' ||
        !['character_shared', 'user_private'].includes(e.visibility) ||
        typeof e.approvedForCharacterSharing !== 'boolean' ||
        typeof e.privacyReviewed !== 'boolean' ||
        !Number.isFinite(epoch(e.learnedAt)) || !Number.isFinite(epoch(e.validAt)) ||
        (e.supersededAt !== null && !Number.isFinite(epoch(e.supersededAt))) ||
        (e.supersededAt !== null && epoch(e.supersededAt) <= epoch(e.validAt)) ||
        (e.visibility === 'user_private' && (!validKey(e.subjectId) || e.approvedForCharacterSharing)) ||
        (e.visibility === 'character_shared' && (e.subjectId !== null ||
          !e.approvedForCharacterSharing || !e.privacyReviewed))) rejectEvidence();
    seen.add(e.evidenceId);
    if (epoch(e.learnedAt) > asOf || epoch(e.validAt) > asOf ||
        (e.supersededAt !== null && epoch(e.supersededAt) <= asOf)) continue;
    if (e.visibility === 'user_private' && e.subjectId !== input.subjectId) continue;
    selected.push(e);
  }

  const baseLevel: SeyeonC09KnowledgeLevelV1 | 'unspecified' =
    p.baseline === 'explicit_unaware' ? 'unaware' :
    p.baseline === 'not_recorded' ? 'unspecified' : p.baseline;
  let level: SeyeonC09KnowledgeLevelV1 | 'unspecified' = baseLevel;
  for (const e of selected) {
    if (level === 'unspecified' || LEVELS.indexOf(e.awareness) > LEVELS.indexOf(level)) {
      level = e.awareness;
    }
  }
  const maximal = selected.filter((e) => e.awareness === level);
  const sourceScope = maximal.some((e) => e.visibility === 'character_shared')
    ? 'character_shared' as const : maximal.length ? 'user_private' as const :
      p.domainPolicy === 'ambient' && level === 'unspecified'
        ? 'ambient' as const : 'none' as const;

  let responsePermission: SeyeonC09KnowledgeDecisionShadowV1['responsePermission'];
  if (p.domainPolicy === 'authority_only') {
    responsePermission = maximal.some((e) =>
      e.sourceKind === 'canon' || e.sourceKind === 'approved_character_fact')
      ? 'partial' : 'withhold';
  } else if (p.domainPolicy === 'ambient' && level === 'unspecified') {
    responsePermission = 'normal';
  } else if (input.requestKind === 'technical_execution') {
    responsePermission = level === 'practiced' || level === 'proficient' ? 'normal' : 'withhold';
  } else if (level === 'unaware') {
    responsePermission = 'learn';
  } else if (level === 'unspecified') {
    responsePermission = 'partial';
  } else {
    responsePermission = level === 'proficient' ? 'normal' : 'partial';
  }

  return Object.freeze({
    version: SEYEON_C09_EPISTEMIC_SHADOW_VERSION_V1,
    characterId: 'seyeon' as const,
    subjectId: input.subjectId,
    topicKey: p.topicKey,
    policyVersion: p.policyVersion,
    asOfTurn: input.asOfTurn,
    requestKind: input.requestKind,
    domainPolicy: p.domainPolicy,
    baseline: p.baseline,
    characterKnowledgeLevel: level,
    sourceScope,
    responsePermission,
    allowedEvidenceIds: Object.freeze(selected.map((e) => e.evidenceId).sort()),
    claimBoundaries: Object.freeze([
      'no_unverified_expertise',
      'no_private_source_disclosure',
      'no_unverified_learning_history',
    ] as const),
    permitsKnowledgeCommit: false as const,
  });
}
