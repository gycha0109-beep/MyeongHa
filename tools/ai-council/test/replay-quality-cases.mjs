import { evaluateMeeting, loadLatestRecording, runtimeFingerprint } from './quality-recording.mjs';

const recording = await loadLatestRecording();
if (!recording) {
  console.log('SKIP: no successful live-quality recording exists yet. Run npm run test:quality:live once to create it.');
  process.exit(0);
}

const currentFingerprint = await runtimeFingerprint();
const freshness = recording.runtimeFingerprint === currentFingerprint ? 'FRESH' : 'STALE';
console.log(`recording=${recording.recordedAt || 'unknown'} runtime_fingerprint=${freshness}`);
if (freshness === 'STALE') {
  console.log('WARN: Council runtime changed after this recording. Replay remains free, but run live once before release to refresh generation coverage.');
}

for (const item of recording.cases || []) {
  const result = evaluateMeeting(item.meeting);
  console.log(`${item.name}: status=${item.meeting.status} calls=${item.meeting.calls} round2_protocol=${result.roundTwoPass ? 'PASS' : 'FAIL'} integration_sections=${result.integrationPass ? 'PASS' : 'FAIL'}`);
  if (!result.passed) process.exitCode = 1;
}
