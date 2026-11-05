import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminFetchWithDeadlineV1, AdminRequestDeadlineErrorV1,
  ADMIN_READ_DEADLINE_MS_V1 } from './admin-request-deadline-v1.js';
import { fetchAdminReadV1, ADMIN_SESSION_MARKER_V1 } from './admin-client.js';

afterEach(() => vi.useRealTimers());

describe('Owner browser read requests never load indefinitely', () => {
  it('bounds an unresponsive transport even when it ignores abort', async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const pending = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      observedSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    }) as typeof fetch;
    const request = adminFetchWithDeadlineV1('/api/admin/users',
      { method: 'GET', credentials: 'same-origin' }, pending, 100);
    const assertion = expect(request).rejects.toBeInstanceOf(AdminRequestDeadlineErrorV1);
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(observedSignal?.aborted).toBe(true);
  });

  it('returns a successful fast response and never aborts it afterward', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fast = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return Response.json({ rows: [], nextCursor: null });
    }) as typeof fetch;
    const result = await adminFetchWithDeadlineV1('/api/admin/users',
      { credentials: 'same-origin' }, fast, 100);
    expect(result.status).toBe(200);
    await vi.advanceTimersByTimeAsync(150);
    expect(signal?.aborted).toBe(false);
  });

  it('ends the actual user-list request with a visible timeout error, not a spinner', async () => {
    vi.useFakeTimers();
    const pending = (async () => new Promise<Response>(() => {})) as typeof fetch;
    const request = fetchAdminReadV1('/api/admin/users?limit=20', ADMIN_SESSION_MARKER_V1, pending);
    const assertion = expect(request).rejects.toMatchObject({
      name: 'AdminRequestDeadlineErrorV1',
      message: expect.stringContaining('ADMIN_REQUEST_TIMEOUT'),
    });
    await vi.advanceTimersByTimeAsync(ADMIN_READ_DEADLINE_MS_V1);
    await assertion;
  });

  it('does not treat a transient network timeout as Owner access denial', async () => {
    vi.useFakeTimers();
    const pending = (async () => new Promise<Response>(() => {})) as typeof fetch;
    const request = fetchAdminReadV1('/api/admin/overview', ADMIN_SESSION_MARKER_V1, pending);
    const assertion = expect(request).rejects.toBeInstanceOf(AdminRequestDeadlineErrorV1);
    await vi.advanceTimersByTimeAsync(ADMIN_READ_DEADLINE_MS_V1);
    await assertion;
  });
});
