import { randomUUID } from 'node:crypto';

export const SECURITY_EVENT_SCHEMA_VERSION_V1 = 'myeongha-security-event-v1' as const;

export type SecurityEventCodeV1 =
  | 'ACCESS_DENIED'
  | 'RATE_LIMITED'
  | 'SERVER_FAILURE'
  | 'UNEXPECTED_EXCEPTION';

export type SecurityEventSeverityV1 = 'warning' | 'error';

export interface SecurityEventV1 {
  readonly schemaVersion: typeof SECURITY_EVENT_SCHEMA_VERSION_V1;
  readonly owasp: readonly ('A09:2025' | 'A10:2025')[];
  readonly eventCode: SecurityEventCodeV1;
  readonly severity: SecurityEventSeverityV1;
  readonly routeId: string;
  readonly method: string;
  readonly status: number;
  readonly requestId: string;
  readonly occurredAt: string;
  readonly durationMs: number;
}

export type SecurityEventWriterV1 = (event: SecurityEventV1) => void;

export interface SecurityObservedExecutionContextV1 {
  readonly requestId: string;
  readonly serverTime: string;
}

interface SecurityObservedOperationInputV1 {
  readonly method?: string | undefined;
  readonly routeId: string;
  readonly execute: (
    context: SecurityObservedExecutionContextV1,
  ) => Response | Promise<Response>;
  readonly requestIdFactory?: (() => string) | undefined;
  readonly now?: (() => number) | undefined;
  readonly eventWriter?: SecurityEventWriterV1 | undefined;
}

export interface ExecuteSecurityObservedRequestInputV1
  extends Omit<SecurityObservedOperationInputV1, 'method'> {
  readonly request: Request;
}

export interface ExecuteSecurityObservedNodeRequestInputV1
  extends SecurityObservedOperationInputV1 {
  readonly writeResponse: (response: Response) => Promise<void>;
}

const ROUTE_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const METHOD_PATTERN = /^[A-Z]{1,16}$/u;
const NO_STORE = 'no-store' as const;

function requireRouteId(value: string): string {
  if (!ROUTE_ID_PATTERN.test(value)) {
    throw new Error('Security observability routeId must be a bounded static key.');
  }
  return value;
}

function requireRequestId(value: string): string {
  if (!REQUEST_ID_PATTERN.test(value)) {
    throw new Error('Security observability requestId must be a bounded opaque key.');
  }
  return value;
}

function requireMethod(value: string | undefined): string {
  if (value === undefined || !METHOD_PATTERN.test(value)) return 'UNKNOWN';
  return value;
}

function boundedDurationMs(startedAt: number, completedAt: number): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt)) return 0;
  return Math.max(0, Math.min(3_600_000, Math.round(completedAt - startedAt)));
}

function classifyStatus(
  status: number,
): Pick<SecurityEventV1, 'eventCode' | 'severity' | 'owasp'> | null {
  if (status === 401 || status === 403) {
    return {
      eventCode: 'ACCESS_DENIED',
      severity: 'warning',
      owasp: ['A09:2025'],
    };
  }
  if (status === 429) {
    return {
      eventCode: 'RATE_LIMITED',
      severity: 'warning',
      owasp: ['A09:2025'],
    };
  }
  if (status >= 500 && status <= 599) {
    return {
      eventCode: 'SERVER_FAILURE',
      severity: 'error',
      owasp: ['A09:2025', 'A10:2025'],
    };
  }
  return null;
}

function defaultEventWriter(event: SecurityEventV1): void {
  const line = `MYEONGHA_SECURITY_EVENT ${JSON.stringify(event)}`;
  if (event.severity === 'error') console.error(line);
  else console.warn(line);
}

function writeEventBestEffort(
  writer: SecurityEventWriterV1,
  event: SecurityEventV1,
): void {
  try {
    writer(event);
  } catch {
    // Logging availability must never become request authority.
  }
}

function securityEvent(input: {
  readonly classification: Pick<
    SecurityEventV1,
    'eventCode' | 'severity' | 'owasp'
  >;
  readonly routeId: string;
  readonly method: string;
  readonly status: number;
  readonly requestId: string;
  readonly occurredAt: string;
  readonly durationMs: number;
}): SecurityEventV1 {
  return Object.freeze({
    schemaVersion: SECURITY_EVENT_SCHEMA_VERSION_V1,
    ...input.classification,
    routeId: input.routeId,
    method: input.method,
    status: input.status,
    requestId: input.requestId,
    occurredAt: input.occurredAt,
    durationMs: input.durationMs,
  });
}

