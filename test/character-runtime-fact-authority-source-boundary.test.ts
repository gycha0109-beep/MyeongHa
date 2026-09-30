import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function collectTypeScriptFiles(relativeDirectory: string): string[] {
  const absoluteDirectory = join(ROOT, relativeDirectory);
  const collected: string[] = [];

  for (const entry of readdirSync(absoluteDirectory)) {
    const relativePath = join(relativeDirectory, entry);
    const absolutePath = join(ROOT, relativePath);
    if (statSync(absolutePath).isDirectory()) {
      collected.push(...collectTypeScriptFiles(relativePath));
    } else if (entry.endsWith('.ts')) {
      collected.push(relativePath);
    }
  }

  return collected;
}

describe('Character Runtime fact source-authority boundary', () => {
  it('does not bind the experimental Character Manifest directly into runtime source', () => {
    const runtimeSources = [
      ...collectTypeScriptFiles('apps/api/src'),
      ...collectTypeScriptFiles('packages/domain/src'),
    ];

    for (const relativePath of runtimeSources) {
      const source = readFileSync(join(ROOT, relativePath), 'utf8');
      expect(
        source,
        `${relativePath} must not bind the experimental Character Manifest directly`,
      ).not.toContain('character-manifest.v0.schema.json');
      expect(
        source,
        `${relativePath} must not treat the experimental manifest state as runtime authority`,
      ).not.toContain('EXPERIMENTAL_NOT_RUNTIME_BOUND');
    }
  });

  it('keeps the two-phase fact seam independent from filesystem or Bible Markdown parsing', () => {
    const source = readFileSync(
      join(ROOT, 'apps/api/src/character-runtime-fact-authority.ts'),
      'utf8',
    );

    expect(source).not.toContain("from 'node:fs'");
    expect(source).not.toContain('docs/character/');
    expect(source).not.toMatch(/\.md['"]/u);
  });
});
