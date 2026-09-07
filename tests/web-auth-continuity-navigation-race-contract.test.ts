import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'scripts', 'verify-web-auth-continuity-browser.mjs'),
  'utf8',
);

describe('web auth continuity browser navigation-race contract', () => {
  it('retries only the exact CDP context-destruction error caused by expected navigation', () => {
    expect(source).toContain("error.message === 'Runtime.evaluate: Inspected target navigated or closed'");
    expect(source).toContain('if (!isNavigationContextRace(error)) throw error;');
    expect(source).toContain('return { completed: false, value: undefined };');
  });

  it('uses the narrow evaluator for navigation polling and navigation-triggering interactions', () => {
    expect(source).toContain('const evaluation = await evaluateAcrossExpectedNavigation(client, expression);');
    expect(source).toContain("await evaluateAcrossExpectedNavigation(client, `document.querySelector('.my-auth-actions button')?.click()`);");
    expect(source).toContain("await evaluateAcrossExpectedNavigation(client, `document.querySelector('.product-profile')?.click()`);");
  });

  it('still requires a fully loaded auth form before submitting credentials', () => {
    expect(source).toContain("document.readyState === 'complete' && location.pathname === '/auth.html'");
    expect(source).toContain("document.querySelector('#auth-form').requestSubmit();");
  });
});