import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Work Track is attribution from the PR, never a reason to skip a dependency.
export function resolveWorkTrackPlan(paths, event = {}) {
  const body = event.pull_request?.body ?? '';
  const tracks = [...body.matchAll(/^Watchtower-Track:\s*([a-z0-9][a-z0-9-]*)\s*$/gmu)];
  const track = tracks.length === 1 ? tracks[0][1] : 'unattributed';
  const shared = paths.some((path) => /^(?:package(?:-lock)?\.json|tsconfig(?:\.[^.]+)?\.json|vitest\.config\.[cm]?[jt]s|\.node-version|\.npmrc)$/u.test(path)
    || path.startsWith('packages/')
    || path.startsWith('scripts/ci/')
    || path === '.github/workflows/ci.yml');
  return {
    track,
    full: event.eventName === 'push' || shared,
    web: event.eventName === 'push' || shared || paths.some((path) => path.startsWith('apps/web/') || /^(?:scripts\/(?:build-web|verify-web|run-web)|vercel\.json)/u.test(path)),
    mobile: event.eventName === 'push' || shared || paths.some((path) => path.startsWith('apps/mobile/')),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = readFileSync(0, 'utf8').split(/\r?\n/u).filter(Boolean);
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const plan = resolveWorkTrackPlan(paths, { ...event, eventName: process.env.GITHUB_EVENT_NAME });
  for (const [key, value] of Object.entries(plan)) process.stdout.write(`${key}=${value}\n`);
}
