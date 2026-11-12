/** Character Optimization offline research contracts: no provider I/O, no production imports. */
import { createHash } from 'node:crypto';

export const CHARACTER_IDS = Object.freeze([
  'seyeon', 'yeoul', 'seorin', 'rahyeon', 'mira',
  'taegyeom', 'yunho', 'doyun', 'baekheon',
]);
export const MUTABLE_SLOTS = Object.freeze(['shared_expression', 'character_expression']);
export const CORPUS_SPLITS = Object.freeze(['development', 'optimizer_validation', 'sealed_holdout', 'long_horizon']);
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const nonempty = v => typeof v === 'string' && v.trim().length > 0;
const sha = v => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const safeCorpusKey = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(v);
const fail = code => { throw new Error(`CHARACTER_OPTIMIZATION_INVALID:${code}`); };
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

export function validateCharacterProfile(profile) {
  if (!isObj(profile) || !CHARACTER_IDS.includes(profile.characterId)) fail('character_id');
  if (!isObj(profile.source) || !nonempty(profile.source.canonRef) || !nonempty(profile.source.runtimeRef)
      || !sha(profile.source.contentBundleSha256) || !nonempty(profile.source.authorityVersion)
      || !['DRAFT', 'APPROVED', 'OTHER_VERIFIED'].includes(profile.source.authorityState)) fail('source_authority');
  if (!isObj(profile.student) || profile.student.provider !== 'openrouter'
      || !nonempty(profile.student.modelId) || !sha(profile.student.parametersSha256)
      || !sha(profile.student.routingPolicySha256)) fail('student_model');
  if (!isObj(profile.evalSuite) || !nonempty(profile.evalSuite.developmentRef)
      || !nonempty(profile.evalSuite.validationRef) || !nonempty(profile.evalSuite.holdoutRef)
      || !nonempty(profile.evalSuite.rubricVersion) || !sha(profile.evalSuite.splitManifestSha256)) fail('evaluation_sources');
  if (!Array.isArray(profile.mutableSlots) || profile.mutableSlots.length !== 1
      || !MUTABLE_SLOTS.includes(profile.mutableSlots[0])) fail('one_mutable_slot_only');
  if (profile.reviewRequired !== true || !nonempty(profile.privacyPolicyRef)) fail('review_privacy');
  return Object.freeze({ ...profile, source: Object.freeze({ ...profile.source }), student: Object.freeze({ ...profile.student }),
    evalSuite: Object.freeze({ ...profile.evalSuite }), mutableSlots: Object.freeze([...profile.mutableSlots]) });
}

export function createOptimizationRun({ track, profiles, weights = null, immutableSourcesSha256,
  baselinePromptSha256, optimizerVersion, evaluatorVersion, approvalRef = null }) {
  if (!['character', 'shared'].includes(track) || !Array.isArray(profiles)) fail('track');
  if ((track === 'character' && profiles.length !== 1) || (track === 'shared' && profiles.length < 2)) fail('cohort_size');
  const checked = profiles.map(validateCharacterProfile);
  if (new Set(checked.map(p => p.characterId)).size !== checked.length) fail('duplicate_character');
  const slot = track === 'shared' ? 'shared_expression' : 'character_expression';
  if (checked.some(p => p.mutableSlots[0] !== slot)) fail('slot_track_mismatch');
  if (![immutableSourcesSha256, baselinePromptSha256].every(sha)
      || !nonempty(optimizerVersion) || !nonempty(evaluatorVersion)) fail('pinned_version');
  const normalizedWeights = weights ?? checked.map(() => 1 / checked.length);
  if (!Array.isArray(normalizedWeights) || normalizedWeights.length !== checked.length
      || normalizedWeights.some(w => !Number.isFinite(w) || w <= 0)
      || Math.abs(normalizedWeights.reduce((x, y) => x + y, 0) - 1) > 1e-9) fail('cohort_weights');
  const target = track === 'character'
    ? { track, characterId: checked[0].characterId }
    : { track, cohort: checked.map((p, i) => ({characterId: p.characterId,
      contentBundleSha256: p.source.contentBundleSha256, studentModelId: p.student.modelId,
      routingPolicySha256: p.student.routingPolicySha256,
      evaluationManifestSha256: p.evalSuite.splitManifestSha256, samplingWeight: normalizedWeights[i]})) };
  const manifest = { schemaVersion:'character-optimization-run-v1', target, optimizerName:'gepa',
    optimizerVersion, evaluatorVersion, immutableSourcesSha256, baselinePromptSha256,
    profileHashes: checked.map(p => digest(p)),
    externalCallsAuthorized: false, ownerReviewVerified: false, productionEligible: false,
    approvalRefClaimOnly: approvalRef, qualityGainEstablished: false };
  return Object.freeze({ ...manifest, manifestSha256:digest(manifest) });
}

