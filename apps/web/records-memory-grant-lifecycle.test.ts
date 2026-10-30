import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Records no longer owns character memory grant lifecycle', () => {
  it('has no character-memory UI or grant runtime dependency', () => {
    const page = readFileSync(new URL('./records-page.js', import.meta.url), 'utf8');
    const runtime = readFileSync(new URL('./records-runtime-client.js', import.meta.url), 'utf8');
    const component = readFileSync(new URL('./src/records/RecordsPage.tsx', import.meta.url), 'utf8');
    expect(page).not.toContain('records-memory-grant');
    expect(page).not.toContain('readSeyeonMemoryGrantStatus');
    expect(page).not.toContain('memory-records-list');
    expect(runtime).not.toContain('readSeyeonMemoryGrantStatus');
    expect(runtime).not.toContain('/api/memories');
    expect(component).not.toContain('memory-records');
  });
});
