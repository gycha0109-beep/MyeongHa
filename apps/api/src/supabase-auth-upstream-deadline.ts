export const SUPABASE_AUTH_UPSTREAM_DEFAULT_TIMEOUT_MS_V1 = 5_000 as const;
export const SUPABASE_AUTH_UPSTREAM_MAX_TIMEOUT_MS_V1 = 30_000 as const;

export type SupabaseAuthUpstreamFetchV1 = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface SupabaseAuthUpstreamDeadlineLeaseV1 {
  readonly response: Response;
  readonly signal: AbortSignal;
  readonly release: () => void;
}

export class SupabaseAuthUpstreamDeadlineConfigErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseAuthUpstreamDeadlineConfigErrorV1';
  }
}

export function requireSupabaseAuthUpstreamTimeoutMsV1(
  value: number = SUPABASE_AUTH_UPSTREAM_DEFAULT_TIMEOUT_MS_V1,
): number {
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > SUPABASE_AUTH_UPSTREAM_MAX_TIMEOUT_MS_V1
  ) {
    throw new SupabaseAuthUpstreamDeadlineConfigErrorV1(
      `Supabase Auth upstream timeout must be an integer from 1 to ${SUPABASE_AUTH_UPSTREAM_MAX_TIMEOUT_MS_V1} ms.`,
    );
  }
  return value;
}

export async function fetchSupabaseAuthWithDeadlineV1(
  fetchImpl: SupabaseAuthUpstreamFetchV1,
  input: string | URL | Request,
  init: Omit<RequestInit, 'signal'>,
  timeoutMs: number = SUPABASE_AUTH_UPSTREAM_DEFAULT_TIMEOUT_MS_V1,
): Promise<SupabaseAuthUpstreamDeadlineLeaseV1> {
  const resolvedTimeoutMs = requireSupabaseAuthUpstreamTimeoutMsV1(timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolvedTimeoutMs);
  let released = false;

  const release = (): void => {
    if (released) return;
    released = true;
    clearTimeout(timeout);
  };

  try {
    const response = await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });
    return Object.freeze({
      response,
      signal: controller.signal,
      release,
    });
  } catch (error) {
    release();
    throw error;
  }
}
