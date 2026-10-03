import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveVerificationPlan } from './ci/verification-plan.mjs';

const root = process.cwd();
const workflowPath = resolve(root, '.github/workflows/governance.yml');
const dependabotPath = resolve(root, '.github/dependabot.yml');
const restoreDrillPath = resolve(root, '.github/workflows/postgres-isolated-restore-drill.yml');

const workflow = readFileSync(workflowPath, 'utf8').replace(/\r\n/g, '\n');
const dependabot = readFileSync(dependabotPath, 'utf8').replace(/\r\n/g, '\n');
const restoreDrill = readFileSync(restoreDrillPath, 'utf8').replace(/\r\n/g, '\n');

const failures = [];

function requireFragment(source, fragment, label) {
  if (!source.includes(fragment)) failures.push(`${label}: missing ${JSON.stringify(fragment)}`);
}

function forbidFragment(source, fragment, label) {
  if (source.includes(fragment)) failures.push(`${label}: forbidden ${JSON.stringify(fragment)}`);
}

requireFragment(
  restoreDrill,
  'image: ghcr.io/supabase/postgres@sha256:b3bfedb107413abb3b8cb0d0874b0414a1dceb3d55bc0c778de6ad22d1f7dc86 # release 17.6.1.166',
  'production restore container',
);
forbidFragment(
  restoreDrill,
  'image: ghcr.io/supabase/postgres:17.6.1.166',
  'production restore container',
);

requireFragment(dependabot, 'version: 2', 'dependabot');
requireFragment(dependabot, 'package-ecosystem: npm', 'dependabot');
requireFragment(dependabot, 'package-ecosystem: github-actions', 'dependabot');
requireFragment(dependabot, 'directory: /', 'dependabot');
const weeklyCount = (dependabot.match(/interval:\s*weekly/gu) || []).length;
if (weeklyCount !== 2) {
  failures.push(`dependabot: expected exactly 2 weekly schedules, found ${weeklyCount}`);
}

requireFragment(
  workflow,
  'node scripts/ci/verification-plan.mjs < "$changed_files" >> "$GITHUB_OUTPUT"',
  'governance',
);
for (const path of ['.github/dependabot.yml', '.github/workflows/governance.yml', 'package.json', 'package-lock.json', 'apps/web/package.json', 'packages/contracts/package.json']) {
  if (!resolveVerificationPlan([path]).dependencies) failures.push(`dependency scope: missing ${path}`);
}
if (resolveVerificationPlan(['apps/web/src/chat/ChatPage.tsx']).dependencies) failures.push('dependency scope: unrelated source change selected');
requireFragment(
  workflow,
  "if: github.event_name == 'pull_request' && steps.scope.outputs.dependencies == 'true'",
  'governance',
);
requireFragment(
  workflow,
  'uses: actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294',
  'governance',
);
requireFragment(workflow, 'fail-on-severity: moderate', 'governance');
requireFragment(workflow, 'fail-on-scopes: runtime, development, unknown', 'governance');
requireFragment(workflow, 'comment-summary-in-pr: never', 'governance');
forbidFragment(workflow, 'warn-only: true', 'governance');
requireFragment(
  workflow,
  'node scripts/verify-dependency-supply-chain-governance.mjs',
  'governance',
);
requireFragment(workflow, 'DEPENDENCIES_SELECTED: ${{ steps.scope.outputs.dependencies }}', 'governance');
requireFragment(workflow, 'DEPENDENCY_RESULT: ${{ steps.dependency_review.outcome }}', 'governance');
requireFragment(
  workflow,
  'if [[ "$EVENT_NAME" == "pull_request" && "$DEPENDENCIES_SELECTED" == "true" ]]; then test "$DEPENDENCY_RESULT" = "success"; fi',
  'governance',
);

const verifyBlock = workflow.match(/\n  verify:\n[\s\S]*$/u)?.[0] ?? '';
requireFragment(verifyBlock, 'name: Governance Verify', 'governance verify');
requireFragment(verifyBlock, 'if: ${{ always() && !cancelled() }}', 'governance verify');

const dependencyReviewBlock = workflow.match(
  /\n      - name: Review dependency changes\n([\s\S]*?)\n      - name:/u,
)?.[1] ?? '';
if (!dependencyReviewBlock) {
  failures.push('governance: dependency-review step is missing');
} else {
  requireFragment(dependencyReviewBlock, 'id: dependency_review', 'governance dependency-review');
  requireFragment(dependencyReviewBlock, "if: github.event_name == 'pull_request' && steps.scope.outputs.dependencies == 'true'", 'governance dependency-review');
  requireFragment(dependencyReviewBlock, 'fail-on-severity: moderate', 'governance dependency-review');
  requireFragment(dependencyReviewBlock, 'fail-on-scopes: runtime, development, unknown', 'governance dependency-review');
  const uses = [...dependencyReviewBlock.matchAll(/uses:\s*([^\s#]+)/gu)].map((match) => match[1]);
  for (const reference of uses) {
    if (reference.startsWith('./')) continue;
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[^@\s]+)?@[0-9a-fA-F]{40}$/u.test(reference)) {
      failures.push(`governance dependency-review: mutable external action reference ${reference}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Dependency supply-chain governance failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  'Dependency supply-chain governance passed: dependabot_ecosystems=2 schedules=weekly dependency_review=required-via-governance severity=moderate scopes=runtime,development,unknown immutable_action=true production_restore_image_digest_pinned=true warn_only=false',
);
