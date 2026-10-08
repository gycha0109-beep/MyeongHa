import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createOpenAiSeyeonStructuredProviderV1 } from '../dist/apps/api/src/openai-seyeon-structured-provider-v1.js';
import { createSeyeonUnifiedPreflightShadowV1 } from '../dist/apps/api/src/seyeon-unified-preflight-shadow-v1.js';
import {
  SEYEON_MODEL_EVAL_CASES_V1,
  scoreSeyeonClassifierCaseV1,
  aggregateSeyeonEvalV1,
} from './seyeon-model-eval-cases-v1.mjs';

const PRICES = Object.freeze({
  'gpt-5.6-luna': Object.freeze({ input: 0.20, cached: 0.02, output: 1.20 }),
  'gpt-5.6-terra': Object.freeze({ input: 2.00, cached: 0.20, output: 12.00 }),
});
const MODELS = Object.freeze(Object.keys(PRICES));
const MAX_CALLS = 200;
const MAX_ESTIMATED_COST_USD = 0.75;
function safeToken(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
function modelSetup(model, apiKey, total) {
  const p = PRICES[model];
  const fetchImpl = async (url, init) => {
    if (total.calls >= MAX_CALLS || total.estimatedCostUsd > MAX_ESTIMATED_COST_USD) {
      throw new Error('UNIFIED_SHADOW_EVAL_BUDGET_EXHAUSTED');
    }
    total.calls += 1;
    const res = await fetch(url, init);
    if (res.ok) {
      const raw = await res.clone().json();
      const use = raw.usage ?? {};
      const input = safeToken(use.input_tokens);
      const cached = safeToken(use.input_tokens_details?.cached_tokens);
      const output = safeToken(use.output_tokens);
      const cost = (
        Math.max(0, input - cached) * p.input +
        cached * p.cached + output * p.output
      ) / 1_000_000;
      total.byModel[model].inputTokens += input;
      total.byModel[model].outputTokens += output;
      total.byModel[model].estimatedCostUsd += cost;
      total.estimatedCostUsd += cost;
    }
    return res;
  };
  return createSeyeonUnifiedPreflightShadowV1(createOpenAiSeyeonStructuredProviderV1({
    apiKey, model, fetchImpl, timeoutMs: 30_000,
  }));
}
async function evaluate(model, classifier, spec) {
  const start = performance.now();
  try {
    const r = await classifier.classify({ characterId: 'seyeon', userText: spec.text });
    return {
      ...scoreSeyeonClassifierCaseV1(spec, r.integrity, r.disclosure),
      model, status: 'ok', elapsedMs: Math.round(performance.now() - start),
    };
  } catch (error) {
    return {
      model, id: spec.id, status: 'error',
      elapsedMs: Math.round(performance.now() - start),
      errorCode: error?.name === 'OpenAiSeyeonStructuredProviderErrorV1'
        ? error.code : 'UNIFIED_SHADOW_EVAL_FAILURE',
    };
  }
}
function percentile(values, share) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.ceil(sorted.length * share) - 1] : null;
}
async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('Missing protected model evaluation credential.');
  if (SEYEON_MODEL_EVAL_CASES_V1.length !== 100) throw new Error('Unexpected benchmark size.');
  const total = {
    calls: 0, estimatedCostUsd: 0,
    byModel: Object.fromEntries(MODELS.map((model) => [model, {
      inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0,
    }])),
  };
  const classifiers = new Map(MODELS.map((m) => [m, modelSetup(m, apiKey, total)]));
  const rows = Object.fromEntries(MODELS.map((m) => [m, []]));
  for (const spec of SEYEON_MODEL_EVAL_CASES_V1) {
    if (total.calls + MODELS.length > MAX_CALLS ||
        total.estimatedCostUsd > MAX_ESTIMATED_COST_USD) {
      throw new Error('Unified shadow evaluation budget exhausted.');
    }
    const pair = await Promise.all(MODELS.map((m) => evaluate(m, classifiers.get(m), spec)));
    for (const result of pair) rows[result.model].push(result);
  }
  const models = Object.fromEntries(MODELS.map((m) => {
    const valid = rows[m].filter((row) => row.status === 'ok');
    const failing = rows[m].filter((row) => row.status !== 'ok');
    return [m, {
      scores: aggregateSeyeonEvalV1(valid),
      errorCount: failing.length,
      p50Ms: percentile(valid.map((row) => row.elapsedMs), 0.5),
      p95Ms: percentile(valid.map((row) => row.elapsedMs), 0.95),
      usage: { ...total.byModel[m],
        estimatedCostUsd: Number(total.byModel[m].estimatedCostUsd.toFixed(6)) },
      mismatches: valid.filter((row) => !row.topicMatch ||
          row.requiredKindFound === false || row.noClaimsViolated === true),
      rows: rows[m],
    }];
  }));
  const report = {
    schemaVersion: 'seyeon-unified-preflight-shadow-eval-v1',
    mode: 'OFFLINE_SYNTHETIC_SHADOW_ONLY',
    productionChanged: false,
    automaticPromotion: false,
    noUserDataOrDatabaseWrites: true,
    pricingBasis: 'Standard API token rate estimate',
    totalCalls: total.calls,
    estimatedCostUsd: Number(total.estimatedCostUsd.toFixed(6)),
    models,
  };
  const evidencePath = process.env.SEYEON_EVAL_EVIDENCE_PATH
    || './.evidence/seyeon-unified-preflight-shadow-eval-v1.json';
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, JSON.stringify(report, null, 2), { mode: 0o600 });
  for (const model of MODELS) {
    const r = models[model];
    console.log(JSON.stringify({
      model, phase: 'unified-preflight-shadow',
      topicAccuracy: r.scores.topicAccuracy,
      sensitiveRecall: r.scores.sensitiveRecall,
      claimRecall: r.scores.claimRecall,
      ordinaryFalsePositives: r.scores.ordinaryFalsePositives,
      p50Ms: r.p50Ms, p95Ms: r.p95Ms,
      errorCount: r.errorCount,
      estimatedCostUsd: r.usage.estimatedCostUsd,
      mismatchIds: r.mismatches.map((row) => row.id),
    }));
  }
  if (MODELS.some((m) => models[m].errorCount > 0)) {
    throw new Error('Unified classifier candidate has runtime errors; no promotion.');
  }
}
await main();
