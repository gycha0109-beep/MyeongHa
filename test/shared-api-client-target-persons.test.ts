import { describe, expect, it } from 'vitest';

import {
  MyeongHaApiClientV1,
  listTargetPersonsV1,
  readTargetPersonV1,
} from '../packages/api-client/src/index.js';

const TARGET_ID = 'b6300000-0000-4000-8000-000000000001';
const BIRTH_ID = 'b6400000-0000-4000-8000-000000000001';
const REVISION_ID = 'b6500000-0000-4000-8000-000000000001';

const target = Object.freeze({
  targetPersonId: TARGET_ID,
  displayLabel: '상대 A',
  relationshipLabel: 'partner',
  birthProfileId: BIRTH_ID,
  currentRevision: {
    revisionId: REVISION_ID,
    revisionNo: 2,
    input: {
      calendarType: 'solar',
      birthDate: '1991-02-03',
      birthTime: '09:30:00',
      timeKnown: true,
      isLeapMonth: false,
      sex: 'female',
    },
  },
});

function success(data: unknown): Response {
  return Response.json({ ok: true, data }, { status: 200 });
}

describe('shared Target Person read client', () => {
  it('lists owner-scoped Target Persons with the active bearer', async () => {
    let authorization: string | null = null;
    let path = '';
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async (input, init) => {
        path = new URL(String(input)).pathname;
        authorization = new Headers(init?.headers).get('Authorization');
        return success([target]);
      },
    });

    await expect(listTargetPersonsV1(client, 'guest-token')).resolves.toEqual([target]);
    expect(path).toBe('/api/target-persons');
    expect(authorization).toBe('Bearer guest-token');
  });

  it('reads one Target Person and rejects identity mismatch', async () => {
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => success({
        ...target,
        targetPersonId: 'b6300000-0000-4000-8000-000000000099',
      }),
    });

    await expect(
      readTargetPersonV1(client, 'member-token', TARGET_ID),
    ).rejects.toMatchObject({ code: 'API_TARGET_PERSON_RESPONSE_INVALID' });
  });

  it('rejects duplicate list identities', async () => {
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => success([target, target]),
    });

    await expect(
      listTargetPersonsV1(client, 'member-token'),
    ).rejects.toMatchObject({ code: 'API_TARGET_PERSON_RESPONSE_INVALID' });
  });

  it('rejects malformed birth-time authority', async () => {
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl: async () => success([{
        ...target,
        currentRevision: {
          ...target.currentRevision,
          input: {
            ...target.currentRevision.input,
            timeKnown: false,
            birthTime: '09:30:00',
          },
        },
      }]),
    });

    await expect(
      listTargetPersonsV1(client, 'member-token'),
    ).rejects.toMatchObject({ code: 'API_TARGET_PERSON_RESPONSE_INVALID' });
  });
});
