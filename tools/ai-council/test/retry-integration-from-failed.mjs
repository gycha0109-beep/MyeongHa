import 'dotenv/config';
import { readFile } from 'node:fs/promises';

const configuredIntegrationTokens = Number(process.env.COUNCIL_INTEGRATION_MAX_OUTPUT_TOKENS || 0);
if (!Number.isFinite(configuredIntegrationTokens) || configuredIntegrationTokens < 2200) {
  process.env.COUNCIL_INTEGRATION_MAX_OUTPUT_TOKENS = '2200';
}

const {
  councilCore,
  getApiAttemptCount,
  resetApiAttemptCount,
  validateIntegrationOutput,
  validateRoundTwoOutput,
} = await import('../room-server.mjs');
const { saveLiveRecording } = await import('./quality-recording.mjs');

const failedRecordingUrl = new URL('./.recordings/live-quality.failed.json', import.meta.url);
const requested = String(process.argv[2] || 'A').trim().toUpperCase();
const failed = JSON.parse(await readFile(failedRecordingUrl, 'utf8'));
const source = (failed.cases || []).find((item) => item.name.startsWith(`Test ${requested} `) || item.name.startsWith(`Test ${requested} —`));
if (!source) throw new Error(`Failed recording does not contain Test ${requested}.`);

const meeting = structuredClone(source.meeting);
const specialists = meeting.messages.filter((message) => ['world', 'revenue', 'engineering'].includes(message.agent));
const roundTwo = specialists.filter((message) => message.round === 2);
if (roundTwo.length !== 3) throw new Error(`Test ${requested} failed recording does not contain all three Round 2 outputs.`);
for (const message of roundTwo) validateRoundTwoOutput(message.agent, message.content);
if (meeting.messages.some((message) => message.agent === 'integration')) {
  throw new Error(`Test ${requested} failed recording already contains an Integration message; refusing ambiguous retry.`);
}

const apiKey = process.env.OPENAI_API_KEY || '';
if (!apiKey) throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');

meeting.status = 'running';
meeting.error = null;
resetApiAttemptCount();
const payload = councilCore.buildResponsePayload(meeting, 'integration', meeting.maxRounds + 1);
const response = await fetch('https://api.openai.com/v1/responses', {
  method: 'POST',
  headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
  body: JSON.stringify(payload),
});
const body = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(body.error?.message || `OpenAI HTTP ${response.status}`);

const content = typeof body.output_text === 'string'
  ? body.output_text.trim()
  : (Array.isArray(body.output)
    ? body.output.flatMap((item) => Array.isArray(item.content) ? item.content : [])
      .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
      .map((item) => item.text)
      .join('\n')
      .trim()
    : '');

if (body.status === 'incomplete') {
  throw new Error(`Integration retry incomplete. reason=${body.incomplete_details?.reason || 'unknown'}${content ? `\n[PARTIAL OUTPUT]\n${content}` : ''}`);
}
validateIntegrationOutput(content);

meeting.messages.push({
  agent: 'integration',
  label: 'Integration',
  content,
  round: meeting.maxRounds + 1,
});
meeting.calls = 7;
meeting.apiAttempts = Number(source.meeting.apiAttempts || 0) + getApiAttemptCount();
meeting.status = 'completed';
meeting.error = null;

const recordingPath = await saveLiveRecording([{ name: source.name, meeting }], true);
console.log(`Test ${requested}: status=completed calls=7 retry_api_attempts=${getApiAttemptCount()} total_api_attempts=${meeting.apiAttempts} round2_protocol=PASS integration_sections=PASS`);
console.log(`\n[Integration / Round ${meeting.maxRounds + 1}]\n${content}`);
console.log(`\nrecording=${recordingPath}`);
console.log('PASS: reused the six successful specialist outputs and paid only for the Integration retry.');
