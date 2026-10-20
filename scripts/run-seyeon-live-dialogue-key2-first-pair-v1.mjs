import { mkdir, writeFile, open } from 'node:fs/promises';
import {admitSeyeonLiveDialogueFirstPairV1} from './seyeon-live-dialogue-first-pair-admission-v1.mjs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createOpenAiSeyeonStructuredProviderV1 } from '../dist/apps/api/src/openai-seyeon-structured-provider-v1.js';
import { runSeyeonCensusFirstThreeCallShadowV1 } from '../dist/apps/api/src/seyeon-census-first-three-call-shadow-v1.js';
import {
  runSeyeonCharacterTurnV2,
} from '../dist/apps/api/src/seyeon-character-runtime-v2.js';
import {
  createIntegrityClassifier,
  createDisclosureClassifier,
} from '../dist/apps/api/src/seyeon-production-governance-v1.js';
import { SEYEON_MODEL_EVAL_CASES_V1 } from './seyeon-model-eval-cases-v1.mjs';
import {
  SEYEON_DIALOGUE_PATH_CASE_IDS_V1, SEYEON_DIALOGUE_PATH_ROUTES_V1,
  SEYEON_DIALOGUE_PATH_MAX_CALLS_V1, SEYEON_DIALOGUE_PATH_MAX_ESTIMATED_COST_USD_V1,
  SEYEON_DIALOGUE_PATH_PRICES_V1, selectSeyeonDialoguePathCasesV1,
  estimateSeyeonDialoguePathCostV1, summarizeSeyeonDialoguePathV1,
  createSeyeonDialoguePathSyntheticCensusV1,
  verifySeyeonDialoguePathStageTopologyV1,
} from './seyeon-dialogue-path-eval-core-v1.mjs';
import {
 SEYEON_C08S_ORDINARY_GOLD_IDS_V1,
 buildSeyeonC08SReviewerPackV1,
 buildSeyeonC08SOwnerKeyV1,
} from './seyeon-c08s-blinded-first-turn-evaluation-v1.mjs';

const cases = Object.freeze(selectSeyeonDialoguePathCasesV1(SEYEON_MODEL_EVAL_CASES_V1).filter(x=>x.id==='N01'));
// This source is the prospective benchmark, NOT a paid dispatch authority.
// A self-attested environment flag cannot verify invoices, project limits,
// the global reservation ledger or monthly spend. A separate reviewed
// execution workflow must own actual provider dispatch; never run here.
const execution = admitSeyeonLiveDialogueFirstPairV1();
const key = process.env.OPENAI_API_KEY2?.trim();
if (!key) throw new Error('Missing isolated evaluation-only credential.');
if (cases.length !== 1 || cases[0]?.id !== 'N01' || SEYEON_DIALOGUE_PATH_CASE_IDS_V1.length !== 16) {
  throw new Error('Synthetic case cap changed unexpectedly.');
}

const MAX_CALLS=8, PER_CALL_RESERVE_USD=0.08, MAX_RESERVED_USD=0.64;
const MAX_BODY_BYTES=24576, MAX_OUTPUT_TOKENS=1536;
const auditDir=join(process.env.RUNNER_TEMP??'', 'seyeon-live-first-pair');
if(!process.env.RUNNER_TEMP)throw Error('RUNNER_ONLY_HOLD');
await mkdir(auditDir,{recursive:true,mode:0o700});
const journal=await open(join(auditDir,'attempts.jsonl'),'wx',0o600);
const journalEntry=async row=>{await journal.appendFile(JSON.stringify(row)+'\n');await journal.sync();};
const usage = Object.fromEntries(SEYEON_DIALOGUE_PATH_ROUTES_V1.map(route => [route, {
  calls: 0, estimatedCostUsd: 0, inputTokens: 0, outputTokens: 0,
  cachedInputTokens: 0, purposes: {},
}]));
let allCalls = 0;
let allCostUsd = 0;

