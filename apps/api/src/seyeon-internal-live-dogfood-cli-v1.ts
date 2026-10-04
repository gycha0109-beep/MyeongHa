import { pathToFileURL } from 'node:url';

import {
  runConfiguredSeyeonInternalLiveDogfoodV1,
} from './seyeon-internal-live-dogfood-v1.js';

export async function runSeyeonInternalLiveDogfoodCliV1(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const result = await runConfiguredSeyeonInternalLiveDogfoodV1({
    env: process.env,
    argv,
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectExecution()) {
  runSeyeonInternalLiveDogfoodCliV1().catch((error: unknown) => {
    const safe =
      error instanceof Error
        ? Object.freeze({
            name: error.name,
            message: error.message,
          })
        : Object.freeze({
            name: 'UnknownError',
            message: 'Se-yeon internal live dogfood failed.',
          });
    process.stderr.write(JSON.stringify(safe) + '\n');
    process.exitCode = 1;
  });
}
