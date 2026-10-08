const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createMobileChatTurnIdV1(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === 'function') {
    const id = randomUUID.call(globalThis.crypto);
    if (UUID_V4.test(id)) return id;
  }

  // A clientTurnId is a scoped replay identifier, not an authentication secret.
  // Some React Native JS engines do not expose Web Crypto.
  const bytes = new Uint8Array(16);
  const getRandomValues = globalThis.crypto?.getRandomValues;
  if (typeof getRandomValues === 'function') {
    getRandomValues.call(globalThis.crypto, bytes);
  } else {
    let clock = Date.now();
    for (let i = 0; i < bytes.length; i++) {
      clock = (clock * 1664525 + 1013904223) >>> 0;
      bytes[i] = (Math.floor(Math.random() * 256) ^ (clock & 255)) & 255;
    }
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((n) => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
