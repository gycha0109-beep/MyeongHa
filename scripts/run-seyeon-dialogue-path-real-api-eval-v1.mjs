import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createOpenAiSeyeonStructuredProviderV1 } from '../dist/apps/api/src/openai-seyeon-structured-provider-v1.js';
import { createSeyeonUnifiedGovernanceCandidateV1 } from '../dist/apps/api/src/seyeon-unified-governance-candidate-v1.js';
import { createSeyeonFastDialogueShadowV1 } from '../dist/apps/api/src/seyeon-fast-dialogue-shadow-v1.js';
import {
  runSeyeonCharacterTurnV2,
} from '../dist/apps/api/src/seyeon-character-runtime-v2.js';
import {
  createIntegrityClassifier,
  createDisclosureClassifier,
} from '../dist/apps/api/src/seyeon-production-governance-v1.js';
import { runCharacterGovernedPreflightV1 } from '../dist/apps/api/src/character-governed-preflight-v1.js';
import { assembleSeyeonRuntimeContextV2 } from '../dist/packages/domain/src/index.js';
import { SEYEON_MODEL_EVAL_CASES_V1 } from './seyeon-model-eval-cases-v1.mjs';
import {
  SEYEON_DIALOGUE_PATH_CASE_IDS_V1, SEYEON_DIALOGUE_PATH_ROUTES_V1,
  SEYEON_DIALOGUE_PATH_MAX_CALLS_V1, SEYEON_DIALOGUE_PATH_MAX_ESTIMATED_COST_USD_V1,
  SEYEON_DIALOGUE_PATH_PRICES_V1, selectSeyeonDialoguePathCasesV1,
  estimateSeyeonDialoguePathCostV1, summarizeSeyeonDialoguePathV1,
} from './seyeon-dialogue-path-eval-core-v1.mjs';

const cases = selectSeyeonDialoguePathCasesV1(SEYEON_MODEL_EVAL_CASES_V1);
const key = process.env.OPENAI_API_KEY?.trim();
if (!key) throw new Error('Missing protected model evaluation credential.');
if (cases.length !== 8 || SEYEON_DIALOGUE_PATH_CASE_IDS_V1.length !== 8) {
  throw new Error('Synthetic case cap changed unexpectedly.');
}

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
    apiKey: key, model, timeoutMs: 30_000,
    fetchImpl: async (url, init) => {
      if (allCalls >= SEYEON_DIALOGUE_PATH_MAX_CALLS_V1 ||
          allCostUsd >= SEYEON_DIALOGUE_PATH_MAX_ESTIMATED_COST_USD_V1) {
        throw new Error('SEYEON_DIALOGUE_PATH_BUDGET_STOP');
      }
      const routeUsage = usage[route];
      allCalls += 1;
      routeUsage.calls += 1;
      const start = performance.now();
      const response = await fetch(url, init);
      // Never persist request, instructions, response content or generated text.
      let body = null;
      if (response.ok) {
        try { body = await response.clone().json(); } catch { /* provider fails closed */ }
      }
      const tokens = estimateSeyeonDialoguePathCostV1(body?.usage ?? {}, rates);
      routeUsage.estimatedCostUsd += tokens.usd;
      routeUsage.inputTokens += tokens.input;
      routeUsage.cachedInputTokens += tokens.cached;
      routeUsage.outputTokens += tokens.output;
      allCostUsd += tokens.usd;
      // Identify stages by a fixed allowlist from the request's strict name.
      const requestBody = JSON.parse(init.body);
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
    'TIMEOUT', 'NETWORK_FAILURE', 'HTTP_FAILURE', 'INVALID_CONFIGURATION',
    'INVALID_CONTENT_TYPE', 'INVALID_RESPONSE', 'MODEL_REFUSAL', 'INVALID_STRUCTURED_OUTPUT',
  ].includes(kind)) return kind;
  const message = String(error?.message ?? '');
  // Enumerate only fixed guard classes. Never include a user/model message in evidence.
  if (error?.name === 'SeyeonTurnInterpretationErrorV2' ||
      error?.name === 'SeyeonRiskActionCausalityErrorV1') {
    return 'INTERPRETATION_GUARD_REJECTED';
  }
  if (error?.name === 'SeyeonRendererGuardErrorV2') {
    return message.includes('semantic review rejected')
      ? 'SEMANTIC_GUARD_REJECTED' : 'RENDERER_GUARD_REJECTED';
  }
  if (error?.name === 'SeyeonCharacterRuntimeErrorV2') {
    if (error.stage === 'interpret' || error.stage === 'risk_causality')
      return 'INTERPRETATION_GUARD_REJECTED';
    if (error.stage === 'render' || error.stage === 'validate')
      return 'RENDERER_GUARD_REJECTED';
    if (error.stage === 'semantic_review') return 'SEMANTIC_PROVIDER_REJECTED';
  }
  if (message.includes('semantic review rejected')) return 'SEMANTIC_GUARD_REJECTED';
  if (message.includes('Fast-dialogue Shadow requires')) return 'FAST_SHADOW_INELIGIBLE';
  if (message.includes('SYNTHETIC_PRIVATE_')) return 'PRIVATE_TOPIC_EXCLUDED';
  if (message.includes('BUDGET_STOP')) return 'BUDGET_STOP';
  if (message.includes('renderer') || message.includes('Renderer')) return 'RENDERER_GUARD_REJECTED';
  if (message.includes('interpretation') || message.includes('interpret')) return 'INTERPRETATION_GUARD_REJECTED';
  return 'EVALUATION_GUARD_OR_PROVIDER_FAILURE';
}

