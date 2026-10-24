import type {
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';

/**
 * Cloudflare Workers cannot reuse a PostgreSQL socket across HTTP requests.
 * This factory must be called from within one request handler, NOT module scope.
 *
 * Deliberately accepts no SQL URL, credentials or Cloudflare binding itself:
 * the later approved adapter must supply a pool built from the governed
 * verify-full CA and nonprivileged execution-role configuration.
 *
 * The returned pool is never cached. Existing
 * executePostgresSubjectTransactionV1 remains the sole authority for
 * BEGIN / SET LOCAL ROLE / canonical subject / RLS / COMMIT-or-ROLLBACK.
 */
export interface CloudflareRequestSubjectPoolV1 extends PostgresSubjectPoolV1 {
  close(): Promise<void>;
}

export interface CloudflareRequestSubjectScopeInputV1<T> {
  readonly createPool: () =>
    CloudflareRequestSubjectPoolV1 | Promise<CloudflareRequestSubjectPoolV1>;
  readonly execute: (pool: PostgresSubjectPoolV1) => T | Promise<T>;
}

/**
 * Own precisely one request-scoped pool and always await its closure.
 * Neither a successful transaction nor an exception may leave a pool to be
 * used by the next Worker request. A retained connect handle is revoked
 * before close() begins.
 */
export async function withCloudflareRequestSubjectScopeV1<T>(
  input: CloudflareRequestSubjectScopeInputV1<T>,
): Promise<T> {
  const source = await input.createPool();
  let active = true;

  // Only expose connect(): callers cannot close/reopen or retrieve the
  // underlying pool and cannot intentionally share the pool between requests.
  const scoped: PostgresSubjectPoolV1 = Object.freeze({
    async connect(): Promise<PostgresSubjectConnectionV1> {
      if (!active) {
        throw new Error('Cloudflare PostgreSQL request scope has ended.');
      }

      const connection = await source.connect();

      // A pending connection attempt could resolve after execute() has
      // already finished. Discard it rather than lending it to another scope.
      if (!active) {
        connection.release(new Error('Cloudflare PostgreSQL request scope ended during connect.'));
        throw new Error('Cloudflare PostgreSQL request scope has ended.');
      }
      return connection;
    },
  });

  let failed = false;
  let operationError: unknown;
  let value!: T;

  try {
    value = await input.execute(scoped);
  } catch (error) {
    failed = true;
    operationError = error;
  }

  active = false;
  try {
    await source.close();
  } catch (closeError) {
    if (failed) {
      throw new AggregateError(
        [operationError, closeError],
        'Cloudflare PostgreSQL request and connection cleanup both failed.',
      );
    }
    throw closeError;
  }

  if (failed) throw operationError;
  return value;
}
