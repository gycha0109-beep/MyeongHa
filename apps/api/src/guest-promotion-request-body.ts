type ParserState = 'leading' | 'object' | 'trailing';

function isJsonWhitespace(value: string): boolean {
  return value === ' ' || value === '\t' || value === '\n' || value === '\r';
}

function isJsTrimWhitespace(value: string): boolean {
  return value.trim().length === 0;
}

/**
 * Validates the Guest promotion transport body without materializing it.
 *
 * The established contract accepts an omitted/empty/JS-trim-whitespace-only
 * body or exactly one JSON empty object. JSON objects retain JSON's narrower
 * whitespace grammar, matching the previous JSON.parse() behavior.
 */
export async function isGuestPromotionEmptyRequestBodyV1(
  request: Request,
): Promise<boolean> {
  if (request.body === null) return true;

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let state: ParserState = 'leading';
  let leadingJsonWhitespaceOnly = true;

  const consume = (text: string): boolean => {
    for (const value of text) {
      if (state === 'leading') {
        if (isJsTrimWhitespace(value)) {
          if (!isJsonWhitespace(value)) leadingJsonWhitespaceOnly = false;
          continue;
        }
        if (!leadingJsonWhitespaceOnly || value !== '{') return false;
        state = 'object';
        continue;
      }

      if (state === 'object') {
        if (isJsonWhitespace(value)) continue;
        if (value !== '}') return false;
        state = 'trailing';
        continue;
      }

      if (!isJsonWhitespace(value)) return false;
    }
    return true;
  };

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!consume(decoder.decode(chunk.value, { stream: true }))) return false;
    }

    if (!consume(decoder.decode())) return false;
    return state === 'leading' || state === 'trailing';
  } finally {
    try {
      await reader.cancel();
    } catch {
    } finally {
      reader.releaseLock();
    }
  }
}
