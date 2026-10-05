import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { acquireProductionMemberSmokeSession } from './production-member-smoke-session.mjs';

const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';
const MEMBER_ME_URL = PRODUCTION_ORIGIN + '/api/me';
const PRODUCTION_SUPABASE_ORIGIN = 'https://cnsfpcdiyofqvhpcegfc.supabase.co';
const REQUEST_TIMEOUT_MS = 20_000;
const EVIDENCE_DIR_NAME = 'seyeon-first-meeting-live-dogfood';

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireEnv(name, max = 8192) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(name + ' is required for Se-yeon live dogfood.');
  }
  const normalized = value.trim();
  if (normalized.length > max) {
    throw new Error(name + ' exceeds the supported bound.');
  }
  return normalized;
}

function requireUuid(name, value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  ) {
    throw new Error(name + ' must be a UUID.');
  }
  return value;
}

function boundedRunId() {
  const explicit = process.env.SEYEON_LIVE_RUN_ID?.trim();
  const candidate =
    explicit && explicit.length > 0
      ? explicit
      : 'gha-' +
        (process.env.GITHUB_RUN_ID ?? 'local') +
        '-' +
        (process.env.GITHUB_RUN_ATTEMPT ?? '1');
  if (
    candidate.length > 64 ||
    !/^[A-Za-z0-9._-]+$/u.test(candidate)
  ) {
    throw new Error(
      'SEYEON_LIVE_RUN_ID must use 1-64 characters from A-Z, a-z, 0-9, dot, underscore, or hyphen.',
    );
  }
  return candidate;
}

async function readJson(response, label) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType.trim())) {
    throw new Error(label + ' returned a non-JSON response.');
  }
  try {
    return await response.json();
  } catch {
    throw new Error(label + ' returned invalid JSON.');
  }
}

async function verifyCanonicalMember(accessToken) {
  const expectedSubjectId = requireUuid(
    'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID',
    requireEnv('MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID', 128),
  );
  const response = await fetch(MEMBER_ME_URL, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: 'Bearer ' + accessToken,
    },
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status !== 200) {
    try {
      void response.body?.cancel();
    } catch {
      // best-effort only
    }
    throw new Error(
      'Production Member canonical-subject verification failed with HTTP ' +
        String(response.status) +
        '.',
    );
  }
  const payload = await readJson(response, 'Production Member /api/me');
  if (
    !isRecord(payload) ||
    payload.ok !== true ||
    !isRecord(payload.data) ||
    payload.data.subjectKind !== 'member' ||
    payload.data.subjectStatus !== 'active' ||
    payload.data.subjectId !== expectedSubjectId
  ) {
    throw new Error(
      'Production Member smoke identity does not match the governed canonical Member subject.',
    );
  }
}

function requireRuntimeConfiguration() {
  const required = [
    'MYEONGHA_DATABASE_URL',
    'MYEONGHA_DATABASE_PRINCIPAL',
    'MYEONGHA_SUPABASE_API_KEY',
    'MYEONGHA_GUEST_FINGERPRINT_SECRET',
    'OPENAI_API_KEY',
    'MYEONGHA_SEYEON_OPENAI_MODEL',
  ];
  for (const name of required) requireEnv(name);

  const principal = requireEnv('MYEONGHA_DATABASE_PRINCIPAL', 128);
  if (
    !/^[a-z_][a-z0-9_]{0,62}$/u.test(principal) ||
    ['postgres', 'supabase_admin', 'service_role', 'myeongha_api_executor'].includes(principal)
  ) {
    throw new Error(
      'MYEONGHA_DATABASE_PRINCIPAL must be a dedicated non-privileged PostgreSQL login principal.',
    );
  }
  if (requireEnv('MYEONGHA_SUPABASE_URL', 256) !== PRODUCTION_SUPABASE_ORIGIN) {
    throw new Error(
      'MYEONGHA_SUPABASE_URL must target the governed Production Supabase project.',
    );
  }
}

function sanitizeProvider(snapshot) {
  if (!isRecord(snapshot)) return null;
  return {
    total: snapshot.total ?? null,
    byPurpose: isRecord(snapshot.byPurpose)
      ? { ...snapshot.byPurpose }
      : null,
  };
}

function sanitizeRelationshipTurn(assistant) {
  const relationship = isRecord(assistant?.relationshipUsedForTurn)
    ? assistant.relationshipUsedForTurn
    : null;
  const behavior = isRecord(assistant?.relationshipBehavior)
    ? assistant.relationshipBehavior
    : null;
  return {
    relationshipRevisionUsedForTurn:
      assistant?.relationshipRevisionUsedForTurn ?? null,
    relationship:
      relationship === null
        ? null
        : {
            revision: relationship.revision ?? null,
            stageKey: relationship.stageKey ?? null,
            closenessBand: relationship.closenessBand ?? null,
            trustBand: relationship.trustBand ?? null,
            frictionBand: relationship.frictionBand ?? null,
          },
    behavior:
      behavior === null
        ? null
        : {
            currentCondition: behavior.currentCondition ?? null,
            behaviorAccess: behavior.behaviorAccess ?? null,
          },
  };
}

