import { describe, expect, it } from 'vitest';

import {
  runSeyeonProductionContextVerticalSliceV1,
} from '../apps/api/src/seyeon-production-context-vertical-slice-v1.js';
import type {
  ProductionRelationshipApplyCommitPortV1,
  ProductionRelationshipApplyContextPortV1,
} from '../apps/api/src/production-relationship-event-apply-command-v1.js';
import type {
  SeyeonProductionRelationshipSyncIdPortV1,
} from '../apps/api/src/seyeon-production-relationship-sync-v1.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const THREAD_ID = '22222222-2222-4222-8222-222222222222';
const USER_MESSAGE_ID = '33333333-3333-4333-8333-333333333333';

function unusedIds(): SeyeonProductionRelationshipSyncIdPortV1 {
  const fail = (): never => {
    throw new Error('relationship sync ids must not be used');
  };
  return {
    nextProductionEventId: fail,
    nextStateId: fail,
    nextHistoryEntryId: fail,
    nextProvenanceRefId: fail,
  };
}

const unusedContextPort: ProductionRelationshipApplyContextPortV1 = {
  lockAndLoad(): never {
    throw new Error('relationship apply context must not be used');
  },
};

const unusedCommitPort: ProductionRelationshipApplyCommitPortV1 = {
  commitEvent(): never {
    throw new Error('relationship commit must not be used');
  },
};

describe('Se-yeon Production context vertical slice V1', () => {
  it('loads the context snapshot after the pre-turn relationship binding and before the committed callback', async () => {
    const observed: string[] = [];

    const result = await runSeyeonProductionContextVerticalSliceV1({
      mode: 'OFF',
      resolvedSubjectId: SUBJECT_ID,
      threadId: THREAD_ID,
      currentUserMessageRef: USER_MESSAGE_ID,
      bandProjection: null,
      relationshipReadPort: {
        readCurrent() {
          observed.push('relationship-read');
          return [];
        },
      },
      contextReadPort: {
        readPersonalRecords() {
          observed.push('personal-record-read');
          return [];
        },
        readRelationshipHistory(input) {
          observed.push('relationship-history-read:' + input.throughRevision);
          return [];
        },
        readRecentMessages() {
          observed.push('recent-message-read');
          return [{
            messageId: USER_MESSAGE_ID,
            sequenceNo: 8,
            senderType: 'user',
            characterId: null,
            text: '현재 사용자 메시지',
            createdAt: '2026-10-03T05:00:00.000Z',
          }];
        },
      },
      productionHistoryRecords: [],
      productionAuthorityRef: 'seyeon-production-context:test',
      idPort: unusedIds(),
      contextPort: unusedContextPort,
      commitPort: unusedCommitPort,
      runCommittedTurn: async ({ turnBinding, productionContext }) => {
        observed.push('committed-turn');
        expect(turnBinding.relationshipRevisionUsedForTurn).toBeNull();
        expect(productionContext.historyThroughRevision).toBe(0);
        expect(productionContext.recentMessages).toEqual([]);
        return {
          turnResult: { utterance: 'ok' },
          signal: {
            committedTurn: {
              turnId: '55555555-5555-4555-8555-555555555555',
              assistantMessageRef:
                '44444444-4444-4444-8444-444444444444',
              occurredAt: '2026-10-03T05:00:01.000Z',
            },
            relationshipEvent: null,
          },
        };
      },
    });

    expect(result.contextVersion).toBe(
      'seyeon-production-context-vertical-slice-v1',
    );
    expect(result.relationshipRevisionUsedForTurn).toBeNull();
    expect(result.relationshipRevisionAfterSync).toBeNull();
    expect(observed[0]).toBe('relationship-read');
    expect(observed).toContain('relationship-history-read:0');
    expect(observed.at(-1)).toBe('committed-turn');
  });
});
