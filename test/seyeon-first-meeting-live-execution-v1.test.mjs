import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  sanitizeSeYeonFirstMeetingCampaignResult,
} from '../scripts/run-seyeon-first-meeting-live-dogfood.mjs';

describe('Se-yeon first-meeting live execution surface', () => {
  it('redacts durable identities while preserving technical and Character-review evidence', () => {
    const safe = sanitizeSeYeonFirstMeetingCampaignResult({
      version: 'seyeon-first-meeting-live-campaign-v1',
      preparation: {
        status: 'READY_CREATED',
        reasons: [],
        threadId: 'thread-secret-id',
        created: true,
        preflight: {
          subjectId: 'subject-secret-id',
          thread: {
            threadId: 'thread-secret-id',
            activeContentReleaseId: 'release-secret-id',
            activeContentBundleId: 'bundle-secret-id',
            contentRevision: 0,
            participantCharacterIds: ['seyeon'],
          },
          stream: {
            messageCount: 0,
            userMessageCount: 0,
            characterMessageCount: 0,
            systemMessageCount: 0,
            messageIds: [],
          },
          memory: {
            itemIds: ['memory-secret-id'],
            grants: [{
              memoryItemId: 'memory-secret-id',
              grantId: 'grant-secret-id',
              characterId: 'seyeon',
            }],
          },
          relationship: {
            relationship: null,
            activeEventKinds: [],
            activeEventIds: ['relationship-event-secret-id'],
          },
        },
      },
      evidence: {
        verdict: 'PASS',
        reasons: [],
        scenario: {
          scenarioId: 'first-meeting-v1',
          runId: 'gha-1-1',
          subjectId: 'subject-secret-id',
          threadId: 'thread-secret-id',
          description: 'test',
          reviewFocus: ['no invented shared past'],
          turnCount: 1,
          providerDelta: {
            total: 1,
            byPurpose: { dialogue_render: 1 },
          },
          turns: [{
            turnIndex: 1,
            clientTurnId: 'dogfood:first-meeting-v1:gha-1-1:01',
            userText: '안녕하세요. 처음 뵙네요.',
            assistant: {
              disposition: 'executed',
              subjectId: 'subject-secret-id',
              assistantText: '안녕하세요. 정말 처음 뵙네요.',
              committedTurn: {
                turnId: 'turn-secret-id',
                attemptId: 'attempt-secret-id',
                assistantMessageId: 'message-secret-id',
                sequenceNo: 2,
                committedAt: '2026-10-04T00:00:00.000Z',
                replayed: false,
              },
              postTurnDecision: 'none',
              relationshipUsedForTurn: null,
              relationshipRevisionUsedForTurn: null,
              relationshipBehavior: null,
              relationshipRevision: null,
            },
            providerDelta: {
              total: 1,
              byPurpose: { dialogue_render: 1 },
            },
          }],
        },
        replay: {
          disposition: 'committed_replay',
          turnId: 'turn-secret-id',
          attemptId: 'attempt-secret-id',
          assistantMessageId: 'message-secret-id',
          sequenceNo: 2,
          committedAt: '2026-10-04T00:00:00.000Z',
          providerDelta: {
            total: 0,
            byPurpose: { dialogue_render: 0 },
          },
        },
      },
    });

    expect(safe.technical.verdict).toBe('PASS');
    expect(safe.scenario?.turns[0]?.assistantText).toBe(
      '안녕하세요. 정말 처음 뵙네요.',
    );
    const serialized = JSON.stringify(safe);
    for (const secret of [
      'subject-secret-id',
      'thread-secret-id',
      'release-secret-id',
      'bundle-secret-id',
      'memory-secret-id',
      'grant-secret-id',
      'relationship-event-secret-id',
      'turn-secret-id',
      'attempt-secret-id',
      'message-secret-id',
      'dogfood:first-meeting-v1:gha-1-1:01',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('pins live workflow to explicit production invocation without PR execution', async () => {
    const workflow = await readFile(
      '.github/workflows/seyeon-first-meeting-live-dogfood.yml',
      'utf8',
    );

    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain(
      'feat/character-memory/seyeon-production-context-v1',
    );
    expect(workflow).toContain(
      ".github/seyeon-first-meeting-live-dogfood.trigger",
    );
    expect(workflow).not.toMatch(/^\s*pull_request:/mu);
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain(
      "RUN_SEYEON_FIRST_MEETING_LIVE",
    );
    expect(workflow).toContain(
      "MYEONGHA_DATABASE_PRINCIPAL: ${{ secrets.MYEONGHA_DATABASE_PRINCIPAL }}",
    );
    expect(workflow).toContain(
      `[[ "\${MYEONGHA_DATABASE_PRINCIPAL:-}" == 'myeongha_runtime' ]]`,
    );
    expect(workflow).toContain(
      'node scripts/run-seyeon-first-meeting-live-dogfood.mjs',
    );
    expect(workflow).toContain('retention-days: 7');
    expect(workflow).toContain(
      "[[ "$TECHNICAL_VERDICT" == 'PASS' ]]",
    );
  });
});