export function sanitizeSeYeonFirstMeetingCampaignResult(result) {
  const preparation = isRecord(result?.preparation)
    ? result.preparation
    : {};
  const preflight = isRecord(preparation.preflight)
    ? preparation.preflight
    : null;
  const evidence = isRecord(result?.evidence)
    ? result.evidence
    : null;
  const scenario = evidence !== null && isRecord(evidence.scenario)
    ? evidence.scenario
    : null;
  const replay = evidence !== null && isRecord(evidence.replay)
    ? evidence.replay
    : null;

  return {
    schemaVersion: 'seyeon-first-meeting-live-evidence-redacted-v1',
    campaignVersion: result?.version ?? null,
    preparation: {
      status: preparation.status ?? null,
      reasons: Array.isArray(preparation.reasons)
        ? [...preparation.reasons]
        : [],
      created:
        typeof preparation.created === 'boolean'
          ? preparation.created
          : null,
      preflight:
        preflight === null
          ? null
          : {
              participantCharacterIds:
                Array.isArray(preflight.thread?.participantCharacterIds)
                  ? [...preflight.thread.participantCharacterIds]
                  : [],
              contentRevision:
                preflight.thread?.contentRevision ?? null,
              messageCount:
                preflight.stream?.messageCount ?? null,
              userMessageCount:
                preflight.stream?.userMessageCount ?? null,
              characterMessageCount:
                preflight.stream?.characterMessageCount ?? null,
              systemMessageCount:
                preflight.stream?.systemMessageCount ?? null,
              memoryItemCount:
                Array.isArray(preflight.memory?.itemIds)
                  ? preflight.memory.itemIds.length
                  : null,
              memoryGrantCount:
                Array.isArray(preflight.memory?.grants)
                  ? preflight.memory.grants.length
                  : null,
              relationshipPresent:
                preflight.relationship?.relationship !== null &&
                preflight.relationship?.relationship !== undefined,
              activeRelationshipEventKinds:
                Array.isArray(preflight.relationship?.activeEventKinds)
                  ? [...preflight.relationship.activeEventKinds]
                  : [],
            },
    },
    technical: {
      verdict: evidence?.verdict ?? null,
      reasons: Array.isArray(evidence?.reasons)
        ? [...evidence.reasons]
        : [],
    },
    scenario:
      scenario === null
        ? null
        : {
            scenarioId: scenario.scenarioId ?? null,
            runId: scenario.runId ?? null,
            description: scenario.description ?? null,
            reviewFocus: Array.isArray(scenario.reviewFocus)
              ? [...scenario.reviewFocus]
              : [],
            turnCount: scenario.turnCount ?? null,
            providerDelta: sanitizeProvider(scenario.providerDelta),
            turns: Array.isArray(scenario.turns)
              ? scenario.turns.map((turn) => ({
                  turnIndex: turn.turnIndex ?? null,
                  userText: turn.userText ?? null,
                  assistantText: turn.assistant?.assistantText ?? null,
                  disposition: turn.assistant?.disposition ?? null,
                  providerDelta: sanitizeProvider(turn.providerDelta),
                  postTurnDecision:
                    turn.assistant?.postTurnDecision ?? null,
                  ...sanitizeRelationshipTurn(turn.assistant),
                }))
              : [],
          },
    replay:
      replay === null
        ? null
        : {
            disposition: replay.disposition ?? null,
            sequenceNo: replay.sequenceNo ?? null,
            providerDelta: sanitizeProvider(replay.providerDelta),
          },
  };
}

function writeGithubOutput(name, value) {
  const path = process.env.GITHUB_OUTPUT;
  if (typeof path !== 'string' || path.length === 0) return;
  return writeFile(path, name + '=' + String(value) + '\n', {
    flag: 'a',
  });
}

async function run() {
  requireRuntimeConfiguration();
  const session = await acquireProductionMemberSmokeSession();
  await verifyCanonicalMember(session.accessToken);
  const verifiedAuthUserId = requireUuid(
    'Production Member authenticated user id',
    session.verifiedAuthUserId,
  );
  const runId = boundedRunId();

  const module = await import(
    '../dist/apps/api/src/seyeon-internal-first-meeting-campaign-v1.js'
  );
  const result =
    await module.runConfiguredSeyeonFirstMeetingLiveCampaignV1({
      env: process.env,
      verifiedEvidence: Object.freeze({
        kind: 'member',
        verifiedAuthUserId,
      }),
      runId,
    });

  const safe = sanitizeSeYeonFirstMeetingCampaignResult(result);
  const runnerTemp = requireEnv('RUNNER_TEMP', 4096);
  const evidenceDir = join(runnerTemp, EVIDENCE_DIR_NAME);
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(
    join(evidenceDir, 'evidence.json'),
    JSON.stringify(safe, null, 2) + '\n',
    { mode: 0o600 },
  );

  const campaignStatus = safe.preparation.status ?? 'UNKNOWN';
  const technicalVerdict = safe.technical.verdict ?? 'NOT_RUN';
  await writeGithubOutput('campaign_status', campaignStatus);
  await writeGithubOutput('technical_verdict', technicalVerdict);

  process.stdout.write(
    'SEYEON_FIRST_MEETING_LIVE_EVIDENCE=' +
      JSON.stringify(safe) +
      '\n',
  );
}

function isDirectExecution() {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectExecution()) {
  run().catch((error) => {
    const safe = error instanceof Error
      ? { name: error.name, message: error.message }
      : {
          name: 'UnknownError',
          message: 'Se-yeon first-meeting live dogfood runner failed.',
        };
    process.stderr.write(JSON.stringify(safe) + '\n');
    process.exitCode = 1;
  });
}
