import { readFile } from 'node:fs/promises';
import { validateIntegrationGrounding, validateRoundTwoOutput } from '../room-server.mjs';
import { validateIntegrationSemanticEvolution } from './integration-semantic-evolution.mjs';
import { saveLiveRecording } from './quality-recording.mjs';

const requested = String(process.argv[2] || 'A').trim().toUpperCase();
if (requested !== 'A') throw new Error('Only captured Test A recovery fixture is available.');

const failedRecordingUrl = new URL('./.recordings/live-quality.failed.json', import.meta.url);
const capturedIntegrationUrl = new URL('./fixtures/integration-a-nested-bullets-20260831.txt', import.meta.url);
const failed = JSON.parse(await readFile(failedRecordingUrl, 'utf8'));
const source = (failed.cases || []).find((item) => item.name.startsWith('Test A ' ) || item.name.startsWith('Test A —'));
if (!source) throw new Error('Failed recording does not contain Test A.');

const meeting = structuredClone(source.meeting);
const roundTwo = meeting.messages.filter(
  (message) => message.round === 2 && ['world', 'revenue', 'engineering'].includes(message.agent),
);
if (roundTwo.length !== 3) throw new Error('Test A failed recording does not contain all three Round 2 outputs.');
for (const message of roundTwo) validateRoundTwoOutput(message.agent, message.content);
if (meeting.messages.some((message) => message.agent === 'integration')) {
  throw new Error('Test A failed recording already contains an Integration message; refusing ambiguous recovery.');
}

const content = (await readFile(capturedIntegrationUrl, 'utf8')).trim();
validateIntegrationGrounding(meeting, content);
validateIntegrationSemanticEvolution(meeting, content);

meeting.messages.push({
  agent: 'integration',
  label: 'Integration',
  content,
  round: meeting.maxRounds + 1,
});
meeting.calls = 7;
meeting.apiAttempts = Number(source.meeting.apiAttempts || 0) + 1;
meeting.status = 'completed';
meeting.error = null;

const recordingPath = await saveLiveRecording([{ name: source.name, meeting }], true);
console.log(`Test A: status=completed calls=7 recovery_api_attempts=0 captured_paid_retry=1 round2_protocol=PASS integration_grounding=PASS semantic_evolution=PASS`);
console.log(`recording=${recordingPath}`);
console.log('PASS: promoted the already-paid captured Integration response without another OpenAI API call.');