async function evaluate(route, spec) {
  const before = { ...usage[route] };
  const startedAt = performance.now();
  const id = 'synthetic:' + spec.id;
  const contextInput = Object.freeze({
    relationship: null,
    recentMessages: Object.freeze([{ messageId: id, role: 'user', text: spec.text }]),
    retrievedMemories: Object.freeze([]),
  });
  let outcome = 'admitted', errorCode = null;
  try {
    if (route === 'legacy_5_terra') {
      await runSeyeonCharacterTurnV2({
        userMessageRef: id, userText: spec.text, contextInput,
        governance: governance(legacyPreflight),
        interpreterProvider: legacyInterpreter,
        rendererProvider: legacyRenderer,
        semanticReviewerProvider: legacyReviewer,
      });
    } else {
      const governanceCandidate = createSeyeonUnifiedGovernanceCandidateV1({
        governance: governance(candidatePreflight),
        provider: candidatePreflight,
      });
      const preflight = await runCharacterGovernedPreflightV1({
        characterId: 'seyeon', userMessageRef: id, userText: spec.text,
        relationship: governanceCandidate.relationship,
        integrity: governanceCandidate.integrity,
        disclosure: governanceCandidate.disclosure,
      });
      const context = assembleSeyeonRuntimeContextV2({
        ...contextInput,
        integrityDecisions: preflight.integrity.decisions,
        governedPreflightApplied: true,
        disclosure: {
          decision: preflight.disclosure.status === 'sensitive'
            ? preflight.disclosure.decision : null,
          retrievedSources: preflight.retrievedPrivateSources,
        },
      });
      await createSeyeonFastDialogueShadowV1({
        candidateProvider: candidateDialogue,
        reviewerProvider: candidateReviewer,
      }).evaluate(context);
    }
  } catch (error) {
    outcome = 'rejected';
    errorCode = reason(error);
  }
  const after = usage[route];
  return Object.freeze({
    id: spec.id,
    route,
    outcome,
    errorCode,
    elapsedMs: Math.round(performance.now() - startedAt),
    calls: after.calls - before.calls,
    estimatedCostUsd: Number((after.estimatedCostUsd - before.estimatedCostUsd).toFixed(6)),
    inputTokens: after.inputTokens - before.inputTokens,
    outputTokens: after.outputTokens - before.outputTokens,
    cachedInputTokens: after.cachedInputTokens - before.cachedInputTokens,
  });
}

const rows = [];
for (let i = 0; i < cases.length; i += 1) {
  const ordered = i % 2 === 0
    ? SEYEON_DIALOGUE_PATH_ROUTES_V1 : [...SEYEON_DIALOGUE_PATH_ROUTES_V1].reverse();
  for (const route of ordered) {
    if (allCalls >= SEYEON_DIALOGUE_PATH_MAX_CALLS_V1 ||
        allCostUsd >= SEYEON_DIALOGUE_PATH_MAX_ESTIMATED_COST_USD_V1) {
      throw new Error('Synthetic benchmark budget exhausted before all cases.');
    }
    rows.push(await evaluate(route, cases[i]));
  }
}
const summary = summarizeSeyeonDialoguePathV1(rows, cases.length);
const evidence = {
  schemaVersion: 'seyeon-real-api-path-benchmark-v1',
  mode: 'OFFLINE_SYNTHETIC_ONLY',
  productionChanged: false,
  noRealUserRecords: true,
  noUserOrAssistantTextPersisted: true,
  priceBasis: 'Repository-defined estimated Standard API token rates',
  fixtureCount: cases.length,
  maxCalls: SEYEON_DIALOGUE_PATH_MAX_CALLS_V1,
  budgetUsd: SEYEON_DIALOGUE_PATH_MAX_ESTIMATED_COST_USD_V1,
  totalCalls: allCalls,
  estimatedCostUsd: Number(allCostUsd.toFixed(6)),
  summary, rows,
  measuredPurposes: Object.fromEntries(Object.entries(usage).map(([route, entry]) => [
    route, entry.purposes,
  ])),
};
const output = process.env.SEYEON_DIALOGUE_PATH_EVIDENCE_PATH
  ?? './.evidence/seyeon-real-api-path-benchmark-v1.json';
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(evidence, null, 2), { mode: 0o600 });
console.log(JSON.stringify({
  phase: 'seyeon-real-api-path-benchmark-v1',
  verdict: summary.verdict,
  totalCalls: allCalls,
  estimatedCostUsd: evidence.estimatedCostUsd,
  routes: summary.routes,
  onlySyntheticPublicCases: true,
  characterVoiceQualityVerified: false,
  productionChanged: false,
}));
if (allCalls > SEYEON_DIALOGUE_PATH_MAX_CALLS_V1 ||
    allCostUsd > SEYEON_DIALOGUE_PATH_MAX_ESTIMATED_COST_USD_V1) {
  throw new Error('Synthetic benchmark cost/call ceiling HOLD.');
}
if (summary.verdict !== 'GUARD_SAMPLE_PASS') {
  throw new Error('Synthetic dialogue-path comparison HOLD; no production promotion.');
}
