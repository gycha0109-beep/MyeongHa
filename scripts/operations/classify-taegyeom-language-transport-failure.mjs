// Watchtower-Track: character-runtime-lab
// Keep transport diagnostics actionable without disclosing requests, credentials,
// response bodies, provider headers, or arbitrary upstream error messages.
const NETWORK_CODES = new Set([
  'EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET',
  'ETIMEDOUT', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET',
  'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export function classifyTaegyeomLanguageTransportFailure(error) {
  if (error && typeof error === 'object' &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return 'LANGUAGE_AB_TRANSPORT_TIMEOUT_HOLD';
  }
  const cause = error && typeof error === 'object' ? error.cause : null;
  const code = cause && typeof cause === 'object' ? cause.code : null;
  if (typeof code === 'string' && NETWORK_CODES.has(code)) {
    return 'LANGUAGE_AB_TRANSPORT_' + code + '_HOLD';
  }
  return 'LANGUAGE_AB_TRANSPORT_UNCLASSIFIED_HOLD';
}
