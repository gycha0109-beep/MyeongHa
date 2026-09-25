import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const workflowDirectory =
  process.env.MYEONGHA_WORKFLOW_DIR ?? '.github/workflows';

const allowedWritePermissions = new Map([
  ['production-privacy-recovery-canary.yml', new Set(['actions'])],
]);

function section(source, key) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const marker = `${key}:`;
  const start = lines.findIndex((line) => line === marker);
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

function parsePermissions(source) {
  const permissionsSection = section(source, 'permissions');
  if (permissionsSection === null) return null;

  const entries = new Map();
  for (const line of permissionsSection.split('\n')) {
    const match = line.match(
      /^\s{2}([a-z][a-z-]*):\s*(read|write|none)\s*(?:#.*)?$/u,
    );
    if (match) entries.set(match[1], match[2]);
  }
  return entries;
}

function hasTrigger(onSection, trigger) {
  if (onSection === null) return false;
  return new RegExp(`^\\s{2}${trigger}:`, 'mu').test(onSection);
}

function isProductionEnvironmentBound(source) {
  return (
    /^\s+environment:\s*production\s*(?:#.*)?$/mu.test(source) ||
    /^\s+environment:\s*\n\s+name:\s*production\s*(?:#.*)?$/mu.test(
      source,
    )
  );
}

function consumesSecrets(source) {
  return /\$\{\{\s*secrets\.[A-Za-z0-9_]+\s*\}\}/u.test(source);
}

function hasPrivilegedCallerControlledCheckout(source) {
  return /^\s+ref:\s*\$\{\{\s*(?:inputs\.|github\.event\.pull_request(?:\.|\s*\}\}))/mu.test(
    source,
  );
}

export function validateWorkflowSource(fileName, source) {
  const violations = [];
  const onSection = section(source, 'on');
  const permissions = parsePermissions(source);

  if (permissions === null) {
    violations.push('missing explicit top-level permissions');
  } else if (permissions.get('contents') !== 'read') {
    violations.push('top-level permissions must include contents: read');
  }

  if (hasTrigger(onSection, 'pull_request_target')) {
    violations.push('pull_request_target is not authorized');
  }

  const secretConsumer = consumesSecrets(source);
  const writeScopes =
    permissions === null
      ? []
      : [...permissions.entries()]
          .filter(([, value]) => value === 'write')
          .map(([scope]) => scope);

  const allowedWrites = allowedWritePermissions.get(fileName) ?? new Set();
  for (const scope of writeScopes) {
    if (!allowedWrites.has(scope)) {
      violations.push(`unauthorized write permission: ${scope}: write`);
    }
  }

  if (secretConsumer) {
    if (!isProductionEnvironmentBound(source)) {
      violations.push('secret-consuming workflow must use environment: production');
    }
    if (
      hasTrigger(onSection, 'pull_request') ||
      hasTrigger(onSection, 'pull_request_target')
    ) {
      violations.push('secret-consuming workflow must not run on pull request events');
    }
  }

  if (
    (secretConsumer || writeScopes.length > 0) &&
    hasPrivilegedCallerControlledCheckout(source)
  ) {
    violations.push(
      'secret-consuming/write-capable workflow must not checkout caller-controlled input or pull-request refs',
    );
  }

  return violations;
}

function expectViolation(name, fileName, source, fragment) {
  const violations = validateWorkflowSource(fileName, source);
  if (!violations.some((value) => value.includes(fragment))) {
    throw new Error(
      `Self-test ${name} did not detect expected violation: ${fragment}; got ${violations.join('; ')}`,
    );
  }
}

function expectPass(name, fileName, source) {
  const violations = validateWorkflowSource(fileName, source);
  if (violations.length > 0) {
    throw new Error(
      `Self-test ${name} unexpectedly failed: ${violations.join('; ')}`,
    );
  }
}

function runSelfTests() {
  expectViolation(
    'missing-permissions',
    'fixture.yml',
    `on:
  push:
jobs:
  test:
    runs-on: ubuntu-latest
`,
    'missing explicit top-level permissions',
  );

  expectViolation(
    'pr-secret',
    'fixture.yml',
    `on:
  pull_request:
permissions:
  contents: read
jobs:
  test:
    environment: production
    runs-on: ubuntu-latest
    env:
      TOKEN: \${{ secrets.TEST_TOKEN }}
`,
    'must not run on pull request events',
  );

  expectViolation(
    'unauthorized-write',
    'fixture.yml',
    `on:
  workflow_dispatch:
permissions:
  contents: read
  id-token: write
jobs:
  test:
    runs-on: ubuntu-latest
`,
    'unauthorized write permission',
  );

  expectViolation(
    'caller-controlled-privileged-checkout',
    'fixture.yml',
    `on:
  workflow_dispatch:
    inputs:
      ref:
        required: true
        type: string
permissions:
  contents: read
jobs:
  test:
    environment: production
    runs-on: ubuntu-latest
    env:
      TOKEN: \${{ secrets.TEST_TOKEN }}
    steps:
      - uses: actions/checkout@0000000000000000000000000000000000000000
        with:
          ref: \${{ inputs.ref }}
`,
    'caller-controlled input or pull-request refs',
  );

  expectPass(
    'approved-actions-write',
    'production-privacy-recovery-canary.yml',
    `on:
  workflow_dispatch:
permissions:
  actions: write
  contents: read
jobs:
  test:
    environment: production
    runs-on: ubuntu-latest
`,
  );

  expectPass(
    'manual-secret-readonly',
    'fixture.yml',
    `on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  test:
    environment: production
    runs-on: ubuntu-latest
    env:
      TOKEN: \${{ secrets.TEST_TOKEN }}
    steps:
      - uses: actions/checkout@0000000000000000000000000000000000000000
`,
  );
}

runSelfTests();

const entries = await readdir(workflowDirectory, { withFileTypes: true });
const workflowFiles = entries
  .filter(
    (entry) =>
      entry.isFile() && /\.(?:ya?ml)$/u.test(entry.name),
  )
  .map((entry) => entry.name)
  .sort();

if (workflowFiles.length === 0) {
  throw new Error(`No GitHub Actions workflows found in ${workflowDirectory}.`);
}

const failures = [];
let secretConsumers = 0;
let writeCapableWorkflows = 0;

for (const fileName of workflowFiles) {
  const source = await readFile(path.join(workflowDirectory, fileName), 'utf8');
  if (consumesSecrets(source)) secretConsumers += 1;
  const permissions = parsePermissions(source);
  if (
    permissions !== null &&
    [...permissions.values()].includes('write')
  ) {
    writeCapableWorkflows += 1;
  }

  const violations = validateWorkflowSource(fileName, source);
  for (const violation of violations) {
    failures.push(`${fileName}: ${violation}`);
  }
}

if (failures.length > 0) {
  throw new Error(
    `GitHub Actions trust-boundary governance failed:\n- ${failures.join('\n- ')}`,
  );
}

console.log(
  `GitHub Actions trust-boundary governance passed: workflows=${workflowFiles.length} secret_consumers=${secretConsumers} write_capable_workflows=${writeCapableWorkflows} explicit_permissions=true pull_request_target=false`,
);
