import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = new URL('../.github/workflows/', import.meta.url);

// These are the paid or production-mutating Se-yeon model jobs. Keep this list
// explicit so lifting the hold requires a reviewed change and test update.
const paidJobs = Object.freeze({
  'seyeon-dialogue-path-real-api-eval-v1.yml': ['compare'],
  'seyeon-model-eval-v1.yml': ['compare'],
  'seyeon-unified-shadow-v1.yml': ['compare'],
  'seyeon-first-meeting-live-main-bridge.yml': ['live'],
  'seyeon-first-meeting-predeploy-final-validation.yml': ['luna', 'terra'],
  'seyeon-first-meeting-predeploy-quality-main.yml': ['quality'],
  'production-seyeon-turn-send-smoke.yml': ['verify'],
});

function jobBody(workflow, job) {
  const text = readFileSync(fileURLToPath(new URL(workflow, root)), 'utf8');
  const lines = text.split(/\r?\n/);
  const header = `  ${job}:`;
  const start = lines.indexOf(header);
  expect(start, `Missing paid job ${workflow}:${job}`).toBeGreaterThan(-1);
  const end = lines.findIndex((line, index) =>
    index > start && /^  [a-zA-Z][\w-]*:$/.test(line));
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n');
}

describe('Se-yeon paid model evaluation hold', () => {
  for (const [workflow, jobs] of Object.entries(paidJobs)) {
    for (const job of jobs) {
      it(`denies ${workflow}:${job} even if triggered manually or on push`, () => {
        const body = jobBody(workflow, job);
        expect(body).toMatch(/^    if: \$\{\{ false \}\}$/m);
      });
    }
  }
});