function provider(route, model) {
  const rates = SEYEON_DIALOGUE_PATH_PRICES_V1[model];
  if (!rates) throw new Error('Unapproved model.');
  return createOpenAiSeyeonStructuredProviderV1({
    apiKey: key, model, timeoutMs: 30_000, maxOutputTokens:MAX_OUTPUT_TOKENS,
    fetchImpl: async (url, init) => {
      // Fix one immutable Actions SHA, reserve before any billable POST.
      // Legacy integrity/disclosure classifiers may run concurrently.
      const bodyBytes=Buffer.byteLength(String(init?.body??''),'utf8');
      let requestBody;
      try{requestBody=JSON.parse(init.body);}catch{throw Error('BODY_SHAPE_HOLD');}
      const allowedStages=new Set([
        'integrity_classification','disclosure_classification',
        'unified_preflight_shadow','turn_interpretation','dialogue_render',
        'turn_interpret_render_shadow','semantic_review',
      ]);
      const purpose=String(requestBody?.text?.format?.name??'').replace(/^myeongha_/, '').replace(/_v2$/, '');
      if(!allowedStages.has(purpose)||bodyBytes<1||bodyBytes>MAX_BODY_BYTES||
          !Number.isSafeInteger(requestBody.max_output_tokens)||
          requestBody.max_output_tokens<1||requestBody.max_output_tokens>MAX_OUTPUT_TOKENS||
          !String(url).startsWith('https://api.openai.com/v1/responses')||
          allCalls>=MAX_CALLS||(allCalls+1)*PER_CALL_RESERVE_USD>MAX_RESERVED_USD+1e-9)
        throw Error('SEYEON_FIRST_PAIR_PRE_DISPATCH_BOUNDS_HOLD');
      const routeUsage = usage[route];
      // Account in memory before await so parallel legacy preflight gets unique slots.
      const reservedCall=++allCalls;
      routeUsage.calls += 1;
      await journalEntry({kind:'reserve',caseId:'N01',route,model,purpose,
        nextCall:reservedCall,reservedMicroUsd:80000,runId:execution.runId});
      const start = performance.now();
      const response = await fetch(url, init);
      // Never persist request, instructions, response content or generated text.
      let body = null;
      if (response.ok) {
        try { body = await response.clone().json(); } catch { /* provider fails closed */ }
      }
      // Missing usage is UNKNOWN (possibly billable), never 0 USD.
      if (response.ok && (!body?.usage ||
         !Number.isSafeInteger(body.usage.input_tokens) ||
         body.usage.input_tokens<1 ||
         !Number.isSafeInteger(body.usage.output_tokens) ||
         body.usage.output_tokens<1)) {
        throw new Error('SEYEON_DIALOGUE_PATH_USAGE_UNKNOWN_HOLD');
      }
      const tokens = estimateSeyeonDialoguePathCostV1(body?.usage ?? {}, rates);
      routeUsage.estimatedCostUsd += tokens.usd;
      routeUsage.inputTokens += tokens.input;
      routeUsage.cachedInputTokens += tokens.cached;
      routeUsage.outputTokens += tokens.output;
      allCostUsd += tokens.usd;
      await journalEntry({kind:'observed',caseId:'N01',route,model,
        inputTokens:tokens.input,outputTokens:tokens.output,
        estimatedMicroUsd:Math.round(tokens.usd*1_000_000)});
      if(tokens.usd>PER_CALL_RESERVE_USD||allCostUsd>MAX_RESERVED_USD)
        throw Error('SEYEON_FIRST_PAIR_COST_BOUNDS_HOLD');
      // Identify stages by a fixed allowlist from the request's strict name.
      const stageName = requestBody?.text?.format?.name ?? '';
      const allowed = [
        'integrity_classification', 'disclosure_classification',
        'unified_preflight_shadow', 'turn_interpretation', 'dialogue_render',
        'turn_interpret_render_shadow', 'semantic_review',
      ];
      const purpose = allowed.find(s => stageName === 'myeongha_' + s + '_v2') ?? 'other';
      const stage = routeUsage.purposes[purpose] ?? { calls: 0, elapsedMs: 0 };
      stage.calls += 1;
      stage.elapsedMs += Math.round(performance.now() - start);
      routeUsage.purposes[purpose] = stage;
      return response;
    },
  });
}

const legacyPreflight = provider('legacy_5_terra', 'gpt-5.6-terra');
const legacyInterpreter = provider('legacy_5_terra', 'gpt-5.6-terra');
const legacyRenderer = provider('legacy_5_terra', 'gpt-5.6-terra');
const legacyReviewer = provider('legacy_5_terra', 'gpt-5.6-terra');
const candidatePreflight = provider('fast_3_luna_terra', 'gpt-5.6-luna');
const candidateDialogue = provider('fast_3_luna_terra', 'gpt-5.6-terra');
const candidateReviewer = provider('fast_3_luna_terra', 'gpt-5.6-terra');

function governance(preflight) {
  return Object.freeze({
    relationship: Object.freeze({
      gate: 'PUBLIC', trustBand: 'low', relevantSharedHistoryRefs: Object.freeze([]),
    }),
    integrity: Object.freeze({
      classifier: createIntegrityClassifier(preflight),
      authorityResolver: Object.freeze({
        resolve: ({ claim }) => Object.freeze({
          state: 'MISSING', authorityRefs: [], provenanceRefs: ['synthetic:unresolved:' + claim.kind],
        }),
      }),
    }),
    disclosure: Object.freeze({
      classifier: createDisclosureClassifier(preflight),
      sourceDescriptor: Object.freeze({
        readDescriptor() { throw new TypeError('SYNTHETIC_PRIVATE_DISCLOSURE_EXCLUDED'); },
      }),
      factAuthorityResolver: Object.freeze({
        resolve() { throw new TypeError('SYNTHETIC_PRIVATE_FACT_EXCLUDED'); },
      }),
      retriever: Object.freeze({
        retrieve() { throw new TypeError('SYNTHETIC_PRIVATE_RETRIEVAL_EXCLUDED'); },
      }),
    }),
  });
}

