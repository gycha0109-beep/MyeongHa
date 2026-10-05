import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  createOpenAiSeyeonStructuredProviderV1,
} from '../dist/apps/api/src/openai-seyeon-structured-provider-v1.js';
import {
  parseSeyeonInternalLiveProviderConfigV1,
} from '../dist/apps/api/src/seyeon-internal-live-dogfood-v1.js';
import {
  runSeyeonCharacterTurnV2,
} from '../dist/apps/api/src/seyeon-character-runtime-v2.js';
import {
  createSeyeonProductionGovernanceV1,
} from '../dist/apps/api/src/seyeon-production-governance-v1.js';
import {
  createObservedSeyeonStructuredProviderV1,
  diffSeyeonStructuredProviderInvocationsV1,
} from '../dist/apps/api/src/seyeon-structured-provider-observer-v1.js';
import {
  getSeyeonInternalDogfoodScenarioV1,
} from '../dist/apps/api/src/seyeon-internal-dogfood-scenarios-v1.js';

const EVIDENCE_DIR = 'seyeon-first-meeting-predeploy-quality';

function requiredEnv(name) {
  const value = process.env[name]?.trim() ?? '';
  if (value.length === 0) throw new Error(name + ' is required.');
  return value;
}

function firstMeetingTurnBinding() {
  return Object.freeze({
    version: 'seyeon-production-relationship-read-v1',
    relationshipRevisionUsedForTurn: null,
    relationship: null,
    relationshipSemantics: null,
    freshness: 'EMPTY',
  });
}

function productionContext(recentMessages) {
  return Object.freeze({
    version: 'seyeon-production-context-v1',
    relationshipRevisionUsedForTurn: null,
    historyThroughRevision: 0,
    recentMessages: Object.freeze([...recentMessages]),
    retrievedMemories: Object.freeze([]),
    personalRecordAdmissions: Object.freeze([]),
    activeRelationshipEventCount: 0,
    relationshipHistoryRecords: Object.freeze([]),
  });
}

async function main() {
  const runnerTemp = requiredEnv('RUNNER_TEMP');
  const providerConfig = parseSeyeonInternalLiveProviderConfigV1(process.env);
  const observed = createObservedSeyeonStructuredProviderV1(
    createOpenAiSeyeonStructuredProviderV1(providerConfig),
  );
  const scenario = getSeyeonInternalDogfoodScenarioV1('first-meeting-v1');

  const recentMessages = [];
  const turns = [];
  const providerBefore = observed.snapshot();

  for (let index = 0; index < scenario.turns.length; index += 1) {
    const fixture = scenario.turns[index];
    const turnIndex = index + 1;
    const userMessageRef =
      'predeploy-first-meeting-user-' + String(turnIndex).padStart(2, '0');
    const assistantMessageRef =
      'predeploy-first-meeting-assistant-' + String(turnIndex).padStart(2, '0');

    const context = productionContext(recentMessages);
    const governance = createSeyeonProductionGovernanceV1({
      provider: observed.provider,
      turnBinding: firstMeetingTurnBinding(),
      productionContext: context,
    });
    const before = observed.snapshot();

    const result = await runSeyeonCharacterTurnV2({
      userMessageRef,
      userText: fixture.text,
      contextInput: Object.freeze({
        relationship: null,
        recentMessages: context.recentMessages,
        retrievedMemories: Object.freeze([]),
      }),
      governance,
      interpreterProvider: observed.provider,
      rendererProvider: observed.provider,
      semanticReviewerProvider: observed.provider,
    });

    const after = observed.snapshot();
    const delta = diffSeyeonStructuredProviderInvocationsV1(before, after);

    turns.push(Object.freeze({
      turnIndex,
      userText: fixture.text,
      assistantText: result.envelope.utterance,
      expressionState: result.envelope.expressionState,
      revealLevel: result.envelope.revealLevel,
      chosenAction: result.interpretation.chosenAction.key,
      immediateWant: result.interpretation.immediateWant.key,
      tension: result.interpretation.tension.key,
      providerDelta: delta,
      characterSource: Object.freeze({
        bibleBlobSha: result.context.character.sourceBibleBlobSha,
        runtimeBlobSha: result.context.character.sourceRuntimeBlobSha,
      }),
    }));

    recentMessages.push(
      Object.freeze({
        messageId: userMessageRef,
        role: 'user',
        text: fixture.text,
      }),
      Object.freeze({
        messageId: assistantMessageRef,
        role: 'assistant',
        text: result.envelope.utterance,
      }),
    );
  }

  const providerAfter = observed.snapshot();
  const evidence = Object.freeze({
    schemaVersion: 'seyeon-first-meeting-predeploy-quality-v1',
    executionBoundary: Object.freeze({
      productionDatabaseUsed: false,
      durableMemoryWriteUsed: false,
      relationshipWriteUsed: false,
      publicRouteUsed: false,
      realStructuredProviderUsed: true,
    }),
    scenarioId: scenario.scenarioId,
    turnCount: turns.length,
    reviewFocus: scenario.reviewFocus,
    providerDelta: diffSeyeonStructuredProviderInvocationsV1(
      providerBefore,
      providerAfter,
    ),
    turns: Object.freeze(turns),
  });

  const evidenceDir = join(runnerTemp, EVIDENCE_DIR);
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(
    join(evidenceDir, 'evidence.json'),
    JSON.stringify(evidence, null, 2) + '\n',
    { mode: 0o600 },
  );

  process.stdout.write(
    '세연 배포 전 첫 만남 실대화 시험 완료: ' +
      turns.length +
      '턴, 운영 DB 사용 없음, 실제 AI 호출 사용.\n',
  );
  for (const turn of turns) {
    process.stdout.write(
      '\n[' + turn.turnIndex + '] 사용자: ' + turn.userText +
      '\n[' + turn.turnIndex + '] 세연: ' + turn.assistantText + '\n',
    );
  }
  process.stdout.write(
    '\nSEYEON_PREDEPLOY_EVIDENCE=' + JSON.stringify(evidence) + '\n',
  );
}

main().catch((error) => {
  const safe =
    error instanceof Error
      ? { name: error.name, message: error.message }
      : { name: 'UnknownError', message: '세연 배포 전 실대화 시험 실패' };
  process.stderr.write(JSON.stringify(safe) + '\n');
  process.exitCode = 1;
});
