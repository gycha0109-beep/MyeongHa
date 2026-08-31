import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const outputRoot = path.join(repoRoot, 'research-evidence/face-reading/frdata224/batch-a');
const mode = process.argv[2] ?? 'acquire';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const ALLOWED_ASSET_HOST = 'upload.wikimedia.org';
const WIKIMEDIA_USER_AGENT = 'MyeongHa-FRData224Bot/0.1 (https://github.com/gycha0109-beep/MyeongHa)';
const WIKIMEDIA_MAX_ATTEMPTS = 4;
const WIKIMEDIA_MAX_RETRY_AFTER_MS = 5 * 60 * 1000;
const WIKIMEDIA_RETRYABLE_STATUSES = new Set([429, 503]);

const candidates = Object.freeze([
  Object.freeze({
    captureRef: 'capture-frdata224-batch-a-001',
    acquisitionRef: 'acquisition-frdata224-batch-a-001',
    sourceProvenanceRef: 'provenance-frdata224-batch-a-001',
    sourceInstanceRef: 'commons-file:Earth_apollo17.jpg|NASA:AS17-148-22727|GRIN:GPN-2000-001138',
    fileTitle: 'Earth apollo17.jpg',
    expectedLicenseFamily: 'public_domain',
    rightsBasisText: 'Wikimedia Commons records the file as a NASA/GSFC work in the U.S. public domain; metadata is recorded for evidence provenance and is not legal adjudication.',
    knownUseRestrictionNotes: ['NASA names, insignia, logos, and related marks may have restrictions distinct from copyright; no such mark is treated as licensed by this record.'],
    privacySubjectRiskNotes: ['Source screening identifies this as an astronomical Earth image with no intended individual-human subject; this note is not a human-face-count annotation or independent privacy adjudication.'],
    derivativeOfSourceInstanceRef: null,
  }),
  Object.freeze({
    captureRef: 'capture-frdata224-batch-a-002',
    acquisitionRef: 'acquisition-frdata224-batch-a-002',
    sourceProvenanceRef: 'provenance-frdata224-batch-a-002',
    sourceInstanceRef: 'commons-file:Dwight_D_Eisenhower_(cropped).jpg',
    fileTitle: 'Dwight D Eisenhower (cropped).jpg',
    expectedLicenseFamily: 'public_domain',
    rightsBasisText: 'Wikimedia Commons records the file as an official-duty U.S. Army work in the U.S. public domain; metadata is recorded for evidence provenance and is not legal adjudication.',
    knownUseRestrictionNotes: [],
    privacySubjectRiskNotes: ['Historical adult public-official portrait selected for low subject-risk research use; this is not independent privacy/personality-rights adjudication.'],
    derivativeOfSourceInstanceRef: 'commons-file:Dwight_D_Eisenhower.jpg',
  }),
  Object.freeze({
    captureRef: 'capture-frdata224-batch-a-003',
    acquisitionRef: 'acquisition-frdata224-batch-a-003',
    sourceProvenanceRef: 'provenance-frdata224-batch-a-003',
    sourceInstanceRef: 'commons-file:Group_Portrait(GN11452).jpg|HistoryTrustSA:GN11452',
    fileTitle: 'Group Portrait(GN11452).jpg',
    expectedLicenseFamily: 'cc0',
    rightsBasisText: 'Wikimedia Commons records the History Trust of South Australia GN11452 file under CC0 1.0; metadata is recorded for evidence provenance and is not legal adjudication.',
    knownUseRestrictionNotes: [],
    privacySubjectRiskNotes: ['Historical circa-1925 group portrait selected from an institutional collection for low subject-risk research use; this is not independent privacy/personality-rights adjudication.'],
    derivativeOfSourceInstanceRef: null,
  }),
]);
const candidatesByCaptureRef = new Map(candidates.map((candidate) => [candidate.captureRef, candidate]));
if (candidatesByCaptureRef.size !== candidates.length) throw new Error('FR-DATA-224 batch-A acquisition: duplicate pinned captureRef.');

function fail(message) {
  throw new Error(`FR-DATA-224 batch-A acquisition: ${message}`);
}