function reason(error) {
  const kind = error?.code;
  if (typeof kind === 'string' && [
    'FAST_INTERPRETATION_GUARD_REJECTED',
    'FAST_RISK_CAUSALITY_REJECTED',
    'FAST_RENDERER_PACKET_REJECTED',
    'FAST_RENDERER_GUARD_REJECTED',
    'FAST_SEMANTIC_OUTPUT_REJECTED',
    'TIMEOUT', 'NETWORK_FAILURE', 'HTTP_FAILURE', 'INVALID_CONFIGURATION',
    'INVALID_CONTENT_TYPE', 'INVALID_RESPONSE', 'MODEL_REFUSAL', 'INVALID_STRUCTURED_OUTPUT',
  ].includes(kind)) return kind;
  const message = String(error?.message ?? '');
  if (message.includes('semantic review rejected')) return 'SEMANTIC_GUARD_REJECTED';
  if (message.includes('Fast-dialogue Shadow requires')) return 'FAST_SHADOW_INELIGIBLE';
  if (message.includes('SYNTHETIC_PRIVATE_')) return 'PRIVATE_TOPIC_EXCLUDED';
  if (message.includes('BUDGET_STOP')) return 'BUDGET_STOP';
  if (message.includes('USAGE_UNKNOWN_HOLD')) return 'USAGE_UNKNOWN_HOLD';
  if (kind === 'FAST_THREAD_CENSUS_REJECTED') return kind;
  if (message.includes('renderer') || message.includes('Renderer')) return 'RENDERER_GUARD_REJECTED';
  if (message.includes('interpretation') || message.includes('interpret')) return 'INTERPRETATION_GUARD_REJECTED';
  return 'EVALUATION_GUARD_OR_PROVIDER_FAILURE';
}

async function evaluate(route, spec) {
  const before = { ...usage[route] };
  const beforeStages = Object.fromEntries(
    Object.entries(usage[route].purposes).map(([stage, value]) => [stage, value.calls]),
  );
  const startedAt = performance.now();
  const id = 'synthetic:' + spec.id;
  const contextInput = Object.freeze({
    relationship: null,
    recentMessages: Object.freeze([{ messageId: id, role: 'user', text: spec.text }]),
    retrievedMemories: Object.freeze([]),
  });
  let outcome = 'admitted', errorCode = null;
  let safeEnvelope = null;
  try {
    if (route === 'legacy_5_terra') {
      const executed = await runSeyeonCharacterTurnV2({
        userMessageRef: id, userText: spec.text, contextInput,
        governance: governance(legacyPreflight),
        interpreterProvider: legacyInterpreter,
        rendererProvider: legacyRenderer,
        semanticReviewerProvider: legacyReviewer,
      });
      safeEnvelope = executed.envelope;
    } else {
      const census = createSeyeonDialoguePathSyntheticCensusV1(spec.id, id);
      const executed = await runSeyeonCensusFirstThreeCallShadowV1({
        userMessageRef: id,
        userText: spec.text,
        contextInput,
        governance: governance(candidatePreflight),
        fullThreadCensus: census.port,
        unifiedPreflightProvider: candidatePreflight,
        candidateDialogueProvider: candidateDialogue,
        independentSemanticReviewer: candidateReviewer,
      });
      // One preflight census before provider #1, then three within the
      // guarded fast-dialogue shadow, including the final post-review read.
      if (census.readCount !== 4 ||
          executed.scope !== 'SHADOW_ONLY_NOT_PRODUCTION')
        throw new Error('SYNTHETIC_FIRST_TURN_CENSUS_HOLD');
      safeEnvelope = executed.envelope;
    }
  } catch (error) {
    outcome = 'rejected';
    errorCode = reason(error);
  }
  // Count every actual provider stage for this individual synthetic case.
  // The legacy classifiers may finish in either order, but each required
  // stage must be observed once. Same number of calls with missing or
  // repeated stages is a HOLD, never a 5→3 performance result.
  const after = usage[route];
  const stageCounts = Object.fromEntries(
    Object.entries(after.purposes)
      .map(([stage, value]) => [stage, value.calls - (beforeStages[stage] ?? 0)])
      .filter(([, count]) => count > 0),
  );
  if (outcome === 'admitted' &&
      !verifySeyeonDialoguePathStageTopologyV1(route, stageCounts)) {
    outcome = 'rejected';
    errorCode = 'STAGE_TOPOLOGY_HOLD';
    safeEnvelope = null;
  }
  if (outcome === 'admitted' && approvedReviewIds.has(spec.id)) {
    if (!safeEnvelope || safeEnvelope.revealLevel !== 'public' ||
        safeEnvelope.memoryRefsMentioned.length !== 0 ||
        safeEnvelope.privateSourceRefsMentioned.length !== 0 ||
        safeEnvelope.disclosureSliceIds.length !== 0)
      throw new Error('SEYEON_BLIND_REVIEW_SAFETY_HOLD');
    const label = route === 'legacy_5_terra' ? 'legacy' : 'candidate';
    const pair = reviewPairs.get(spec.id) ?? {id:spec.id};
    if (pair[label]) throw new Error('SEYEON_BLIND_REVIEW_DUPLICATE_HOLD');
    pair[label] = {guardApproved:true,revealLevel:'public',
      memoryRefs:[],privateSourceRefs:[],utterance:safeEnvelope.utterance};
    reviewPairs.set(spec.id,pair);
  }
  return Object.freeze({
    id: spec.id,
    route,
    outcome,
    errorCode,
    stageCounts,
    elapsedMs: Math.round(performance.now() - startedAt),
    calls: after.calls - before.calls,
    estimatedCostUsd: Number((after.estimatedCostUsd - before.estimatedCostUsd).toFixed(6)),
    inputTokens: after.inputTokens - before.inputTokens,
    outputTokens: after.outputTokens - before.outputTokens,
    cachedInputTokens: after.cachedInputTokens - before.cachedInputTokens,
  });
}

