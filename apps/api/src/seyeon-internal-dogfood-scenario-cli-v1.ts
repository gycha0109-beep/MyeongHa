import { pathToFileURL } from 'node:url';

import {
  createConfiguredSeyeonInternalLiveDogfoodRuntimeV1,
} from './seyeon-internal-live-dogfood-v1.js';
import {
  getSeyeonInternalDogfoodScenarioV1,
} from './seyeon-internal-dogfood-scenarios-v1.js';
import {
  runSeyeonInternalDogfoodScenarioV1,
} from './seyeon-internal-dogfood-scenario-runner-v1.js';
import type {
  VerifiedSubjectIdentityEvidenceV1,
} from './subject-identity-resolver.js';

export interface SeyeonInternalDogfoodScenarioCommandV1 {
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly threadId: string;
  readonly scenarioId: string;
  readonly runId: string;
  readonly verifyFinalReplay: boolean;
}

function required(value: string | undefined, name: string, max: number): string {
  const normalized = value?.trim() ?? '';
  if (normalized.length === 0 || normalized.length > max) {
    throw new Error(
      name + ' must be non-empty text within ' + max + ' characters.',
    );
  }
  return normalized;
}

function value(argv: readonly string[], flag: string): string | undefined {
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
    '--scenario',
    '--run-id',
    '--thread',
    '--member-auth-user-id',
    '--guest-token-hash',
  ]);
  const booleanFlags = new Set(['--verify-final-replay']);

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (valueFlags.has(token)) {
      index += 1;
      if (index >= argv.length) {
        throw new Error(token + ' requires a value.');
      }
      continue;
    }
    if (booleanFlags.has(token)) continue;
    throw new Error('Unsupported scenario CLI argument: ' + token + '.');
  }
}

export function parseSeyeonInternalDogfoodScenarioCommandV1(
  argv: readonly string[],
): SeyeonInternalDogfoodScenarioCommandV1 {
  assertArgs(argv);

  const member = value(argv, '--member-auth-user-id');
  const guest = value(argv, '--guest-token-hash');
  if ((member === undefined) === (guest === undefined)) {
    throw new Error(
      'Exactly one verified identity argument is required.',
    );
  }

  return Object.freeze({
    verifiedEvidence:
      member !== undefined
        ? Object.freeze({
            kind: 'member' as const,
            verifiedAuthUserId: required(
              member,
              '--member-auth-user-id',
              256,
            ),
          })
        : Object.freeze({
            kind: 'guest' as const,
            verifiedGuestTokenHash: required(
              guest,
              '--guest-token-hash',
              512,
            ),
          }),
    threadId: required(value(argv, '--thread'), '--thread', 256),
    scenarioId: required(value(argv, '--scenario'), '--scenario', 128),
    runId: required(value(argv, '--run-id'), '--run-id', 64),
    verifyFinalReplay: argv.includes('--verify-final-replay'),
  });
}

export async function runSeyeonInternalDogfoodScenarioCliV1(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const command = parseSeyeonInternalDogfoodScenarioCommandV1(argv);
  const scenario =
    getSeyeonInternalDogfoodScenarioV1(command.scenarioId);
  const runtime =
    createConfiguredSeyeonInternalLiveDogfoodRuntimeV1(process.env);

  try {
    const result = await runSeyeonInternalDogfoodScenarioV1({
      harness: runtime.harness,
      observer: runtime.observer,
      relationshipInspector: runtime.relationshipInspector,
      scenario,
      verifiedEvidence: command.verifiedEvidence,
      threadId: command.threadId,
      runId: command.runId,
      verifyFinalReplay: command.verifyFinalReplay,
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } finally {
    await runtime.close();
  }
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectExecution()) {
  runSeyeonInternalDogfoodScenarioCliV1().catch((error: unknown) => {
    const safe =
      error instanceof Error
        ? Object.freeze({ name: error.name, message: error.message })
        : Object.freeze({
            name: 'UnknownError',
            message: 'Se-yeon long-run dogfood scenario failed.',
          });
    process.stderr.write(JSON.stringify(safe) + '\n');
    process.exitCode = 1;
  });
}
