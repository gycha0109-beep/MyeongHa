import { createHash } from 'node:crypto';
import { readdir, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  freezeIndependentFaceAnnotationPacketFRData07C,
  freezeIndependentFaceAnnotationPacketItemBindingFRData07C,
  verifyFrozenIndependentFaceAnnotationPacketFRData07C,
  verifyIndependentFaceAnnotationPacketAssetBytesFRData07C,
} from '../../dist/packages/face-reading/src/index.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const sourceRoot = path.join(repoRoot, 'research-evidence/face-reading/frdata224/batch-a');
const sourceManifestPath = path.join(sourceRoot, 'manifest.json');
const packetRoot = path.join(sourceRoot, 'annotation-packet-v1');
const packetManifestPath = path.join(packetRoot, 'manifest.json');
const packetInstructionsPath = path.join(packetRoot, 'INSTRUCTIONS.md');
const internalBindingPath = path.join(sourceRoot, 'annotation-packet-v1-binding.json');
const PACKET_REF = 'frdata224-batch-a-annotation-v1';
const mode = process.argv[2] ?? 'prepare';
const SHA256 = /^sha256:[0-9a-f]{64}$/u;

function fail(message) {
  throw new Error(`FR-DATA-224 annotation packet: ${message}`);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child === undefined) fail('metadata cannot contain undefined values');
      out[key] = canonicalize(child);
    }
    return out;
  }
  return value;
}

function sha256Json(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex')}`;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function validateSourceManifest(manifest) {
  if (manifest?.schemaVersion !== 'fr-data224-batch-a-source-acquisition-manifest-v1') fail('source manifest schema drift');
  if (manifest?.batchRef !== 'frdata224-source-batch-a') fail('source batchRef drift');
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0 || manifest.assetCount !== manifest.assets.length) {
    fail('source asset coverage drift');
  }
  if (!SHA256.test(manifest.manifestDigest ?? '')) fail('source manifestDigest is not canonical sha256');
  const topLevelFalse = [
    'humanFaceCountLabelsIncluded',
    'providerOutputsIncluded',
    'annotationPacketGenerated',
    'empiricalAdmissionAuthorized',
    'providerScoringAuthorized',
    'productionGeometryAuthorized',
  ];
  for (const key of topLevelFalse) if (manifest[key] !== false) fail(`source manifest ${key} must remain false`);
  const captureRefs = new Set();
  const digests = new Set();
  for (const asset of manifest.assets) {
    if (typeof asset.captureRef !== 'string' || asset.captureRef.length === 0 || captureRefs.has(asset.captureRef)) fail('source captureRef uniqueness drift');
    captureRefs.add(asset.captureRef);
    if (asset.humanFaceCountLabelIncluded !== false || asset.providerOutputIncluded !== false) fail(`source ${asset.captureRef} already contains forbidden human/provider evidence`);
    if (!asset.sourceRecord || !asset.storageReceipt || !asset.retrievalVerification) fail(`source ${asset.captureRef} missing FR-DATA-07A/07B evidence`);
    if (asset.sourceRecord.humanFaceCountLabelEstablished !== false || asset.sourceRecord.partitionAssignmentAuthorized !== false ||
        asset.sourceRecord.empiricalAdmissionAuthorized !== false || asset.sourceRecord.providerScoringAuthorized !== false) {
      fail(`source ${asset.captureRef} FR-DATA-07A authority boundary drift`);
    }
    if (asset.storageReceipt.humanFaceCountLabelEstablished !== false || asset.storageReceipt.partitionAssignmentAuthorized !== false ||
        asset.storageReceipt.empiricalAdmissionAuthorized !== false || asset.storageReceipt.providerScoringAuthorized !== false) {
      fail(`source ${asset.captureRef} FR-DATA-07B receipt authority boundary drift`);
    }
    if (asset.retrievalVerification.humanFaceCountLabelEstablished !== false || asset.retrievalVerification.partitionAssignmentAuthorized !== false ||
        asset.retrievalVerification.empiricalAdmissionAuthorized !== false || asset.retrievalVerification.providerScoringAuthorized !== false) {
      fail(`source ${asset.captureRef} FR-DATA-07B retrieval authority boundary drift`);
    }
    const digest = asset.sourceRecord.canonicalAssetDigest;
    if (!SHA256.test(digest ?? '') || digests.has(digest)) fail('source canonical digest uniqueness drift');
    digests.add(digest);
    if (asset.downloadedSha256 !== digest || asset.storageReceipt.canonicalAssetDigest !== digest ||
        asset.retrievalVerification.canonicalAssetDigest !== digest || asset.retrievalVerification.retrievedByteDigest !== digest) {
      fail(`source ${asset.captureRef} canonical digest binding drift`);
    }
    if (asset.sourceRecord.captureRef !== asset.captureRef || asset.storageReceipt.captureRef !== asset.captureRef ||
        asset.retrievalVerification.captureRef !== asset.captureRef) fail(`source ${asset.captureRef} capture binding drift`);
  }
  return manifest;
}

