import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import {
  createOpenAiSeyeonStructuredProviderV1,
} from '../dist/apps/api/src/openai-seyeon-structured-provider-v1.js';
import {
  createIntegrityClassifier,
  createDisclosureClassifier,
} from '../dist/apps/api/src/seyeon-production-governance-v1.js';
import {
  SEYEON_MODEL_EVAL_CASES_V1,
  SEYEON_MODEL_EVAL_VERSION_V1,
  scoreSeyeonClassifierCaseV1,
  aggregateSeyeonEvalV1,
} from './seyeon-model-eval-cases-v1.mjs';

const RATE_PER_MILLION = Object.freeze({
  'gpt-5.6-luna': Object.freeze({ input: 0.20, cached: 0.02, output: 1.20 }),
  'gpt-5.6-terra': Object.freeze({ input: 2.00, cached: 0.20, output: 12.00 }),
});
const MODELS = Object.freeze(Object.keys(RATE_PER_MILLION));
const MAX_CALLS = 192;
const MAX_ESTIMATED_COST_USD = 1.50;
const DEFAULT_OUTPUT = './.evidence/seyeon-model-eval-v1.json';
const MAX_CASES = 48;

function token(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value : 0;
}

function createModelRunner(model, apiKey, totals) {
  const rates = RATE_PER_MILLION[model];
  const fetchImpl = async (url, init) => {
    if (totals.calls >= MAX_CALLS || totals.estimatedCostUsd > MAX_ESTIMATED_COST_USD) {
      throw new Error('EVALUATION_BUDGET_EXHAUSTED');
    }
    totals.calls += 1;
    const response = await fetch(url, init);
    if (response.ok) {
      const body = await response.clone().json();
      const usage = body?.usage ?? {};
      const cached = token(usage.input_tokens_details?.cached_tokens);
      const input = token(usage.input_tokens);
      const output = token(usage.output_tokens);
      totals.inputTokens += input;
      totals.outputTokens += output;
      totals.cachedTokens += cached;
      totals.estimatedCostUsd += (
        Math.max(0, input - cached) * rates.input +
        cached * rates.cached + output * rates.output
      ) / 1_000_000;
    }
    return response;
  };
  const provider = createOpenAiSeyeonStructuredProviderV1({
    apiKey, model, timeoutMs: 30_000, fetchImpl,
  });
  return Object.freeze({
    integrity: createIntegrityClassifier(provider),
    disclosure: createDisclosureClassifier(provider),
  });
}

async function evaluateOne(model, runner, spec) {
  const startedAt = performance.now();
  try {
    // EXACT same production classifier prompts, schemas and guards; no fake conversations.
    const [integrity, disclosure] = await Promise.all([
      runner.integrity.classify({ characterId: 'seyeon', userText: spec.text }),
      runner.disclosure.classify({ characterId: 'seyeon', userQuestion: spec.text }),
    ]);
    return {
      ...scoreSeyeonClassifierCaseV1(spec, integrity, disclosure),
      model,
      elapsedMs: Math.round(performance.now() - startedAt),
      status: 'ok',
    };
  } catch (error) {
    return {
      id: spec.id, model, status: 'error',
      elapsedMs: Math.round(performance.now() - startedAt),
      errorCode: error instanceof Error && error.name === 'OpenAiSeyeonStructuredProviderErrorV1'
        ? error.code : 'EVALUATION_FAILURE',
    };
  }
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY missing in protected evaluation environment');
  if (SEYEON_MODEL_EVAL_CASES_V1.length !== MAX_CASES) {
    throw new Error('Unexpected benchmark size; fail closed.');
  }
  const totals = { calls: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, estimatedCostUsd: 0 };
  const runners = new Map(MODELS.map((model) => [
    model, createModelRunner(model, apiKey, totals),
  ]));
  const results = new Map(MODELS.map((model) => [model, []]));
  for (const spec of SEYEON_MODEL_EVAL_CASES_V1) {
    if (totals.calls + MODELS.length * 2 > MAX_CALLS ||
        totals.estimatedCostUsd > MAX_ESTIMATED_COST_USD) {
      throw new Error('Evaluation request or cost budget reached; fail closed');
    }
    const pair = await Promise.all(MODELS.map((model) =>
      evaluateOne(model, runners.get(model), spec)
    ));
    for (const row of pair) results.get(row.model).push(row);
  }

  const models = Object.fromEntries(MODELS.map((model) => {
    const rows = results.get(model);
    const passed = rows.filter((row) => row.status === 'ok');
    const countErrors = rows.length - passed.length;
    const times = passed.map((row) => row.elapsedMs).sort((a, b) => a - b);
    const percentile = (p) => times.length
      ? times[Math.ceil(times.length * p) - 1] : null;
    return [model, {
      errorCount: countErrors,
      scores: aggregateSeyeonEvalV1(passed),
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      rows, // ID, gold and model output enum only; no utterance or personal data.
    }];
  }));
  const artifact = {
    schemaVersion: SEYEON_MODEL_EVAL_VERSION_V1,
    runMode: 'OFFLINE_SYNTHETIC_CLASSIFICATION_ONLY',
    productionChanged: false,
    automaticPromotion: false,
    context: 'No character renderer, relationship mutation, real users or DB writes',
    models,
    estimatedUsage: {
      calls: totals.calls,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      cachedTokens: totals.cachedTokens,
      estimatedCostUsd: Number(totals.estimatedCostUsd.toFixed(6)),
      pricingBasis: 'Standard API rates per million tokens; no tool or regional adjustments',
    },
  };
  const output = process.env.SEYEON_EVAL_EVIDENCE_PATH || DEFAULT_OUTPUT;
  await mkdir(new URL('.', 'file://' + (output.startsWith('/') ? output : process.cwd() + '/' + output)).pathname, { recursive: true });
  await writeFile(output, JSON.stringify(artifact, null, 2), { mode: 0o600 });
  for (const model of MODELS) {
    const report = models[model];
    console.log(JSON.stringify({
      phase: 'classification-model-compare', model,
      cases: report.rows.length, errors: report.errorCount,
      accuracy: report.scores.topicAccuracy,
      sensitiveRecall: report.scores.sensitiveRecall,
      claimRecall: report.scores.claimRecall,
      ordinaryFalsePositives: report.scores.ordinaryFalsePositives,
      p50Ms: report.p50Ms, p95Ms: report.p95Ms,
    }));
  }
  console.log(JSON.stringify({ calls: totals.calls, estimatedCostUsd: artifact.estimatedUsage.estimatedCostUsd, automaticPromotion: false }));
  if (MODELS.some((model) => models[model].errorCount !== 0)) {
    throw new Error('One or more model classifications failed. See bounded artifact.');
  }
}
await main();
