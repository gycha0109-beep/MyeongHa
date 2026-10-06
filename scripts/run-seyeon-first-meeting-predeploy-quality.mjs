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
  bindSeyeonProductionCurrentUserTurnV1,
} from '../dist/apps/api/src/seyeon-production-chat-execution-v1.js';
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

function safeErrorChain(error) {
  const chain = [];
  let current = error;
  for (let depth = 0; depth < 6; depth += 1) {
    if (typeof current !== 'object' || current === null) break;
    chain.push(Object.freeze({
      name:
        typeof current.name === 'string'
          ? current.name
          : current.constructor?.name ?? 'UnknownError',
      message:
        typeof current.message === 'string'
          ? current.message
          : null,
      stage:
        typeof current.stage === 'string'
          ? current.stage
          : null,
      code:
        typeof current.code === 'string'
          ? current.code
          : null,
      httpStatus:
        Number.isInteger(current.httpStatus)
          ? current.httpStatus
          : null,
    }));
    current = current.cause;
  }
  return Object.freeze(chain);
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

function maxTurns() {
  const raw = process.env.SEYEON_PREDEPLOY_MAX_TURNS?.trim() ?? '1';
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 10) {
    throw new Error('SEYEON_PREDEPLOY_MAX_TURNS must be an integer between 1 and 10.');
  }
  return value;
}

async function main() {
  const runnerTemp = requiredEnv('RUNNER_TEMP');
  const turnLimit = maxTurns();
  const providerConfig = parseSeyeonInternalLiveProviderConfigV1(process.env);
  const observed = createObservedSeyeonStructuredProviderV1(
    createOpenAiSeyeonStructuredProviderV1(providerConfig),
  );
  let lastPurpose = null;
  let lastRendererCandidate = null;
  const tracedProvider = Object.freeze({
    providerKey: observed.provider.providerKey,
    modelKey: observed.provider.modelKey,
    async generate(request) {
      lastPurpose = request.purpose;
      const output = await observed.provider.generate(request);
      if (
        request.purpose === 'dialogue_render' &&
        typeof output === 'object' &&
        output !== null &&
        typeof output.utterance === 'string'
      ) {
        const utterance = output.utterance.trim();
        lastRendererCandidate =
          utterance.length > 0 && utterance.length <= 1200
            ? utterance
            : null;
      }
      return output;
    },
  });
  const scenario = getSeyeonInternalDogfoodScenarioV1('first-meeting-v1');

  const evidenceDir = join(runnerTemp, EVIDENCE_DIR);
  await mkdir(evidenceDir, { recursive: true });

  const recentMessages = [];
  const turns = [];
  const providerBefore = observed.snapshot();

  for (
    let index = 0;
    index < Math.min(turnLimit, scenario.turns.length);
    index += 1
  ) {
    const fixture = scenario.turns[index];
    const turnIndex = index + 1;
    const userMessageRef =
      'predeploy-first-meeting-user-' + String(turnIndex).padStart(2, '0');
    const assistantMessageRef =
      'predeploy-first-meeting-assistant-' + String(turnIndex).padStart(2, '0');

    const context = productionContext(recentMessages);
    const governance = createSeyeonProductionGovernanceV1({
      provider: tracedProvider,
      turnBinding: firstMeetingTurnBinding(),
      productionContext: context,
    });
    const before = observed.snapshot();
    lastRendererCandidate = null;

    const historicalContext = Object.freeze({
      relationship: null,
      recentMessages: context.recentMessages,
      retrievedMemories: Object.freeze([]),
    });
    const contextInput = bindSeyeonProductionCurrentUserTurnV1({
      historicalContext,
      userMessageId: userMessageRef,
      userText: fixture.text,
    });

    let result;
    try {
      result = await runSeyeonCharacterTurnV2({
        userMessageRef,
        userText: fixture.text,
        contextInput,
        governance,
        interpreterProvider: tracedProvider,
        rendererProvider: tracedProvider,
        semanticReviewerProvider: tracedProvider,
      });
    } catch (error) {
      const afterFailure = observed.snapshot();
      const failure = Object.freeze({
        schemaVersion: 'seyeon-first-meeting-predeploy-failure-v1',
        turnIndex,
        userText: fixture.text,
        lastStructuredPurpose: lastPurpose,
        providerDelta: diffSeyeonStructuredProviderInvocationsV1(
          before,
          afterFailure,
        ),
        errorChain: safeErrorChain(error),
        rejectedRendererCandidate:
          lastPurpose === 'semantic_review'
            ? lastRendererCandidate
            : null,
        completedTurns: Object.freeze([...turns]),
        executionBoundary: Object.freeze({
          productionDatabaseUsed: false,
          durableMemoryWriteUsed: false,
          relationshipWriteUsed: false,
          publicRouteUsed: false,
          realStructuredProviderUsed: true,
        }),
      });
      await writeFile(
        join(evidenceDir, 'evidence.json'),
        JSON.stringify(failure, null, 2) + '\n',
        { mode: 0o600 },
      );
      process.stderr.write(
        'SEYEON_PREDEPLOY_FAILURE=' + JSON.stringify(failure) + '\n',
      );
      throw error;
    }

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
    requestedTurnLimit: turnLimit,
    turnCount: turns.length,
    reviewFocus: scenario.reviewFocus,
    providerDelta: diffSeyeonStructuredProviderInvocationsV1(
      providerBefore,
      providerAfter,
    ),
    turns: Object.freeze(turns),
  });

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
