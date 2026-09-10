import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const authPage = readFileSync(join(root, 'apps', 'web', 'auth-page.js'), 'utf8');
const promotionRuntime = readFileSync(
  join(root, 'apps', 'api', 'src', 'production-guest-promotion-runtime.ts'),
  'utf8',
);

describe('web Guest promotion rejection contract', () => {
  it('distinguishes which promotion credential was rejected by HTTP 401', () => {
    expect(promotionRuntime).toContain("return failure('GUEST_AUTH_REQUIRED', 401, requestId)");
    expect(promotionRuntime).toContain("return failure('MEMBER_AUTH_REQUIRED', 401, requestId)");
    expect(promotionRuntime).not.toContain("return failure('AUTH_REQUIRED', 401, requestId)");
  });

  it('invalidates only the exact rejected credential while preserving recoverable failures', () => {
    expect(authPage).toContain("if (code === 'MEMBER_AUTH_REQUIRED')");
    expect(authPage).toContain('invalidateMemberSession(accessToken)');
    expect(authPage).not.toContain('invalidateMemberSession()');
    expect(authPage).toContain("if (code === 'GUEST_AUTH_REQUIRED')");
    expect(authPage).toContain('invalidateGuestSession(guestBearer)');
    expect(authPage).not.toContain('invalidateGuestSession()');
    expect(authPage).toContain('await clearConfirmationGuestHandoffIfMatches(memberEmail, guestBearer)');
    expect(authPage).toContain("return { status: 'auth-rejected' }");
    expect(authPage).toContain("return { status: 'preserved' }");
  });

  it('does not navigate after Member or ambiguous promotion auth rejection', () => {
    expect(authPage).toContain("if (promotion.status === 'member-rejected')");
    expect(authPage).toContain("if (promotion.status === 'auth-rejected')");
    expect(authPage).toContain('로그인 세션이 서버에서 거부되었습니다. 다시 로그인해 주세요.');
    expect(authPage).toContain('로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요.');
  });

  it('binds Guest promotion to the exact canonical Member generation under the shared mutation lock', () => {
    expect(authPage).toContain("const MEMBER_MUTATION_LOCK_NAME = 'myeongha.memberSession.v1.refresh.lock'");
    expect(authPage).toContain('async function withCanonicalMemberPromotionAuthority(expectedSession, operation)');
    expect(authPage).toContain('current.accessToken !== expectedSession?.accessToken');
    expect(authPage).toContain('current.refreshToken !== expectedSession?.refreshToken');
    expect(authPage).toContain("return Object.freeze({ status: 'superseded' })");
    expect(authPage).toContain("locks.request(MEMBER_MUTATION_LOCK_NAME, { mode: 'exclusive' }, run)");
    expect(authPage).toContain('const promotion = await withCanonicalMemberPromotionAuthority(');
    expect(authPage).toContain("if (promotion.status === 'superseded')");
  });
});