function instructionsMarkdown(manifest) {
  const labels = manifest.labelVocabulary.map((label) => `- \`${label}\``).join('\n');
  const instructions = manifest.instructions.map((instruction, index) => `${index + 1}. ${instruction}`).join('\n');
  return `# Human Face-Count Annotation Packet\n\n## Allowed response vocabulary\n\n${labels}\n\n## Instructions\n\n${instructions}\n\nReturn one allowed label for each opaque item reference through the controlled annotation session. Do not add identity or other facial inferences.\n`;
}

function forbiddenPublicHints(asset) {
  return [
    asset.captureRef,
    asset.localAssetPath,
    asset.gitBlobObjectId,
    asset.downloadedSha1,
    asset.downloadedSha256,
    asset.sourceRecord.acquisitionRef,
    asset.sourceRecord.sourceProvenanceRef,
    asset.sourceRecord.sourceInstanceRef,
    asset.sourceRecord.sourcePageUrl,
    asset.sourceRecord.sourcePageRevisionRef,
    asset.sourceRecord.sourceAssetUrl,
    asset.sourceRecord.recordDigest,
    asset.storageReceipt.storageReceiptRef,
    asset.storageReceipt.storageProviderRef,
    asset.storageReceipt.storageNamespaceRef,
    asset.storageReceipt.storageObjectRef,
    asset.storageReceipt.storageVersionRef,
    asset.storageReceipt.receiptDigest,
    asset.retrievalVerification.retrievalVerificationRef,
    asset.retrievalVerification.retrievalMechanismRef,
    asset.retrievalVerification.verificationDigest,
    asset.commonsAudit?.sourcePageUrl,
    asset.commonsAudit?.revisionUrl,
    asset.commonsAudit?.sourceAssetUrl,
    asset.commonsAudit?.artist,
    asset.commonsAudit?.credit,
  ].filter((value) => typeof value === 'string' && value.length > 0);
}

async function prepare() {
  const sourceManifest = validateSourceManifest(await readJson(sourceManifestPath));
  const bindings = [];
  const sourceBytes = new Map();
  for (const asset of sourceManifest.assets) {
    const absoluteSourcePath = path.join(repoRoot, asset.localAssetPath);
    const bytes = new Uint8Array(await readFile(absoluteSourcePath));
    const binding = freezeIndependentFaceAnnotationPacketItemBindingFRData07C(
      asset.sourceRecord,
      asset.storageReceipt,
      asset.retrievalVerification,
      {
        schemaVersion: 'fr-data07c-independent-face-annotation-packet-item-input-v1',
        packetRef: PACKET_REF,
        canonicalAssetBytes: bytes,
      },
    );
    bindings.push(binding);
    sourceBytes.set(binding.captureRef, bytes);
  }
  const packet = freezeIndependentFaceAnnotationPacketFRData07C(PACKET_REF, sourceManifest.manifestDigest, bindings);
  await rm(packetRoot, { recursive: true, force: true });
  await rm(internalBindingPath, { force: true });
  await mkdir(path.join(packetRoot, 'assets'), { recursive: true });
  for (const binding of packet.itemBindings) {
    const bytes = sourceBytes.get(binding.captureRef);
    if (!bytes) fail(`missing source bytes for ${binding.captureRef}`);
    await writeFile(path.join(packetRoot, binding.packetAssetPath), bytes);
  }
  await writeFile(packetManifestPath, `${JSON.stringify(packet.annotatorManifest, null, 2)}\n`, 'utf8');
  await writeFile(packetInstructionsPath, instructionsMarkdown(packet.annotatorManifest), 'utf8');
  await writeFile(internalBindingPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
  await verifyExisting();
  return packet;
}

async function listRelativeFiles(root, prefix = '') {
  const entries = await readdir(root, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) out.push(...await listRelativeFiles(path.join(root, entry.name), relative));
    else out.push(relative);
  }
  return out.sort();
}

