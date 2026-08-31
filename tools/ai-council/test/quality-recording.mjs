import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateIntegrationGrounding, validateRoundTwoOutput } from '../room-server.mjs';
import { validateIntegrationSemanticEvolution } from '../integration-semantic-evolution.mjs';

const recordingDir = new URL('./.recordings/', import.meta.url);
const caseArchiveDir = new URL('./.recordings/cases/', import.meta.url);
const latestRecordingUrl = new URL('./.recordings/live-quality.latest.json', import.meta.url);
const failedRecordingUrl = new URL('./.recordings/live-quality.failed.json', import.meta.url);
const retryFailureUrl = new URL('./.recordings/integration-retry.failed.json', import.meta.url);
const runtimeFiles = [
  new URL('../room-server.mjs', import.meta.url),
  new URL('../room-server-core.mjs', import.meta.url),
  new URL('../integration-semantic-runtime-gate.mjs', import.meta.url),
  new URL('../integration-semantic-evolution.mjs', import.meta.url),
];

function passes(validation) {
  try {
    validation();
    return true;
  } catch {
    return false;
  }
}

export function evaluateMeeting(meeting) {
  const roundTwo = meeting.messages.filter(
    (message) => message.round === 2 && ['world', 'revenue', 'engineering'].includes(message.agent),
  );
  const integration = meeting.messages.find((message) => message.agent === 'integration');
  const roundTwoPass = roundTwo.length === 3
    && roundTwo.every((message) => passes(() => validateRoundTwoOutput(message.agent, message.content)));
  const integrationGroundingPass = Boolean(integration)
    && passes(() => validateIntegrationGrounding(meeting, integration.content));
  const semanticEvolutionPass = Boolean(integration)
    && passes(() => validateIntegrationSemanticEvolution(meeting, integration.content));
  const integrationPass = integrationGroundingPass && semanticEvolutionPass;
  const sevenCallsPass = meeting.calls === 7;
  const completedPass = meeting.status === 'completed';

  return {
    completedPass,
    sevenCallsPass,
    roundTwoPass,
    integrationGroundingPass,
    semanticEvolutionPass,
    integrationPass,
    passed: completedPass && sevenCallsPass && roundTwoPass && integrationPass,
  };
}

export function snapshotMeeting(meeting) {
  return {
    topic: meeting.topic,
    agents: [...(meeting.agents || [])],
    maxRounds: meeting.maxRounds,
    maxAgentCalls: meeting.maxAgentCalls,
    webSearch: Boolean(meeting.webSearch),
    calls: meeting.calls,
    apiAttempts: Number(meeting.apiAttempts || 0),
    status: meeting.status,
    error: meeting.error ? String(meeting.error) : null,
    messages: (meeting.messages || []).map(({ agent, label, content, round }) => ({
      agent,
      label,
      content,
      round,
    })),
  };
}

export async function runtimeFingerprint() {
  const hash = createHash('sha256');
  for (const url of runtimeFiles) hash.update(await readFile(url));
  return hash.digest('hex');
}

async function readRecording(url) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function caseKey(name) {
  const match = String(name || '').match(/^Test\s+([A-Za-z0-9_-]+)/i);
  if (match) return `test-${match[1].toLowerCase()}`;
  return String(name || 'case').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'case';
}

function normalizeStoredCases(recording) {
  const fallbackFingerprint = recording?.runtimeFingerprint || null;
  return (recording?.cases || []).map((item) => ({
    ...item,
    runtimeFingerprint: item.runtimeFingerprint || fallbackFingerprint,
  }));
}

export function mergeRecordedCases(existing, incoming, fallbackFingerprint = null) {
  const merged = new Map(
    normalizeStoredCases(existing).map((item) => [item.name, item]),
  );
  for (const item of incoming || []) {
    merged.set(item.name, {
      ...item,
      runtimeFingerprint: item.runtimeFingerprint || fallbackFingerprint,
    });
  }
  return [...merged.values()];
}

async function writeCaseArchive(item, passed) {
  await mkdir(caseArchiveDir, { recursive: true });
  const archiveUrl = new URL(`${caseKey(item.name)}.${passed ? 'passed' : 'failed'}.json`, caseArchiveDir);
  const payload = {
    version: 2,
    recordedAt: new Date().toISOString(),
    runtimeFingerprint: item.runtimeFingerprint,
    name: item.name,
    meeting: item.meeting,
  };
  await writeFile(archiveUrl, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function saveLiveRecording(results, passed) {
  await mkdir(recordingDir, { recursive: true });
  const target = passed ? latestRecordingUrl : failedRecordingUrl;
  const fingerprint = await runtimeFingerprint();
  const incoming = results.map(({ name, meeting }) => ({
    name,
    runtimeFingerprint: fingerprint,
    meeting: snapshotMeeting(meeting),
  }));

  for (const item of incoming) await writeCaseArchive(item, passed);

  const existing = await readRecording(target);
  const cases = mergeRecordedCases(existing, incoming, fingerprint);
  const payload = {
    version: 2,
    recordedAt: new Date().toISOString(),
    runtimeFingerprint: fingerprint,
    cases,
  };
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return fileURLToPath(target);
}

export async function loadLatestRecording() {
  return readRecording(latestRecordingUrl);
}

export async function loadFailedRecording() {
  return readRecording(failedRecordingUrl);
}

export async function loadRecordedCase(name, { passed = null } = {}) {
  const key = caseKey(name);
  const candidates = [];
  if (passed !== false) candidates.push(new URL(`${key}.passed.json`, caseArchiveDir));
  if (passed !== true) candidates.push(new URL(`${key}.failed.json`, caseArchiveDir));
  for (const url of candidates) {
    const archive = await readRecording(url);
    if (archive?.meeting) return {
      name: archive.name || name,
      runtimeFingerprint: archive.runtimeFingerprint || null,
      meeting: archive.meeting,
    };
  }

  for (const url of [latestRecordingUrl, failedRecordingUrl, retryFailureUrl]) {
    const recording = await readRecording(url);
    const cases = normalizeStoredCases(recording);
    const found = cases.find((item) => item.name === name || item.name.startsWith(`${name} `) || item.name.startsWith(`${name} —`));
    if (found) return found;
    if (recording?.sourceMeeting && (recording.case === name || String(recording.case || '').startsWith(`${name} `) || String(recording.case || '').startsWith(`${name} —`))) {
      return {
        name: recording.case,
        runtimeFingerprint: recording.runtimeFingerprint || null,
        meeting: recording.sourceMeeting,
      };
    }
  }
  return null;
}
