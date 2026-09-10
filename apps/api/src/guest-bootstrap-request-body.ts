import { ApiCommandError } from './api-error.js';

const EMPTY_REQUEST = undefined;
const EMPTY_OBJECT = Object.freeze({});

type ParserState = 'leading' | 'object' | 'trailing';

function isJsonWhitespace(value: string): boolean {
  return value === ' ' || value === '\t' || value === '\n' || value === '\r';
}

function isJsTrimWhitespace(value: string): boolean {
  return value.trim().length === 0;
}

function invalidRequestBody(): never {
  throw new ApiCommandError(
    'INVALID_REQUEST',
    'Session bootstrap request body must be empty or valid JSON.',
  );
}

export async function readGuestBootstrapRequestBodyV1(
  request: Request,
): Promise<unknown> {
  if (request.body === null) return EMPTY_REQUEST;

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let state: ParserState = 'leading';
  let leadingJsonWhitespaceOnly = true;

  const consume = (text: string): void => {
    for (const value of text) {
      if (state === 'leading') {
        if (isJsTrimWhitespace(value)) {
          if (!isJsonWhitespace(value)) leadingJsonWhitespaceOnly = false;
          continue;
        }
        if (!leadingJsonWhitespaceOnly || value !== '{') invalidRequestBody();
        state = 'object';
        continue;
      }

      if (state === 'object') {
        if (isJsonWhitespace(value)) continue;
        if (value !== '}') invalidRequestBody();
        state = 'trailing';
        continue;
      }

      if (!isJsonWhitespace(value)) invalidRequestBody();
    }
  };

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      consume(decoder.decode(chunk.value, { stream: true }));
    }
    consume(decoder.decode());

    if (state === 'leading') return EMPTY_REQUEST;
    if (state === 'object') invalidRequestBody();
    return EMPTY_OBJECT;
  } finally {
    try {
      await reader.cancel();
    } catch {
    } finally {
      reader.releaseLock();
    }
  }
}
