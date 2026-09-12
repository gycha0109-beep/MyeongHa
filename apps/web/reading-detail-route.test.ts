import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(process.cwd(), 'apps/web');
const readWeb = (name: string) => readFileSync(resolve(webRoot, name), 'utf8');
const routeModuleUrl = pathToFileURL(resolve(webRoot, 'reading-detail-route.js')).href;

type ValidRoute = Readonly<{
  valid: true;
  topic: string;
  scope: string;
  label: string;
  scopeLabel: string;
  routeKey: string;
}>;

type InvalidRoute = Readonly<{
  valid: false;
  reason: string;
  requestedTopic: string | null;
  requestedScope: string | null;
}>;

type ReadingDetailRoute = ValidRoute | InvalidRoute;

type ResolveReadingDetailRoute = (search: string | URLSearchParams) => ReadingDetailRoute;

const routeModule = await import(routeModuleUrl) as { resolveReadingDetailRoute: ResolveReadingDetailRoute };
const { resolveReadingDetailRoute } = routeModule;

describe('Reading detail product-route identity', () => {
  it.each([
    ['?topic=temperament&scope=original', 'temperament', 'original', '전체 사주'],
    ['?topic=career', 'career', 'original', '직업 · 커리어'],
    ['?topic=money', 'money', 'original', '재물'],
    ['?topic=love', 'love', 'original', '연애 · 관계'],
    ['?topic=business', 'business', 'original', '사업'],
    ['?topic=family', 'family', 'original', '가족'],
    ['?topic=life-stage', 'life-stage', 'original', '삶의 단계'],
    ['?topic=spouse', 'spouse', 'original', '배우자 · 관계'],
    ['?topic=compatibility', 'compatibility', 'original', '궁합'],
    ['?topic=question-specific', 'question-specific', 'original', '지금 고민으로 보기'],
  ])('preserves %s instead of collapsing it', (search, topic, scope, label) => {
    expect(resolveReadingDetailRoute(search)).toMatchObject({
      valid: true,
      topic,
      scope,
      label,
    });
  });

  it('keeps standalone yearly and monthly hub routes distinct', () => {
    expect(resolveReadingDetailRoute('?scope=year')).toMatchObject({
      valid: true,
      topic: 'general',
      scope: 'year',
      label: '올해',
    });
    expect(resolveReadingDetailRoute('?scope=month')).toMatchObject({
      valid: true,
      topic: 'general',
      scope: 'month',
      label: '이번 달',
    });
  });

  it('accepts only explicitly represented temporal topic combinations', () => {
    expect(resolveReadingDetailRoute('?topic=career&scope=year')).toMatchObject({ valid: true, topic: 'career', scope: 'year' });
    expect(resolveReadingDetailRoute('?topic=money&scope=monthly')).toMatchObject({ valid: true, topic: 'money', scope: 'month' });
    expect(resolveReadingDetailRoute('?topic=business&scope=yearly')).toMatchObject({ valid: true, topic: 'business', scope: 'year' });
    expect(resolveReadingDetailRoute('?topic=love&scope=year')).toMatchObject({ valid: false, reason: 'unsupported_combination' });
  });

  it('rejects unknown or incomplete routes without temperament/year fallback', () => {
    expect(resolveReadingDetailRoute('?topic=not-a-reading')).toMatchObject({
      valid: false,
      reason: 'unsupported_topic',
    });
    expect(resolveReadingDetailRoute('?scope=original')).toMatchObject({
      valid: false,
      reason: 'unsupported_scope',
    });
    expect(resolveReadingDetailRoute('')).toMatchObject({
      valid: false,
      reason: 'missing_route',
    });
  });
});

describe('Reading hub/detail fail-closed regression', () => {
  const hub = readWeb('reading.html');
  const detail = readWeb('reading-detail.html');
  const detailRuntime = readWeb('reading-character.js');

  it('keeps every current hub product route explicit', () => {
    for (const href of [
      'reading-detail.html?topic=temperament&scope=original',
      'reading-detail.html?topic=career',
      'reading-detail.html?topic=money',
      'reading-detail.html?topic=love',
      'reading-detail.html?topic=business',
      'reading-detail.html?topic=family',
      'reading-detail.html?topic=life-stage',
      'reading-detail.html?scope=year',
      'reading-detail.html?scope=month',
      'reading-detail.html?topic=spouse',
      'reading-detail.html?topic=compatibility',
      'reading-detail.html?topic=question-specific',
    ]) {
      expect(hub).toContain(`href="${href}"`);
    }
  });

  it('does not expose the generic placeholder stage while public Product Reading is blocked', () => {
    expect(detail).toContain('data-reading-route-state');
    expect(detail).toMatch(/<section class="reading-stage" data-reading-stage hidden/);
    expect(detail).toContain('<script type="module" src="reading-character.js"></script>');
    expect(detailRuntime).toContain("root.dataset.readingRouteState = route.valid ? 'blocked_by_authority' : 'invalid';");
    expect(detailRuntime).toContain('다른 주제의 풀이로 대신 보여드리지 않습니다.');
  });

  it('removes the legacy implicit yearly default from the detail runtime', () => {
    expect(detailRuntime).not.toContain("params.get('scope') || 'year'");
    expect(detailRuntime).toContain("import { resolveReadingDetailRoute } from './reading-detail-route.js';");
  });
});