function sha1(bytes) {
  return createHash('sha1').update(bytes).digest('hex');
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value).sort()) result[key] = canonicalize(value[key]);
    return result;
  }
  return value;
}

function metadataDigest(value) {
  return sha256(Buffer.from(JSON.stringify(canonicalize(value)), 'utf8'));
}

function isoNow() {
  return new Date().toISOString();
}

function extForMime(mime) {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  fail(`unsupported MIME ${mime}`);
}

function extmetadataValue(info, key) {
  const value = info.extmetadata?.[key]?.value;
  return typeof value === 'string' && value.trim() ? value : null;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseRetryAfterMilliseconds(value) {
  if (value === null) return null;
  const trimmed = value.trim();
  if (/^\d+$/u.test(trimmed)) return Number.parseInt(trimmed, 10) * 1000;
  const timestamp = Date.parse(trimmed);
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, timestamp - Date.now());
}

async function fetchWikimedia(url, options, label) {
  for (let attempt = 1; attempt <= WIKIMEDIA_MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, {
      ...options,
      headers: {
        'User-Agent': WIKIMEDIA_USER_AGENT,
        'Api-User-Agent': WIKIMEDIA_USER_AGENT,
        ...(options?.headers ?? {}),
      },
    });
    if (!WIKIMEDIA_RETRYABLE_STATUSES.has(response.status)) return response;
    if (attempt === WIKIMEDIA_MAX_ATTEMPTS) {
      fail(`${label} remained unavailable after ${WIKIMEDIA_MAX_ATTEMPTS} attempts: ${response.status}`);
    }
    const retryAfter = parseRetryAfterMilliseconds(response.headers.get('retry-after'));
    const delay = retryAfter ?? (1000 * (2 ** (attempt - 1)));
    if (delay > WIKIMEDIA_MAX_RETRY_AFTER_MS) {
      fail(`${label} Retry-After exceeds governed retry budget: ${delay}ms`);
    }
    await response.body?.cancel();
    await sleep(delay);
  }
  fail(`${label} retry loop exhausted unexpectedly`);
}

function assertExpectedRightsMetadata(candidate, info) {
  const shortName = info.licenseShortName;
  if (typeof shortName !== 'string' || shortName.trim().length === 0) {
    fail(`Commons LicenseShortName is missing for ${candidate.fileTitle}`);
  }
  const normalized = shortName.trim().toLowerCase();
  if (candidate.expectedLicenseFamily === 'public_domain' && normalized !== 'public domain') {
    fail(`Commons license family drift for ${candidate.fileTitle}: expected public domain, received ${shortName}`);
  }
  if (candidate.expectedLicenseFamily === 'cc0' && normalized !== 'cc0' && normalized !== 'cc0 1.0') {
    fail(`Commons license family drift for ${candidate.fileTitle}: expected CC0, received ${shortName}`);
  }
}

function assertPinnedCandidateBinding(candidate, entry) {
  if (entry.captureRef !== candidate.captureRef) fail(`captureRef binding drift for ${entry.captureRef}`);
  if (entry.sourceRecord?.captureRef !== candidate.captureRef) fail(`source record captureRef binding drift for ${entry.captureRef}`);
  if (entry.sourceRecord?.acquisitionRef !== candidate.acquisitionRef) fail(`acquisitionRef binding drift for ${entry.captureRef}`);
  if (entry.sourceRecord?.sourceProvenanceRef !== candidate.sourceProvenanceRef) fail(`sourceProvenanceRef binding drift for ${entry.captureRef}`);
  if (entry.sourceRecord?.sourceInstanceRef !== candidate.sourceInstanceRef) fail(`sourceInstanceRef binding drift for ${entry.captureRef}`);
  if (entry.sourceRecord?.derivativeOfSourceInstanceRef !== candidate.derivativeOfSourceInstanceRef) fail(`derivative source binding drift for ${entry.captureRef}`);
  assertExpectedRightsMetadata(candidate, entry.commonsAudit ?? {});
}

