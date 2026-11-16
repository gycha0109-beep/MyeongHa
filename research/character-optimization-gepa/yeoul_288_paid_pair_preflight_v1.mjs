/** Private Yeoul paired DeepSeek experiment plan; no credentials, requests or dispatch. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHARACTER_RUNTIME_AUTHORING_V1 } from '../../packages/character-content/src/runtime-authoring-v1.ts';

const sha = s => createHash('sha256').update(s).digest('hex');
const root = fileURLToPath(new URL('../../', import.meta.url));
const ORIGINAL_PATH = resolve(root, 'scripts/run-yeoul-four-model-288-v1.mjs');
const ORIGINAL_SHA256 = 'e19474a84f8aa204e5c854cd9da5bdc2fcbcb79832c8fc042d92046c4ff2d544';
const MODEL = 'deepseek/deepseek-v4.1-flash-1017';
const VARIANTS = ['baseline', 'language_rules', 'conversation_examples'];
const SETTINGS = Object.freeze({
  stream: false, max_tokens: 1200, temperature: 0.7,
  reasoning: { effort: 'low' },
  response_format: {type:'json_schema',
    json_schema: { name:'yeoul_language_reply', strict: true,
      schema: {type:'object', properties:{reply:{type:'string'}},required:['reply'],additionalProperties:false}}},
  provider: {require_parameters:true, allow_fallbacks:false,zdr:true,data_collection:'deny'},
});
const fail = code => { throw new Error('YEOUL_PAIRED_PREFLIGHT_HOLD:' + code); };
const object = x => !!x && typeof x === 'object' && !Array.isArray(x);

export function recoverOriginalExperimentPrompts(source = readFileSync(ORIGINAL_PATH, 'utf8')) {
  source = source.replaceAll('\r\n', '\n');
  if (sha(source) !== ORIGINAL_SHA256) fail('original_protocol_changed');
  const start = source.indexOf('const MODELS = Object.freeze(');
  const end = source.indexOf('const schema = {', start);
  if (start < 0 || end < start || !source.slice(start, end).includes('const SYSTEMS = Object.freeze(')) fail('original_protocol_boundary_changed');
  const prefix = source.slice(start, end);
  // Only hash-matched trusted repository code is evaluated. Nothing after
  // "const schema" (fetch, paid calls, output writing) is ever executed.
  const get = new Function('CHARACTER_RUNTIME_AUTHORING_V1',
    'const KEY="OFFLINE_PROTOCOL_RECONSTRUCTION_NO_REAL_KEY";\n' +
    prefix + '\nreturn {CASES, SYSTEMS, MODELS, VARIANTS, MAX_TOKENS};');
  const recovered = get(CHARACTER_RUNTIME_AUTHORING_V1);
  if (recovered.CASES.length !== 12 || recovered.MAX_TOKENS !== 1200
      || !recovered.MODELS.includes(MODEL)
      || recovered.VARIANTS.join('|') !== VARIANTS.join('|')) fail('original_protocol_mismatch');
  return recovered;
}

export function buildPairedPlan(exported, candidate) {
  if (!object(exported) || exported.schemaVersion !== 'yeoul-evaluation-export-v1'
      || exported.scope !== 'all-288' || exported.experimentRunId !== 42572722295
      || exported.responses?.length !== 288) fail('original_evaluation_source');
  if (!object(candidate) || candidate.schemaVersion !== 'yeoul-feedback-gepa-optimized-expression-v1'
      || candidate.optimizer !== 'real_pinned_gepa_offline'
      || candidate.qualityGainEstablished !== false
      || candidate.externalModelCalls !== 0
      || candidate.realStudentModelResponses !== 0
      || typeof candidate.candidateText !== 'string'
      || sha(candidate.candidateText) !== candidate.candidateSha256
      || !candidate.candidateText.trim() || candidate.candidateText.length > 1600) fail('candidate_identity');
  const orig = recoverOriginalExperimentPrompts();
  const questions = new Map(orig.CASES.map(x => [x.id, x.text]));
  const observed = new Set(), records = new Map();
  for (const row of exported.responses) {
    const key = [row.id,row.variant,row.repeat,row.model].join('|');
    if (observed.has(key) || !questions.has(row.id) || row.input !== questions.get(row.id)
        || !VARIANTS.includes(row.variant) || ![1,2].includes(row.repeat)
        || !orig.MODELS.includes(row.model) || typeof row.reply !== 'string'
        || !object(row.evaluation) || typeof row.evaluation.rating !== 'string') fail('original_response_matrix');
    observed.add(key);
    records.set(key,row);
  }
  if (observed.size !== 288) fail('incomplete_original_response_matrix');
  const tasks = [];
  for (const repeat of [1,2]) {
    for (let idx=0;idx<orig.CASES.length;idx++) {
      const q = orig.CASES[idx];
      const vstart = (idx + repeat)%3;
      for (const variant of [...VARIANTS.slice(vstart),...VARIANTS.slice(0,vstart)]) {
        const key = [q.id,variant,repeat,MODEL].join('|');
        const old = records.get(key);
        if (!old) fail('missing_deepseek_baseline');
        const baseline = orig.SYSTEMS[variant];
        const optimized = baseline + '\n' + candidate.candidateText;
        tasks.push({
          legacyKey: key, id: q.id, repeat, variant, model: MODEL,
          input: q.text, legacyRating: old.evaluation.rating,
          originalSystemSha256: sha(baseline),
          optimizedSystemSha256: sha(optimized),
          messages: [{role:'system',content:optimized},{role:'user',content:q.text}],
        });
      }
    }
  }
  if (tasks.length !== 72 || new Set(tasks.map(x=>x.legacyKey)).size !== 72) fail('paired_matrix');
  return {
    schemaVersion:'yeoul-288-paid-72-paired-preflight-v1',
    sourceExperimentRunId:42572722295,
    sourceProtocolSha256:ORIGINAL_SHA256,
    candidateSha256:candidate.candidateSha256,
    originalDeepSeekExistingReplies:72,
    newDeepSeekCallsPlanned:72,
    newDeepSeekCallsExecuted:0,
    sameInputAndSamplingAsLegacy:true,
    differentGenerationDateAndUnknownProviderIdentity:true,
    maxCumulativeSpendKrw:500,
    paidOwnerConsentRecordedInConversation:true,
    paidTransportReady:false,
    explicitBlockers:['authenticated_owner_approval_issuer_not_wired','inference_and_management_keys_unavailable','verified_live_price_fx_token_ceiling_not_ready'],
    qualityGainEstablished:false,
    settings:SETTINGS,
    tasks,
  };
}

export function preparePrivatePlan(inputPath, candidatePath, outputPath) {
  if (!inputPath || !candidatePath || !outputPath) fail('explicit_private_paths_required');
  const exported = JSON.parse(readFileSync(inputPath,'utf8'));
  const candidate = JSON.parse(readFileSync(candidatePath,'utf8'));
  const plan = buildPairedPlan(exported,candidate);
  if (existsSync(outputPath)) fail('no_overwrite');
  writeFileSync(outputPath, JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});
  return {tasks:plan.tasks.length, originalExperiment:plan.sourceExperimentRunId,
    model:MODEL, externalCalls:0, readyForPaidTransport:false,
    candidateSha256:plan.candidateSha256, originalSourceSha256:ORIGINAL_SHA256};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , original, candidate, destination] = process.argv;
  try { console.log(JSON.stringify(preparePrivatePlan(original,candidate,destination))); }
  catch(error) {
    console.error(error.message.startsWith('YEOUL_PAIRED_PREFLIGHT_HOLD:')
      ? error.message : 'YEOUL_PAIRED_PREFLIGHT_HOLD:cannot_prepare');
    process.exitCode=1;
  }
}
