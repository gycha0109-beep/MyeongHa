export const INGRESS_REQUEST_BODY_COMPLETION_DEADLINE_MS_V1 = 3_000 as const;

export class IngressRequestBodyCompletionDeadlineExceededV1 extends Error {
  constructor() {
    super('Ingress request body did not complete within the governed deadline.');
    this.name = 'IngressRequestBodyCompletionDeadlineExceededV1';
  }
}

export interface IngressRequestBodyCompletionDeadlineLeaseV1 {
  readonly waitFor: <T>(operation: Promise<T>) => Promise<T>;
  readonly release: () => void;
}

/**
 * Creates one absolute request-body completion deadline.
 *
 * The deadline starts when the lease is created and is never reset by incoming
 * chunks. Callers retain ownership of reader cancellation and lock cleanup.
 */
export function createIngressRequestBodyCompletionDeadlineLeaseV1(): IngressRequestBodyCompletionDeadlineLeaseV1 {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new IngressRequestBodyCompletionDeadlineExceededV1());
    }, INGRESS_REQUEST_BODY_COMPLETION_DEADLINE_MS_V1);
  });

  return Object.freeze({
    waitFor<T>(operation: Promise<T>): Promise<T> {
      return Promise.race([operation, deadline]);
    },
    release(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  });
}
