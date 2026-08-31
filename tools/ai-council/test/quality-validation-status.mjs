import { readFile } from 'node:fs/promises';
import { loadLatestRecording, runtimeFingerprint } from './quality-recording.mjs';

const evidenceUrl = new URL('./fixtures/live-quality-evidence.json', import.meta.url);
const evidence = JSON.parse(await readFile(evidenceUrl, 'utf8'));
const latest = await loadLatestRecording();
const currentFingerprint = await runtimeFingerprint();
const liveCases = new Map((latest?.cases || []).map((item) => [item.name, item]));

function evidenceState(item, live, liveFresh) {
  if (liveFresh && item.replayableSourceAvailable) return 'CURRENT_FRESH_PASS';
  if (live && item.replayableSourceAvailable) return 'REPLAYABLE_STALE_PASS';
  if (item.freshAtObservation && !item.replayableSourceAvailable) return 'HISTORICAL_PASS_SOURCE_LOST';
  if (item.freshAtObservation) return 'HISTORICAL_PASS';
  return 'NO_VALID_EVIDENCE';
}

for (const item of evidence.cases || []) {
  const live = [...liveCases.values()].find((candidate) => candidate.name === item.name || candidate.name.startsWith(`Test ${item.id} `) || candidate.name.startsWith(`Test ${item.id} —`));
  const liveFresh = Boolean(live && (live.runtimeFingerprint || latest?.runtimeFingerprint) === currentFingerprint);
  const state = evidenceState(item, live, liveFresh);
  console.log(`${item.name}: evidence_state=${state} replayable=${item.replayableSourceAvailable ? 'YES' : 'NO'} current_generation_coverage=${liveFresh ? 'YES' : 'NO'} round2_protocol=${item.round2Protocol} integration_grounding=${item.integrationGrounding} semantic_evolution=${item.semanticEvolution}`);
}

const allCurrent = (evidence.cases || []).every((item) => {
  const live = [...liveCases.values()].find((candidate) => candidate.name === item.name || candidate.name.startsWith(`Test ${item.id} `) || candidate.name.startsWith(`Test ${item.id} —`));
  return Boolean(live && item.replayableSourceAvailable && (live.runtimeFingerprint || latest?.runtimeFingerprint) === currentFingerprint);
});

console.log(`overall_live_generation_coverage=${allCurrent ? 'CLOSED' : 'NOT_FULLY_REPLAYABLE'}`);
