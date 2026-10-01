import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const workflowDirectory = '.github/workflows';
const responsibilityMapPath = 'docs/ci/workflow-responsibility-map.json';

function section(source, key) {
  const lines = source.replace(/\r\n/gu, '\n').split('\n');
  const start = lines.findIndex((line) => line === `${key}:`);
  if (start < 0) return null;

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (!/^\s/u.test(line)) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

function hasTrigger(source, trigger) {
  const onSection = section(source, 'on');
  return onSection !== null
    && new RegExp(`^\\s{2}${trigger}:`, 'mu').test(onSection);
}

function staticWorkTrackMarker(source) {
  for (const line of source.replace(/\r\n/gu, '\n').split('\n')) {
    if (/^(?:name|run-name):.*\[WT:[^\]]+\]/u.test(line)) return line.trim();
  }
  return null;
}

const map = JSON.parse(await readFile(responsibilityMapPath, 'utf8'));
if (map.schemaVersion !== 1 || typeof map.workflows !== 'object' || map.workflows === null) {
  throw new Error('Invalid workflow responsibility map schema.');
}

const entries = await readdir(workflowDirectory, { withFileTypes: true });
const workflowFiles = entries
  .filter((entry) => entry.isFile() && /\.(?:ya?ml)$/u.test(entry.name))
  .map((entry) => entry.name)
  .sort();
const mappedFiles = Object.keys(map.workflows).sort();

const missing = workflowFiles.filter((file) => !mappedFiles.includes(file));
const stale = mappedFiles.filter((file) => !workflowFiles.includes(file));
const failures = [];

if (missing.length > 0) failures.push(`unmapped workflows: ${missing.join(', ')}`);
if (stale.length > 0) failures.push(`stale workflow map entries: ${stale.join(', ')}`);

for (const fileName of workflowFiles) {
  const source = await readFile(path.join(workflowDirectory, fileName), 'utf8');
  const entry = map.workflows[fileName];
  if (!entry) continue;

  for (const field of ['responsibility', 'prMode', 'mainMode', 'workTrackAttribution']) {
    if (typeof entry[field] !== 'string' || entry[field].length === 0) {
      failures.push(`${fileName}: missing map field ${field}`);
    }
  }

  const marker = staticWorkTrackMarker(source);
  if (hasTrigger(source, 'pull_request') && marker !== null) {
    failures.push(
      `${fileName}: PR-triggered verification must not statically claim a Work Track: ${marker}`,
    );
  }

  if (entry.prMode === 'routed-via-ci' && hasTrigger(source, 'pull_request')) {
    failures.push(`${fileName}: routed-via-ci workflow still has pull_request trigger`);
  }

  for (const deprecated of map.authority.deprecatedWorkTrackKeys ?? []) {
    if (source.includes(`[WT:${deprecated}]`)) {
      failures.push(`${fileName}: deprecated Work Track marker [WT:${deprecated}]`);
    }
  }
}

const requiredChecks = new Map([
  ['ci.yml', 'name: CI Verify'],
  ['governance.yml', 'name: Governance Verify'],
  ['web-pr-domain-gates.yml', 'name: Web PR Verify'],
]);

for (const [fileName, expected] of requiredChecks) {
  const source = await readFile(path.join(workflowDirectory, fileName), 'utf8');
  if (!source.includes(expected)) {
    failures.push(`${fileName}: required check contract missing: ${expected}`);
  }
}

if (failures.length > 0) {
  throw new Error(
    `CI responsibility governance failed:\n- ${failures.join('\n- ')}`,
  );
}

console.log(
  `CI responsibility governance passed: workflows=${workflowFiles.length} deprecated_track_markers=0 static_pr_track_markers=0 required_checks=3`,
);
