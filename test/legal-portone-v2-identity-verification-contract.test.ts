import { describe, expect, it } from 'vitest';
import {
  PORTONE_V2_IDENTITY_VERIFICATION_LAUNCH_HOLD_V1,
  assessPortOneV2IdentityVerificationV1,
  type PortOneV2IdentityOwnedAttemptV1,
} from '../apps/api/src/portone-v2-identity-verification-contract-v1.js';

const id = 'identity-verification-test-1';
const subjectId = '88000000-0000-0000-0000-000000000001';
const serverTime = '2026-10-23T06:00:00.000Z';
const ownedAttempt: PortOneV2IdentityOwnedAttemptV1 = {
  subjectId, identityVerificationId: id, status: 'pending',
};
const proof = (birthDate: string, extra: Record<string, unknown> = {}) => ({
  id, status: 'VERIFIED',
  verifiedCustomer: {
    birthDate,
    ci: 'private-connecting-information',
    di: 'private-duplication-information',
    name: 'Private Name',
    phoneNumber: '01012345678',
  },
  ...extra,
});
const assess = (providerResult: unknown, overrides: Record<string, unknown> = {}) =>
  assessPortOneV2IdentityVerificationV1({
    subjectId, expectedIdentityVerificationId: id, ownedAttempt, providerResult, serverTime,
    ...overrides,
  });

describe('LEGAL L2: PortOne V2 identity verification provider decision', () => {
  it('pins selected provider and fails closed until commercial activation', () => {
    expect(PORTONE_V2_IDENTITY_VERIFICATION_LAUNCH_HOLD_V1).toEqual({
      provider: 'portone_v2',
      identityApiOrigin: 'https://api.portone.io',
      identityRouteActive: false,
      sdkInvocationEnabled: false,
      liveChannelEnabled: false,
      guardianVerificationAvailable: false,
      minimumFreeAge: 14,
      minimumDirectPurchaseAge: 19,
    });
  });

  it('accepts only provider-verified birth dates and returns a data-minimal age band', () => {
    expect(assess(proof('2012-10-23'))).toEqual({
      kind: 'verified', subjectId, identityVerificationId: id, ageBand: 'free_minor',
    });
    const adult = assess(proof('2007-10-23'));
    expect(adult).toEqual({
      kind: 'verified', subjectId, identityVerificationId: id, ageBand: 'adult',
    });
    expect(JSON.stringify(adult)).not.toMatch(/private-|phoneNumber|birthDate|01012345678/u);
  });

  it('denies under-14 and unverified responses without releasing age access', () => {
    expect(assess(proof('2012-10-24'))).toEqual({ kind: 'held', reason: 'AGE_RESTRICTED' });
    expect(assess(proof('2000-01-01', { status: 'READY' }))).toEqual({ kind: 'held', reason: 'NOT_VERIFIED' });
    expect(assess(proof('2000-01-01', { status: 'FAILED' }))).toEqual({ kind: 'held', reason: 'NOT_VERIFIED' });
    expect(assess({ id, status: 'VERIFIED' })).toEqual({ kind: 'held', reason: 'INVALID_PROVIDER_RESULT' });
    expect(assess(proof('2012-02-30'))).toEqual({ kind: 'held', reason: 'INVALID_PROVIDER_RESULT' });
    expect(assess(null)).toEqual({ kind: 'held', reason: 'INVALID_PROVIDER_RESULT' });
  });

  it('rejects swapped provider ID, different subject and already-consumed attempts', () => {
    expect(assess(proof('1990-01-01', { id: 'not-issued-id' }))).toEqual({ kind: 'held', reason: 'ATTEMPT_MISMATCH' });
    expect(assess(proof('1990-01-01'), { subjectId: 'other' })).toEqual({ kind: 'held', reason: 'ATTEMPT_MISMATCH' });
    expect(assess(proof('1990-01-01'), { ownedAttempt: { ...ownedAttempt, status: 'consumed' } })).toEqual({ kind: 'held', reason: 'ATTEMPT_MISMATCH' });
    expect(assess(proof('1990-01-01'), { ownedAttempt: { ...ownedAttempt, status: 'expired' } })).toEqual({ kind: 'held', reason: 'ATTEMPT_MISMATCH' });
    expect(assess(proof('1990-01-01'), { expectedIdentityVerificationId: '../../hack' })).toEqual({ kind: 'held', reason: 'ATTEMPT_MISMATCH' });
  });

  it('rejects browser-only success shapes and user-declared dates', () => {
    expect(assess({ id, status: 'VERIFIED', birthDate: '1990-01-01' })).toEqual({ kind: 'held', reason: 'INVALID_PROVIDER_RESULT' });
    expect(assess({ id, status: 'VERIFIED', verifiedCustomer: { birthDate: '' } })).toEqual({ kind: 'held', reason: 'INVALID_PROVIDER_RESULT' });
  });
});
