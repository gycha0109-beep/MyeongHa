const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/**
 * S7 server-side receipt idempotency must be backed by a CSPRNG.
 * Normal Chat's non-secret correlation ID generator is NOT suitable:
 * its compatibility fallback may use Math.random when Web Crypto is absent.
 *
 * No random source => do not make the paid Reader disclosure request.
 */
export function createMobilePaidReaderDeliveryRequestIdV1(): string {
  const crypto = globalThis.crypto;
  if (crypto && typeof crypto.randomUUID === 'function') {
    const value = crypto.randomUUID();
    if (typeof value === 'string' && UUID_V4.test(value.toLowerCase())) {
      return value.toLowerCase();
    }
  }
  if (!crypto || typeof crypto.getRandomValues !== 'function') {
    throw new Error('Secure Reader delivery request identity unavailable.');
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const value =
    hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) +
    '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  if (!UUID_V4.test(value)) throw new Error('Secure Reader delivery identity invalid.');
  return value;
}
