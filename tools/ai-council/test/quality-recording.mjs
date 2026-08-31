import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateIntegrationOutput, validateRoundTwoOutput } from '../room-server.mjs';

const recordingDir = new URL('./.recordings/', import.meta.url);
const latestRecordingUrl = new URL('./.recordings/live-quality.latest.json', import.meta.url);
const failedRecordingUrl = new URL('./.recordings/live-quality.failed.json', import.meta.url);
const runtimeFiles = [
  new URL('../room-server.mjs', import.meta.url),
  new URL('../room-server-core.mjs', import.meta.url),
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
  const integrationPass = Boolean(integration)
    && passes(() => validateIntegrationOutput(integration.content));
  const sevenCallsPass = meeting.calls === 7;
  const completedPass = meeting.status === 'completed';

  return {
    completedPass,
    sevenCallsPass,
    roundTwoPass,
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

export async function saveLiveRecording(results, passed) {
  await mkdir(recordingDir, { recursive: true });
  const target = passed ? latestRecordingUrl : failedRecordingUrl;
  const payload = {
    version: 1,
    recordedAt: new Date().toISOString(),
    runtimeFingerprint: await runtimeFingerprint(),
    cases: results.map(({ name, meeting }) => ({
      name,
      meeting: snapshotMeeting(meeting),
    })),
  };
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return fileURLToPath(target);
}

export async function loadLatestRecording() {
  try {
    return JSON.parse(await readFile(latestRecordingUrl, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}
