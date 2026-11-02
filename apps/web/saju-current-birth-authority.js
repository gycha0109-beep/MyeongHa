// The calculation service and birth profile reader independently resolve the
// current subject. Never trust a tab-local ID for displayed personal birth facts.
export const CURRENT_SAJU_BIRTH_PROFILE_ENDPOINT_V1 = '/api/me/birth-profile';

export class CurrentSajuBirthProfileErrorV1 extends Error {
  constructor(operation, status, code) {
    super('Current self Birth Profile request failed.');
    this.name = 'CurrentSajuBirthProfileErrorV1';
    this.operation = operation;
    this.status = status;
    this.code = code;
  }
}

export async function readCurrentSajuBirthProfileV1(token, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(CURRENT_SAJU_BIRTH_PROFILE_ENDPOINT_V1, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    credentials: 'same-origin',
    cache: 'no-store',
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new CurrentSajuBirthProfileErrorV1('birth-current-read', response.status, 'MALFORMED_RESPONSE');
  }
  if (!response.ok) {
    throw new CurrentSajuBirthProfileErrorV1(
      'birth-current-read', response.status, payload?.error?.code ?? null,
    );
  }
  if (payload?.ok !== true || !payload.data ||
      !Object.prototype.hasOwnProperty.call(payload.data, 'birthProfile')) {
    throw new CurrentSajuBirthProfileErrorV1('birth-current-read', response.status, 'MALFORMED_RESPONSE');
  }
  const profile = payload.data.birthProfile;
  if (profile === null) return null;
  if (!profile || typeof profile !== 'object' ||
      typeof profile.birthProfileId !== 'string' || !profile.birthProfileId.trim() ||
      profile.profileKind !== 'self' || profile.archivedAt !== null ||
      typeof profile.currentRevision?.revisionId !== 'string' ||
      !profile.currentRevision.revisionId.trim() ||
      !profile.currentRevision.input || typeof profile.currentRevision.input !== 'object') {
    throw new CurrentSajuBirthProfileErrorV1('birth-current-read', response.status, 'MALFORMED_RESPONSE');
  }
  return profile;
}

export function matchCurrentSajuBirthProfileV1(profile, calculation) {
  // Both independently authorized reads must belong to the SAME current birth
  // revision; a concurrent correction must never mix old facts and new pillars.
  return profile?.currentRevision?.revisionId &&
    typeof calculation?.birthRevisionRef === 'string' &&
    profile.currentRevision.revisionId === calculation.birthRevisionRef
    ? profile : null;
}
