import { describe, expect, it, vi } from 'vitest';

import {
  runSeyeonFirstMeetingLiveCampaignV1,
} from '../apps/api/src/seyeon-internal-first-meeting-campaign-v1.js';
import type {
  ConfiguredSeyeonInternalDogfoodEvidenceRuntimeV1,
  SeyeonInternalDogfoodEvidenceSnapshotV1,
} from '../apps/api/src/seyeon-internal-dogfood-evidence-v1.js';
import type {
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from '../apps/api/src/postgres-subject-execution.js';

const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const THREAD_ID = '33333333-3333-4333-8333-333333333333';

function dirtySnapshot(): SeyeonInternalDogfoodEvidenceSnapshotV1 {
  return {
    version: 'seyeon-internal-dogfood-evidence-v1',
    subjectId: SUBJECT_ID,
    thread: {
      threadId: THREAD_ID,
      activeContentReleaseId: '55555555-5555-4555-8555-555555555555',
      activeContentBundleId: '66666666-6666-4666-8666-666666666666',
      contentRevision: 0,
      participantCharacterIds: ['seyeon'],
    },
    stream: {
      messageCount: 1,
      maxSequenceNo: 1,
      messageIds: ['message-1'],
      userMessageCount: 1,
      characterMessageCount: 0,
      systemMessageCount: 0,
    },
    memory: { itemIds: [], grants: [] },
    relationship: {
      version: 'seyeon-internal-dogfood-relationship-inspector-v1',
      subjectId: SUBJECT_ID,
      relationship: null,
      activeEventKinds: [],
      activeEventIds: [],
    },
  };
}

function pool(): PostgresSubjectPoolV1 {
  return {
    async connect(): Promise<PostgresSubjectConnectionV1> {
      return {
        async query<Row = Record<string, unknown>>(
          text: string,
        ): Promise<{ rows: readonly Row[] }> {
          if (
            text === 'BEGIN' ||
            text.startsWith('SET LOCAL ROLE') ||
            text === 'COMMIT' ||
            text === 'ROLLBACK' ||
            text.includes('assert_myeongha_subject_context_v1')
          ) {
            return { rows: [] };
          }
          if (text.includes('begin_member_subject_context_v1')) {
            return {
              rows: [{
                subjectId: SUBJECT_ID,
                subjectKind: 'member',
              } as Row],
            };
          }
          if (text.includes('cmd_open_member_single_character_thread_v1')) {
            return {
              rows: [{
                threadId: THREAD_ID,
                threadCharacterId: '44444444-4444-4444-8444-444444444444',
                created: false,
                activeContentReleaseId: '55555555-5555-4555-8555-555555555555',
                activeContentBundleId: '66666666-6666-4666-8666-666666666666',
                characterId: 'seyeon',
              } as Row],
            };
          }
          throw new Error('Unexpected SQL: ' + text);
        },
        release: vi.fn(),
      };
    },
  };
}

describe('Se-yeon first-meeting live campaign V1', () => {
  it('returns prerequisite stop without invoking the provider on dirty reused thread', async () => {
    const harnessRun = vi.fn();
    const runtime = {
      pool: pool(),
      harness: {
        run: harnessRun,
        async close() {},
      },
      observer: {
        provider: {
          providerKey: 'test',
          modelKey: 'test',
          async generate() {
            throw new Error('provider must not run');
          },
        },
        snapshot() {
          return {
            total: 0,
            byPurpose: {
              integrity_classification: 0,
              disclosure_classification: 0,
              turn_interpretation: 0,
              dialogue_render: 0,
              semantic_review: 0,
              event_extraction: 0,
            },
          };
        },
      },
      relationshipInspector: {
        async inspect() {
          return dirtySnapshot().relationship;
        },
      },
      evidenceInspector: {
        async inspect() {
          return dirtySnapshot();
        },
      },
      async close() {},
    } as unknown as ConfiguredSeyeonInternalDogfoodEvidenceRuntimeV1;

    const result = await runSeyeonFirstMeetingLiveCampaignV1({
      runtime,
      verifiedEvidence: {
        kind: 'member',
        verifiedAuthUserId: '11111111-1111-4111-8111-111111111111',
      },
      runId: 'live-first-meeting-001',
      createUuid: (() => {
        const values = [
          '77777777-7777-4777-8777-777777777777',
          '88888888-8888-4888-8888-888888888888',
        ];
        let index = 0;
        return () => values[index++]!;
      })(),
    });

    expect(result.preparation.status).toBe('NOT_RUN_PREREQUISITE');
    expect(result.evidence).toBeNull();
    expect(harnessRun).not.toHaveBeenCalled();
  });
});
