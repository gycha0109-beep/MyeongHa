/**
 * Device-local notification of a VERIFIED credential-store mutation.
 *
 * Consumers invalidate owner-scoped UI caches; this event conveys no bearer,
 * Subject identity, authentication outcome, or server authorization.
 * Callers must emit only AFTER durable write/clear verification succeeds.
 */
type MobileCredentialChangeListenerV1 = () => void;
const listeners = new Set<MobileCredentialChangeListenerV1>();

export function subscribeMobileSubjectCredentialChangesV1(
  listener: MobileCredentialChangeListenerV1,
): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Internal native-session-store signal. Never use as a Grant or auth proof. */
export function emitMobileSubjectCredentialChangedV1(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // Cache invalidation observers cannot roll back an already-committed
      // credential mutation or suppress notifications to other screens.
    }
  }
}
