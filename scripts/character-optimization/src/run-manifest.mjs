import { CHARACTER_IDS, fail, keys, hash, id, positiveInteger, string, objectSha256 } from './contracts.mjs';
import { validateOptimizationProfile } from './profile-schema.mjs';

const RUN_FIELDS = [
  'runId', 'target', 'immutableSourcesSha256', 'baselinePromptSha256',
  'datasetManifestSha256', 'optimizerName', 'optimizerVersion',
  'pythonEnvironmentSha256', 'optimizerConfigSha256', 'evaluatorVersion',
  'reflectionModelId', 'judgeModelId', 'maxStudentCalls',
  'maxReflectionCalls', 'maxJudgeCalls', 'maxHoldoutCalls',
  'maxApiAttempts', 'maxConcurrency', 'maxTotalSpendUsd',
  'maximumRequestTokensByRole', 'stopOnUnknownUsage',
  'sealedHoldoutOutsideGepa', 'privateRunDirectoryRef',
  'budgetLedgerRef', 'executionMode', 'approvalRef',
];
const COHORT_FIELDS = ['characterId', 'contentBundleSha256', 'studentModelId', 'routingPolicySha256', 'evaluationManifestSha256', 'samplingWeight'];

export function validateOptimizationRunManifest(run, profiles) {
  keys(run, RUN_FIELDS, RUN_FIELDS.filter(x => !['judgeModelId', 'approvalRef'].includes(x)), 'run');
  id(run.runId, 'run.runId');
  if (run.optimizerName !== 'gepa') fail('run.optimizerName', 'unsupported optimizer');
  for (const field of ['immutableSourcesSha256','baselinePromptSha256','datasetManifestSha256','pythonEnvironmentSha256','optimizerConfigSha256']) hash(run[field], `run.${field}`);
  for (const field of ['optimizerVersion','evaluatorVersion','reflectionModelId','privateRunDirectoryRef','budgetLedgerRef']) string(run[field], `run.${field}`);
  if (run.judgeModelId !== undefined) string(run.judgeModelId, 'run.judgeModelId');
  for (const field of ['maxStudentCalls','maxReflectionCalls','maxJudgeCalls','maxHoldoutCalls','maxApiAttempts','maxConcurrency']) positiveInteger(run[field], `run.${field}`, true);
  if (!Number.isFinite(run.maxTotalSpendUsd) || run.maxTotalSpendUsd < 0) fail('run.maxTotalSpendUsd', 'invalid budget');
  if (run.stopOnUnknownUsage !== true || run.sealedHoldoutOutsideGepa !== true) fail('run.gates', 'mandatory gates missing');
  // First offline milestone can never dispatch network traffic or claim an approval.
  if (run.executionMode !== 'offline' || run.approvalRef !== undefined) fail('run.executionMode', 'approved live execution not implemented');
  if (run.maxStudentCalls !== 0 || run.maxReflectionCalls !== 0 || run.maxJudgeCalls !== 0 || run.maxHoldoutCalls !== 0 || run.maxApiAttempts !== 0 || run.maxTotalSpendUsd !== 0) fail('run.budget', 'offline manifest must allocate zero external spend');
  keys(run.maximumRequestTokensByRole, ['student','reflection','judge','holdout'], ['student','reflection','judge','holdout'], 'run.maximumRequestTokensByRole');
  for (const role of ['student','reflection','judge','holdout']) {
    keys(run.maximumRequestTokensByRole[role], ['input','output'], ['input','output'], `run.maximumRequestTokensByRole.${role}`);
    positiveInteger(run.maximumRequestTokensByRole[role].input, `run.tokens.${role}.input`, true);
    positiveInteger(run.maximumRequestTokensByRole[role].output, `run.tokens.${role}.output`, true);
  }
  if (!Array.isArray(profiles) || profiles.length < 1) fail('profiles', 'profiles array required');
  const ps = new Map();
  for (const p of profiles) {
    validateOptimizationProfile(p);
    if (ps.has(p.target.characterId)) fail('profiles', 'duplicate character');
    ps.set(p.target.characterId, p);
  }
  const target = run.target;
  const common = target?.track === 'shared';
  if (common) {
    keys(target, ['track','cohort'], ['track','cohort'], 'run.target');
    if (!Array.isArray(target.cohort) || target.cohort.length < 2 || target.cohort.length !== ps.size) fail('run.target.cohort', 'at least two profiles must match cohort');
    let total = 0; const seen = new Set();
    for (const c of target.cohort) {
      keys(c, COHORT_FIELDS, COHORT_FIELDS, 'run.target.cohort.member');
      if (!CHARACTER_IDS.includes(c.characterId) || seen.has(c.characterId) || !ps.has(c.characterId)) fail('run.target.cohort.characterId', 'unknown or duplicate');
      seen.add(c.characterId);
      const p = ps.get(c.characterId);
      hash(c.contentBundleSha256, 'cohort.contentBundleSha256');
      hash(c.routingPolicySha256, 'cohort.routingPolicySha256');
      hash(c.evaluationManifestSha256, 'cohort.evaluationManifestSha256');
      if (c.contentBundleSha256 !== p.target.contentBundleSha256 || c.routingPolicySha256 !== p.target.student.routingPolicySha256 || c.evaluationManifestSha256 !== p.target.evalSuite.splitManifestSha256 || c.studentModelId !== p.target.student.modelId) fail('run.target.cohort', 'pinned character settings mismatch');
      if (!p.mutableSlots.includes('shared_expression')) fail('run.target.cohort', 'shared slot not enabled');
      if (typeof c.samplingWeight !== 'number' || c.samplingWeight <= 0 || !Number.isFinite(c.samplingWeight)) fail('run.target.cohort.samplingWeight', 'invalid weight');
      total += c.samplingWeight;
    }
    if (Math.abs(total - 1) > 1e-9) fail('run.target.cohort', 'sampling weights must sum to 1');
  } else {
    keys(target, ['track','characterId'], ['track','characterId'], 'run.target');
    if (target.track !== 'character' || ps.size !== 1 || !ps.has(target.characterId)) fail('run.target.characterId', 'one matching character required');
    if (!ps.get(target.characterId).mutableSlots.includes('character_expression')) fail('run.target.characterId', 'character slot not enabled');
  }
  return Object.freeze({runId:run.runId, track:target.track, characterIds:Object.freeze(common?target.cohort.map(c=>c.characterId):[target.characterId]), manifestSha256:objectSha256(run), externalCallsEnabled:false, productionChangesEnabled:false});
}
