import {
  isGuestCredentialExpiredV1,
  promoteGuestToNewMemberV1,
  signInMemberV1,
  signUpMemberV1,
  type GuestCredentialV1,
  type GuestPromotionReceiptV1,
  type MemberSessionV1,
  type MyeongHaApiClientV1,
} from '@myeongha/api-client';

import type { MobileGuestCredentialStoreV1 } from '@/core/auth/guest-credential-store';
import type {
  MobileNewMemberEnrollmentStoreV1,
  PendingNewMemberEnrollmentV1,
} from '@/core/auth/new-member-enrollment-store';
import type { MobileMemberSessionStoreV1 } from '@/core/auth/member-session-store';
import type { MobileSubjectSessionCoordinatorV1 } from '@/core/session/mobile-subject-session';

export type MobileNewMemberEnrollmentErrorCodeV1 =
  | 'MOBILE_NEW_MEMBER_ENROLLMENT_NOT_PENDING'
  | 'MOBILE_NEW_MEMBER_GUEST_CHANGED';

export class MobileNewMemberEnrollmentErrorV1 extends Error {
  constructor(
    readonly code: MobileNewMemberEnrollmentErrorCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'MobileNewMemberEnrollmentErrorV1';
  }
}

export type MobileNewMemberEnrollmentResultV1 =
  | Readonly<{
      status: 'authenticated';
      session: MemberSessionV1;
      promotion: GuestPromotionReceiptV1;
    }>
  | Readonly<{
      status: 'verification_required';
      email: string;
    }>;

export interface MobileNewMemberEnrollmentServiceV1 {
  readPending(): Promise<PendingNewMemberEnrollmentV1 | null>;
  start(email: string, password: string): Promise<MobileNewMemberEnrollmentResultV1>;
  continueAfterVerification(
    email: string,
    password: string,
  ): Promise<Extract<MobileNewMemberEnrollmentResultV1, { status: 'authenticated' }>>;
  cancelPending(): Promise<void>;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function createMobileNewMemberEnrollmentServiceV1(input: {
  readonly client: MyeongHaApiClientV1;
  readonly subjectSession: Pick<MobileSubjectSessionCoordinatorV1, 'acquireGuestCredential'>;
  readonly guestStore: Pick<MobileGuestCredentialStoreV1, 'read' | 'clear'>;
  readonly memberStore: Pick<MobileMemberSessionStoreV1, 'write'>;
  readonly pendingStore: MobileNewMemberEnrollmentStoreV1;
  readonly nowEpochMs?: () => number;
}): MobileNewMemberEnrollmentServiceV1 {
  const nowEpochMs = input.nowEpochMs ?? Date.now;

  async function commitNewMember(
    session: MemberSessionV1,
    guestCredential: GuestCredentialV1,
  ): Promise<Extract<MobileNewMemberEnrollmentResultV1, { status: 'authenticated' }>> {
    const promotion = await promoteGuestToNewMemberV1(
      input.client,
      session.accessToken,
      guestCredential,
    );

    const persistedSession = await input.memberStore.write(session);
    try {
      await input.guestStore.clear(guestCredential.bearerToken);
    } catch {
      // The promoted Guest credential has already lost server authority.
    }
    try {
      await input.pendingStore.clear();
    } catch {
      // A stale pending marker cannot override the persisted Member session.
    }

    return Object.freeze({
      status: 'authenticated' as const,
      session: persistedSession,
      promotion,
    });
  }

  async function requirePendingGuest(
    email: string,
  ): Promise<GuestCredentialV1> {
    const pending = await input.pendingStore.read();
    if (pending === null || pending.email !== normalizeEmail(email)) {
      throw new MobileNewMemberEnrollmentErrorV1(
        'MOBILE_NEW_MEMBER_ENROLLMENT_NOT_PENDING',
        '새 회원 가입 이어가기 상태를 찾을 수 없습니다.',
      );
    }

    const guest = await input.guestStore.read();
    if (
      guest === null ||
      isGuestCredentialExpiredV1(guest, nowEpochMs()) ||
      guest.subjectId !== pending.guestSubjectId ||
      guest.guestSessionId !== pending.guestSessionId
    ) {
      throw new MobileNewMemberEnrollmentErrorV1(
        'MOBILE_NEW_MEMBER_GUEST_CHANGED',
        '가입을 시작한 게스트 세션과 현재 세션이 다릅니다.',
      );
    }
    return guest;
  }

  return Object.freeze({
    readPending() {
      return input.pendingStore.read();
    },

    async start(email: string, password: string) {
      const guest = await input.subjectSession.acquireGuestCredential();
      const signUp = await signUpMemberV1(input.client, email, password);
      const pendingEmail = signUp.status === 'verification_required'
        ? signUp.email
        : normalizeEmail(email);

      await input.pendingStore.write({
        email: pendingEmail,
        guestSubjectId: guest.subjectId,
        guestSessionId: guest.guestSessionId,
      });

      if (signUp.status === 'verification_required') return signUp;
      return commitNewMember(signUp.session, guest);
    },

    async continueAfterVerification(email: string, password: string) {
      const guest = await requirePendingGuest(email);
      const session = await signInMemberV1(input.client, email, password);
      return commitNewMember(session, guest);
    },

    cancelPending() {
      return input.pendingStore.clear();
    },
  });
}
