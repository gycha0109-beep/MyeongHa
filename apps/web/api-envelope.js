function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireNonBlankString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WebApiEnvelopeError(`API success envelope is missing ${field}.`);
  }
  return value;
}

export class WebApiEnvelopeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WebApiEnvelopeError';
    this.code = 'WEB_API_MALFORMED_ENVELOPE';
  }
}

export function unwrapApiSuccessEnvelope(payload) {
  if (!isObject(payload) || payload.ok !== true || !Object.prototype.hasOwnProperty.call(payload, 'data')) {
    throw new WebApiEnvelopeError('API response is not a success envelope.');
  }
  if (!isObject(payload.meta)) {
    throw new WebApiEnvelopeError('API success envelope is missing meta.');
  }

  requireNonBlankString(payload.meta.apiContractVersion, 'meta.apiContractVersion');
  requireNonBlankString(payload.meta.requestId, 'meta.requestId');
  const serverTime = requireNonBlankString(payload.meta.serverTime, 'meta.serverTime');
  if (Number.isNaN(Date.parse(serverTime))) {
    throw new WebApiEnvelopeError('API success envelope has an invalid meta.serverTime.');
  }

  return payload.data;
}

export function readApiErrorCode(payload) {
  if (!isObject(payload) || payload.ok !== false || !isObject(payload.error)) return null;
  return typeof payload.error.code === 'string' && payload.error.code.trim().length > 0
    ? payload.error.code
    : null;
}
