import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const landingHtmlPath = new URL('../apps/web/index.html', import.meta.url);
const landingPagePath = new URL('../apps/web/src/landing/LandingPage.tsx', import.meta.url);

describe('MyeongHa React landing', () => {
  it('keeps the approved world entry and experience hierarchy in React-owned DOM', async () => {
    const [html, page] = await Promise.all([
      readFile(landingHtmlPath, 'utf8'),
      readFile(landingPagePath, 'utf8'),
    ]);

    expect(html).toContain('id="landing-react-root"');
    expect(html).toContain('src="/src/landing/main.tsx"');
    expect(page).toContain('태어난 순간부터');
    expect(page).toContain('대리자와 함께 읽습니다.');
    expect(page).toContain('href="hall.html?mode=guest"');
    expect(page).toContain('href="birth.html?from=landing"');
    expect(page.match(/className="landing-experience-card"/gu)).toHaveLength(4);
  });

  it('loads artwork integrity and theme controllers only after React mounts their DOM', async () => {
    const page = await readFile(landingPagePath, 'utf8');
    const imports = [
      'landing-art-dark-01.js',
      'landing-art-dark-05.js',
      'landing-art-light-01.js',
      'landing-art-light-05.js',
      'landing-art-init.js',
      'app.js',
    ];

    let previous = -1;
    for (const filename of imports) {
      const position = page.indexOf(filename);
      expect(position).toBeGreaterThan(previous);
      previous = position;
    }

    expect(page).toContain('data-landing-art="night"');
    expect(page).toContain('data-landing-art="day"');
    expect(page).toContain('data-theme-toggle');
  });
});
