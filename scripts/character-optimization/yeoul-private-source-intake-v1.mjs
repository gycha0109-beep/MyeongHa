/** Private-source-only legacy evaluation intake for the Yeoul GEPA preparation track.
 * Never publish the Y01-Y12 question text, 288 replies, user notes, or private file digest.
 * No provider transport, optimizer input admission, or paid authority.
 */
import { createHash } from 'node:crypto';
import { readFile, lstat, realpath, stat, writeFile } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenPrivateYeoulOverlap } from './yeoul-pilot-readiness-v1.mjs';

const MODELS = Object.freeze(['z-ai/glm-5.3-flash', 'deepseek/deepseek-v4.1-flash-1017',
  'minimax/minimax-m3.1-flash', 'qwen/qwen3.8-27b']);
const VARIANTS = Object.freeze(['baseline', 'language_rules', 'conversation_examples']);
const RATINGS = Object.freeze(['good', 'awkward', 'fiction', 'harsh', 'flat', 'persona', 'soft', 'other']);
const SCRIPT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const error = code => { throw new Error('YEOUL_PRIVATE_INTAKE_INVALID:' + code); };
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const within = (root, path) => path === root || path.startsWith(root + sep);
const questionKey = id => /^Y(?:0[1-9]|1[0-2])$/u.test(id);
const normalize = x => x.normalize('NFKC').replace(/\s+/gu, ' ').trim();

/** Validate the complete original matrix; no scoring, normalization of ratings, or source rewriting. */
export function validatePrivateYeoul288(source) {
  if (!isObject(source) || source.schemaVersion !== 'yeoul-evaluation-export-v1'
      || source.experimentRunId !== 42572722295 || source.scope !== 'all-288'
      || !isObject(source.sourceExperiment)
      || source.sourceExperiment.attemptedCalls !== 288
      || source.sourceExperiment.successfulCalls !== 288
      || !Array.isArray(source.responses) || source.responses.length !== 288)
    error('original_288_source_required');

  const seen = new Set(), prompts = new Map();
  const ratingCounts = Object.fromEntries(RATINGS.map(label => [label, 0]));
  let caveatedGood = 0, userNoteCount = 0, deepseekCount = 0;
  for (const row of source.responses) {
    if (!isObject(row) || !questionKey(row.id) || !MODELS.includes(row.model)
        || !VARIANTS.includes(row.variant) || ![1, 2].includes(row.repeat)
        || typeof row.input !== 'string' || !row.input.trim()
        || typeof row.reply !== 'string' || !row.reply.trim()
        || !isObject(row.evaluation) || !RATINGS.includes(row.evaluation.rating)
        || (row.evaluation.note !== undefined && typeof row.evaluation.note !== 'string')
        || (row.evaluation.details !== undefined && !Array.isArray(row.evaluation.details))
        || row.questionDiscrimination !== null) error('private_row_contract');
    const key = [row.id, row.variant, row.repeat, row.model].join('|');
    if (seen.has(key)) error('duplicate_row_key');
    seen.add(key);
    const input = normalize(row.input);
    if (prompts.has(row.id) && prompts.get(row.id) !== input) error('question_input_drift');
    prompts.set(row.id, input);
    ratingCounts[row.evaluation.rating]++;
    const hasNote = Boolean(row.evaluation.note?.trim());
    const hasDetails = Boolean(row.evaluation.details?.length);
    if (hasNote) userNoteCount++;
    if (row.evaluation.rating === 'good' && (hasNote || hasDetails)) caveatedGood++;
    if (row.model === 'deepseek/deepseek-v4.1-flash-1017') deepseekCount++;
  }
  // Ensures every question × model × variant × repetition exists exactly once.
  for (let n = 1; n <= 12; n++) for (const model of MODELS)
    for (const variant of VARIANTS) for (const repeat of [1, 2]) {
      const id = 'Y' + String(n).padStart(2, '0');
      if (!seen.has([id, variant, repeat, model].join('|'))) error('missing_matrix_cell');
    }
  if (seen.size !== 288 || prompts.size !== 12 || deepseekCount !== 72)
    error('matrix_coverage');

  return Object.freeze({
    schemaVersion: 'yeoul-private-288-audit-v1',
    sourceExperimentRunId: 42572722295,
    originalRowsChecked: 288, questionFamiliesChecked: 12, deepseekRowsChecked: 72,
    ratingCounts: Object.freeze(ratingCounts),
    goodWithCaveat: caveatedGood, rowsWithUserNote: userNoteCount,
    userRatingsRewritten: false,
    sourceRawBytesAuthenticatedByExternalAuthority: false,
    legacyPromptsNotExported: true, privateResponsesNotExported: true,
    developmentEvidenceOnly: true, ownerReviewVerified: false,
    independentQualityEvidence: false, optimizerInputAuthorized: false,
  });
}

