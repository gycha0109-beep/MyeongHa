import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { createMobileReaderAccessViewStateV1 } from '../apps/mobile/src/features/reading/mobile-reader-access-view-model.js';
import { projectMobileOfficialReadingReaderEntryV1 } from '../apps/mobile/src/features/reading/mobile-official-reading-reader-entry-view-model.js';
import { MOBILE_READER_PRESENTATIONS_V1 } from '../apps/mobile/src/features/reading/mobile-reader-presentation.js';

const official = { readingId: '11111111-1111-4111-8111-111111111111' };
type Access = ReturnType<typeof createMobileReaderAccessViewStateV1>;

describe('mobile M3-alpha Official Reading Reader entry', () => {
  it('keeps all nine Reader slots closed and preserves server-sourced record identity', () => {
    expect(MOBILE_READER_PRESENTATIONS_V1).toHaveLength(9);
    for (const { key } of MOBILE_READER_PRESENTATIONS_V1) {
      const entry = projectMobileOfficialReadingReaderEntryV1(official, key);
      expect(entry).toMatchObject({
        officialReadingId: official.readingId,
        readerId: key,
        status: 'public_route_off',
        canStartInterpretation: false,
      });
      expect(Object.isFrozen(entry)).toBe(true);
      expect(entry).not.toHaveProperty('threadId');
    }
  });

  it('distinguishes server evidence, pending/denied and failure presentation without admission', () => {
    const base: Access = {
      ...createMobileReaderAccessViewStateV1('seyeon'),
      interpretationRoute: 'server_admission_required',
    };
    const project = (access: Access, verificationFailure?: 'retryable_failure' | 'protected_failure') =>
      projectMobileOfficialReadingReaderEntryV1(official, 'seyeon', verificationFailure ? { access, verificationFailure } : { access });

    expect(project(base).status).toBe('server_verification_required');
    expect(project({ ...base, releaseApproval: { kind: 'server_verified', value: 'approval_pending' } }).status).toBe('release_approval_pending');
    expect(project({ ...base, officialReadingAccess: { kind: 'server_verified', value: 'denied' } }).status).toBe('official_reading_access_denied');
    expect(project({ ...base, purchaseAccess: { kind: 'server_verified', value: 'access_required' } }).status).toBe('purchase_access_required');
    expect(project(base, 'retryable_failure').status).toBe('retryable_verification_failure');
    expect(project(base, 'protected_failure').status).toBe('protected_verification_failure');

    const positive: Access = {
      ...base,
      productEligibility: { kind: 'server_verified', value: 'product_eligible' },
      purchaseAccess: { kind: 'server_verified', value: 'access_granted' },
      releaseApproval: { kind: 'server_verified', value: 'approved' },
      officialReadingAccess: { kind: 'server_verified', value: 'allowed' },
    };
    expect(project(positive)).toMatchObject({
      status: 'server_admission_required',
      canStartInterpretation: false,
    });
    expect(project({ ...positive, interpretationRoute: 'public_route_off' }).status).toBe('public_route_off');
    expect(() => projectMobileOfficialReadingReaderEntryV1(official, 'seyeon', {
      access: createMobileReaderAccessViewStateV1('baekheon'),
    })).toThrow('matching Reader identity');
  });

  it('uses the validated archive and offers no Reader admission or Thread action', async () => {
    const read = (path: string) => readFile(new URL('../' + path, import.meta.url), 'utf8');
    const [screen, view, native] = await Promise.all([
      read('apps/mobile/src/app/reading/[readingId].tsx'),
      read('apps/mobile/src/features/reading/MobileOfficialReadingReaderEntry.tsx'),
      read('apps/mobile/src/features/reading/native-mobile-reader-interpretation-service.ts'),
    ]);
    expect(screen).toContain('mobileRecordsServiceV1.readOfficialReading(readingId)');
    expect(screen).toContain('<MobileOfficialReadingReaderEntry record={state.record} />');
    expect(screen).toContain('state.record.display.steps.map');
    expect(view).toContain('MOBILE_READER_PRESENTATIONS_V1.map');
    expect(view).toContain('해설 서비스 준비 중');
    expect(view).not.toContain('onPress=');
    expect(view).not.toContain('fetch(');
    expect(view).not.toContain('threadId');
    expect(view).not.toContain('mobileReaderInterpretationServiceV1');
    expect(native).not.toContain('publicRouteActivated: true');
  });
});
