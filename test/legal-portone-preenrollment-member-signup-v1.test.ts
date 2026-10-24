import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  handleSupabaseAuthRequestV1,
  type SupabasePreenrollmentMemberBindingPortV1,
} from '../apps/api/src/supabase-auth-http.js';

const env = {
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY: 'test-publishable-key-that-is-long-enough',
  MYEONGHA_PORTONE_VERIFIED_AGE_ENFORCEMENT: 'ENFORCE',
  MYEONGHA_PORTONE_IDENTITY_MIGRATION_STATE: 'APPROVED_AND_APPLIED',
  MYEONGHA_PORTONE_IDENTITY_PRIVACY_DISPOSITION_STATE: 'APPROVED',
};
const id = '22222222-2222-4222-8222-222222222222';
const request = () => new Request('https://myeongha.vercel.app/api/auth/sign-up', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'new@example.com', password: 'strong-test-password' }),
});
const guard = { check: async () => ({ status: 'clear' as const }) };
const proof = (verified: boolean): SupabasePreenrollmentMemberBindingPortV1 => ({
  readVerified: vi.fn(async () => verified),
  bindMember: vi.fn(async () => undefined),
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('A1 Member signup verified preenrollment binding', () => {
  it('denies OFF/absent proof and never calls Supabase', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const result = await handleSupabaseAuthRequestV1({
      request: request(), action: 'sign-up', env,
      passwordCompromiseGuard: guard,
    });
    expect(result.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects missing server-verified age before Supabase creates a user', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const port = proof(false);
    const result = await handleSupabaseAuthRequestV1({
      request: request(), action: 'sign-up', env,
      passwordCompromiseGuard: guard, preenrollmentMemberPort: port,
    });
    expect(result.status).toBe(403);
    expect((await result.json()).error.code).toBe('AGE_VERIFICATION_REQUIRED');
    expect(fetch).not.toHaveBeenCalled();
    expect(port.bindMember).not.toHaveBeenCalled();
  });

  it('binds only a UUID returned from trusted Supabase upstream, before success response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      id, email: 'new@example.com',
    })));
    const port = proof(true);
    const result = await handleSupabaseAuthRequestV1({
      request: request(), action: 'sign-up', env,
      passwordCompromiseGuard: guard, preenrollmentMemberPort: port,
    });
    expect(result.status).toBe(200);
    expect((await result.json()).data.status).toBe('verification_required');
    expect(port.readVerified).toHaveBeenCalledOnce();
    expect(port.bindMember).toHaveBeenCalledExactlyOnceWith(id);
  });

  it('withholds session if the canonical Subject/age binding fails or upstream ID is absent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      id, email: 'new@example.com',
      access_token: 'token', refresh_token: 'refresh', expires_in: 3600,
    })));
    const port: SupabasePreenrollmentMemberBindingPortV1 = {
      readVerified: async () => true,
      bindMember: vi.fn(async () => { throw new Error('Age DB unavailable'); }),
    };
    const response = await handleSupabaseAuthRequestV1({
      request: request(), action: 'sign-up', env,
      passwordCompromiseGuard: guard, preenrollmentMemberPort: port,
    });
    expect(response.status).toBe(503);
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain('token');
    expect(body).not.toContain('refresh');
    expect(body).not.toContain(id);
    expect(port.bindMember).toHaveBeenCalledWith(id);
  });
});
