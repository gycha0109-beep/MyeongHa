import type { ApiErrorCode } from '../../../packages/contracts/src/index.js';

/**
 * Shared API-layer command error.
 *
 * This primitive is transport/domain-neutral within the API package. Domain modules
 * should depend on this module rather than on another domain entrypoint such as
 * `chat-receive.ts`.
 */
export class ApiCommandError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiCommandError';
  }
}
