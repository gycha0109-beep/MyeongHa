// This module checks only which browser session may display a late API response.
// The server still determines Reading ownership and authorization.
function memberKey(session) {
  const id = session?.user?.id;
  return typeof id === 'string' && id.trim() ? id : null;
}

export function captureReadingResponseOwnerV1(credential, memberSession, guestCredential) {
  if (credential?.kind === 'member') {
    const key = memberKey(memberSession);
    if (!key || memberSession.accessToken !== credential.token) return null;
    return Object.freeze({ kind: 'member', key });
  }
  if (credential?.kind === 'guest') {
    if (memberSession !== null || guestCredential !== credential.token ||
      typeof guestCredential !== 'string' || !guestCredential) return null;
    return Object.freeze({ kind: 'guest', key: guestCredential });
  }
  return null;
}

export function isReadingResponseOwnerCurrentV1(snapshot, memberSession, guestCredential) {
  if (snapshot?.kind === 'member') {
    return memberKey(memberSession) !== null && memberKey(memberSession) === snapshot.key;
  }
  if (snapshot?.kind === 'guest') {
    return memberSession === null && guestCredential === snapshot.key;
  }
  return false;
}
