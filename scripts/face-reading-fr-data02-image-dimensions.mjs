import { readFile, realpath, writeFile, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildMentonDatasetImageDimensionReportFRData02,
  inspectImageByteDimensionsFRData02,
  validateMentonDatasetIntakeManifestFRData01,
} from '../dist/packages/face-reading/src/index.js';
import { verifyMentonDatasetAssetFilesFRData01 } from './face-reading-fr-data01-menton-dataset-intake.mjs';

function assertConfined(root, target, captureRef) {
  const rel = relative(root, target);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`FR-DATA-02 capture ${captureRef} resolves outside the declared asset root.`);
  }
}

export async function inspectMentonDatasetImageDimensionsFRData02(manifest, assetRootInput) {
  validateMentonDatasetIntakeManifestFRData01(manifest);
  await verifyMentonDatasetAssetFilesFRData01(manifest, assetRootInput);
  const assetRoot = await realpath(resolve(assetRootInput));
  const evidence = [];
  for (const binding of manifest.assets) {
    const target = await realpath(resolve(assetRoot, ...binding.relativeAssetPath.split('/')));
    assertConfined(assetRoot, target, binding.captureRef);
    const bytes = await readFile(target);
    const dimensions = inspectImageByteDimensionsFRData02(bytes);
    evidence.push(Object.freeze({
      captureRef: binding.captureRef,
      relativeAssetPath: binding.relativeAssetPath,
      ...dimensions,
    }));
  }
  return Object.freeze(evidence);
}

export async function runMentonDatasetImageDimensionVerificationFRData02(
  manifestPathInput,
  assetRootInput,
  reportPathInput = null,
) {
  const manifest = JSON.parse(await readFile(resolve(manifestPathInput), 'utf8'));
  validateMentonDatasetIntakeManifestFRData01(manifest);
  const evidence = await inspectMentonDatasetImageDimensionsFRData02(manifest, assetRootInput);
  const report = buildMentonDatasetImageDimensionReportFRData02(manifest, evidence);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (reportPathInput !== null) {
    const reportPath = resolve(reportPathInput);
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, serialized, 'utf8');
  }
  console.log(`FR_DATA_02_DIMENSIONS ${JSON.stringify(report)}`);
  return report;
}

async function main() {
  const [manifestPath, assetRoot, reportPath] = process.argv.slice(2);
  if (!manifestPath || !assetRoot) {
    throw new Error('Usage: node scripts/face-reading-fr-data02-image-dimensions.mjs <manifest.json> <asset-root> [report.json]');
  }
  await runMentonDatasetImageDimensionVerificationFRData02(manifestPath, assetRoot, reportPath ?? null);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath !== null && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
