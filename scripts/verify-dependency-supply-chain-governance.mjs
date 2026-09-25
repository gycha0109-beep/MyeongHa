import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const workflowPath = resolve(root, '.github/workflows/governance.yml');
const dependabotPath = resolve(root, '.github/dependabot.yml');

const workflow = readFileSync(workflowPath, 'utf8').replace(/\r\n/g, '\n');
const dependabot = readFileSync(dependabotPath, 'utf8').replace(/\r\n/g, '\n');

const failures = [];

function requireFragment(source, fragment, label) {
  if (!source.includes(fragment)) failures.push(`${label}: missing ${JSON.stringify(fragment)}`);
}

function forbidFragment(source, fragment, label) {
  if (source.includes(fragment)) failures.push(`${label}: forbidden ${JSON.stringify(fragment)}`);
}

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
  'dependencies: ${{ steps.scope.outputs.dependencies }}',
  'governance',
);
requireFragment(workflow, '.github/dependabot\\.yml$', 'governance');
requireFragment(workflow, 'apps/[^/]+/package\\.json$', 'governance');
requireFragment(workflow, 'packages/[^/]+/package\\.json$', 'governance');
requireFragment(
  workflow,
  "if: github.event_name == 'pull_request' && needs.scope.outputs.dependencies == 'true'",
  'governance',
);
requireFragment(
  workflow,
  'uses: actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294 # v5.0.0',
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
requireFragment(workflow, 'DEPENDENCY_REVIEW_RESULT: ${{ needs.dependency-review.result }}', 'governance');
requireFragment(
  workflow,
  'test "$DEPENDENCY_REVIEW_RESULT" = "success" || test "$DEPENDENCY_REVIEW_RESULT" = "skipped"',
  'governance',
);

const verifyBlock = workflow.match(/\n  verify:\n[\s\S]*$/u)?.[0] ?? '';
requireFragment(verifyBlock, '      - dependency-review', 'governance verify');

const dependencyReviewBlock = workflow.match(
  /\n  dependency-review:\n([\s\S]*?)\n  verify:\n/u,
)?.[1] ?? '';
if (!dependencyReviewBlock) {
  failures.push('governance: dependency-review job is missing');
} else {
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
  'Dependency supply-chain governance passed: dependabot_ecosystems=2 schedules=weekly dependency_review=required-via-governance severity=moderate scopes=runtime,development,unknown immutable_action=true warn_only=false',
);
