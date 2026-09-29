import {
  calculateCurrentSajuV1,
  createBirthProfileV1,
  readCurrentBirthProfileV1,
  type BirthProfileCreateRequestV1,
  type CurrentBirthProfileV1,
  type MyeongHaApiClientV1,
  type SajuCalculationEvidenceV1,
} from '@myeongha/api-client';

import {
  ensureMobileGuestSessionV1,
  type MobileGuestSessionV1,
} from '@/core/auth/guest-session';
import type { MobileGuestCredentialStoreV1 } from '@/core/auth/guest-credential-store';

export type MobileSajuLoadStateV1 =
  | Readonly<{
      kind: 'needs_birth';
      session: MobileGuestSessionV1;
    }>
  | Readonly<{
      kind: 'ready';
      session: MobileGuestSessionV1;
      birthProfile: CurrentBirthProfileV1;
      calculation: SajuCalculationEvidenceV1;
    }>;

export class MobileSajuRuntimeErrorV1 extends Error {
  constructor(
    readonly code:
      | 'MOBILE_SAJU_BIRTH_REVISION_MISMATCH'
      | 'MOBILE_SAJU_BIRTH_CREATE_MISMATCH',
    message: string,
  ) {
    super(message);
    this.name = 'MobileSajuRuntimeErrorV1';
  }
}

function assertCalculationMatchesBirth(
  birthProfile: CurrentBirthProfileV1,
  calculation: SajuCalculationEvidenceV1,
): void {
  if (
    calculation.birthRevisionRef !==
    birthProfile.currentRevision.revisionId
  ) {
    throw new MobileSajuRuntimeErrorV1(
      'MOBILE_SAJU_BIRTH_REVISION_MISMATCH',
      '사주 계산 결과가 현재 명식 revision과 일치하지 않습니다.',
    );
  }
}

async function calculateBoundCurrentSaju(input: {
  readonly client: MyeongHaApiClientV1;
  readonly bearer: string;
  readonly birthProfile: CurrentBirthProfileV1;
}): Promise<SajuCalculationEvidenceV1> {
  const calculation = await calculateCurrentSajuV1(
    input.client,
    input.bearer,
  );
  assertCalculationMatchesBirth(input.birthProfile, calculation);
  return calculation;
}

export async function loadMobileSajuV1(input: {
  readonly client: MyeongHaApiClientV1;
  readonly store: MobileGuestCredentialStoreV1;
}): Promise<MobileSajuLoadStateV1> {
  const session = await ensureMobileGuestSessionV1(input);
  const birthProfile = await readCurrentBirthProfileV1(
    input.client,
    session.credential.bearerToken,
  );

  if (birthProfile === null) {
    return Object.freeze({ kind: 'needs_birth', session });
  }

  const calculation = await calculateBoundCurrentSaju({
    client: input.client,
    bearer: session.credential.bearerToken,
    birthProfile,
  });

  return Object.freeze({
    kind: 'ready',
    session,
    birthProfile,
    calculation,
  });
}

export async function createMobileBirthAndSajuV1(input: {
  readonly client: MyeongHaApiClientV1;
  readonly store: MobileGuestCredentialStoreV1;
  readonly request: BirthProfileCreateRequestV1;
}): Promise<Extract<MobileSajuLoadStateV1, { kind: 'ready' }>> {
  const session = await ensureMobileGuestSessionV1(input);
  const receipt = await createBirthProfileV1(
    input.client,
    session.credential.bearerToken,
    input.request,
  );

  const birthProfile = await readCurrentBirthProfileV1(
    input.client,
    session.credential.bearerToken,
  );
  if (
    birthProfile === null ||
    birthProfile.birthProfileId !== receipt.birthProfileId ||
    birthProfile.currentRevision.revisionId !== receipt.revisionId ||
    birthProfile.currentRevision.revisionNo !== receipt.revisionNo
  ) {
    throw new MobileSajuRuntimeErrorV1(
      'MOBILE_SAJU_BIRTH_CREATE_MISMATCH',
      '생성된 명식과 서버의 현재 명식이 일치하지 않습니다.',
    );
  }

  const calculation = await calculateBoundCurrentSaju({
    client: input.client,
    bearer: session.credential.bearerToken,
    birthProfile,
  });

  return Object.freeze({
    kind: 'ready',
    session,
    birthProfile,
    calculation,
  });
}
