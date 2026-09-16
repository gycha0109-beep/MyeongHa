import { createIngressRequestBodyCompletionDeadlineLeaseV1 } from './ingress-request-body-deadline.js';

export async function hasRequestBodyWithoutDrainingV1(request: Request): Promise<boolean> {
  if (request.body === null) return false;

  const reader = request.body.getReader();
  const deadline = createIngressRequestBodyCompletionDeadlineLeaseV1();
  try {
    while (true) {
      const chunk = await deadline.waitFor(reader.read());
      if (chunk.done) return false;
      if (chunk.value.byteLength > 0) return true;
    }
  } finally {
    deadline.release();
    try {
      void reader.cancel().catch(() => undefined);
    } catch {
    } finally {
      try {
        reader.releaseLock();
      } catch {
      }
    }
  }
}