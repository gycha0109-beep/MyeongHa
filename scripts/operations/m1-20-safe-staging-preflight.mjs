import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditLiveMigrationImpactV1, HISTORICAL_BUNDLE } from './m1-19-live-migration-impact.mjs';

// Git blob fingerprints of the 45 individually reviewed M1-19 migration files.
// This pins the inspected bytes, not just filenames or risk-category labels.
// Any changed SQL must receive a NEW security/Owner review, not silent promotion.
export const REVIEWED_SOURCE_BLOBS_V1 = Object.freeze({
  "1520": "9cab84727c33d2ffb6985119b22ec284c9ed025a",
  "1530": "0b369d4955c935992e5243dcb4c2ec87c722a876",
  "1540": "f6a87a80db1a1463cca34b7f09e157a8ede3b4cd",
  "1550": "e3c1d8a3f26866b8cc6b6e0f0c58f9eb90525677",
  "1560": "7ddf9e97635e65cc43402cd620af45b798d66b6e",
  "1570": "0228eeb25dc30014e045b1995f2af32b43b91f6a",
  "1580": "fb278c9e38646997ea75e8419c97dcff9ddf17ad",
  "1590": "1a36e8f8b98f6c98c591572729685d7f6e319249",
  "1600": "a40ad2c1cbae8ab6653c817340f0c42f1784b08c",
  "1610": "ad4a961d4474b9048c8e397d092f354e032bd057",
  "1620": "35fc7a22627a1157e2b92d277e419bd8945d219c",
  "1630": "f02299ebc1d400532756c14101bc50e8423158d0",
  "1640": "51862c2b4adcfcf65d76ab08459b1c26a12e0fba",
  "1650": "702166644092b8bc4b91ef8428b36901c636811b",
  "1660": "138eed0898a868c14200719e383f75302c379a26",
  "1670": "90bae4dd44811c07d81be8028c40da0cbb211891",
  "1680": "d1b63f472b620b3250153d59dfeab079c6585e23",
  "1690": "79026a10855fbafaf2e4465e0a382e37ce1a16cd",
  "1700": "fb8803f8cdb3b6cfb76dd8e1faa2cc8dcdcf043f",
  "1710": "1d0e773a8e8b27474a0fde182d75433077d8add8",
  "1720": "659df0d5a039d6617de20407ea129aab95fe1201",
  "1740": "6632f705f07b3d5216ee85e36e3d288c348e7f95",
  "1750": "b49b48073e09104e9c7872a6d2bb05dc8f0bdca3",
  "1760": "c2e5c594453e4e1e5bb17cff0298f950b0505567",
  "1770": "f906719d271668efadaba728570cbe00d8261e90",
  "1780": "1db5f7437eb538839eaf3e1740858b20187af946",
  "1790": "6ad7be160be810fad04c865b7a63ac455b138a42",
  "1800": "48b3d562b08accaba950dbee76c9219b7defaafe",
  "1810": "70969a6cb301518a3e2db236ec38bda719884566",
  "1820": "b54ca7b718cdc36b5904668bb8382152b34165a6",
  "1830": "29a658f7b02fd1a5922345743c409bd38499d50e",
  "1840": "665e98eac18df3290340e80f872235eb0f12f2d5",
  "1850": "a42ceb4e7c048a20dc85015f08aa5474ae90bbbd",
  "1860": "e8667dc343a567a1168189eb8b372792592d1e45",
  "1870": "2981e6ff617ac79fe411b8b432960542a3ead199",
  "1880": "486dd4ae760d004acdaa1e509be33ce71c3eb69c",
  "1890": "d7cfea884415b0b253040225392d594d47880766",
  "1900": "0a2aae0f015cc404344824881c4a5d24c9ca0810",
  "1910": "933553135d133aa942ea20148f7a60e1014fd8ec",
  "1920": "914efa21d4f3323275f79a74e5e41a17e1fe004d",
  "1930": "432225802152d26e3d86ecbd4ee8a97a25de8507",
  "1940": "5ac869800ea43d50eec7e7852ef5a1298e6102b5",
  "1950": "28db956dcb9ce06869f8a1e4bb14fa94576fb285",
  "1960": "bc7e3dc97d93700379dc5b2bcf25a1056fa1cdef",
  "1970": "a2267dcaa30c8a4dde15dd741fc8eea4dda0e5fd"
});

// Conservative, source-reviewed cross-stage obligations. An edge is a
// necessary ordering dependency, NOT approval that the migration is safe.
export const REQUIRED_PREDECESSORS_V1 = Object.freeze({
  '1750': ['1740'],
  '1760': ['1740', '1750'],
  '1770': ['1740'],
  '1780': ['1770'],
  '1790': ['1740'],
  '1800': ['1740', '1760', '1790'],
  '1810': ['1800'],
  '1820': ['1800', '1810'],
  '1830': ['1820'],
  '1840': ['1830'],
  '1850': ['1830', '1840'],
  '1860': ['1830'],
  '1870': ['1830'],
  '1880': ['1850', '1870'],
  '1890': ['1770', '1780', '1830', '1850', '1860', '1880'],
  '1900': ['1820', '1830', '1890'],
  '1910': ['1830'],
  '1920': ['1910'],
  '1930': ['1920'],
  '1940': ['1930'],
  '1950': ['1930'],
  '1960': ['1920'],
  '1970': ['1820', '1900'],
});