/** Construct only temporary in-memory Y01-Y12 prompts, then discard them. */
export function inspectPrivateYeoulEvaluation(source) {
  const audit = validatePrivateYeoul288(source);
  const originals = new Map();
  for (const row of source.responses) if (!originals.has(row.id)) originals.set(row.id, row.input);
  const screen = screenPrivateYeoulOverlap(
    [...originals].map(([id, input]) => ({ id, turns: [input] }))
  );
  return Object.freeze({
    schemaVersion: 'yeoul-private-legacy-overlap-intake-v1',
    legacy: audit, lexical: screen,
    semanticIndependenceVerified: false, independentFinalHoldoutReady: false,
    userReviewerApproved: false, modelCallsAuthorized: false,
    readyForPaidExperiment: false, externalCalls: 0, productionEligible: false,
  });
}

/** A local-only entrypoint. The sole artifact is a mode-0600 metadata report outside git. */
export async function runPrivateYeoulIntake({ input, output }) {
  if (typeof input !== 'string' || !input.trim() || typeof output !== 'string' || !output.trim())
    error('paths_required');
  const sourcePath = resolve(input), outputPath = resolve(output), repoPath = await realpath(SCRIPT_ROOT);
  const sourceStat = await lstat(sourcePath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || sourceStat.size > 2 * 1024 * 1024)
    error('unsafe_source_file');
  const verifiedSourcePath = await realpath(sourcePath);
  const parent = await realpath(dirname(outputPath));
  const destination = resolve(parent, outputPath.split(sep).at(-1));
  const directory = await stat(parent);
  if (within(repoPath, verifiedSourcePath) || within(repoPath, destination)
      || sourcePath === destination || (directory.mode & 0o077) !== 0
      || !directory.isDirectory()) error('private_paths_required');
  const bytes = await readFile(sourcePath);
  if (bytes.length > 2 * 1024 * 1024) error('source_size_changed');
  const parsed = JSON.parse(bytes.toString('utf8'));
  const report = inspectPrivateYeoulEvaluation(parsed);
  const evidence = {
    ...report,
    localRawByteSha256: createHash('sha256').update(bytes).digest('hex'),
    originalByteHashMatchedToTrustedIndependentCopy: false,
    privateOriginalNotPublished: true,
  };
  // Failure on an existing file (including a symlink); no overwrite or temporary leak.
  await writeFile(destination, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return Object.freeze({ result: 'PRIVATE_METADATA_WRITTEN', rows: 288,
    candidateFamilies: report.lexical.candidateFamiliesScreened,
    lexicalFlags: report.lexical.possibleLexicalOverlapCount,
    ownerReviewVerified: false, paidCalls: 0 });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--input' || args[2] !== '--out') {
    console.error('Usage: node yeoul-private-source-intake-v1.mjs --input /private/288.json --out /private/0700/report.json');
    process.exitCode = 1;
  } else {
    runPrivateYeoulIntake({ input: args[1], output: args[3] })
      .then(result => console.log(JSON.stringify(result)))
      .catch(() => { console.error('YEOUL_PRIVATE_INTAKE_FAILED'); process.exitCode = 1; });
  }
}