function emitStatusEvent(input: {
  readonly status: number;
  readonly routeId: string;
  readonly method: string;
  readonly requestId: string;
  readonly occurredAt: string;
  readonly durationMs: number;
  readonly writer: SecurityEventWriterV1;
}): void {
  const classification = classifyStatus(input.status);
  if (classification === null) return;

  writeEventBestEffort(
    input.writer,
    securityEvent({
      classification,
      routeId: input.routeId,
      method: input.method,
      status: input.status,
      requestId: input.requestId,
      occurredAt: input.occurredAt,
      durationMs: input.durationMs,
    }),
  );
}

function emitUnexpectedException(input: {
  readonly routeId: string;
  readonly method: string;
  readonly requestId: string;
  readonly occurredAt: string;
  readonly durationMs: number;
  readonly writer: SecurityEventWriterV1;
}): void {
  writeEventBestEffort(
    input.writer,
    securityEvent({
      classification: {
        eventCode: 'UNEXPECTED_EXCEPTION',
        severity: 'error',
        owasp: ['A09:2025', 'A10:2025'],
      },
      routeId: input.routeId,
      method: input.method,
      status: 500,
      requestId: input.requestId,
      occurredAt: input.occurredAt,
      durationMs: input.durationMs,
    }),
  );
}

function genericInternalServerError(): Response {
  return new Response(null, {
    status: 500,
    headers: {
      'Cache-Control': NO_STORE,
    },
  });
}

function createExecutionState(input: SecurityObservedOperationInputV1) {
  const routeId = requireRouteId(input.routeId);
  const method = requireMethod(input.method);
  const requestId = requireRequestId((input.requestIdFactory ?? randomUUID)());
  const now = input.now ?? Date.now;
  const writer = input.eventWriter ?? defaultEventWriter;
  const startedAt = now();

  return Object.freeze({
    routeId,
    method,
    requestId,
    now,
    writer,
    startedAt,
    context: Object.freeze({
      requestId,
      serverTime: new Date(startedAt).toISOString(),
    }),
  });
}

async function executeObservedOperationV1(
  input: SecurityObservedOperationInputV1,
): Promise<Response> {
  const state = createExecutionState(input);

  try {
    const response = await input.execute(state.context);
    const completedAt = state.now();
    emitStatusEvent({
      status: response.status,
      routeId: state.routeId,
      method: state.method,
      requestId: state.requestId,
      occurredAt: new Date(completedAt).toISOString(),
      durationMs: boundedDurationMs(state.startedAt, completedAt),
      writer: state.writer,
    });
    return response;
  } catch {
    const completedAt = state.now();
    emitUnexpectedException({
      routeId: state.routeId,
      method: state.method,
      requestId: state.requestId,
      occurredAt: new Date(completedAt).toISOString(),
      durationMs: boundedDurationMs(state.startedAt, completedAt),
      writer: state.writer,
    });
    return genericInternalServerError();
  }
}

export async function executeSecurityObservedRequestV1(
  input: ExecuteSecurityObservedRequestInputV1,
): Promise<Response> {
  return executeObservedOperationV1({
    method: input.request.method,
    routeId: input.routeId,
    execute: input.execute,
    requestIdFactory: input.requestIdFactory,
    now: input.now,
    eventWriter: input.eventWriter,
  });
}

export async function executeSecurityObservedNodeRequestV1(
  input: ExecuteSecurityObservedNodeRequestInputV1,
): Promise<void> {
  const state = createExecutionState(input);
  let response: Response;

  try {
    response = await input.execute(state.context);
  } catch {
    const completedAt = state.now();
    emitUnexpectedException({
      routeId: state.routeId,
      method: state.method,
      requestId: state.requestId,
      occurredAt: new Date(completedAt).toISOString(),
      durationMs: boundedDurationMs(state.startedAt, completedAt),
      writer: state.writer,
    });
    try {
      await input.writeResponse(genericInternalServerError());
    } catch {
      throw new Error('Security-observed Node fallback response write failed.');
    }
    return;
  }

  const completedAt = state.now();
  emitStatusEvent({
    status: response.status,
    routeId: state.routeId,
    method: state.method,
    requestId: state.requestId,
    occurredAt: new Date(completedAt).toISOString(),
    durationMs: boundedDurationMs(state.startedAt, completedAt),
    writer: state.writer,
  });

  try {
    await input.writeResponse(response);
  } catch {
    const failedAt = state.now();
    emitUnexpectedException({
      routeId: state.routeId,
      method: state.method,
      requestId: state.requestId,
      occurredAt: new Date(failedAt).toISOString(),
      durationMs: boundedDurationMs(state.startedAt, failedAt),
      writer: state.writer,
    });
    throw new Error('Security-observed Node response write failed.');
  }
}
