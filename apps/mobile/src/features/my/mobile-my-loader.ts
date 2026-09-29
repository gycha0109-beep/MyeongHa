import type {
  CurrentBirthProfileV1,
  CurrentSubjectProfileV1,
} from '@myeongha/api-client';

import type { MobileMyServiceV1 } from './mobile-my-service.js';

export type MobileMyProfileStateV1 =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'ready'; profile: CurrentSubjectProfileV1 }>
  | Readonly<{ kind: 'error' }>;

export type MobileMyBirthStateV1 =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'empty' }>
  | Readonly<{ kind: 'ready'; birth: CurrentBirthProfileV1 }>
  | Readonly<{ kind: 'error' }>;

export interface MobileMyStateV1 {
  readonly profile: MobileMyProfileStateV1;
  readonly birth: MobileMyBirthStateV1;
}

export const MOBILE_MY_LOADING_STATE_V1: MobileMyStateV1 = Object.freeze({
  profile: Object.freeze({ kind: 'loading' }),
  birth: Object.freeze({ kind: 'loading' }),
});

export async function loadMobileMyV1(
  service: Pick<MobileMyServiceV1, 'readProfile' | 'readBirth'>,
): Promise<MobileMyStateV1> {
  const [profileResult, birthResult] = await Promise.allSettled([
    service.readProfile(),
    service.readBirth(),
  ]);

  const profile: MobileMyProfileStateV1 =
    profileResult.status === 'fulfilled'
      ? Object.freeze({ kind: 'ready', profile: profileResult.value })
      : Object.freeze({ kind: 'error' });

  const birth: MobileMyBirthStateV1 =
    birthResult.status === 'rejected'
      ? Object.freeze({ kind: 'error' })
      : birthResult.value === null
        ? Object.freeze({ kind: 'empty' })
        : Object.freeze({ kind: 'ready', birth: birthResult.value });

  return Object.freeze({ profile, birth });
}

export async function reloadMobileMyProfileV1(
  service: Pick<MobileMyServiceV1, 'readProfile'>,
): Promise<MobileMyProfileStateV1> {
  try {
    return Object.freeze({ kind: 'ready', profile: await service.readProfile() });
  } catch {
    return Object.freeze({ kind: 'error' });
  }
}

export async function reloadMobileMyBirthV1(
  service: Pick<MobileMyServiceV1, 'readBirth'>,
): Promise<MobileMyBirthStateV1> {
  try {
    const birth = await service.readBirth();
    return birth === null
      ? Object.freeze({ kind: 'empty' })
      : Object.freeze({ kind: 'ready', birth });
  } catch {
    return Object.freeze({ kind: 'error' });
  }
}
