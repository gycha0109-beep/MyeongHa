import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { integrationSemanticInstruction, validateIntegrationSemanticEvolution } from './integration-semantic-evolution.mjs';

const configuredIntegrationTokens = Number(process.env.COUNCIL_INTEGRATION_MAX_OUTPUT_TOKENS || 0);
if (!Number.isFinite(configuredIntegrationTokens) || configuredIntegrationTokens < 3000) {
  process.env.COUNCIL_INTEGRATION_MAX_OUTPUT_TOKENS = '3000';
}

const {
  councilCore,
  getApiAttemptCount,
  resetApiAttemptCount,
  validateIntegrationGrounding,
  validateRoundTwoOutput,
} = await import('../room-server.mjs');
const { saveLiveRecording } = await import('./quality-recording.mjs');

const failedRecordingUrl = new URL('./.recordings/live-quality.failed.json', import.meta.url);
const retryFailureUrl = new URL('./.recordings/integration-retry.failed.json', import.meta.url);
const requested = String(process.argv[2] || 'A').trim().toUpperCase();
const failed = JSON.parse(await readFile(failedRecordingUrl, 'utf8'));
const source = (failed.cases || []).find((item) => item.name.startsWith(`Test ${requested} `) || item.name.startsWith(`Test ${requested} —`));
if (!source) throw new Error(`Failed recording does not contain Test ${requested}.`);

const meeting = structuredClone(source.meeting);
const sourceApiAttempts = Number(source.meeting.apiAttempts || 0);
const specialists = meeting.messages.filter((message) => ['world', 'revenue', 'engineering'].includes(message.agent));
const roundTwo = specialists.filter((message) => message.round === 2);
if (roundTwo.length !== 3) throw new Error(`Test ${requested} failed recording does not contain all three Round 2 outputs.`);
for (const message of roundTwo) validateRoundTwoOutput(message.agent, message.content);
if (meeting.messages.some((message) => message.agent === 'integration')) {
  throw new Error(`Test ${requested} failed recording already contains an Integration message; refusing ambiguous retry.`);
}

const apiKey = process.env.OPENAI_API_KEY || '';
if (!apiKey) throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');

async function recordRetryFailure({ content = '', error, responseStatus = null, responseBody = null }) {
  await mkdir(new URL('./.recordings/', import.meta.url), { recursive: true });
  const payload = {
    version: 1,
    recordedAt: new Date().toISOString(),
    case: source.name,
    sourceApiAttempts,
    retryApiAttempts: getApiAttemptCount(),
    responseStatus,
    validationError: String(error?.message || error || 'unknown retry failure'),
    rejectedIntegration: content || null,
    responseBody,
    sourceMeeting: source.meeting,
  };
  await writeFile(retryFailureUrl, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return fileURLToPath(retryFailureUrl);
}

meeting.status = 'running';
meeting.error = null;
resetApiAttemptCount();
const payload = councilCore.buildResponsePayload(meeting, 'integration', meeting.maxRounds + 1);
payload.input = `${payload.input}\n\n${integrationSemanticInstruction()}`;
const response = await fetch('https://api.openai.com/v1/responses', {
  method: 'POST',
  headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
  body: JSON.stringify(payload),
});
const body = await response.json().catch(() => ({}));

const content = typeof body.output_text === 'string'
  ? body.output_text.trim()
  : (Array.isArray(body.output)
    ? body.output.flatMap((item) => Array.isArray(item.content) ? item.content : [])
      .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
      .map((item) => item.text)
      .join('\n')
      .trim()
    : '');

let retryError = null;
if (!response.ok) {
  retryError = new Error(body.error?.message || `OpenAI HTTP ${response.status}`);
} else if (body.status === 'incomplete') {
  retryError = new Error(`Integration retry incomplete. reason=${body.incomplete_details?.reason || 'unknown'}`);
} else {
  try {
    validateIntegrationGrounding(meeting, content);
    validateIntegrationSemanticEvolution(meeting, content);
  } catch (error) {
    retryError = error;
  }
}

if (retryError) {
  const failurePath = await recordRetryFailure({
    content,
    error: retryError,
    responseStatus: response.status,
    responseBody: response.ok ? null : body,
  });
  console.error(`Test ${requested}: status=failed source_api_attempts=${sourceApiAttempts} retry_api_attempts=${getApiAttemptCount()} integration_grounding_or_semantic=FAIL error=${retryError.message}`);
  if (content) console.error(`\n[REJECTED Integration / Round ${meeting.maxRounds + 1}]\n${content}`);
  console.error(`\nretry_failure_recording=${failurePath}`);
  process.exitCode = 1;
} else {
  meeting.messages.push({
    agent: 'integration',
    label: 'Integration',
    content,
    round: meeting.maxRounds + 1,
  });
  meeting.calls = 7;
  meeting.apiAttempts = sourceApiAttempts + getApiAttemptCount();
  meeting.status = 'completed';
  meeting.error = null;

  const recordingPath = await saveLiveRecording([{ name: source.name, meeting }], true);
  console.log(`Test ${requested}: status=completed calls=7 source_api_attempts=${sourceApiAttempts} retry_api_attempts=${getApiAttemptCount()} round2_protocol=PASS integration_grounding=PASS semantic_evolution=PASS`);
  console.log(`\n[Integration / Round ${meeting.maxRounds + 1}]\n${content}`);
  console.log(`\nrecording=${recordingPath}`);
  console.log('PASS: reused the six successful specialist outputs and paid only for this Integration retry.');
}
