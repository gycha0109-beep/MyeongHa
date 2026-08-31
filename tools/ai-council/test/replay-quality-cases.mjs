import { evaluateMeeting, loadLatestRecording, runtimeFingerprint } from './quality-recording.mjs';

const recording = await loadLatestRecording();
if (!recording) {
  console.log('SKIP: no successful live-quality recording exists yet. Run a targeted live/recovery case to create it.');
  process.exit(0);
}

const currentFingerprint = await runtimeFingerprint();
const cases = recording.cases || [];
const freshnesses = cases.map((item) => (item.runtimeFingerprint || recording.runtimeFingerprint) === currentFingerprint ? 'FRESH' : 'STALE');
const overallFreshness = freshnesses.length && freshnesses.every((value) => value === 'FRESH')
  ? 'FRESH'
  : (freshnesses.some((value) => value === 'FRESH') ? 'MIXED' : 'STALE');
console.log(`recording=${recording.recordedAt || 'unknown'} runtime_fingerprint=${overallFreshness}`);
if (overallFreshness !== 'FRESH') {
  console.log('WARN: at least one Council case was generated under an older runtime. Replay still revalidates its saved output for free; do not describe a STALE case as current-generation coverage.');
}

for (const item of cases) {
  const result = evaluateMeeting(item.meeting);
  const caseFingerprint = item.runtimeFingerprint || recording.runtimeFingerprint || null;
  const freshness = caseFingerprint === currentFingerprint ? 'FRESH' : 'STALE';
  console.log(`${item.name}: freshness=${freshness} status=${item.meeting.status} calls=${item.meeting.calls} round2_protocol=${result.roundTwoPass ? 'PASS' : 'FAIL'} integration_grounding=${result.integrationGroundingPass ? 'PASS' : 'FAIL'} semantic_evolution=${result.semanticEvolutionPass ? 'PASS' : 'FAIL'}`);
  if (!result.passed) process.exitCode = 1;
}
