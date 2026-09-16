import { createIngressRequestBodyCompletionDeadlineLeaseV1 } from './ingress-request-body-deadline.js';

/**
 * Reads one Chat-open JSON body under the governed absolute V1 ingress
 * completion deadline.
 *
 * The caller must establish identity authority before invoking this helper.
 * This helper intentionally does not add a byte ceiling; request resource
 * ceilings remain governed separately by #699.
 */
export async function readChatOpenJsonRequestBodyV1(request: Request): Promise<unknown> {
  if (request.body === null) {
    return request.json();
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const deadline = createIngressRequestBodyCompletionDeadlineLeaseV1();
  const parts: string[] = [];

  try {
    while (true) {
      const chunk = await deadline.waitFor(reader.read());
      if (chunk.done) break;
      parts.push(decoder.decode(chunk.value, { stream: true }));
    }
    parts.push(decoder.decode());
    return JSON.parse(parts.join('')) as unknown;
  } finally {
    deadline.release();
    try {
      void reader.cancel().catch(() => undefined);
    } catch {
    } finally {
      reader.releaseLock();
    }
  }
}
