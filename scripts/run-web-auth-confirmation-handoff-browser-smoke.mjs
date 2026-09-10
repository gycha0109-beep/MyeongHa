import { spawn } from 'node:child_process';

async function run(script, marker, cleanupPrefix = null) {
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
        reject(new Error(`Auth confirmation handoff browser smoke terminated by signal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });

  if (exitCode === 0) return;

  const functionalPass = stdout.includes(marker);
  const cleanupRace = cleanupPrefix
    && stderr.includes('ENOTEMPTY: directory not empty, rmdir')
    && stderr.includes(cleanupPrefix);

  if (functionalPass && cleanupRace) {
    console.warn(`${marker} assertions passed; ignoring ephemeral Chrome profile cleanup ENOTEMPTY race.`);
    return;
  }

  process.exit(exitCode);
}

await run(
  'scripts/verify-web-auth-confirmation-handoff-browser.mjs',
  'MyeongHa_WEB_AUTH_CONFIRMATION_HANDOFF_BROWSER_PASS',
  '/tmp/myeongha-auth-confirmation-handoff-browser-',
);
await run(
  'scripts/verify-web-auth-confirmation-handoff-removal-readback-browser.mjs',
  'MyeongHa_WEB_AUTH_CONFIRMATION_HANDOFF_REMOVAL_READBACK_BROWSER_PASS',
);
