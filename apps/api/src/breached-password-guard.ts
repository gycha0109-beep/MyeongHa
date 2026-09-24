import { createHash } from 'node:crypto';

const HIBP_PWNED_PASSWORDS_ORIGIN = 'https://api.pwnedpasswords.com' as const;
const HIBP_RANGE_PREFIX_LENGTH = 5;
const HIBP_SHA1_HEX_LENGTH = 40;
const HIBP_SUFFIX_HEX_LENGTH = HIBP_SHA1_HEX_LENGTH - HIBP_RANGE_PREFIX_LENGTH;
const HIBP_RESPONSE_MAX_BYTES = 512 * 1024;
const HIBP_REQUEST_TIMEOUT_MS = 3_000;
const HIBP_LINE_PATTERN = /^([0-9A-F]{35}):([0-9]+)$/u;

export type PasswordCompromiseCheckV1 =
  | Readonly<{ status: 'clear' }>
  | Readonly<{ status: 'compromised'; occurrenceCount: number }>
  | Readonly<{ status: 'unavailable' }>;

export interface PasswordCompromiseGuardPortV1 {
  check(password: string): Promise<PasswordCompromiseCheckV1>;
}

async function readBoundedText(response: Response): Promise<string | null> {
  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (
    Number.isFinite(declaredLength)
    && declaredLength > HIBP_RESPONSE_MAX_BYTES
  ) {
    try {
      await response.body?.cancel();
    } catch {}
    return null;
  }

  if (response.body === null) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined || value.byteLength === 0) continue;
      if (value.byteLength > HIBP_RESPONSE_MAX_BYTES - total) {
        try {
          await reader.cancel();
        } catch {}
        return null;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

function parseRangeResponse(
  body: string,
  expectedSuffix: string,
): PasswordCompromiseCheckV1 {
  let compromisedCount = 0;
  let parsedLines = 0;

  for (const rawLine of body.split(/\r?\n/u)) {
    if (rawLine.length === 0) continue;
    const match = HIBP_LINE_PATTERN.exec(rawLine.trim().toUpperCase());
    if (match === null) return Object.freeze({ status: 'unavailable' });

    const suffix = match[1];
    const count = Number(match[2]);
    if (
      suffix === undefined
      || count === undefined
      || !Number.isSafeInteger(count)
      || count < 0
    ) {
      return Object.freeze({ status: 'unavailable' });
    }

    parsedLines += 1;
    if (suffix === expectedSuffix) compromisedCount = count;
  }

  if (parsedLines === 0) return Object.freeze({ status: 'unavailable' });
  if (compromisedCount > 0) {
    return Object.freeze({
      status: 'compromised',
      occurrenceCount: compromisedCount,
    });
  }
  return Object.freeze({ status: 'clear' });
}

export function createPwnedPasswordCompromiseGuardV1(input?: {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}): PasswordCompromiseGuardPortV1 {
  const fetchImpl = input?.fetchImpl ?? globalThis.fetch;
  const timeoutMs = input?.timeoutMs ?? HIBP_REQUEST_TIMEOUT_MS;

  return Object.freeze({
    async check(password: string): Promise<PasswordCompromiseCheckV1> {
      if (typeof password !== 'string' || password.length === 0) {
        return Object.freeze({ status: 'unavailable' });
      }

      const sha1 = createHash('sha1')
        .update(password, 'utf8')
        .digest('hex')
        .toUpperCase();
      const prefix = sha1.slice(0, HIBP_RANGE_PREFIX_LENGTH);
      const suffix = sha1.slice(HIBP_RANGE_PREFIX_LENGTH);

      if (prefix.length !== HIBP_RANGE_PREFIX_LENGTH || suffix.length !== HIBP_SUFFIX_HEX_LENGTH) {
        return Object.freeze({ status: 'unavailable' });
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(
          `${HIBP_PWNED_PASSWORDS_ORIGIN}/range/${prefix}`,
          {
            method: 'GET',
            headers: {
              Accept: 'text/plain',
              'Add-Padding': 'true',
              'User-Agent': 'MyeongHa-Password-Compromise-Guard/1.0',
            },
            cache: 'no-store',
            redirect: 'error',
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          try {
            await response.body?.cancel();
          } catch {}
          return Object.freeze({ status: 'unavailable' });
        }

        const body = await readBoundedText(response);
        if (body === null) return Object.freeze({ status: 'unavailable' });
        return parseRangeResponse(body, suffix);
      } catch {
        return Object.freeze({ status: 'unavailable' });
      } finally {
        clearTimeout(timer);
      }
    },
  });
}

export const PASSWORD_COMPROMISE_GUARD_V1 = Object.freeze({
  provider: 'HIBP_PWNED_PASSWORDS_RANGE_API',
  requestAuthority: 'SHA1_PREFIX_5_ONLY',
  plaintextPasswordExternalTransmission: false,
  fullSha1ExternalTransmission: false,
  responseBodyMaxBytes: HIBP_RESPONSE_MAX_BYTES,
  timeoutMs: HIBP_REQUEST_TIMEOUT_MS,
  signupFailureMode: 'FAIL_CLOSED',
  signinUnavailableMode: 'AVAILABILITY_PRESERVING',
} as const);
