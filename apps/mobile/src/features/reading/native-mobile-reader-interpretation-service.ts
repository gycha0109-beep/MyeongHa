import { nativeMobileRuntimeV1 } from '@/core/runtime/native-mobile-runtime';
import { createMobileReaderInterpretationServiceV1 } from '@/features/reading/mobile-reader-interpretation-service';

/**
 * Fail closed while the server-owned public Reader route remains disabled.
 * This module does not grant entitlements, publish Readers, or synthesize
 * Official Reading / Thread ids from client presentation choices.
 */
export const mobileReaderInterpretationServiceV1 =
  createMobileReaderInterpretationServiceV1({
    client: nativeMobileRuntimeV1.apiClient,
    session: nativeMobileRuntimeV1.subjectSession,
  });
