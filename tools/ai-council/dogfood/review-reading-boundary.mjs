import { readFile } from 'node:fs/promises';
import {
  validateIntegrationGrounding,
  validateRoundTwoOutput,
} from '../room-server.mjs';
import { validateIntegrationSemanticEvolution } from '../integration-semantic-evolution.mjs';

const recordingUrl = new URL('../test/.recordings/dogfood/reading-boundary.latest.json', import.meta.url);
let recording;
try {
  recording = JSON.parse(await readFile(recordingUrl, 'utf8'));
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.log('SKIP: no Reading-boundary dogfood recording exists yet. Run the dry-run first, then intentionally run the live command when ready.');
    process.exit(0);
  }
  throw error;
}

const meeting = recording.meeting;
if (!meeting || !Array.isArray(meeting.messages)) throw new Error('Dogfood recording is malformed: meeting/messages missing.');

let roundTwoPass = false;
let integrationGroundingPass = false;
let semanticEvolutionPass = false;
let error = null;

try {
  const roundTwo = meeting.messages.filter(
    (message) => message.round === 2 && ['world', 'revenue', 'engineering'].includes(message.agent),
  );
  if (roundTwo.length !== 3) throw new Error(`Expected 3 Round 2 specialist outputs, got ${roundTwo.length}.`);
  for (const message of roundTwo) validateRoundTwoOutput(message.agent, message.content);
  roundTwoPass = true;

  const integration = meeting.messages.find((message) => message.agent === 'integration');
  if (!integration) throw new Error('Integration output is missing from dogfood recording.');
  validateIntegrationGrounding(meeting, integration.content);
  integrationGroundingPass = true;
  validateIntegrationSemanticEvolution(meeting, integration.content);
  semanticEvolutionPass = true;
} catch (caught) {
  error = caught;
}

const roundOneIsolation = recording.roundOneIsolation === true;
const decisionEvidence = roundOneIsolation
  ? 'ISOLATED_R1_VALIDATION_PASS'
  : 'LEGACY_ANCHORED_R1_NOT_ADOPTABLE';

console.log(`${recording.name || 'Dogfood D1'}: recorded_at=${recording.recordedAt || 'unknown'} status=${meeting.status} calls=${meeting.calls} api_attempts=${meeting.apiAttempts} round_one_isolation=${roundOneIsolation ? 'YES' : 'NO'} decision_evidence=${decisionEvidence} round2_protocol=${roundTwoPass ? 'PASS' : 'FAIL'} integration_grounding=${integrationGroundingPass ? 'PASS' : 'FAIL'} semantic_evolution=${semanticEvolutionPass ? 'PASS' : 'FAIL'}${error ? ` error=${error.message}` : ''}`);

const integration = meeting.messages.find((message) => message.agent === 'integration');
if (integration) console.log(`\n[Integration / Round ${integration.round}]\n${integration.content}`);

if (error || meeting.status !== 'completed' || meeting.calls !== 7) {
  process.exitCode = 1;
} else if (!roundOneIsolation) {
  console.log('\nVALIDATION PASS / DECISION EVIDENCE NOT ADOPTABLE: this recording predates isolated specialist Round 1. The output may be useful as an observed hypothesis, but do not promote it to product policy without a future isolated-R1 dogfood run. API calls=0.');
} else {
  console.log('\nPASS: saved dogfood output satisfies the current Council validators and was generated with isolated specialist Round 1; API calls=0.');
}