async function commonsInfo(fileTitle) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'imageinfo|revisions',
    titles: `File:${fileTitle}`,
    iiprop: 'url|size|sha1|mime|extmetadata|timestamp',
    rvprop: 'ids|timestamp',
    rvlimit: '1',
    origin: '*',
  });
  const response = await fetchWikimedia(`${COMMONS_API}?${params.toString()}`, { redirect: 'error' }, `Commons API ${fileTitle}`);
  if (!response.ok) fail(`Commons API failed for ${fileTitle}: ${response.status}`);
  const payload = await response.json();
  const page = payload?.query?.pages?.[0];
  if (!page || page.missing) fail(`Commons file page missing: ${fileTitle}`);
  const imageInfo = page.imageinfo?.[0];
  if (!imageInfo) fail(`Commons imageinfo missing: ${fileTitle}`);
  const assetUrl = new URL(imageInfo.url);
  if (assetUrl.protocol !== 'https:' || assetUrl.hostname !== ALLOWED_ASSET_HOST) {
    fail(`asset URL host is not pinned Wikimedia upload host for ${fileTitle}: ${assetUrl.href}`);
  }
  if (!Number.isInteger(imageInfo.size) || imageInfo.size <= 0) fail(`invalid Commons byte size for ${fileTitle}`);
  if (!Number.isInteger(imageInfo.width) || imageInfo.width <= 0 || !Number.isInteger(imageInfo.height) || imageInfo.height <= 0) {
    fail(`invalid Commons dimensions for ${fileTitle}`);
  }
  if (!/^[0-9a-f]{40}$/u.test(imageInfo.sha1)) fail(`invalid Commons SHA-1 for ${fileTitle}`);
  const revisionId = page.revisions?.[0]?.revid ?? page.lastrevid;
  if (!Number.isInteger(revisionId) || revisionId <= 0) fail(`file page revision id missing for ${fileTitle}`);
  const canonicalPageTitle = String(page.title);
  const sourcePageUrl = `https://commons.wikimedia.org/wiki/${encodeURIComponent(canonicalPageTitle.replace(/ /g, '_')).replace(/%2F/gu, '/')}`;
  const revisionUrl = `https://commons.wikimedia.org/w/index.php?title=${encodeURIComponent(canonicalPageTitle.replace(/^File:/u, 'File:').replace(/ /g, '_'))}&oldid=${revisionId}`;
  return {
    pageId: page.pageid,
    revisionId,
    revisionTimestamp: page.revisions?.[0]?.timestamp ?? null,
    sourcePageUrl,
    revisionUrl,
    sourceAssetUrl: assetUrl.href,
    mediaWikiSha1: imageInfo.sha1,
    byteLength: imageInfo.size,
    width: imageInfo.width,
    height: imageInfo.height,
    mime: imageInfo.mime,
    mediaTimestamp: imageInfo.timestamp ?? null,
    licenseShortName: extmetadataValue(imageInfo, 'LicenseShortName'),
    licenseUrl: extmetadataValue(imageInfo, 'LicenseUrl'),
    usageTerms: extmetadataValue(imageInfo, 'UsageTerms'),
    attributionRequired: extmetadataValue(imageInfo, 'AttributionRequired'),
    credit: extmetadataValue(imageInfo, 'Credit'),
    artist: extmetadataValue(imageInfo, 'Artist'),
  };
}

async function probeSourceAccess() {
  const probed = [];
  for (const candidate of candidates) {
    const info = await commonsInfo(candidate.fileTitle);
    assertExpectedRightsMetadata(candidate, info);
    const response = await fetchWikimedia(info.sourceAssetUrl, {
      redirect: 'follow',
      headers: { Range: 'bytes=0-0' },
    }, `source access probe ${candidate.captureRef}`);
    if (!response.ok) fail(`source access probe failed for ${candidate.captureRef}: ${response.status}`);
    const effective = new URL(response.url);
    if (effective.protocol !== 'https:' || effective.hostname !== ALLOWED_ASSET_HOST) {
      fail(`source access probe escaped pinned Wikimedia upload host for ${candidate.captureRef}: ${effective.href}`);
    }
    if (response.status !== 200 && response.status !== 206) {
      fail(`source access probe returned unexpected status for ${candidate.captureRef}: ${response.status}`);
    }
    await response.body?.cancel();
    probed.push({ captureRef: candidate.captureRef, status: response.status, expectedLicenseFamily: candidate.expectedLicenseFamily });
  }
  console.log(JSON.stringify({ status: 'FRDATA224_WIKIMEDIA_ACCESS_PROBE_PASS', assetCount: probed.length, assets: probed }));
}

