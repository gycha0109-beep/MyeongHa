/** Offline-only metadata preflight. Never imports API clients or accepts credentials. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateOptimizationRunManifest, validateDatasetSplitMetadata } from './src/index.mjs';

async function main(args) {
  if (args.length !== 3 || args.some(x => x.startsWith('--') || x.trim() === '')) throw new Error('USAGE: node scripts/character-optimization/validate-offline-manifest.mjs RUN_JSON PROFILES_JSON DATASET_METADATA_JSON');
  const inputs = await Promise.all(args.map(async p => JSON.parse(await readFile(resolve(p), 'utf8'))));
  const [run,profiles,metadata] = inputs;
  const plan = validateOptimizationRunManifest(run,profiles);
  const splits = validateDatasetSplitMetadata(metadata);
  if (splits.roleCounts.sealed_holdout || splits.roleCounts.long_horizon) {
    throw new Error('CHARACTER_OPTIMIZATION_INVALID: offline CLI does not admit sealed/long_horizon metadata; separate verifier required');
  }
  const known = new Set(plan.characterIds);
  if (metadata.some(r => !known.has(r.characterId))) throw new Error('CHARACTER_OPTIMIZATION_INVALID: unknown dataset character');
  const report = {
    schemaVersion:'character-optimization-offline-preflight-v1',
    runId:plan.runId,track:plan.track,characterIds:plan.characterIds,
    runManifestSha256:plan.manifestSha256,datasetManifestSha256:splits.manifestSha256,
    developmentCount:splits.roleCounts.development,
    optimizerValidationCount:splits.roleCounts.optimizer_validation,
    externalCalls:0,productionChanges:false,qualityImprovementProven:false,
    semanticLeakageNotYetVerified:true,
  };
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
main(process.argv.slice(2)).catch(err => {
  process.stderr.write(`${String(err.message).split('\n')[0].slice(0,230)}\n`);
  process.exitCode=1;
});
