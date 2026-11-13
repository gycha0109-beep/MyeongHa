/** Synthetic end-to-end proof: real pinned GEPA -> frozen Python packet -> Node review.
 * This fixture never uses real chats, model accounts, runtime profiles, or providers.
 */
import assert from 'node:assert/strict';
import {
  chmodSync, mkdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { isAbsolute } from 'node:path';
import {
  createOptimizationRun, digest, validateCandidate,
} from './contracts-v1.mjs';
import { buildGepaResearchPayload, DIMENSIONS } from './evaluation-v1.mjs';
import { inspectCandidateReviewReadiness } from './candidate-evidence-review-v1.mjs';
import { intakeFrozenGepaResult } from './gepa-result-intake-v1.mjs';

const [mode, dir] = process.argv.slice(2);
if (!['prepare', 'verify'].includes(mode) || !dir || !isAbsolute(dir))
  throw new Error('offline_synthetic_proof_requires_absolute_directory');
const CONTEXT = digest('synthetic offline GEPA context; no real source');
const SEED = 'Respond clearly in natural Korean.';
const IDS = ['yeoul', 'seyeon'];

function profile(characterId) {
  return {
    characterId,
    source: {
      canonRef: 'synthetic/no-canon-read',
      runtimeRef: 'synthetic/no-runtime-read',
      contentBundleSha256: CONTEXT,
      authorityVersion: 'DRAFT_ONLY',
      authorityState: 'DRAFT',
    },
    student: {
      provider: 'openrouter',
      modelId: 'synthetic/no-external-model',
      parametersSha256: CONTEXT,
      routingPolicySha256: CONTEXT,
    },
    evalSuite: {
      developmentRef: 'synthetic/dev',
      validationRef: 'synthetic/val',
      holdoutRef: 'synthetic/not-mounted',
      rubricVersion: 'synthetic-not-real-r16',
      splitManifestSha256: CONTEXT,
    },
    mutableSlots: ['shared_expression'],
    reviewRequired: true,
    privacyPolicyRef: 'synthetic/never-user-data',
  };
}

function proofRows() {
  return IDS.flatMap(characterId => [
    {
      id: characterId + '-synthetic-dev',
      characterId,
      familyId: characterId + '-synthetic-dev-family',
      split: 'development',
      contentSha256: digest(characterId + '-dev-content-synthetic'),
      sourceType: 'synthetic',
    },
    {
      id: characterId + '-synthetic-val',
      characterId,
      familyId: characterId + '-synthetic-val-family',
      split: 'optimizer_validation',
      contentSha256: digest(characterId + '-val-content-synthetic'),
      sourceType: 'synthetic',
    },
  ]);
}

function readJson(name) {
  return JSON.parse(readFileSync(dir + '/' + name, 'utf8'));
}

if (mode === 'prepare') {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const manifest = createOptimizationRun({
    track: 'shared',
    profiles: IDS.map(profile),
    immutableSourcesSha256: CONTEXT,
    baselinePromptSha256: digest(SEED),
    optimizerVersion: 'ce5b0d6e3d6af6c6dbec6de2c54536bbb961d309',
    evaluatorVersion: 'synthetic-contract-not-approval',
  });
  const candidate = validateCandidate(
    { shared_expression: SEED },
    { slot: 'shared_expression', pinnedContextSha256: CONTEXT },
  );
  const envelope = buildGepaResearchPayload({
    manifest, candidate, corpus: proofRows(),
  });
  assert.equal(envelope.test_set, null);
  for (const [name, value] of [
    ['manifest.json', JSON.stringify(manifest)],
    ['envelope.json', JSON.stringify(envelope)],
    ['seed.txt', SEED],
  ]) writeFileSync(dir + '/' + name, value, { flag: 'wx', mode: 0o600 });
  console.log('Synthetic-only shared GEPA handoff prepared; real model calls 0.');
} else {
  const manifest = readJson('manifest.json');
  const envelope = readJson('envelope.json');
  const packet = readJson('frozen-result.json');
  assert.equal(envelope.candidateSha256, digest(SEED));
  assert.equal(packet.sourceSeedSha256, envelope.candidateSha256);
  assert.equal(envelope.runManifestSha256, manifest.manifestSha256);
  const intake = intakeFrozenGepaResult({ manifest, packet });
  assert.deepEqual(intake.characterIds, IDS);
  assert.equal(intake.candidate.slot, 'shared_expression');
  assert.equal(intake.candidate.status, 'pending_owner_review');
  assert.equal(intake.candidateRegistryStage, 'proposed');
  assert.equal(intake.ownerReviewGranted, false);
  assert.equal(intake.productionEligible, false);
  assert.equal(intake.independentQualityGainEstablished, false);
  assert.equal(intake.externalCalls, 0);
  const frozen = JSON.stringify(packet);
  assert.equal(frozen.includes('eval_log'), false);
  assert.equal(frozen.includes('PRIVATE_USER'), false);
  assert.equal(frozen.includes('reflection_dataset'), false);

  // Separate family aggregates remain explicitly synthetic and unreviewed.
  const synthetic = IDS.flatMap(characterId =>
    ['development', 'optimizer_validation'].map(split => {
      const prefix = characterId + '-synthetic-' + (split === 'development' ? 'dev' : 'val');
      const scores = Object.fromEntries(DIMENSIONS.map(key => [key, 0.5]));
      return {
        characterId, split, familyId: prefix + '-family',
        baselineScores: scores, candidateScores: { ...scores },
        hardFailures: [], uncertainty: false, reviewStatus: 'unreviewed',
      };
    }));
  const review = inspectCandidateReviewReadiness({
    manifest, candidate: intake.candidate, familyEvaluations: synthetic,
  });
  assert.equal(review.scenarioFamiliesChecked, 4);
  assert.deepEqual(review.characterIds, IDS);
  assert.equal(review.candidateRegistryStage, 'proposed');
  assert.equal(review.offlineValidated, false);
  assert.equal(review.releaseApproved, false);
  assert.equal(review.productionEligible, false);
  console.log('Real pinned GEPA -> Python frozen packet -> Node review: synthetic HOLD, zero provider calls.');
}
