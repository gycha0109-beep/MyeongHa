import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

type CancellationClass =
  | 'cancel_on_disconnect'
  | 'continue_to_terminal_outcome'
  | 'not_yet_authorized_for_cancellation';

const ROOT = resolve(process.cwd());
const API_ROOT = resolve(ROOT, 'api');

const FUNCTION_POLICY = Object.freeze({
  'api/auth/promote-guest.ts': 'continue_to_terminal_outcome',
  'api/auth/refresh.ts': 'continue_to_terminal_outcome',
  'api/auth/sign-in.ts': 'continue_to_terminal_outcome',
  'api/auth/sign-out.ts': 'continue_to_terminal_outcome',
  'api/auth/sign-up.ts': 'continue_to_terminal_outcome',
  'api/birth-profiles.ts': 'continue_to_terminal_outcome',
  'api/health.ts': 'cancel_on_disconnect',
  'api/me.ts': 'continue_to_terminal_outcome',
  'api/me/birth-profile.ts': 'not_yet_authorized_for_cancellation',
  'api/me/saju/calculation.ts': 'not_yet_authorized_for_cancellation',
  'api/me/saju/preview-reading.ts': 'not_yet_authorized_for_cancellation',
  'api/readiness.ts': 'cancel_on_disconnect',
  'api/session/bootstrap.ts': 'continue_to_terminal_outcome',
} satisfies Readonly<Record<string, CancellationClass>>);

async function collectTypeScriptFunctions(
  directory: string,
  files: string[] = [],
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await collectTypeScriptFunctions(path, files);
      continue;
    }
    if (entry.isFile() && extname(entry.name) === '.ts') {
      files.push(relative(ROOT, path).split(sep).join('/'));
    }
  }
  return files;
}

async function readVercelConfig(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(ROOT, 'vercel.json'), 'utf8')) as Record<string, unknown>;
}

describe('Production request cancellation policy V1', () => {
  it('classifies every deployed TypeScript Vercel Function explicitly', async () => {
    const deployedFunctions = (await collectTypeScriptFunctions(API_ROOT)).sort();
    expect(deployedFunctions).toEqual(Object.keys(FUNCTION_POLICY).sort());
  });

  it('opts Vercel cancellation into exactly the cancel_on_disconnect subset', async () => {
    const config = await readVercelConfig();
    const functions = config.functions as Record<string, unknown> | undefined;

    const cancellationEnabledFunctions = Object.entries(FUNCTION_POLICY)
      .filter(([, classification]) => classification === 'cancel_on_disconnect')
      .map(([path]) => path)
      .sort();

    expect(functions).toEqual({
      'api/health.ts': { supportsCancellation: true },
      'api/readiness.ts': { supportsCancellation: true },
    });
    expect(Object.keys(functions ?? {}).sort()).toEqual(cancellationEnabledFunctions);
    expect(functions).not.toHaveProperty('api/*');
    expect(functions).not.toHaveProperty('api/**/*.ts');
  });

  it('keeps durable and mixed dispatchers fail-closed at Function cancellation level', () => {
    expect(FUNCTION_POLICY['api/auth/promote-guest.ts']).toBe('continue_to_terminal_outcome');
    expect(FUNCTION_POLICY['api/session/bootstrap.ts']).toBe('continue_to_terminal_outcome');
    expect(FUNCTION_POLICY['api/birth-profiles.ts']).toBe('continue_to_terminal_outcome');
    expect(FUNCTION_POLICY['api/me.ts']).toBe('continue_to_terminal_outcome');
  });

  it('keeps DB/upstream read work non-cancellable until end-to-end signal authority exists', () => {
    expect(FUNCTION_POLICY['api/me/birth-profile.ts']).toBe(
      'not_yet_authorized_for_cancellation',
    );
    expect(FUNCTION_POLICY['api/me/saju/calculation.ts']).toBe(
      'not_yet_authorized_for_cancellation',
    );
    expect(FUNCTION_POLICY['api/me/saju/preview-reading.ts']).toBe(
      'not_yet_authorized_for_cancellation',
    );
  });
});
