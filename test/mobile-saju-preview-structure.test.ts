import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readRepoFile(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile M3-B Saju Preview Reading structure', () => {
  it('keeps the Saju screen native and delegates Preview authority to the feature service', async () => {
    const screen = await readRepoFile('apps/mobile/src/app/(tabs)/reading/index.tsx');
    const view = await readRepoFile(
      'apps/mobile/src/features/saju/SajuPreviewReadingView.tsx',
    );

    expect(screen).toContain('SajuPreviewReadingView');
    expect(screen).not.toContain('/api/me/saju/preview-reading');
    expect(screen).not.toContain('fetch(');
    expect(view).toContain('mobileSajuPreviewServiceV1.read');
    expect(view).not.toContain('fetch(');
    expect(view).not.toContain('SecureStore');
    expect(view).not.toContain('JSON.stringify');
  });

  it('exposes only the exact five approved Preview topics and preserves neutral authority copy', async () => {
    const client = await readRepoFile('packages/api-client/src/saju-preview.ts');
    const view = await readRepoFile(
      'apps/mobile/src/features/saju/SajuPreviewReadingView.tsx',
    );

    for (const readingText of ['전체 사주', '직업운', '재물운', '연애운', '사업운']) {
      expect(client).toContain(`'${readingText}'`);
    }
    expect(client).not.toContain("'올해 운세'");
    expect(view).toContain('확정적 미래 예측은 포함하지 않습니다');
    expect(view).not.toContain('오늘 운세');
    expect(view).not.toContain('행운');
    expect(view).not.toContain('점수');
  });

  it('pins the public ProductReadingResponse v2 source and never raw-dumps the response', async () => {
    const architecture = await readRepoFile('docs/MOBILE_CLIENT_ARCHITECTURE_V1.md');
    const client = await readRepoFile('packages/api-client/src/saju-preview.ts');

    expect(architecture).toContain(
      '19095a89773d517c2b6d69c45544525b9262459a',
    );
    expect(client).toContain('myeonghwa-product-reading-response-v2');
    expect(client).toContain("type === 'source_hint'");
    expect(client).toContain("type === 'fact_table'");
    expect(client).not.toContain('JSON.stringify(data');
  });

  it('keeps Home calculation-only and does not auto-run Preview Reading', async () => {
    const home = await readRepoFile('apps/mobile/src/features/home/mobile-home-loader.ts');
    const homeScreen = await readRepoFile('apps/mobile/src/app/(tabs)/index.tsx');

    expect(home).not.toContain('preview-reading');
    expect(homeScreen).not.toContain('SajuPreviewReadingView');
  });
});
