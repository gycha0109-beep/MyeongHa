import { describe, expect, it, vi } from 'vitest';
import {
  finalizePortOneV2IdentityAgeV1,
  type PortOneV2IdentityAgeAuthorityPortV1,
} from '../apps/api/src/portone-v2-identity-age-finalization-v1.js';
import type { PortOneV2IdentityLookupAdapterV1 } from '../apps/api/src/portone-v2-identity-verification-lookup-v1.js';

const subjectId = 'subject-1';
const identityVerificationId = 'issued-identity-1';
const serverTime = '2026-10-23T06:00:00.000Z';
const ownedAttempt = { subjectId, identityVerificationId, status: 'pending' as const };

function harness(decision: Awaited<ReturnType<PortOneV2IdentityLookupAdapterV1['verify']>>, canConsume = true) {
  const readPendingOwnedAttempt = vi.fn(async () => ownedAttempt);
  const consumeAndRecordAgeBand = vi.fn(async () => canConsume);
  const verify = vi.fn(async () => decision);
  const authority: PortOneV2IdentityAgeAuthorityPortV1 = {
    readPendingOwnedAttempt, consumeAndRecordAgeBand,
  };
  const lookup: PortOneV2IdentityLookupAdapterV1 = { verify };
  return {
    readPendingOwnedAttempt, consumeAndRecordAgeBand, verify,
    run: () => finalizePortOneV2IdentityAgeV1({
      subjectId, identityVerificationId, serverTime, authority, lookup,
    }),
  };
}

describe('LEGAL L2: one-time PortOne age finalization wiring', () => {
  it('commits only the age band after matching provider verification and owned attempt', async () => {
    const t = harness({ kind: 'verified', subjectId, identityVerificationId, ageBand: 'adult' });
    await expect(t.run()).resolves.toEqual({ kind: 'granted', ageBand: 'adult' });
    expect(t.readPendingOwnedAttempt).toHaveBeenCalledWith({ subjectId, identityVerificationId });
    expect(t.verify).toHaveBeenCalledWith({ subjectId, identityVerificationId, ownedAttempt, serverTime });
    expect(t.consumeAndRecordAgeBand).toHaveBeenCalledOnce();
    expect(t.consumeAndRecordAgeBand).toHaveBeenCalledWith({
      subjectId, identityVerificationId, ageBand: 'adult', serverTime,
    });
    expect(JSON.stringify(t.consumeAndRecordAgeBand.mock.calls)).not.toMatch(/ci|di|phone|birthDate|name/u);
  });

  it('rejects attempts owned by another subject, used or revoked before provider I/O', async () => {
    const t = harness({ kind: 'verified', subjectId, identityVerificationId, ageBand: 'free_minor' });
    t.readPendingOwnedAttempt.mockResolvedValueOnce({ ...ownedAttempt, subjectId: 'other-subject' });
    await expect(t.run()).resolves.toEqual({ kind: 'held', reason: 'ATTEMPT_NOT_OWNED' });
    t.readPendingOwnedAttempt.mockResolvedValueOnce({ ...ownedAttempt, status: 'consumed' });
    await expect(t.run()).resolves.toEqual({ kind: 'held', reason: 'ATTEMPT_NOT_OWNED' });
    expect(t.verify).not.toHaveBeenCalled();
    expect(t.consumeAndRecordAgeBand).not.toHaveBeenCalled();
  });

  it('does not grant age on an unverified or mismatched PortOne response', async () => {
    const failed = harness({ kind: 'held', reason: 'NOT_VERIFIED' });
    await expect(failed.run()).resolves.toEqual({ kind: 'held', reason: 'INVALID_AGE_PROOF' });
    expect(failed.consumeAndRecordAgeBand).not.toHaveBeenCalled();

    const swapped = harness({ kind: 'verified', subjectId: 'other', identityVerificationId, ageBand: 'adult' });
    await expect(swapped.run()).resolves.toEqual({ kind: 'held', reason: 'INVALID_AGE_PROOF' });
    expect(swapped.consumeAndRecordAgeBand).not.toHaveBeenCalled();
  });

  it('respects atomic consume failure on replay even if the provider previously verified', async () => {
    const t = harness({ kind: 'verified', subjectId, identityVerificationId, ageBand: 'free_minor' }, false);
    await expect(t.run()).resolves.toEqual({ kind: 'held', reason: 'ALREADY_USED' });
    expect(t.consumeAndRecordAgeBand).toHaveBeenCalledOnce();
  });
});
