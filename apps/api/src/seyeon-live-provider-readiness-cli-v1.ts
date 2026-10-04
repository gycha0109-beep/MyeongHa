import { pathToFileURL } from 'node:url';

import {
  OpenAiSeyeonStructuredProviderErrorV1,
} from './openai-seyeon-structured-provider-v1.js';
import {
  runConfiguredSeyeonLiveProviderReadinessV1,
} from './seyeon-live-provider-readiness-v1.js';

export async function runSeyeonLiveProviderReadinessCliV1(): Promise<void> {
  const result =
    await runConfiguredSeyeonLiveProviderReadinessV1(process.env);
  process.stdout.write(
    'SEYEON_LIVE_PROVIDER_READINESS=' +
      JSON.stringify(result) +
      '\n',
  );
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectExecution()) {
  runSeyeonLiveProviderReadinessCliV1().catch((error: unknown) => {
    const safe =
      error instanceof OpenAiSeyeonStructuredProviderErrorV1
        ? Object.freeze({
            name: error.name,
            code: error.code,
            httpStatus: error.httpStatus,
            message: error.message,
          })
        : error instanceof Error
          ? Object.freeze({
              name: error.name,
              message: error.message,
            })
          : Object.freeze({
              name: 'UnknownError',
              message:
                'Se-yeon live provider readiness probe failed.',
            });
    process.stderr.write(JSON.stringify(safe) + '\n');
    process.exitCode = 1;
  });
}
