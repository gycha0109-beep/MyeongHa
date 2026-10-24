// Transport only. Each consumer owns validation and projection of its event schema.
export function parseRuntimeLogEvents(text, { prefix, schemas }) {
  if (typeof text !== 'string') throw new Error('Runtime log input must be text.');
  const events = [];
  function message(value) {
    for (const line of value.split(/\r?\n/u)) {
      const index = line.indexOf(prefix);
      if (index < 0) continue;
      let event;
      try {
        event = JSON.parse(line.slice(index + prefix.length).trim());
      } catch {
        // JSON parser errors can contain credentials from the original log line.
        throw new Error('Runtime log event payload is malformed.');
      }
      if (!event || !schemas.includes(event.schemaVersion)) {
        throw new Error('Runtime log event schema is unsupported.');
      }
      events.push(event);
    }
  }
  function collect(value) {
    if (Array.isArray(value)) {
      for (const item of value) collect(item);
    } else if (value !== null && typeof value === 'object') {
      if (schemas.includes(value.schemaVersion)) events.push(value);
      else {
        if (typeof value.message === 'string') message(value.message);
        if (typeof value.text === 'string') message(value.text);
      }
    }
  }
  const trimmed = text.trim();
  if (!trimmed) return events;
  let structured;
  try { structured = JSON.parse(trimmed); } catch { /* Text or JSONL below. */ }
  if (structured !== undefined) collect(structured);
  else {
    for (const line of trimmed.split(/\r?\n/u)) {
      let record;
      try { record = JSON.parse(line); } catch { /* Provider text below. */ }
      if (record !== undefined) collect(record);
      else message(line);
    }
  }
  return events;
}
