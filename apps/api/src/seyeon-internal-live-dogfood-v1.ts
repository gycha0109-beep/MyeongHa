import {
  createOpenAiSeyeonStructuredProviderV1,
  type OpenAiSeyeonStructuredProviderConfigV1,
} from './openai-seyeon-structured-provider-v1.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import {
  createProductionSeyeonInternalDogfoodHarnessV1,
  type ProductionSeyeonInternalDogfoodHarnessV1,
  type RunSeyeonInternalDogfoodTurnInputV1,
  type RunSeyeonInternalDogfoodTurnResultV1,
} from './seyeon-internal-dogfood-harness-v1.js';
import {
  createObservedSeyeonStructuredProviderV1,
  diffSeyeonStructuredProviderInvocationsV1,
  type ObservedSeyeonStructuredProviderV1,
  type SeyeonStructuredProviderInvocationSnapshotV1,
} from './seyeon-structured-provider-observer-v1.js';
import type {
  VerifiedSubjectIdentityEvidenceV1,
} from './subject-identity-resolver.js';

export const SEYEON_INTERNAL_LIVE_DOGFOOD_VERSION_V1 =
  'seyeon-internal-live-dogfood-v1' as const;

export const SEYEON_INTERNAL_LIVE_DOGFOOD_ENV_V1 = Object.freeze({
  openAiApiKey: 'OPENAI_API_KEY',
  openAiModel: 'MYEONGHA_SEYEON_OPENAI_MODEL',
  openAiTimeoutMs: 'MYEONGHA_SEYEON_OPENAI_TIMEOUT_MS',
} as const);

export interface SeyeonInternalLiveDogfoodCommandV1 {
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly threadId: string;
  readonly clientTurnId: string;
  readonly text: string;
  readonly verifyReplay: boolean;
}

export interface ConfiguredSeyeonInternalLiveDogfoodRuntimeV1 {
  readonly harness: ProductionSeyeonInternalDogfoodHarnessV1;
  readonly observer: ObservedSeyeonStructuredProviderV1;
  close(): Promise<void>;
}

export interface RunSeyeonInternalLiveDogfoodSessionInputV1 {
  readonly harness: ProductionSeyeonInternalDogfoodHarnessV1;
  readonly observer: ObservedSeyeonStructuredProviderV1;
  readonly turn: RunSeyeonInternalDogfoodTurnInputV1;
  readonly verifyReplay: boolean;
}

export interface SeyeonInternalLiveDogfoodTurnSummaryV1 {
  readonly disposition: RunSeyeonInternalDogfoodTurnResultV1['disposition'];
  readonly subjectId: string;
  readonly assistantText: string;
  readonly committedTurn: Readonly<{
    readonly turnId: string;
    readonly attemptId: string;
    readonly assistantMessageId: string;
    readonly sequenceNo: number;
    readonly committedAt: string;
    readonly replayed: boolean;
  }>;
  readonly postTurnDecision: string | null;
  readonly relationshipUsedForTurn:
    | Readonly<{
        readonly revision: number;
        readonly stageKey: string;
        readonly closenessBand: string;
        readonly trustBand: string;
        readonly frictionBand: string;
      }>
    | null;
  readonly relationshipRevisionUsedForTurn: number | null;
  readonly relationshipRevision:
    RunSeyeonInternalDogfoodTurnResultV1['relationshipRevision'];
}

export interface RunSeyeonInternalLiveDogfoodSessionResultV1 {
  readonly version: typeof SEYEON_INTERNAL_LIVE_DOGFOOD_VERSION_V1;
  readonly first: SeyeonInternalLiveDogfoodTurnSummaryV1;
  readonly replay: SeyeonInternalLiveDogfoodTurnSummaryV1 | null;
  readonly providerAfterFirst: SeyeonStructuredProviderInvocationSnapshotV1;
  readonly providerReplayDelta:
    SeyeonStructuredProviderInvocationSnapshotV1 | null;
}

export class SeyeonInternalLiveDogfoodErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeyeonInternalLiveDogfoodErrorV1';
  }
}

function requiredText(value: string | undefined, name: string, max: number): string {
  const normalized = value?.trim() ?? '';
  if (normalized.length === 0 || normalized.length > max) {
    throw new SeyeonInternalLiveDogfoodErrorV1(
      name + ' must be non-empty text within ' + max + ' characters.',
    );
  }
  return normalized;
}

function parsePositiveInteger(
  value: string | undefined,
  name: string,
): number | undefined {
  if (value === undefined || value.trim().length === 0) return undefined;
  if (!/^[1-9][0-9]*$/u.test(value.trim())) {
    throw new SeyeonInternalLiveDogfoodErrorV1(
      name + ' must be a positive integer.',
    );
  }
  return Number(value.trim());
}