async function verifyExisting() {
  const sourceManifest = validateSourceManifest(await readJson(sourceManifestPath));
  const packet = verifyFrozenIndependentFaceAnnotationPacketFRData07C(await readJson(internalBindingPath));
  if (packet.packetRef !== PACKET_REF) fail('persisted packetRef drift');
  if (packet.sourceEvidenceManifestDigest !== sourceManifest.manifestDigest) fail('packet sourceEvidenceManifestDigest drift');
  if (packet.itemCount !== sourceManifest.assetCount) fail('packet/source item-count coverage drift');
  const publicManifest = await readJson(packetManifestPath);
  if (JSON.stringify(publicManifest) !== JSON.stringify(packet.annotatorManifest)) fail('public manifest differs from frozen internal binding');
  const instructions = await readFile(packetInstructionsPath, 'utf8');
  if (instructions !== instructionsMarkdown(packet.annotatorManifest)) fail('public instructions drift');

  const expectedFiles = ['INSTRUCTIONS.md', 'manifest.json', ...packet.itemBindings.map((binding) => binding.packetAssetPath)].sort();
  const actualFiles = await listRelativeFiles(packetRoot);
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) fail('annotator-facing packet contains unexpected or missing files');

  const sourceByCaptureRef = new Map(sourceManifest.assets.map((asset) => [asset.captureRef, asset]));
  for (const binding of packet.itemBindings) {
    const asset = sourceByCaptureRef.get(binding.captureRef);
    if (!asset) fail(`binding ${binding.itemRef} has no exact source evidence capture`);
    const sourceBytes = new Uint8Array(await readFile(path.join(repoRoot, asset.localAssetPath)));
    const packetBytes = new Uint8Array(await readFile(path.join(packetRoot, binding.packetAssetPath)));
    verifyIndependentFaceAnnotationPacketAssetBytesFRData07C(binding, packetBytes);
    if (sourceBytes.length !== packetBytes.length || !Buffer.from(sourceBytes).equals(Buffer.from(packetBytes))) {
      fail(`packet asset ${binding.itemRef} is not byte-for-byte identical to canonical source evidence`);
    }
    const recomputed = freezeIndependentFaceAnnotationPacketItemBindingFRData07C(
      asset.sourceRecord,
      asset.storageReceipt,
      asset.retrievalVerification,
      {
        schemaVersion: 'fr-data07c-independent-face-annotation-packet-item-input-v1',
        packetRef: PACKET_REF,
        canonicalAssetBytes: sourceBytes,
      },
    );
    if (JSON.stringify(recomputed) !== JSON.stringify(binding)) fail(`internal item binding drift for ${binding.itemRef}`);
  }

  const publicText = `${JSON.stringify(publicManifest)}\n${instructions}`;
  const forbiddenPublicEvidenceTokens = [
    /capture-frdata224/i,
    /commons\.wikimedia/i,
    /upload\.wikimedia/i,
    /sha256:/i,
    /git-blob:/i,
    /calibration/i,
    /holdout/i,
    /providerOutput/i,
    /providerCandidateCount/i,
    /providerRunRef/i,
    /providerLandmarks/i,
    /providerResultShape/i,
    /annotatorRef/i,
    /annotationSessionRef/i,
    /observedAssetDigest/i,
    /annotatedAt/i,
    /annotationFrozenBefore/i,
    /suggestedLabel/i,
    /humanFaceCountLabel/i,
  ];
  if (forbiddenPublicEvidenceTokens.some((pattern) => pattern.test(publicText))) {
    fail('annotator-facing wrapper contains a forbidden source/digest/partition/provider-or-prior-annotation evidence token');
  }
  for (const asset of sourceManifest.assets) {
    for (const hint of forbiddenPublicHints(asset)) {
      if (publicText.includes(hint)) fail(`annotator-facing wrapper leaked source/internal hint from ${asset.captureRef}`);
    }
  }

  const canonicalPacketDigest = sha256Json((({ packetDigest: _ignored, ...material }) => material)(packet));
  if (canonicalPacketDigest !== packet.packetDigest) fail('packet digest readback mismatch');
  return packet;
}

if (mode === 'prepare') {
  const packet = await prepare();
  console.log(JSON.stringify({
    status: 'FRDATA224_PROVIDER_BLIND_ANNOTATION_PACKET_PREPARED',
    packetRef: packet.packetRef,
    packetDigest: packet.packetDigest,
    annotatorManifestDigest: packet.annotatorManifestDigest,
    itemCount: packet.itemCount,
    humanAnnotationEstablished: packet.humanAnnotationEstablished,
    empiricalAdmissionAuthorized: packet.empiricalAdmissionAuthorized,
  }));
} else if (mode === 'verify-existing') {
  const packet = await verifyExisting();
  console.log(JSON.stringify({
    status: 'FRDATA224_PROVIDER_BLIND_ANNOTATION_PACKET_VERIFY_PASS',
    packetRef: packet.packetRef,
    packetDigest: packet.packetDigest,
    annotatorManifestDigest: packet.annotatorManifestDigest,
    itemCount: packet.itemCount,
    humanAnnotationEstablished: packet.humanAnnotationEstablished,
    empiricalAdmissionAuthorized: packet.empiricalAdmissionAuthorized,
  }));
} else {
  fail(`unsupported mode ${mode}`);
}
