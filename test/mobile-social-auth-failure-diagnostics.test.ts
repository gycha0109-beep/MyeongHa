import { describe, expect, it } from 'vitest';

import { MyeongHaApiClientErrorV1 } from '../packages/api-client/src/http.js';
import { MobileGuestCredentialStoreErrorV1 } from '../apps/mobile/src/core/auth/guest-credential-store.js';
import { MobileSubjectSessionErrorV1 } from '../apps/mobile/src/core/session/mobile-subject-session.js';
import { MobileSocialAuthPendingStoreErrorV1 } from '../apps/mobile/src/core/auth/mobile-social-auth-pending-store.js';
import { describeMobileAuthDiagnosticV1 } from '../apps/mobile/src/features/my/mobile-auth-error-diagnostics.js';

describe('mobile social login error diagnostics are clear and token-safe', () => {
  it('distinguishes failed guest bootstrap before any provider authorization', () => {
    const error = new MobileSubjectSessionErrorV1(
      'MOBILE_GUEST_BOOTSTRAP_FAILED',
      'sensitive upstream response',
    );
    const view = describeMobileAuthDiagnosticV1(error);
    expect(view).toContain('GUEST_BOOTSTRAP');
    expect(view).not.toContain('sensitive');
  });

  it('distinguishes secure guest and pending state failures without recommending destructive reset', () => {
    const stored = describeMobileAuthDiagnosticV1(new MobileGuestCredentialStoreErrorV1(
      'MOBILE_GUEST_CREDENTIAL_INVALID',
      'sensitive stored session',
    ));
    const pending = describeMobileAuthDiagnosticV1(new MobileSocialAuthPendingStoreErrorV1(
      'MOBILE_SOCIAL_AUTH_PENDING_WRITE_FAILED',
      'secret pending oauth state',
    ));
    expect(stored).toContain('GUEST_STORED_INVALID');
    expect(stored).toContain('임의로 삭제하지 마세요');
    expect(pending).toContain('SOCIAL_PENDING_STORAGE');
    expect(stored).not.toContain('sensitive');
    expect(pending).not.toContain('secret');
  });

  it('reports sanitized server error codes while redacting unknown provider text', () => {
    const known = describeMobileAuthDiagnosticV1(new MyeongHaApiClientErrorV1(
      'http', 'SOCIAL_AUTH_PROVIDER_DISABLED', 'token=SECRET', 503,
    ));
    const malformed = describeMobileAuthDiagnosticV1(new MyeongHaApiClientErrorV1(
      'http', 'response?token=SECRET', 'token=SECRET', 418,
    ));
    expect(known).toContain('SOCIAL_AUTH_PROVIDER_DISABLED');
    expect(known).toContain('HTTP 503');
    expect(malformed).toContain('API_UNKNOWN');
    expect(malformed).not.toContain('SECRET');
  });

  it('never echoes Error.message for unexpected errors', () => {
    expect(describeMobileAuthDiagnosticV1(new Error('secret=abc'))).toBeNull();
  });
});
