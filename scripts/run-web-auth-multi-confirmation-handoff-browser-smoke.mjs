import { copyFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

async function runBrowserGate({ script, marker, cleanupPrefix, label }) {
  const child = spawn(process.execPath, [script], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
    process.stderr.write(chunk);
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${label} terminated by signal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });

  if (exitCode === 0) return;

  const functionalPass = stdout.includes(marker);
  const cleanupRace =
    stderr.includes('ENOTEMPTY: directory not empty, rmdir') &&
    stderr.includes(cleanupPrefix);

  if (functionalPass && cleanupRace) {
    console.warn(`${label} assertions passed; ignoring ephemeral Chrome profile cleanup ENOTEMPTY race.`);
    return;
  }

  process.exit(exitCode);
}

await runBrowserGate({
  script: 'scripts/verify-web-auth-multi-confirmation-handoff-browser.mjs',
  marker: 'MyeongHa_WEB_AUTH_MULTI_CONFIRMATION_HANDOFF_BROWSER_PASS',
  cleanupPrefix: '/tmp/myeongha-auth-multi-confirmation-handoff-browser-',
  label: 'MyeongHa auth multi confirmation handoff browser smoke',
});

await runBrowserGate({
  script: 'scripts/verify-web-auth-concurrent-confirmation-journal-browser.mjs',
  marker: 'MyeongHa_WEB_AUTH_CONCURRENT_CONFIRMATION_HANDOFF_BROWSER_PASS',
  cleanupPrefix: '/tmp/myeongha-auth-concurrent-confirmation-journal-browser-',
  label: 'MyeongHa auth concurrent confirmation journal browser smoke',
});

await runBrowserGate({
  script: 'scripts/verify-web-auth-confirmation-handoff-read-failure-browser.mjs',
  marker: 'MyeongHa_WEB_AUTH_CONFIRMATION_HANDOFF_READ_FAILURE_BROWSER_PASS',
  cleanupPrefix: '/tmp/myeongha-auth-confirmation-handoff-read-failure-browser-',
  label: 'MyeongHa auth confirmation handoff read failure browser smoke',
});

await runBrowserGate({
  script: 'scripts/verify-web-auth-confirmation-handoff-removal-failure-browser.mjs',
  marker: 'MyeongHa_WEB_AUTH_CONFIRMATION_HANDOFF_REMOVAL_FAILURE_BROWSER_PASS',
  cleanupPrefix: '/tmp/myeongha-auth-confirmation-handoff-removal-failure-browser-',
  label: 'MyeongHa auth confirmation handoff removal failure browser smoke',
});

await runBrowserGate({
  script: 'scripts/verify-web-auth-confirmation-handoff-persistence-verification-browser.mjs',
  marker: 'MyeongHa_WEB_AUTH_CONFIRMATION_HANDOFF_PERSISTENCE_VERIFICATION_BROWSER_PASS',
  cleanupPrefix: '/tmp/myeongha-auth-confirmation-handoff-persistence-verification-browser-',
  label: 'MyeongHa auth confirmation handoff persistence verification browser smoke',
});

await runBrowserGate({
  script: 'scripts/verify-web-auth-confirmation-handoff-write-readback-browser.mjs',
  marker: 'MyeongHa_WEB_AUTH_CONFIRMATION_HANDOFF_WRITE_READBACK_BROWSER_PASS',
  cleanupPrefix: '/tmp/myeongha-auth-confirmation-handoff-write-readback-browser-',
  label: 'MyeongHa auth confirmation handoff write readback browser smoke',
});

await runBrowserGate({
  script: 'scripts/verify-web-auth-rejected-bearer-browser.mjs',
  marker: 'MyeongHa_WEB_AUTH_REJECTED_BEARER_BROWSER_PASS',
  cleanupPrefix: '/tmp/myeongha-auth-rejected-bearer-browser-',
  label: 'MyeongHa auth rejected bearer browser smoke',
});

try {
  await copyFile(
    'artifacts/web-auth-concurrent-confirmation-handoff-browser-smoke.json',
    'artifacts/web-auth-multi-confirmation-handoff-browser-smoke-concurrent.json',
  );
} catch {}
