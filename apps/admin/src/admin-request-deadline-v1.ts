/** Bound browser requests independently of Worker and Hyperdrive timeouts.
 * Aborts native fetch, and the raced deadline also settles if an injected transport
 * does not observe AbortSignal. Never retries an Owner read automatically.
 */
export const ADMIN_READ_DEADLINE_MS_V1 = 12_000;
export const ADMIN_SESSION_DEADLINE_MS_V1 = 8_000;

export class AdminRequestDeadlineErrorV1 extends Error {
  constructor() {
    super('관리자 서버 응답이 지연됐습니다. (ADMIN_REQUEST_TIMEOUT) 다시 시도할 수 있습니다.');
    this.name = 'AdminRequestDeadlineErrorV1';
  }
}

export async function adminFetchWithDeadlineV1(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
  deadlineMs: number = ADMIN_READ_DEADLINE_MS_V1,
): Promise<Response> {
  if (!Number.isInteger(deadlineMs) || deadlineMs < 100 || deadlineMs > 60_000) {
    throw new Error('Invalid Admin request deadline');
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AdminRequestDeadlineErrorV1());
    }, deadlineMs);
  });
  try {
    return await Promise.race([
      fetchImpl(url, { ...init, signal: controller.signal }),
      deadline,
    ]);
  } catch (error) {
    if (controller.signal.aborted) throw new AdminRequestDeadlineErrorV1();
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** The response may deliver HTTP headers while its JSON/CSV stream stalls.
 * Bound body consumption separately so a never-ending stream cannot pin UI loading.
 */
export async function adminReadResponseBodyV1<T>(
  read: () => Promise<T>,
  deadlineMs: number = ADMIN_READ_DEADLINE_MS_V1,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new AdminRequestDeadlineErrorV1()), deadlineMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(read), deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
