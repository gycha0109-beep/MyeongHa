import { readAuthenticatedJsonRequestBodyV1 } from './authenticated-json-request-resource.js';
import { createIngressRequestBodyCompletionDeadlineLeaseV1 } from './ingress-request-body-deadline.js';

/**
 * Reads one Chat-open JSON body under both the governed absolute V1 ingress
 * completion deadline and the authenticated structured-JSON byte ceiling.
 *
 * The caller must establish identity authority before invoking this helper.
 */
export async function readChatOpenJsonRequestBodyV1(request: Request): Promise<unknown> {
  const deadline = createIngressRequestBodyCompletionDeadlineLeaseV1();

  try {
    return await readAuthenticatedJsonRequestBodyV1(request, {
      waitForRead: (pending) => deadline.waitFor(pending),
    });
  } finally {
    deadline.release();
  }
}
