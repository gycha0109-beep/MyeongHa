import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PLATFORMS = Object.freeze(['android', 'ios']);

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function inspectMobileExportPlatformV1(exportRoot, platform) {
  if (!PLATFORMS.includes(platform)) {
    throw new Error(`Unsupported Mobile export platform: ${platform}`);
  }

  const platformRoot = path.join(exportRoot, platform);
  const metadataPath = path.join(platformRoot, 'metadata.json');
  const bundleRoot = path.join(
    platformRoot,
    '_expo',
    'static',
    'js',
    platform,
  );
  const oppositePlatform = platform === 'android' ? 'ios' : 'android';
  const oppositeBundleRoot = path.join(
    platformRoot,
    '_expo',
    'static',
    'js',
    oppositePlatform,
  );

  if (!await exists(metadataPath)) {
    throw new Error(`${platform} export is missing metadata.json.`);
  }
  const metadataStats = await stat(metadataPath);
  if (!metadataStats.isFile() || metadataStats.size <= 0) {
    throw new Error(`${platform} metadata.json must be a non-empty file.`);
  }

  let metadata;
  try {
    metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  } catch {
    throw new Error(`${platform} metadata.json must contain valid JSON.`);
  }
  if (!isRecord(metadata)) {
    throw new Error(`${platform} metadata.json must contain a JSON object.`);
  }

  if (!await exists(bundleRoot)) {
    throw new Error(`${platform} export is missing its platform bundle directory.`);
  }

  const bundleFiles = (await collectFiles(bundleRoot))
    .filter((file) => file.endsWith('.hbc'));
  if (bundleFiles.length === 0) {
    throw new Error(`${platform} export must contain at least one Hermes .hbc bundle.`);
  }

  for (const bundleFile of bundleFiles) {
    const bundleStats = await stat(bundleFile);
    if (bundleStats.size <= 0) {
      throw new Error(`${platform} export contains an empty Hermes bundle.`);
    }
  }

  if (await exists(oppositeBundleRoot)) {
    const oppositeBundles = (await collectFiles(oppositeBundleRoot))
      .filter((file) => file.endsWith('.hbc'));
    if (oppositeBundles.length > 0) {
      throw new Error(
        `${platform} export unexpectedly contains ${oppositePlatform} Hermes bundles.`,
      );
    }
  }

  return Object.freeze({
    platform,
    metadataPath,
    bundleCount: bundleFiles.length,
    bundleBytes: (
      await Promise.all(bundleFiles.map(async (file) => (await stat(file)).size))
    ).reduce((sum, size) => sum + size, 0),
  });
}

export async function verifyMobileExportArtifactsV1(exportRoot) {
  const reports = [];
  for (const platform of PLATFORMS) {
    reports.push(await inspectMobileExportPlatformV1(exportRoot, platform));
  }
  return Object.freeze(reports);
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedAsScript) {
  const exportRoot = path.resolve(
    process.cwd(),
    process.argv[2] ?? 'apps/mobile/.expo/export-ci',
  );
  const reports = await verifyMobileExportArtifactsV1(exportRoot);
  for (const report of reports) {
    console.log(
      `Mobile export artifact verified: ${report.platform} bundles=${report.bundleCount} bytes=${report.bundleBytes}`,
    );
  }
}
