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

export interface ExecuteSecurityObservedRequestInputV1 {
  readonly request: Request;
  readonly routeId: string;
  readonly execute: (context: {
    readonly requestId: string;
    readonly serverTime: string;
  }) => Response | Promise<Response>;
  readonly requestIdFactory?: () => string;
  readonly now?: () => number;
  readonly eventWriter?: SecurityEventWriterV1;
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

function requireMethod(value: string): string {
  if (!METHOD_PATTERN.test(value)) return 'UNKNOWN';
  return value;
}

function boundedDurationMs(startedAt: number, completedAt: number): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt)) return 0;
  return Math.max(0, Math.min(3_600_000, Math.round(completedAt - startedAt)));
}

function classifyStatus(status: number): Pick<SecurityEventV1, 'eventCode' | 'severity' | 'owasp'> | null {
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

  input.writer(Object.freeze({
    schemaVersion: SECURITY_EVENT_SCHEMA_VERSION_V1,
    ...classification,
    routeId: input.routeId,
    method: input.method,
    status: input.status,
    requestId: input.requestId,
    occurredAt: input.occurredAt,
    durationMs: input.durationMs,
  }));
}

function genericInternalServerError(): Response {
  return new Response(null, {
    status: 500,
    headers: {
      'Cache-Control': NO_STORE,
    },
  });
}

export async function executeSecurityObservedRequestV1(
  input: ExecuteSecurityObservedRequestInputV1,
): Promise<Response> {
  const routeId = requireRouteId(input.routeId);
  const method = requireMethod(input.request.method);
  const requestId = requireRequestId((input.requestIdFactory ?? randomUUID)());
  const now = input.now ?? Date.now;
  const writer = input.eventWriter ?? defaultEventWriter;
  const startedAt = now();
  const serverTime = new Date(startedAt).toISOString();

  try {
    const response = await input.execute({ requestId, serverTime });
    const completedAt = now();
    emitStatusEvent({
      status: response.status,
      routeId,
      method,
      requestId,
      occurredAt: new Date(completedAt).toISOString(),
      durationMs: boundedDurationMs(startedAt, completedAt),
      writer,
    });
    return response;
  } catch {
    const completedAt = now();
    writer(Object.freeze({
      schemaVersion: SECURITY_EVENT_SCHEMA_VERSION_V1,
      owasp: ['A09:2025', 'A10:2025'],
      eventCode: 'UNEXPECTED_EXCEPTION',
      severity: 'error',
      routeId,
      method,
      status: 500,
      requestId,
      occurredAt: new Date(completedAt).toISOString(),
      durationMs: boundedDurationMs(startedAt, completedAt),
    }));
    return genericInternalServerError();
  }
}
