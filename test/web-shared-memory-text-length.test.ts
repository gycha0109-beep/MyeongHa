import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { validateSharedMemoryTextV1 } from '../apps/api/src/character-shared-memory-http-v1.js';

describe('manual shared-memory 500-character limit', () => {
  it('uses Unicode code points at the authoritative server boundary', () => {
    const emoji = '\u{1F9E0}';
    expect(validateSharedMemoryTextV1(emoji.repeat(500))).toBe(emoji.repeat(500));
    expect(validateSharedMemoryTextV1(emoji.repeat(501))).toBeNull();
  });

  it('does not impose a shorter UTF-16 textarea limit than the server', async () => {
    const panel = await readFile(new URL('../apps/web/src/my/SharedMemoryPanel.tsx', import.meta.url), 'utf8');
    expect(panel).not.toContain('maxLength={MAX_TEXT}');
    expect(panel).toContain('[...draft.trim()].length > MAX_TEXT');
    expect(panel).toContain('[...editText.trim()].length > MAX_TEXT');
    expect(panel).toContain("setEditText([...event.target.value].slice(0, MAX_TEXT).join(''))");
    expect(panel).toContain("setDraft([...event.target.value].slice(0, MAX_TEXT).join(''))");
    expect(panel).toContain('disabled={busy || !draft.trim() || [...draft.trim()].length > MAX_TEXT');
    expect(panel).toContain('disabled={busy || !editText.trim() || [...editText.trim()].length > MAX_TEXT');
  });
});
