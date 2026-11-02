import { createHmac, timingSafeEqual } from 'node:crypto';

export interface AdminCommandConfirmationV1 {
  readonly actorAuthUserId: string;
  readonly operationId: string;
  readonly payloadHash: string;
  readonly expectedVersion: string;
  readonly expiresAt: number;
}
/** Stateless confirmation survives separate Worker invocations. This is not an
 * authorization credential: Owner verification and durable domain checks remain mandatory. */
export function createAdminCommandConfirmationV1(secret: string) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32 || Buffer.byteLength(secret) > 256) throw new Error('Administrator confirmation signing key unavailable.');
  const mac = (payload: string) => createHmac('sha256', secret).update('admin-command-confirmation-v1.' + payload).digest();
  return Object.freeze({
    issue(evidence: AdminCommandConfirmationV1): string {
      const payload = Buffer.from(JSON.stringify(evidence)).toString('base64url');
      return payload + '.' + mac(payload).toString('base64url');
    },
    verify(token: string, now: number): AdminCommandConfirmationV1 | null {
      try {
        if (token.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)) return null;
        const [payload,signature] = token.split('.'); const expected = mac(payload!); const actual = Buffer.from(signature!,'base64url');
        if (actual.length !== expected.length || !timingSafeEqual(actual,expected)) return null;
        const evidence = JSON.parse(Buffer.from(payload!,'base64url').toString('utf8')) as AdminCommandConfirmationV1;
        if (!evidence || typeof evidence !== 'object' || !Number.isSafeInteger(evidence.expiresAt) || evidence.expiresAt <= now ||
            evidence.expiresAt > now + 5 * 60_000 || !/^[a-f0-9]{64}$/u.test(evidence.payloadHash) ||
            typeof evidence.expectedVersion !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/u.test(evidence.expectedVersion)) return null;
        return evidence;
      } catch { return null; }
    },
  });
}
