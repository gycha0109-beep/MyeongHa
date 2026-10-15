import { describe, expect, it } from 'vitest';
import {
  classifySupabaseAuthApiKeyV1,
  isLeastPrivilegeSupabaseAuthApiKeyV1,
} from '../apps/api/src/supabase-auth-api-key-least-privilege.js';

function fakeLegacyKey(role: string, algorithm = 'HS256'): string {
  // Synthetic JWT only. No project key, signature or customer token.
  return [
    Buffer.from(JSON.stringify({ typ: 'JWT', alg: algorithm })).toString('base64url'),
    Buffer.from(JSON.stringify({ role, iss: 'supabase' })).toString('base64url'),
    'synthetic_signature_for_local_policy_tests',
  ].join('.');
}

describe('Supabase Auth API key least-privilege local policy', () => {
  it('accepts only publishable or legitimate-class legacy anon shapes', () => {
    const publishable = 'sb_publishable_synthetic_test_material_1234567890';
    const legacyAnon = fakeLegacyKey('anon');
    expect(classifySupabaseAuthApiKeyV1(publishable)).toBe('publishable');
    expect(isLeastPrivilegeSupabaseAuthApiKeyV1(publishable)).toBe(true);
    expect(classifySupabaseAuthApiKeyV1(legacyAnon)).toBe('legacy_anon');
    expect(isLeastPrivilegeSupabaseAuthApiKeyV1(legacyAnon)).toBe(true);
  });

  it('rejects new secret keys and legacy service_role without logging contents', () => {
    const sensitive = [
      'sb_secret_synthetic_test_material_1234567890',
      fakeLegacyKey('service_role'),
    ];
    for (const candidate of sensitive) {
      expect(classifySupabaseAuthApiKeyV1(candidate)).toBe('privileged');
      expect(isLeastPrivilegeSupabaseAuthApiKeyV1(candidate)).toBe(false);
    }
  });

  it('rejects malformed, short, unknown-role, unsigned and ambiguous values', () => {
    const unexpected = [
      null,
      '',
      'short',
      'sb_publishable_short',
      'sb_publishable_synthetic_test_material_1234567890 ',
      'sb_unknown_synthetic_test_material_1234567890',
      fakeLegacyKey('authenticated'),
      fakeLegacyKey('anon', 'none'),
      'header.not_base64.signature',
      'header.payload.signature',
      'some-long-arbitrary-password-material',
    ];
    for (const value of unexpected) {
      expect(classifySupabaseAuthApiKeyV1(value)).toBe('unrecognized');
      expect(isLeastPrivilegeSupabaseAuthApiKeyV1(value)).toBe(false);
    }
  });

  it('does not mistake the JWT user bearer for an application API key', () => {
    const userBearer = fakeLegacyKey('authenticated');
    expect(isLeastPrivilegeSupabaseAuthApiKeyV1(userBearer)).toBe(false);
    // End-user bearer is forwarded separately on the Authorization header;
    // only the named API key is subject to this app-key classification.
  });
});
