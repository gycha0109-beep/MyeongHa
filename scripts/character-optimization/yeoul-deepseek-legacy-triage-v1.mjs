/** Prioritize historical Yeoul/DeepSeek failures using user ratings only.
 * Private prompts, replies, notes, original byte hashes are NEVER returned.
 * No generative evaluation, trusted hard-failure inference, or paid transport.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectPrivateYeoulEvaluation } from './yeoul-private-source-intake-v1.mjs';

const MODEL = 'deepseek/deepseek-v4.1-flash-1017';
const VARIANTS = Object.freeze(['baseline', 'language_rules', 'conversation_examples']);
const QUESTIONS = Object.freeze(Array.from({ length: 12 }, (_, i) =>
  'Y' + String(i + 1).padStart(2, '0')));
const LABELS = Object.freeze(['good', 'awkward', 'fiction', 'harsh', 'flat', 'persona', 'soft', 'other']);
const tally = () => Object.fromEntries(LABELS.map(label => [label, 0]));
const denial = reason => { throw new Error('YEOUL_DEEPSEEK_LEGACY_TRIAGE_INVALID:' + reason); };
const isPlain = obj => obj !== null && typeof obj === 'object' && !Array.isArray(obj);

function summary(rows) {
  const ratings = tally();
  for (const row of rows) ratings[row.evaluation.rating]++;
  return Object.freeze({ count: rows.length, ratings: Object.freeze(ratings),
    userRatedGood: ratings.good, userRatedNonGood: rows.length - ratings.good,
    humanConfirmedAuthorityViolation: false, humanConfirmedMemoryFabrication: false });
}

/** Historical development evidence only: repeated replies are not independent holdout families. */
export function inspectHistoricalDeepseekFailures(source, { knownOriginalAutoFields = false } = {}) {
  const audit = inspectPrivateYeoulEvaluation(source, { knownOriginalAutoFields });
  if (audit.legacy.originalRowsChecked !== 288 || audit.legacy.deepseekRowsChecked !== 72)
    denial('incomplete_verified_matrix');
  const rows = source.responses.filter(row => row.model === MODEL);
  if (rows.length !== 72) denial('deepseek_count');
  const byQuestion = QUESTIONS.map(questionId => {
    const selected = rows.filter(row => row.id === questionId);
    if (selected.length !== 6) denial('six_repeated_responses_per_question');
    const variants = Object.fromEntries(VARIANTS.map(variant => {
      const cells = selected.filter(row => row.variant === variant);
      if (cells.length !== 2) denial('two_repeats_per_variant');
      return [variant, summary(cells)];
    }));
    return Object.freeze({
      questionId, ...summary(selected), byVariant: Object.freeze(variants),
      reportedFictionOrPersona: selected.filter(row =>
        ['fiction', 'persona'].includes(row.evaluation.rating)).length,
      ownerReviewStatus: 'pending',
    });
  });
  // Sorting is for review workload only; NOT quality scoring or owner approval.
  const priority = [...byQuestion].sort((a,b) =>
    a.userRatedGood - b.userRatedGood ||
    b.reportedFictionOrPersona - a.reportedFictionOrPersona ||
    a.questionId.localeCompare(b.questionId)).map(x => x.questionId);
  const transitions = Object.fromEntries(VARIANTS.slice(1).map(variant => {
    const counts = { bothGood:0, bothNonGood:0, nonGoodToGood:0, goodToNonGood:0 };
    for (const id of QUESTIONS) for (const repeat of [1,2]) {
      const base = rows.find(x => x.id === id && x.repeat === repeat && x.variant === 'baseline');
      const next = rows.find(x => x.id === id && x.repeat === repeat && x.variant === variant);
      if (!base || !next) denial('matched_cells_required');
      const b = base.evaluation.rating === 'good', c = next.evaluation.rating === 'good';
      if (b && c) counts.bothGood++;
      else if (b) counts.goodToNonGood++;
      else if (c) counts.nonGoodToGood++;
      else counts.bothNonGood++;
    }
    return [variant, Object.freeze({ ...counts, pairedRepeatedCells:24,
      independentQuestionFamilies:12, causalImprovementEstablished:false })];
  }));
  return Object.freeze({
    schemaVersion: 'yeoul-deepseek-legacy-failure-triage-v1',
    characterId:'yeoul', modelId:MODEL, sourceExperimentRunId:42572722295,
    sourceScope:'existing_user_rated_development_data_only',
    originalRowsChecked:288, deepseekRowsChecked:72, independentQuestionFamilies:12,
    overall:summary(rows), byQuestion:Object.freeze(byQuestion),
    reviewPriorityQuestionIds:Object.freeze(priority),
    matchedHistoricalRatingChanges:Object.freeze(transitions),
    archivedUnreviewedAutoFieldsExcluded: knownOriginalAutoFields,
    rawConversationExported:false, userNotesExported:false, privateSourceHashExported:false,
    historicalRatingIsHumanConfirmedHardFailure:false,
    ownerReviewVerified:false, independentQualityGainEstablished:false,
    externalCalls:0, candidateRegistryStage:'proposed', productionEligible:false,
    decision:'HOLD_PENDING_HUMAN_REVIEW_NOT_NEW_HOLDOUT',
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--private-original') {
    console.error('Usage: node yeoul-deepseek-legacy-triage-v1.mjs --private-original /local/source.json');
    process.exitCode=1;
  } else {
    try {
      const source=JSON.parse(await readFile(resolve(args[1]),'utf8'));
      const report=inspectHistoricalDeepseekFailures(source,{knownOriginalAutoFields:true});
      console.log(JSON.stringify(report));
    } catch {
      console.error('YEOUL_DEEPSEEK_LEGACY_TRIAGE_REFUSED');
      process.exitCode=1;
    }
  }
}