/** Synthetic test items must carry an owner-defined scenario family; this is not semantic similarity detection. */
export function validateCorpusSplits(rows, { exposeToOptimizer = false } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) fail('dataset_missing');
  const ids = new Set(), families = new Map(), normalized = [];
  for (const row of rows) {
    if (!isObj(row) || !CHARACTER_IDS.includes(row.characterId)
        || !safeCorpusKey(row.id) || !safeCorpusKey(row.familyId) || !CORPUS_SPLITS.includes(row.split)
        || !sha(row.contentSha256) || !['synthetic','approved_development'].includes(row.sourceType)) fail('corpus_row');
    const id = `${row.characterId}|${row.id}`;
    if (ids.has(id)) fail('duplicate_corpus_item');
    ids.add(id);
    const family = `${row.characterId}|${row.familyId}`;
    if (families.has(family) && families.get(family) !== row.split) fail('family_crosses_split');
    families.set(family, row.split);
    normalized.push({ characterId:row.characterId, id:row.id, familyId:row.familyId,
      split:row.split, contentSha256:row.contentSha256, sourceType:row.sourceType });
  }
  const digests = new Map();
  for (const row of normalized) {
    const prev = digests.get(row.contentSha256);
    if (prev && prev !== row.split) fail('identical_content_crosses_split');
    digests.set(row.contentSha256, row.split);
  }
  if (exposeToOptimizer && normalized.some(r => !['development','optimizer_validation'].includes(r.split))) fail('sealed_data_exposure');
  return { schemaVersion:'character-optimization-split-v1', count:normalized.length,
    families:families.size, splitCounts:Object.fromEntries(CORPUS_SPLITS.map(s => [s, normalized.filter(r => r.split === s).length])),
    manifestSha256:digest(normalized), semanticSimilarityNotProven:true };
}

const forbiddenOverride = /(?:ignore|override|disregard|bypass)\s+(?:all\s+)?(?:previous|system|developer|authority|canon|rules|instructions)|(?:기존|상위|시스템|개발자|권한|캐논|설정|기억|관계).{0,16}(?:무시|덮어써|변경|조작|우회|해제)/i;
export function validateCandidate(candidate, { slot, pinnedContextSha256 }) {
  if (!MUTABLE_SLOTS.includes(slot) || !sha(pinnedContextSha256)) fail('slot_or_anchor');
  if (!isObj(candidate) || Object.keys(candidate).length !== 1 || !Object.hasOwn(candidate, slot)) fail('candidate_keys');
  const wording = candidate[slot];
  if (!nonempty(wording) || wording.length > 1600 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(wording)) fail('candidate_text');
  if (forbiddenOverride.test(wording)) fail('suspected_authority_override');
  return Object.freeze({schemaVersion:'character-expression-proposal-v1', slot,
    textSha256:digest(wording), pinnedContextSha256, status:'pending_owner_review',
    productionEligible:false, semanticSafetyVerified:false, text:wording });
}