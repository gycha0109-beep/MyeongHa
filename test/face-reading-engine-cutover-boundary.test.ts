import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const RUNTIME_ROOTS = ['packages', 'apps', 'supabase'] as const;
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json']);
const FORBIDDEN_ENGINE_COUPLINGS = [
  '/face-reading/',
  '@myeongha/face-reading',
  'packages/face-reading',
  'FaceResearchDiagnosisOutput',
  'projectResearchFaceDiagnosisGrounding',
  'presentResearchFaceDiagnosisForCharacter',
] as const;

function repositoryRelative(path: string): string {
  return relative(REPOSITORY_ROOT, path).split(sep).join('/');
}

function excluded(path: string): boolean {
  const normalized = repositoryRelative(path);
  return normalized === 'packages/face-reading' || normalized.startsWith('packages/face-reading/');
}

async function runtimeSourceFiles(root: string): Promise<readonly string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (excluded(path)) continue;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue;
      files.push(...(await runtimeSourceFiles(path)));
      continue;
    }
    if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(path);
  }
  return files;
}

async function source(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

describe('Face Reading engine cutover boundary', () => {
  it('keeps every MyeongHa runtime source outside the legacy Face package free of engine coupling', async () => {
    const files = (
      await Promise.all(RUNTIME_ROOTS.map((root) => runtimeSourceFiles(join(REPOSITORY_ROOT, root))))
    ).flat();

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      for (const forbidden of FORBIDDEN_ENGINE_COUPLINGS) {
        expect(text, `${repositoryRelative(file)} must not contain ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('exposes only the product-safe grounding presentation boundary from Domain', async () => {
    const index = await source('../packages/domain/src/index.ts');
    expect(index).toContain('presentResearchFaceGroundingForCharacter');
    expect(index).toContain('ResearchCharacterFaceGroundingV1');
    expect(index).toContain('CharacterFaceGroundingV1');
  });
});
