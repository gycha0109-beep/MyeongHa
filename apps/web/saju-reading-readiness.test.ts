import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const webRoot = resolve(process.cwd(), 'apps/web');
const moduleUrl = pathToFileURL(resolve(webRoot, 'saju-reading-readiness.js')).href;
const readinessModule = await import(moduleUrl) as {
  resolveProductReadingDisplayState: (payload: unknown) => string;
  readProductReadingDisplayState: (fetchImpl: typeof fetch) => Promise<string>;
};

const { resolveProductReadingDisplayState, readProductReadingDisplayState } = readinessModule;

describe('Saju hub Product Reading readiness projection', () => {
  it('accepts only the currently admitted authority-blocked capability state', () => {
    expect(resolveProductReadingDisplayState({
      status: 'ready',
      capabilities: { sajuProductReading: 'blocked_by_authority' },
    })).toBe('blocked_by_authority');

    expect(resolveProductReadingDisplayState({
      status: 'ready',
      capabilities: { sajuProductReading: 'ready' },
    })).toBe('unavailable');
    expect(resolveProductReadingDisplayState({ capabilities: {} })).toBe('unavailable');
    expect(resolveProductReadingDisplayState(null)).toBe('unavailable');
  });

  it('fails closed on HTTP, payload, and network failures', async () => {
    const blockedFetch = vi.fn(async () => Response.json({
      status: 'ready',
      capabilities: { sajuProductReading: 'blocked_by_authority' },
    })) as unknown as typeof fetch;
    expect(await readProductReadingDisplayState(blockedFetch)).toBe('blocked_by_authority');

    const unavailableFetch = vi.fn(async () => new Response(null, { status: 503 })) as unknown as typeof fetch;
    expect(await readProductReadingDisplayState(unavailableFetch)).toBe('unavailable');

    const malformedFetch = vi.fn(async () => new Response('{', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
    expect(await readProductReadingDisplayState(malformedFetch)).toBe('unavailable');

    const rejectedFetch = vi.fn(async () => { throw new Error('network down'); }) as unknown as typeof fetch;
    expect(await readProductReadingDisplayState(rejectedFetch)).toBe('unavailable');
  });

  it('ships the hub fail-closed before client JavaScript runs', () => {
    const html = readFileSync(resolve(webRoot, 'reading.html'), 'utf8');

    expect((html.match(/data-product-reading-chip/g) ?? []).length).toBe(4);
    expect(html).toContain('<script type="module" src="saju-reading-readiness.js"></script>');
    expect(html).not.toContain('<span class="gm-chip is-green">완료</span>');
    expect(html).not.toContain('<span class="gm-chip">이어보기</span>');
    expect(html).not.toContain('<span class="gm-chip">추천</span>');
    expect(html).not.toContain('<span class="gm-chip">새로 보기</span>');
  });
});
