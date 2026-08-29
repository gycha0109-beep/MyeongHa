import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildMentonDatasetIntakeReportFRData01,
  validateMentonDatasetIntakeManifestFRData01,
} from '../dist/packages/face-reading/src/menton-dataset-intake-frdata01.js';

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function detectImageContentSignature(bytes) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return 'image/webp';
  throw new Error('FR-DATA-01 asset does not expose a recognized PNG/JPEG/WebP content signature.');
}

function assertConfined(root, target, captureRef) {
  const rel = relative(root, target);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`FR-DATA-01 capture ${captureRef} resolves outside the declared asset root.`);
  }
}

export async function verifyMentonDatasetAssetFilesFRData01(manifest, assetRootInput) {
  validateMentonDatasetIntakeManifestFRData01(manifest);
  const assetRoot = await realpath(resolve(assetRootInput));
  const verifiedAssets = [];
  for (const binding of manifest.assets) {
    const requestedPath = resolve(assetRoot, ...binding.relativeAssetPath.split('/'));
    const actualPath = await realpath(requestedPath);
    assertConfined(assetRoot, actualPath, binding.captureRef);
    const fileStat = await stat(actualPath);
    if (!fileStat.isFile()) throw new Error(`FR-DATA-01 capture ${binding.captureRef} asset is not a regular file.`);
    const bytes = await readFile(actualPath);
    verifiedAssets.push(Object.freeze({
      captureRef: binding.captureRef,
      relativeAssetPath: binding.relativeAssetPath,
      actualDigest: sha256(bytes),
      byteLength: bytes.length,
      contentSignature: detectImageContentSignature(bytes),
    }));
  }
  return Object.freeze(verifiedAssets);
}

export async function runMentonDatasetIntakeFRData01(manifestPathInput, assetRootInput, reportPathInput = null) {
  const manifestPath = resolve(manifestPathInput);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  validateMentonDatasetIntakeManifestFRData01(manifest);
  const verifiedAssets = await verifyMentonDatasetAssetFilesFRData01(manifest, assetRootInput);
  const report = buildMentonDatasetIntakeReportFRData01(manifest, verifiedAssets);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (reportPathInput !== null) {
    const reportPath = resolve(reportPathInput);
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, serialized, 'utf8');
  }
  console.log(`FR_DATA_01_INTAKE ${JSON.stringify(report)}`);
  return report;
}

async function main() {
  const [manifestPath, assetRoot, reportPath] = process.argv.slice(2);
  if (!manifestPath || !assetRoot) {
    throw new Error('Usage: node scripts/face-reading-fr-data01-menton-dataset-intake.mjs <manifest.json> <asset-root> [report.json]');
  }
  await runMentonDatasetIntakeFRData01(manifestPath, assetRoot, reportPath ?? null);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath !== null && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