function flagValue(
  argv: readonly string[],
  name: string,
): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new SeyeonInternalLiveDogfoodErrorV1(
      name + ' requires a value.',
    );
  }
  return value;
}

function assertKnownArgs(argv: readonly string[]): void {
  const valueFlags = new Set([
    '--thread',
    '--client-turn',
    '--text',
    '--member-auth-user-id',
    '--guest-token-hash',
  ]);
  const booleanFlags = new Set(['--verify-replay']);

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (valueFlags.has(token)) {
      index += 1;
      if (index >= argv.length) {
        throw new SeyeonInternalLiveDogfoodErrorV1(
          token + ' requires a value.',
        );
      }
      continue;
    }
    if (booleanFlags.has(token)) continue;
    throw new SeyeonInternalLiveDogfoodErrorV1(
      'Unsupported Se-yeon dogfood CLI argument: ' + token + '.',
    );
  }
}

export function parseSeyeonInternalLiveDogfoodCommandV1(
  argv: readonly string[],
): SeyeonInternalLiveDogfoodCommandV1 {
  assertKnownArgs(argv);

  const memberAuthUserId = flagValue(argv, '--member-auth-user-id');
  const guestTokenHash = flagValue(argv, '--guest-token-hash');
  if ((memberAuthUserId === undefined) === (guestTokenHash === undefined)) {
    throw new SeyeonInternalLiveDogfoodErrorV1(
      'Exactly one verified identity argument is required: --member-auth-user-id or --guest-token-hash.',
    );
  }

  const verifiedEvidence: VerifiedSubjectIdentityEvidenceV1 =
    memberAuthUserId !== undefined
      ? Object.freeze({
          kind: 'member' as const,
          verifiedAuthUserId: requiredText(
            memberAuthUserId,
            '--member-auth-user-id',
            256,
          ),
        })
      : Object.freeze({
          kind: 'guest' as const,
          verifiedGuestTokenHash: requiredText(
            guestTokenHash,
            '--guest-token-hash',
            512,
          ),
        });

  return Object.freeze({
    verifiedEvidence,
    threadId: requiredText(flagValue(argv, '--thread'), '--thread', 256),
    clientTurnId: requiredText(
      flagValue(argv, '--client-turn'),
      '--client-turn',
      256,
    ),
    text: requiredText(flagValue(argv, '--text'), '--text', 8000),
    verifyReplay: argv.includes('--verify-replay'),
  });
}

