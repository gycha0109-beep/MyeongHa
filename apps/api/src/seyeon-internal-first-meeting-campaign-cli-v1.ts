import { pathToFileURL } from 'node:url';

import {
  runConfiguredSeyeonFirstMeetingLiveCampaignV1,
} from './seyeon-internal-first-meeting-campaign-v1.js';

export interface SeyeonInternalFirstMeetingCampaignCommandV1 {
  readonly verifiedAuthUserId: string;
  readonly runId: string;
}

function required(
  value: string | undefined,
  name: string,
  max: number,
): string {
  const normalized = value?.trim() ?? '';
  if (normalized.length === 0 || normalized.length > max) {
    throw new Error(
      name + ' must be non-empty text within ' + max + ' characters.',
    );
  }
  return normalized;
}

function value(
  argv: readonly string[],
  flag: string,
): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const found = argv[index + 1];
  if (found === undefined || found.startsWith('--')) {
    throw new Error(flag + ' requires a value.');
  }
  return found;
}

function assertArgs(argv: readonly string[]): void {
  const valueFlags = new Set([
    '--member-auth-user-id',
    '--run-id',
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!valueFlags.has(token)) {
      throw new Error(
        'Unsupported first-meeting campaign CLI argument: ' +
          token + '.',
      );
    }
    index += 1;
    if (index >= argv.length) {
      throw new Error(token + ' requires a value.');
    }
  }
}

export function parseSeyeonInternalFirstMeetingCampaignCommandV1(
  argv: readonly string[],
): SeyeonInternalFirstMeetingCampaignCommandV1 {
  assertArgs(argv);
  return Object.freeze({
    verifiedAuthUserId: required(
      value(argv, '--member-auth-user-id'),
      '--member-auth-user-id',
      256,
    ),
    runId: required(
      value(argv, '--run-id'),
      '--run-id',
      64,
    ),
  });
}

export async function runSeyeonInternalFirstMeetingCampaignCliV1(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const command =
    parseSeyeonInternalFirstMeetingCampaignCommandV1(argv);
  const result =
    await runConfiguredSeyeonFirstMeetingLiveCampaignV1({
      env: process.env,
      verifiedEvidence: Object.freeze({
        kind: 'member' as const,
        verifiedAuthUserId: command.verifiedAuthUserId,
      }),
      runId: command.runId,
    });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectExecution()) {
  runSeyeonInternalFirstMeetingCampaignCliV1().catch(
    (error: unknown) => {
      const safe = error instanceof Error
        ? Object.freeze({
            name: error.name,
            message: error.message,
          })
        : Object.freeze({
            name: 'UnknownError',
            message:
              'Se-yeon first-meeting campaign failed.',
          });
      process.stderr.write(JSON.stringify(safe) + '\n');
      process.exitCode = 1;
    },
  );
}
