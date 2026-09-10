import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'apps', 'web', 'auth-page.js'), 'utf8');

describe('confirmation handoff removal authority', () => {
  it('snapshots the exact authoritative journal raw before removal', () => {
    expect(source).toMatch(/function removeConfirmationGuestHandoffLocal\(key\)[\s\S]*const previousRaw = readConfirmationGuestHandoffLocal\(key\);[\s\S]*localStorage\.removeItem\(key\)/);
  });

  it('rolls back an exact journal entry when removal verification read fails', () => {
    expect(source).toMatch(/localStorage\.getItem\(key\);[\s\S]*catch \(error\) \{[\s\S]*reconcileConfirmationGuestHandoffRemoval\(key, previousRaw\)[\s\S]*confirmationGuestHandoffClearFailure\(error\)/);
    expect(source).toMatch(/function reconcileConfirmationGuestHandoffRemoval\(key, previousRaw\)[\s\S]*localStorage\.setItem\(key, previousRaw\)[\s\S]*observed === previousRaw/);
  });

  it('preserves a newer same-key replacement instead of restoring the stale handoff snapshot', () => {
    expect(source).toMatch(/function reconcileConfirmationGuestHandoffRemoval\(key, previousRaw\)[\s\S]*if \(observed !== null\) return true;/);
    expect(source).toMatch(/if \(observed === null \|\| observed !== previousRaw\) return true;/);
  });

  it('distinguishes rollback failure from an ordinary unverified clear', () => {
    expect(source).toContain("'WEB_AUTH_CONFIRMATION_HANDOFF_CLEAR_ROLLBACK_FAILED'");
    expect(source).toMatch(/if \(!reconcileConfirmationGuestHandoffRemoval\(key, previousRaw\)\)[\s\S]*confirmationGuestHandoffClearRollbackFailure/);
  });

  it('applies the same rollback contract when removeItem itself throws', () => {
    expect(source).toMatch(/let mutationError = null;[\s\S]*localStorage\.removeItem\(key\);[\s\S]*mutationError = error;[\s\S]*if \(mutationError\)[\s\S]*reconcileConfirmationGuestHandoffRemoval\(key, previousRaw\)/);
  });

  it('propagates confirmation handoff rollback failures through the locked cleanup path', () => {
    expect(source).toMatch(/error\.code === 'WEB_AUTH_CONFIRMATION_HANDOFF_CLEAR_FAILED' \|\|[\s\S]*error\.code === 'WEB_AUTH_CONFIRMATION_HANDOFF_CLEAR_ROLLBACK_FAILED'/);
    expect(source).toMatch(/case 'WEB_AUTH_CONFIRMATION_HANDOFF_CLEAR_FAILED':[\s\S]*case 'WEB_AUTH_CONFIRMATION_HANDOFF_CLEAR_ROLLBACK_FAILED':/);
  });

  it('does not report successful promotion when confirmation handoff cleanup is unverified', () => {
    expect(source).toMatch(/response\.ok && payload\?\.ok === true[\s\S]*clearPromotedGuestBearer\(\);[\s\S]*if \(!await clearConfirmationGuestHandoffIfMatches\(memberEmail, guestBearer\)\)[\s\S]*confirmationGuestHandoffClearFailure/);
  });

  it('does not report Guest rejection cleanup when confirmation handoff removal is unverified', () => {
    expect(source).toMatch(/code === 'GUEST_AUTH_REQUIRED'[\s\S]*invalidateGuestSession\(guestBearer\);[\s\S]*if \(!await clearConfirmationGuestHandoffIfMatches\(memberEmail, guestBearer\)\)[\s\S]*confirmationGuestHandoffClearFailure/);
  });

  it('treats an absent exact handoff as already clear without inventing subject identity', () => {
    expect(source).toContain('if (next.length === current.length) return true;');
    expect(source).not.toContain('subjectId');
    expect(source).not.toContain('authUserId');
  });
});