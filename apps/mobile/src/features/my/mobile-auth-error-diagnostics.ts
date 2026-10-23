import { MyeongHaApiClientErrorV1 } from '@myeongha/api-client';

import { MobileGuestCredentialStoreErrorV1 } from '@/core/auth/guest-credential-store';
import { MobileSocialAuthPendingStoreErrorV1 } from '@/core/auth/mobile-social-auth-pending-store';
import { MobileSubjectSessionErrorV1 } from '@/core/session/mobile-subject-session';

/**
 * Display only fixed failure-category codes, never upstream response bodies,
 * OAuth state, URLs, credentials, token values or nested error causes.
 * This supplements (and does not override) explicit user-facing auth messages.
 */
export function describeMobileAuthDiagnosticV1(error: unknown): string | null {
  if (error instanceof MobileSubjectSessionErrorV1) {
    return error.code === 'MOBILE_GUEST_BOOTSTRAP_FAILED'
      ? '로그인 전 게스트 세션을 준비하지 못했습니다. [GUEST_BOOTSTRAP]'
      : '회원·게스트 세션을 구분할 수 없습니다. [SUBJECT_SESSION]';
  }

  if (error instanceof MobileGuestCredentialStoreErrorV1) {
    if (error.code === 'MOBILE_GUEST_CREDENTIAL_INVALID') {
      return '기기에 보관된 게스트 로그인 정보가 올바르지 않습니다. 기록을 임의로 삭제하지 마세요. [GUEST_STORED_INVALID]';
    }
    return '기기에서 게스트 로그인 정보를 읽거나 저장하지 못했습니다. [GUEST_STORAGE]';
  }

  if (error instanceof MobileSocialAuthPendingStoreErrorV1) {
    if (error.code === 'MOBILE_SOCIAL_AUTH_PENDING_INVALID') {
      return '소셜 로그인 이어가기 정보가 올바르지 않습니다. [SOCIAL_PENDING_INVALID]';
    }
    return '소셜 로그인 이어가기 정보를 기기에 저장하거나 확인하지 못했습니다. [SOCIAL_PENDING_STORAGE]';
  }

  if (error instanceof MyeongHaApiClientErrorV1) {
    if (error.code === 'API_AUTH_RESPONSE_INVALID') {
      return '로그인 서버의 세션 응답을 처리하지 못했습니다. [AUTH_RESPONSE_INVALID]';
    }
    if (error.code === 'API_RESPONSE_NOT_JSON' || error.code === 'API_RESPONSE_INVALID') {
      return '로그인 서버가 예상과 다른 응답을 보냈습니다. [API_RESPONSE_INVALID]';
    }
    const safeCode = /^[A-Z][A-Z0-9_]{1,72}$/u.test(error.code)
      ? error.code
      : 'API_UNKNOWN';
    const status = error.status !== null &&
        Number.isInteger(error.status) && error.status >= 100 && error.status <= 599
      ? ` · HTTP ${error.status}`
      : '';
    return `로그인 요청 오류 [${safeCode}${status}]`;
  }

  return null;
}