async function downloadExact(url, captureRef) {
  const response = await fetchWikimedia(url, { redirect: 'follow' }, `source asset download ${captureRef}`);
  if (!response.ok) fail(`source asset download failed for ${captureRef}: ${response.status}`);
  const effective = new URL(response.url);
  if (effective.protocol !== 'https:' || effective.hostname !== ALLOWED_ASSET_HOST) {
    fail(`download escaped pinned Wikimedia upload host: ${effective.href}`);
  }
  return { bytes: Buffer.from(await response.arrayBuffer()), effectiveUrl: effective.href };
}

async function runtime() {
  return import(new URL('../../dist/packages/face-reading/src/index.js', import.meta.url).href);
}

async function acquire() {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(path.join(outputRoot, 'assets'), { recursive: true });
  const fr = await runtime();
  const assets = [];

  for (const candidate of candidates) {
    const info = await commonsInfo(candidate.fileTitle);
    assertExpectedRightsMetadata(candidate, info);
    const { bytes, effectiveUrl } = await downloadExact(info.sourceAssetUrl, candidate.captureRef);
    if (effectiveUrl !== info.sourceAssetUrl) fail(`effective asset URL changed after MediaWiki resolution for ${candidate.fileTitle}`);
    if (bytes.length !== info.byteLength) fail(`downloaded byte length mismatch for ${candidate.fileTitle}`);
    if (sha1(bytes) !== info.mediaWikiSha1) fail(`downloaded SHA-1 mismatch for ${candidate.fileTitle}`);

    const extension = extForMime(info.mime);
    const relativeAssetPath = `research-evidence/face-reading/frdata224/batch-a/assets/${candidate.captureRef}.${extension}`;
    const absoluteAssetPath = path.join(repoRoot, relativeAssetPath);
    await writeFile(absoluteAssetPath, bytes);
    const canonicalAssetDigest = fr.computeIndependentFaceSourceAssetDigestFRData07A(bytes);
    const acquiredAt = isoNow();
    const sourceRecord = fr.freezeIndependentFaceSourceAssetRecordFRData07A({
      schemaVersion: 'fr-data07a-independent-face-source-asset-intake-v1',
      acquisitionRef: candidate.acquisitionRef,
      captureRef: candidate.captureRef,
      sourceProvenanceRef: candidate.sourceProvenanceRef,
      sourceInstanceRef: candidate.sourceInstanceRef,
      sourcePageUrl: info.sourcePageUrl,
      sourcePageRevisionRef: `commons-oldid:${info.revisionId}`,
      sourceAssetUrl: info.sourceAssetUrl,
      declaredCanonicalAssetDigest: canonicalAssetDigest,
      bytes,
      sourceReportedWidth: info.width,
      sourceReportedHeight: info.height,
      rightsBasisText: candidate.rightsBasisText,
      rightsEvidenceRefs: [info.revisionUrl, info.sourcePageUrl],
      rightsReviewState: 'source_rights_basis_recorded_not_legally_adjudicated',
      knownUseRestrictionNotes: candidate.knownUseRestrictionNotes,
      privacySubjectRiskNotes: candidate.privacySubjectRiskNotes,
      derivativeOfSourceInstanceRef: candidate.derivativeOfSourceInstanceRef,
      acquiredAt,
    });

    const gitBlobObjectId = execFileSync('git', ['hash-object', '-w', absoluteAssetPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    if (!/^[0-9a-f]{40}$/u.test(gitBlobObjectId)) fail(`unexpected Git blob object id for ${candidate.captureRef}`);
    const storedAt = isoNow();
    const storageReceipt = fr.freezeIndependentFaceSourceAssetStorageReceiptFRData07B(sourceRecord, {
      schemaVersion: 'fr-data07b-independent-face-source-asset-storage-receipt-input-v1',
      storageReceiptRef: `storage-receipt-${candidate.captureRef}`,
      acquisitionRef: sourceRecord.acquisitionRef,
      captureRef: sourceRecord.captureRef,
      sourceAssetRecordDigest: sourceRecord.recordDigest,
      canonicalAssetDigest: sourceRecord.canonicalAssetDigest,
      byteLength: sourceRecord.byteLength,
      storageProviderRef: 'github-git-object-database',
      storageNamespaceRef: 'gycha0109-beep/MyeongHa',
      storageObjectRef: `git-blob:${gitBlobObjectId}`,
      storageVersionRef: `git-blob-sha1:${gitBlobObjectId}`,
      retentionAttestation: 'bytes_declared_retained_in_controlled_research_storage',
      storedAt,
    });

    const retrievedBytes = Buffer.from(execFileSync('git', ['cat-file', 'blob', gitBlobObjectId], {
      cwd: repoRoot,
      maxBuffer: 32 * 1024 * 1024,
    }));
    const retrievedAt = isoNow();
    const retrievalVerification = fr.freezeIndependentFaceSourceAssetStorageRetrievalVerificationFRData07B(
      sourceRecord,
      storageReceipt,
      {
        schemaVersion: 'fr-data07b-independent-face-source-asset-storage-retrieval-input-v1',
        retrievalVerificationRef: `retrieval-verification-${candidate.captureRef}`,
        storageReceiptRef: storageReceipt.storageReceiptRef,
        sourceAssetRecordDigest: sourceRecord.recordDigest,
        retrievalMechanismRef: 'git-cat-file-blob-local-object-database',
        retrievedAt,
        retrievedBytes,
      },
    );

    assets.push({
      captureRef: candidate.captureRef,
      localAssetPath: relativeAssetPath,
      gitBlobObjectId,
      expectedLicenseFamily: candidate.expectedLicenseFamily,
      commonsAudit: info,
      downloadedSha1: sha1(bytes),
      downloadedSha256: sha256(bytes),
      sourceRecord,
      storageReceipt,
      retrievalVerification,
      humanFaceCountLabelIncluded: false,
      providerOutputIncluded: false,
    });
  }

  const material = {
    schemaVersion: 'fr-data224-batch-a-source-acquisition-manifest-v1',
    batchRef: 'frdata224-source-batch-a',
    createdAt: isoNow(),
    sourcePool: 'pinned_wikimedia_commons_files_with_per_file_rights_screen',
    sourceHostAllowlist: ['commons.wikimedia.org', ALLOWED_ASSET_HOST],
    assetCount: assets.length,
    assets,
    humanFaceCountLabelsIncluded: false,
    providerOutputsIncluded: false,
    annotationPacketGenerated: false,
    empiricalAdmissionAuthorized: false,
    providerScoringAuthorized: false,
    productionGeometryAuthorized: false,
  };
  const manifest = { ...material, manifestDigest: metadataDigest(material) };
  await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeFile(path.join(outputRoot, 'README.md'), `# FR-DATA-224 source batch A\n\nThis directory is a **research-evidence source acquisition package**, not a human ground-truth dataset.\n\n- Exact source bytes are stored under opaque capture refs.\n- Source/provenance metadata is isolated in \`manifest.json\`.\n- No human face-count labels or provider outputs are present.\n- Do not expose source filenames, captions, rights text, or provenance metadata to later blinded annotators.\n- FR-DATA-07A and FR-DATA-07B records remain fail-closed for empirical admission, provider scoring, and production geometry.\n`, 'utf8');

  console.log(JSON.stringify({
    status: 'FRDATA224_BATCH_A_ACQUISITION_PASS',
    assetCount: assets.length,
    manifestDigest: manifest.manifestDigest,
    assets: assets.map((entry) => ({ captureRef: entry.captureRef, sha256: entry.downloadedSha256, byteLength: entry.sourceRecord.byteLength, gitBlobObjectId: entry.gitBlobObjectId })),
  }));
}

async function verifyExisting() {
  const fr = await runtime();
  const manifestPath = path.join(outputRoot, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const { manifestDigest, ...material } = manifest;
  if (metadataDigest(material) !== manifestDigest) fail('manifest metadata digest mismatch');
  if (manifest.schemaVersion !== 'fr-data224-batch-a-source-acquisition-manifest-v1') fail('manifest schema drift');
  if (manifest.humanFaceCountLabelsIncluded !== false || manifest.providerOutputsIncluded !== false || manifest.annotationPacketGenerated !== false) {
    fail('blinding boundary drift in acquisition manifest');
  }
  if (manifest.empiricalAdmissionAuthorized !== false || manifest.providerScoringAuthorized !== false || manifest.productionGeometryAuthorized !== false) {
    fail('authority boundary drift in acquisition manifest');
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length !== candidates.length) fail('unexpected acquired asset count');

  const sourceRecords = [];
  const receipts = [];
  const verifications = [];
  const seenCaptureRefs = new Set();
  for (const entry of manifest.assets) {
    const candidate = candidatesByCaptureRef.get(entry.captureRef);
    if (!candidate) fail(`unrecognized captureRef ${entry.captureRef}`);
    if (seenCaptureRefs.has(entry.captureRef)) fail(`duplicate captureRef ${entry.captureRef}`);
    seenCaptureRefs.add(entry.captureRef);
    assertPinnedCandidateBinding(candidate, entry);
    if (entry.expectedLicenseFamily !== candidate.expectedLicenseFamily) fail(`expected license-family binding drift for ${entry.captureRef}`);
    if (entry.humanFaceCountLabelIncluded !== false || entry.providerOutputIncluded !== false) fail(`label/provider leakage for ${entry.captureRef}`);
    const absoluteAssetPath = path.join(repoRoot, entry.localAssetPath);
    const bytes = Buffer.from(await readFile(absoluteAssetPath));
    if (bytes.length !== entry.commonsAudit.byteLength || bytes.length !== entry.sourceRecord.byteLength) fail(`byte length mismatch for ${entry.captureRef}`);
    if (sha1(bytes) !== entry.commonsAudit.mediaWikiSha1 || sha1(bytes) !== entry.downloadedSha1) fail(`SHA-1 mismatch for ${entry.captureRef}`);
    if (sha256(bytes) !== entry.downloadedSha256 || sha256(bytes) !== entry.sourceRecord.canonicalAssetDigest) fail(`SHA-256 mismatch for ${entry.captureRef}`);
    const oid = execFileSync('git', ['hash-object', absoluteAssetPath], { cwd: repoRoot, encoding: 'utf8' }).trim();
    if (oid !== entry.gitBlobObjectId) fail(`Git blob object id mismatch for ${entry.captureRef}`);
    const gitBytes = Buffer.from(execFileSync('git', ['cat-file', 'blob', entry.gitBlobObjectId], { cwd: repoRoot, maxBuffer: 32 * 1024 * 1024 }));
    if (!gitBytes.equals(bytes)) fail(`Git blob readback mismatch for ${entry.captureRef}`);
    fr.verifyFrozenIndependentFaceSourceAssetRecordFRData07A(entry.sourceRecord);
    fr.verifyFrozenIndependentFaceSourceAssetStorageReceiptFRData07B(entry.sourceRecord, entry.storageReceipt);
    fr.verifyFrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07B(entry.sourceRecord, entry.storageReceipt, entry.retrievalVerification);
    if (entry.retrievalVerification.retrievedByteDigest !== sha256(gitBytes)) fail(`retrieval verification digest mismatch for ${entry.captureRef}`);
    sourceRecords.push(entry.sourceRecord);
    receipts.push(entry.storageReceipt);
    verifications.push(entry.retrievalVerification);
  }
  if (seenCaptureRefs.size !== candidates.length || candidates.some((candidate) => !seenCaptureRefs.has(candidate.captureRef))) {
    fail('pinned capture coverage is incomplete');
  }
  const report = fr.bindIndependentFaceSourceAssetStorageFRData07B(sourceRecords, receipts, verifications);
  if (!report.sourceAssetRecordCoverageComplete || report.empiricalAdmissionAuthorized !== false) fail('FR-DATA-07B binding report drift');
  console.log(JSON.stringify({ status: 'FRDATA224_BATCH_A_EXISTING_EVIDENCE_PASS', manifestDigest, assetCount: manifest.assets.length }));
}

if (mode === 'acquire') await acquire();
else if (mode === 'verify-existing') await verifyExisting();
else if (mode === 'probe-access') await probeSourceAccess();
else fail(`unsupported mode ${mode}`);
