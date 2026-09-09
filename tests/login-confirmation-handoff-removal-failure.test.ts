import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'apps', 'web', 'auth-page.js'), 'utf8');

describe('confirmation handoff removal authority', () => {
  it('verifies authoritative journal removal by direct read-back', () => {
    expect(source).toContain("'WEB_AUTH_CONFIRMATION_HANDOFF_CLEAR_FAILED'");
    expect(source).toMatch(/function removeConfirmationGuestHandoffLocal\(key\)[\s\S]*localStorage\.removeItem\(key\);[\s\S]*localStorage\.getItem\(key\) === null/);
    expect(source).toContain('removeConfirmationGuestHandoffLocal(key);');
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