export function gitBlobSha1(bytes) {
  return createHash('sha1')
    .update(Buffer.from('blob ' + bytes.length + '\0'))
    .update(bytes).digest('hex');
}
function readSourceInventory(dir) {
  const files = readdirSync(dir).filter(n => /^\d{4,14}_.+\.sql$/u.test(n));
  const found = new Map();
  for (const file of files) {
    const version = file.split('_')[0];
    if (found.has(version)) throw new Error('M1-20 duplicate source version');
    found.set(version, {
      version,
      file,
      blobSha: gitBlobSha1(readFileSync(join(dir, file))),
    });
  }
  return found;
}

export function auditM120SafeStaging(snapshot, directory = 'supabase/migrations') {
  const impact = auditLiveMigrationImpactV1(snapshot, directory);
  const source = readSourceInventory(directory);
  const pinned = Object.keys(REVIEWED_SOURCE_BLOBS_V1).sort();
  const sourceDrift = pinned.filter(v =>
    !source.has(v) || source.get(v).blobSha !== REVIEWED_SOURCE_BLOBS_V1[v]);
  const missing = new Set(impact.migrationInventory.map(x => x.version));
  const installed = new Set(snapshot.installedVersions);
  const graph = impact.migrationInventory.map(entry => {
    const predecessors = REQUIRED_PREDECESSORS_V1[entry.version] || [];
    const unresolved = predecessors.filter(v => !source.has(v) && !installed.has(v));
    return Object.freeze({
      version: entry.version,
      file: entry.file,
      owner: entry.owner,
      risk: entry.risk,
      sourceSha256: entry.sha256,
      reviewedBlobMatch: !sourceDrift.includes(entry.version),
      requiredPredecessors: predecessors,
      missingPredecessors: predecessors.filter(v => missing.has(v)),
      unknownPredecessors: unresolved,
    });
  });
  const unknownPredecessors = graph.flatMap(x =>
    x.unknownPredecessors.map(version => ({ requiredBy: x.version, version })));
  const closure = new Set();
  const visiting = new Set();
  function add(version) {
    if (closure.has(version)) return;
    if (visiting.has(version)) throw new Error('M1-20 dependency cycle');
    visiting.add(version);
    for (const prior of REQUIRED_PREDECESSORS_V1[version] || []) add(prior);
    visiting.delete(version);
    closure.add(version);
  }
  add('1970');

  // This closure is a risk and review candidate ONLY. It is not a
  // deployable sequence; unlisted DB objects, data and side-effects require
  // real PG17 replay and domain-specific Owner authorization.
  const requiredMissingForRead = [...closure].filter(v => missing.has(v))
    .sort((a,b) => Number(a)-Number(b));
  const excludedMissing = [...missing].filter(v => !closure.has(v)).sort();
  const historicCorrect = impact.historicalBundleStatus ===
    'IDENTIFIED_EXISTING_SEYEON_RESTORE_UNRECONCILED';
  const safeState = sourceDrift.length || unknownPredecessors.length ||
      !historicCorrect || impact.unmatchedRemoteCount !== 1 ||
      impact.unmatchedRemoteVersions[0] !== HISTORICAL_BUNDLE.version
    ? 'HOLD_M1_20_UNRECONCILED_SOURCE_OR_DEPENDENCY'
    : 'HOLD_M1_20_OWNER_STAGING_AND_RESTORE_EVIDENCE_REQUIRED';
  return Object.freeze({
    verdict: safeState,
    basedOnM119: impact.verdict,
    reviewedSourceCount: pinned.length,
    sourceDrift,
    unknownPredecessors,
    requiredMissingForRead,
    excludedMissing,
    graph,
    approvalRequired: [
      'SeYeon restore Owner/DR evidence',
      'Privacy and Saju migration owners',
      'Commerce D2/Cancel and DB Security owners',
      'Real isolated PG17 + nonproduction Supabase restore/replay',
      'Independent M1-18 catalog and history gates',
    ],
    stagingPlanOnly: true,
    safeToApplyMigrations: false,
    migrationHistoryRepairAuthorized: false,
    privateIssuerAuthorized: false,
    providerPaymentAuthorized: false,
    paidReaderAuthorized: false,
    deployAuthorized: false,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!process.argv[2]) {
    console.error('Usage: node scripts/operations/m1-20-safe-staging-preflight.mjs <snapshot.json>');
    process.exitCode = 2;
  } else {
    const report = auditM120SafeStaging(JSON.parse(readFileSync(process.argv[2], 'utf8')));
    const { graph, ...summary } = report;
    console.log(JSON.stringify(summary, null, 2));
    // Diagnostic-only contract. Never silently succeed as a cutover permit.
    process.exitCode = 3;
  }
}
