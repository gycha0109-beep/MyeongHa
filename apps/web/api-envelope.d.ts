// Static browser contract for the existing runtime JS module.
export class WebApiEnvelopeError extends Error {
  readonly code: string;
}
export function unwrapApiSuccessEnvelope(payload: unknown): unknown;
export function readApiErrorCode(payload: unknown): string | null;
