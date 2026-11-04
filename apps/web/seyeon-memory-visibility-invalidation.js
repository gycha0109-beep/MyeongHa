// Watchtower-Track: security
// Browser presentation invalidation only. A notification is not a DB Grant,
// revocation ACK, authorization proof, or permission to replay history.
export const SEYEON_MEMORY_VISIBILITY_INVALIDATION_V1 =
  'myeongha:seyeon-memory-visibility-invalidation-v1';
const CHANNEL = 'myeongha-seyeon-memory-visibility-v1';

function broadcastFactory() {
  return typeof BroadcastChannel === 'function' ? BroadcastChannel : null;
}

/** Called only after the revoke endpoint returned an exact Member ACK
 * (withdrawal_pending/newUseBlocked or committed). Publish NO identifiers,
 * text, credentials, grants, or cached personal content to another tab.
 */
export function publishSeyeonMemoryVisibilityInvalidationV1() {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(SEYEON_MEMORY_VISIBILITY_INVALIDATION_V1));
  }
  const Factory = broadcastFactory();
  if (!Factory) return;
  try {
    const channel = new Factory(CHANNEL);
    channel.postMessage({ version: 'v1', action: 'invalidate' });
    channel.close();
  } catch {
    // Cross-tab broadcast is best effort. The local UI must still invalidate.
  }
}

/** Callbacks only CLEAR already-rendered private presentation; they MUST NOT
 * authorize a read or grant access. A forged event can at most hide content.
 */
export function subscribeSeyeonMemoryVisibilityInvalidationV1(callback) {
  if (typeof callback !== 'function') throw new TypeError('Callback required');
  const local = () => callback();
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener(SEYEON_MEMORY_VISIBILITY_INVALIDATION_V1, local);
  }
  let channel = null;
  const Factory = broadcastFactory();
  const remote = (event) => {
    if (event?.data?.version === 'v1' && event.data.action === 'invalidate' &&
        Object.keys(event.data).length === 2) callback();
  };
  if (Factory) {
    try {
      channel = new Factory(CHANNEL);
      channel.addEventListener('message', remote);
    } catch {
      channel = null;
    }
  }
  return () => {
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener(SEYEON_MEMORY_VISIBILITY_INVALIDATION_V1, local);
    }
    if (channel) {
      channel.removeEventListener('message', remote);
      channel.close();
    }
  };
}
