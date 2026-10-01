export type MyeongHaFetchV1 = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type MyeongHaApiErrorKindV1 =
  | 'network'
  | 'malformed_response'
  | 'http';

export class MyeongHaApiClientErrorV1 extends Error {
  constructor(
    readonly kind: MyeongHaApiErrorKindV1,
    readonly code: string,
    message: string,
    readonly status: number | null = null,
    readonly retryable = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MyeongHaApiClientErrorV1';
  }
}

export interface MyeongHaApiClientOptionsV1 {
  readonly origin: string;
  readonly fetchImpl?: MyeongHaFetchV1;
}

export interface MyeongHaApiRequestV1 {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly bearer?: string;
  readonly guestBearer?: string;
  readonly body?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch (error) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'CLIENT_ORIGIN_INVALID',
      'MyeongHa API origin must be an absolute HTTP(S) origin.',
      null,
      false,
      { cause: error },
    );
  }

  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'CLIENT_ORIGIN_INVALID',
      'MyeongHa API origin must contain only scheme, host, and optional port.',
    );
  }

  return url.origin;
}

function normalizeBearer(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 4096 ||
    /\s/u.test(value)
  ) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'CLIENT_BEARER_INVALID',
      'MyeongHa bearer credential is malformed.',
    );
  }
  return value;
}

function responseError(
  response: Response,
  payload: Record<string, unknown> | null,
): MyeongHaApiClientErrorV1 {
  const errorObject = payload !== null && isRecord(payload.error)
    ? payload.error
    : null;
  const code = errorObject !== null && typeof errorObject.code === 'string'
    ? errorObject.code
    : 'API_REQUEST_FAILED';
  const retryable = errorObject !== null && typeof errorObject.retryable === 'boolean'
    ? errorObject.retryable
    : false;

  return new MyeongHaApiClientErrorV1(
    'http',
    code,
    `MyeongHa API request failed with status ${response.status}.`,
    response.status,
    retryable,
  );
}

async function readJsonEnvelope(response: Response): Promise<Record<string, unknown>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'API_RESPONSE_NOT_JSON',
      'MyeongHa API response is not valid JSON.',
      response.status,
      false,
      { cause: error },
    );
  }

  if (!isRecord(payload)) {
    throw new MyeongHaApiClientErrorV1(
      'malformed_response',
      'API_RESPONSE_INVALID',
      'MyeongHa API response envelope is malformed.',
      response.status,
    );
  }

  return payload;
}

export class MyeongHaApiClientV1 {
  readonly origin: string;
  private readonly fetchImpl: MyeongHaFetchV1;

  constructor(options: MyeongHaApiClientOptionsV1) {
    this.origin = normalizeOrigin(options.origin);
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async requestData(input: MyeongHaApiRequestV1): Promise<unknown> {
    if (!input.path.startsWith('/') || input.path.startsWith('//')) {
      throw new MyeongHaApiClientErrorV1(
        'malformed_response',
        'CLIENT_PATH_INVALID',
        'MyeongHa API request path must be origin-relative.',
      );
    }

    const headers = new Headers({ Accept: 'application/json' });
    if (input.bearer !== undefined) {
      headers.set('Authorization', `Bearer ${normalizeBearer(input.bearer)}`);
    }
    if (input.guestBearer !== undefined) {
      headers.set('x-myeongha-guest-bearer', normalizeBearer(input.guestBearer));
    }
    if (input.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }

    let response: Response;
    try {
      response = await this.fetchImpl(new URL(input.path, this.origin), {
        method: input.method,
        headers,
        cache: 'no-store',
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      });
    } catch (error) {
      throw new MyeongHaApiClientErrorV1(
        'network',
        'API_NETWORK_FAILED',
        'MyeongHa API request could not reach the server.',
        null,
        true,
        { cause: error },
      );
    }

    const payload = await readJsonEnvelope(response);

    if (!response.ok || payload.ok !== true) {
      throw responseError(response, payload);
    }
    if (!Object.prototype.hasOwnProperty.call(payload, 'data')) {
      throw new MyeongHaApiClientErrorV1(
        'malformed_response',
        'API_RESPONSE_DATA_MISSING',
        'MyeongHa API success response omitted data.',
        response.status,
      );
    }

    return payload.data;
  }
}
