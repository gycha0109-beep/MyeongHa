#!/usr/bin/env node
/**
 * Replays the 45 PRE-EXISTING paid model utterances through the new bounded
 * first-contact lexical guard. This DOES NOT regenerate any dialogue and is
 * NOT a replacement for a live independent semantic or governance review.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assembleSeyeonRuntimeContextV2 } from '../packages/domain/src/seyeon-runtime-context-v2.js';
import { inspectSeyeonC09PublicSpeechBoundaryV1 } from '../apps/api/src/seyeon-c09-public-speech-boundary-shadow-v1.js';

const source = 'docs/experiments/seyeon-c09-15x3-generative-gpt-41-mini-20261026-raw-v1.json';
const data = JSON.parse(readFileSync(resolve(source), 'utf8')) as {
  records: readonly Readonly<{
    id: number;
    profile: string;
    prompt: string;
    reply: string;
    localGuard?: { localGuardPassed: boolean; guardFailureCode: string | null };
  }>[];
};
if (data.records.length !== 45) throw new Error('C09_REPLAY_INCOMPLETE_REFERENCE');

const results = data.records.map((record) => {
  const context = assembleSeyeonRuntimeContextV2({
    relationship: null,
    recentMessages: [{ messageId: 'replay_u1', role: 'user' as const, text: record.prompt }],
    retrievedMemories: [],
    integrityDecisions: [],
    governedPreflightApplied: true,
    disclosure: { decision: null, retrievedSources: [] },
  });
  const refusalReasons = inspectSeyeonC09PublicSpeechBoundaryV1({
    context, utterance: record.reply,
  });
  return {
    id: record.id,
    profile: record.profile,
    oldRendererAndInterpretationGuardsPassed: record.localGuard?.localGuardPassed === true,
    newSpeechBoundaryPassed: refusalReasons.length === 0,
    newSpeechBoundaryFailureReasons: [...refusalReasons],
  };
});
const profiles = ['baseline', 'character_first_v1', 'character_first_life_v1'];
const summary = Object.fromEntries(profiles.map((profile) => {
  const rows = results.filter((x) => x.profile === profile);
  return [profile, {
    total: rows.length,
    passedOldLocalGuards: rows.filter((r) =>
      r.oldRendererAndInterpretationGuardsPassed).length,
    passedNewSpeechBoundary: rows.filter((r) =>
      r.newSpeechBoundaryPassed).length,
    rejectedByNewSpeechBoundary: rows.filter((r) =>
      !r.newSpeechBoundaryPassed).length,
  }];
}));
process.stdout.write(JSON.stringify({
  source,
  schemaVersion: 'seyeon-c09-balanced-45-offline-replay-v1',
  originalPaidModelRequestsReused: 45,
  newPaidModelRequests: 0,
  productionPreflightPerformed: false,
  independentSemanticReviewerPerformed: false,
  regeneratedAnswers: false,
  newBalancedModelQualityMeasured: false,
  guardIsHighConfidencePartialFilter: true,
  summary,
  results,
}, null, 2));