const rows = [];
const approvedReviewIds = new Set(SEYEON_C08S_ORDINARY_GOLD_IDS_V1);
const reviewPairs = new Map();
benchmarkLoop: for (let i = 0; i < cases.length; i += 1) {
  const ordered = i % 2 === 0
    ? SEYEON_DIALOGUE_PATH_ROUTES_V1 : [...SEYEON_DIALOGUE_PATH_ROUTES_V1].reverse();
  for (const route of ordered) {
    if (allCalls >= MAX_CALLS ||
        allCostUsd >= MAX_RESERVED_USD) {
      throw new Error('Synthetic benchmark budget exhausted before all cases.');
    }
    const row=await evaluate(route, cases[i]);
    rows.push(row);
    // A rejected or unknown-outcome request may still have been charged.
    // Never proceed to the next route/case after any failed real request.
    if (row.outcome !== 'admitted')break benchmarkLoop;
  }
}
const summary=summarizeSeyeonDialoguePathV1(rows,cases.map(spec=>spec.id));
const evidence={
 schemaVersion:'seyeon-live-dialogue-key2-first-pair-v1',
 mode:'REAL_PROVIDER_SYNTHETIC_PUBLIC_FIRST_CONTACT_ONLY',
 runId:execution.runId,commitSha:execution.mainSha,
 secretUsed:'OPENAI_API_KEY2',sampleId:'N01',
 expectedRoutes:['legacy_5_terra','fast_3_luna_terra'],
 attemptedCalls:allCalls,observedCalls:Object.values(usage)
  .reduce((n,v)=>n+Object.values(v.purposes).reduce((m,s)=>m+s.calls,0),0),
 maxCalls:MAX_CALLS,reservedMicroUsd:allCalls*80000,
 conservativeReservedKrw:allCalls*80000*2500/1e6,
 estimatedMicroUsd:Math.round(allCostUsd*1e6),
 actualBilledKrw:null,invoiceReconciled:false,providerHardLimitVerified:false,
 productionPromotionPermitted:false,
 summary,rows,
 measuredPurposes:Object.fromEntries(Object.entries(usage).map(([route,v])=>[route,v.purposes])),
};
await writeFile(join(auditDir,'report.json'),JSON.stringify(evidence,null,2),{mode:0o600,flag:'wx'});
await journal.close();
console.log('SEYEON_LIVE_DIALOGUE_FIRST_PAIR '+JSON.stringify({
 verdict:summary.verdict,attemptedCalls:allCalls,observedCalls:evidence.observedCalls,
 reservedMicroUsd:evidence.reservedMicroUsd,
 estimatedMicroUsd:evidence.estimatedMicroUsd,
 routes:summary.routes,actualBilledKrw:null,productionPromotionPermitted:false
}));
if(summary.verdict!=='GUARD_SAMPLE_PASS'||allCalls!==8)
 throw Error('SEYEON_LIVE_DIALOGUE_FIRST_PAIR_HOLD');
