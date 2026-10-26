#!/usr/bin/env node
/**
 * Offline-only research artifact. Requires 'npm run build' for the
 * compiled TypeScript modules; never talks to OpenRouter or any service.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const argv = process.argv.slice(2);
if (argv.some(flag => ['--execute', '--paid', '--model-call', '--resume'].includes(flag))) {
  throw new Error('OFFLINE_ONLY_NO_PROVIDER_DISPATCH');
}
if (argv.length && (argv[0] !== '--output' || argv.length !== 2)) {
  throw new Error('USAGE: node scripts/seyeon-c09-luna-shadow-report-v1.mjs [--output path]');
}
const output = resolve(argv[1] ?? 'artifacts/seyeon-c09-luna-shadow-prompt-audit-v1.json');
const base = JSON.parse(readFileSync(resolve(
  'docs/experiments/seyeon-c09-gpt6-luna-five-20261026-baseline-v1.json'), 'utf8'));
const { buildSeyeonC09LunaAgencyFiveCaseShadowV1 } = await import(
  '../dist/apps/api/src/seyeon-c09-luna-agency-five-cases-shadow-v1.js');
const { auditSeyeonC09LunaUtteranceShadowV1 } = await import(
  '../dist/apps/api/src/seyeon-c09-luna-surface-audit-shadow-v1.js');
const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');

if (base.source?.originalModel !== 'openai/gpt-6-luna' ||
    base.source?.workflowRunId !== 40261419279 ||
    base.attempted !== 5 || base.completed !== 5 || base.improvedModelCalls !== 0) {
  throw new Error('INVALID_LUNA_BASELINE');
}
const candidates = buildSeyeonC09LunaAgencyFiveCaseShadowV1();
const records = candidates.map(candidate => {
  const originals = base.records.filter(r => r.id === candidate.caseId);
  if (originals.length !== 1 || originals[0].status !== 'COMPLETED') {
    throw new Error('BASELINE_CASE_MISSING_OR_UNEXPECTED');
  }
  const original = originals[0];
  const previous = auditSeyeonC09LunaUtteranceShadowV1(original.text);
  const system = candidate.messages[0].content;
  if (candidate.messages[1].content !== candidate.messages[1].content.trim() ||
      candidate.productionRoutingAuthorized || candidate.providerCallExecuted) {
    throw new Error('UNSAFE_RESEARCH_CANDIDATE');
  }
  return {
    questionId: candidate.caseId,
    question: candidate.messages[1].content,
    originalOutput: original.text,
    originalElapsedMs: original.latencyMs,
    originalRecordedUsd: original.recordedUsd,
    originalHeuristicFlags: previous.flags,
    improvedPrompt: {
      model: candidate.modelId,
      profileVersion: candidate.personaProfileVersion,
      selectedFocuses: candidate.selectedFocuses,
      plannedMove: candidate.plannedMove,
      currentMotive: candidate.currentMotive,
      planSource: candidate.behaviorPlanSource,
      systemSha256: sha256(system),
      systemChars: system.length,
      system,
    },
    improvedModelOutput: null,
    improvedModelExecutionStatus: 'NOT_EXECUTED_NO_PAID_APPROVAL',
    independentSemanticReviewPerformed: false,
    realMemoryAuthorityVerified: false,
  };
});
const flagCounts = Object.fromEntries(
  [...new Set(records.flatMap(x => x.originalHeuristicFlags))].sort().map(flag => [
    flag, records.filter(x => x.originalHeuristicFlags.includes(flag)).length
  ])
);
const result = {
  schemaVersion: 'seyeon-c09-luna-shadow-prompt-audit-v1',
  mode: 'OFFLINE_ONLY',
  sourceWorkflowRunId: 40261419279,
  originalFiveCallsAlreadyCompleted: 5,
  newProviderCalls: 0,
  newEstimatedSpendUsd: 0,
  improvedModelOutputAvailable: false,
  semanticSafetyEquivalenceProven: false,
  automatedBehaviorPlannerImplemented: false,
  baselineSurfaceFlags: flagCounts,
  records,
};
mkdirSync(dirname(output), {recursive: true});
writeFileSync(output, JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  output,
  preparedPrompts: records.length,
  originalSurfaceFlags: flagCounts,
  improvedModelOutputs: 0,
  newProviderCalls: 0,
}, null, 2));
