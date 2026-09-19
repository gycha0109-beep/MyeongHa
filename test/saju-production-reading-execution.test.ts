import { describe, expect, it, vi } from 'vitest';
import type { BirthProfileReadResponseV1 } from '../apps/api/src/birth-profile-read.js';
import { executeCurrentBirthProfileSajuReadingV1 } from '../apps/api/src/saju-production-reading-execution.js';
import type { SajuProductionReadingHttpAdapterV1 } from '../apps/api/src/saju-production-reading-http-adapter.js';

function profileFixture(): BirthProfileReadResponseV1 {
  return {
    birthProfileId: 'birth-profile:test:1',
    profileKind: 'self',
    label: null,
    archivedAt: null,
    currentRevision: {
      revisionId: 'birth-revision:test:7',
      revisionNo: 7,
      input: {
        calendarType: 'solar',
        birthDate: '2001-07-14',
        birthTime: '15:20:00',
        timeKnown: true,
        isLeapMonth: false,
        sex: 'female',
      },
    },
    revisions: [{ revisionId: 'birth-revision:test:7', revisionNo: 7, isCurrent: true }],
  };
}

describe('current Birth Profile Saju Product Reading execution v1', () => {
  it('projects the authority-selected current Birth revision into the ProductHost request', async () => {
    const admitted = Object.freeze({ state: 'temporarily_unavailable' });
    const requestReading = vi.fn(async () => admitted);
    const adapter = { requestReading } satisfies SajuProductionReadingHttpAdapterV1<typeof admitted>;

    await expect(
      executeCurrentBirthProfileSajuReadingV1({
        profile: profileFixture(),
        readingText: '직업운',
        adapter,
      }),
    ).resolves.toBe(admitted);

    expect(requestReading).toHaveBeenCalledWith({
      birth: {
        calendarType: 'solar',
        date: '2001-07-14',
        time: '15:20',
        sex: 'female',
      },
      reading: {
        text: '직업운',
      },
    });
  });

  it('preserves an authority-resolved target reference without accepting alternate Birth input', async () => {
    const requestReading = vi.fn(async () => ({ state: 'temporarily_unavailable' }));
    const adapter = { requestReading } satisfies SajuProductionReadingHttpAdapterV1;

    await executeCurrentBirthProfileSajuReadingV1({
      profile: profileFixture(),
      readingText: '궁합',
      targetPersonRef: 'target-person-ref-1',
      adapter,
    });

    expect(requestReading).toHaveBeenCalledWith(
      expect.objectContaining({
        reading: {
          text: '궁합',
          targetPersonRef: 'target-person-ref-1',
        },
      }),
    );
  });
});
