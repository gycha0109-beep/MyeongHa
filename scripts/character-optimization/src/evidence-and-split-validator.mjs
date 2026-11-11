import { fail, keys, hash, id, objectSha256 } from './contracts.mjs';

export const DATASET_ROLES = Object.freeze(['development', 'optimizer_validation', 'sealed_holdout', 'long_horizon']);
const FIELDS = ['recordId', 'characterId', 'familyId', 'paraphraseFamilyId', 'turnGroupId', 'promptFingerprint', 'role', 'sourceKind'];

/** Validates public metadata only. Raw utterances never belong in this contract. */
export function validateDatasetSplitMetadata(records) {
  if (!Array.isArray(records) || !records.length) fail('dataset', 'nonempty array required');
  const families = new Map(), paraphrases = new Map(), turns = new Map(), fingerprints = new Map(), ids = new Set();
  const roles = Object.fromEntries(DATASET_ROLES.map(k => [k, 0]));
  for (const rec of records) {
    keys(rec, FIELDS, FIELDS, 'dataset.record');
    for (const field of ['recordId','characterId','familyId','paraphraseFamilyId','turnGroupId']) id(rec[field], `dataset.${field}`);
    hash(rec.promptFingerprint, 'dataset.promptFingerprint');
    if (!DATASET_ROLES.includes(rec.role)) fail('dataset.role', 'unrecognized split');
    if (!['synthetic', 'user_reviewed_development'].includes(rec.sourceKind)) fail('dataset.sourceKind', 'unreviewed or unknown source');
    if (rec.sourceKind === 'user_reviewed_development' && rec.role !== 'development') fail('dataset.sourceKind', 'historical ratings belong only in development');
    if (ids.has(rec.recordId)) fail('dataset.recordId', 'duplicate record');
    ids.add(rec.recordId);
    for (const [map, field] of [[families,'familyId'],[paraphrases,'paraphraseFamilyId'],[turns,'turnGroupId'],[fingerprints,'promptFingerprint']]) {
      const scopedKey = `${rec.characterId}|${rec[field]}`;
      const prior = map.get(scopedKey);
      if (prior !== undefined && prior !== rec.role) fail(`dataset.${field}`, 'same family/turn/prompt split across roles');
      map.set(scopedKey, rec.role);
    }
    roles[rec.role] += 1;
  }
  return Object.freeze({manifestSha256:objectSha256(records), count:records.length, roleCounts:Object.freeze(roles), semanticSimilarityVerified:false, holdoutQuestionIndependenceVerified:false});
}

/** Build GEPA-visible manifest only; never reveals holdout identifiers, hashes or raw content. */
export function buildOptimizerDatasetView(records) {
  validateDatasetSplitMetadata(records);
  if (records.some(r => r.role === 'sealed_holdout' || r.role === 'long_horizon')) fail('optimizer dataset view', 'sealed/long-horizon records not admitted to optimizer process');
  return Object.freeze(records.map(r => Object.freeze({
    recordId:r.recordId, characterId:r.characterId, familyId:r.familyId,
    paraphraseFamilyId:r.paraphraseFamilyId, turnGroupId:r.turnGroupId,
    promptFingerprint:r.promptFingerprint, role:r.role, sourceKind:r.sourceKind,
  })));
}