export function parseSeyeonInternalLiveProviderConfigV1(
  env: ProductionUserDataRuntimeEnvV1,
): OpenAiSeyeonStructuredProviderConfigV1 {
  const apiKey = requiredText(
    env[SEYEON_INTERNAL_LIVE_DOGFOOD_ENV_V1.openAiApiKey],
    SEYEON_INTERNAL_LIVE_DOGFOOD_ENV_V1.openAiApiKey,
    4096,
  );
  const model = requiredText(
    env[SEYEON_INTERNAL_LIVE_DOGFOOD_ENV_V1.openAiModel],
    SEYEON_INTERNAL_LIVE_DOGFOOD_ENV_V1.openAiModel,
    128,
  );
  const timeoutMs = parsePositiveInteger(
    env[SEYEON_INTERNAL_LIVE_DOGFOOD_ENV_V1.openAiTimeoutMs],
    SEYEON_INTERNAL_LIVE_DOGFOOD_ENV_V1.openAiTimeoutMs,
  );

  return Object.freeze({
    apiKey,
    model,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

function summarizeTurn(
  result: RunSeyeonInternalDogfoodTurnResultV1,
): SeyeonInternalLiveDogfoodTurnSummaryV1 {
  const execution = result.chat.execution;
  const assistantText =
    execution.disposition === 'committed_replay'
      ? execution.assistantText
      : execution.runtimeResult.envelope.utterance;

  const relationshipResult =
    execution.disposition === 'executed'
      ? execution.relationshipResult
      : null;
  const relationship =
    relationshipResult?.turnBinding.relationship ?? null;

  return Object.freeze({
    disposition: result.disposition,
    subjectId: result.subjectId,
    assistantText,
    committedTurn: Object.freeze({
      turnId: execution.committedTurn.turnId,
      attemptId: execution.committedTurn.attemptId,
      assistantMessageId: execution.committedTurn.assistantMessageId,
      sequenceNo: execution.committedTurn.sequenceNo,
      committedAt: execution.committedTurn.committedAt,
      replayed: execution.committedTurn.replayed,
    }),
    postTurnDecision:
      result.postTurn === null ? null : result.postTurn.result.decision,
    relationshipUsedForTurn:
      relationship === null
        ? null
        : Object.freeze({
            revision: relationship.revision,
            stageKey: relationship.stageKey,
            closenessBand: relationship.closenessBand,
            trustBand: relationship.trustBand,
            frictionBand: relationship.frictionBand,
          }),
    relationshipRevisionUsedForTurn:
      relationshipResult?.relationshipRevisionUsedForTurn ?? null,
    relationshipRevision: result.relationshipRevision,
  });
}

export async function runSeyeonInternalLiveDogfoodSessionV1(
  input: RunSeyeonInternalLiveDogfoodSessionInputV1,
): Promise<RunSeyeonInternalLiveDogfoodSessionResultV1> {
  const firstResult = await input.harness.run(input.turn);
  const providerAfterFirst = input.observer.snapshot();

  let replay: SeyeonInternalLiveDogfoodTurnSummaryV1 | null = null;
  let providerReplayDelta:
    SeyeonStructuredProviderInvocationSnapshotV1 | null = null;

  if (input.verifyReplay) {
    const beforeReplay = input.observer.snapshot();
    const replayResult = await input.harness.run(input.turn);
    const afterReplay = input.observer.snapshot();
    providerReplayDelta =
      diffSeyeonStructuredProviderInvocationsV1(
        beforeReplay,
        afterReplay,
      );

    if (replayResult.disposition !== 'committed_replay') {
      throw new SeyeonInternalLiveDogfoodErrorV1(
        'Replay verification expected committed_replay.',
      );
    }
    if (providerReplayDelta.total !== 0) {
      throw new SeyeonInternalLiveDogfoodErrorV1(
        'Committed replay invoked the structured provider again.',
      );
    }
    if (
      replayResult.chat.execution.committedTurn.assistantMessageId !==
      firstResult.chat.execution.committedTurn.assistantMessageId
    ) {
      throw new SeyeonInternalLiveDogfoodErrorV1(
        'Committed replay returned a different assistant message identity.',
      );
    }

    replay = summarizeTurn(replayResult);
  }

  return Object.freeze({
    version: SEYEON_INTERNAL_LIVE_DOGFOOD_VERSION_V1,
    first: summarizeTurn(firstResult),
    replay,
    providerAfterFirst,
    providerReplayDelta,
  });
}

function leaseExpiresAt(
  now: Date,
  minutes: number,
): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

export function createConfiguredSeyeonInternalLiveDogfoodRuntimeV1(
  env: ProductionUserDataRuntimeEnvV1,
): ConfiguredSeyeonInternalLiveDogfoodRuntimeV1 {
  const databaseConfig = parseProductionUserDataRuntimeConfigV1(env);
  const providerConfig = parseSeyeonInternalLiveProviderConfigV1(env);
  const observer = createObservedSeyeonStructuredProviderV1(
    createOpenAiSeyeonStructuredProviderV1(providerConfig),
  );
  const harness = createProductionSeyeonInternalDogfoodHarnessV1({
    databaseConfig,
    provider: observer.provider,
  });

  return Object.freeze({
    harness,
    observer,
    async close() {
      await harness.close();
    },
  });
}

export async function runConfiguredSeyeonInternalLiveDogfoodV1(input: {
  readonly env: ProductionUserDataRuntimeEnvV1;
  readonly argv: readonly string[];
  readonly now?: () => Date;
}): Promise<RunSeyeonInternalLiveDogfoodSessionResultV1> {
  const command = parseSeyeonInternalLiveDogfoodCommandV1(input.argv);
  const runtime =
    createConfiguredSeyeonInternalLiveDogfoodRuntimeV1(input.env);
  const now = input.now?.() ?? new Date();
  const suffix = command.clientTurnId.replace(/[^A-Za-z0-9_-]/gu, '_');

  try {
    return await runSeyeonInternalLiveDogfoodSessionV1({
      harness: runtime.harness,
      observer: runtime.observer,
      verifyReplay: command.verifyReplay,
      turn: Object.freeze({
        verifiedEvidence: command.verifiedEvidence,
        threadId: command.threadId,
        clientTurnId: command.clientTurnId,
        text: command.text,
        postTurnLease: Object.freeze({
          lockOwner: 'seyeon-live-post-turn-' + suffix,
          leaseExpiresAt: leaseExpiresAt(now, 5),
        }),
        relationshipLease: Object.freeze({
          lockOwner: 'seyeon-live-relationship-' + suffix,
          leaseExpiresAt: leaseExpiresAt(now, 5),
        }),
      }),
    });
  } finally {
    await runtime.close();
  }
}
