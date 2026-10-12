import { describe, expect, it } from 'vitest';
import {
  createProductionSeyeonTurnSendRuntimeV1,
} from '../apps/api/src/production-seyeon-turn-send-runtime-v1.js';

const THREAD = '123e4567-e89b-42d3-a456-426614174000';
const CLIENT_TURN = '423e4567-e89b-42d3-a456-426614174000';

describe('Production Se-yeon turn-send disclosure composition boundary', () => {
  it('returns fail-closed before paid provider/OIDC/database initialization when no DB Reveal owner is provided', async () => {
    let oidcCalls = 0;
    let verifiedCalls = 0;
    const runtime = createProductionSeyeonTurnSendRuntimeV1({
      env: {
        MYEONGHA_DATABASE_URL:
          'postgres://synthetic_login:synthetic_password@localhost:5432/disposable?sslmode=require',
        MYEONGHA_DATABASE_PRINCIPAL: 'synthetic_login',
        MYEONGHA_DATABASE_TLS_PEER_MODE: 'verify-full',
        MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM: 'synthetic-root-certificate-not-for-network',
        MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
        MYEONGHA_SUPABASE_API_KEY: 'synthetic-key-for-test-no-network',
        MYEONGHA_GUEST_FINGERPRINT_SECRET: 'synthetic-secret-not-for-network-123456789',
      },
      identityEvidenceVerifier: {
        verifyRequestIdentity: async () => {
          verifiedCalls += 1;
          return { kind: 'member' as const, verifiedAuthUserId: 'synthetic-user' };
        },
      },
      oidcTokenProvider: async () => {
        oidcCalls += 1;
        throw new Error('OIDC provider must not be reached');
      },
      // Do NOT inject controlledDisclosurePort: no DB Owner authorization exists.
    });

    try {
      const response = await runtime.handleRequest({
        request: new Request(
          'https://myeongha.internal/api/chat/' + THREAD + '/turns',
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              clientTurnId: CLIENT_TURN,
              text: '합성 요청입니다.',
            }),
          },
        ),
        requestId: 'synthetic-disclosure-no-authority',
        serverTime: '2026-10-12T00:00:00.000Z',
      });
      expect(verifiedCalls).toBe(1);
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const payload = await response.json();
      expect(payload.error).toEqual({
        code: 'CHAT_DISCLOSURE_UNAVAILABLE',
        messageKey: 'chat.disclosure_unavailable',
        retryable: false,
      });
      expect(oidcCalls).toBe(0);
    } finally {
      await runtime.close();
    }
  });
});
