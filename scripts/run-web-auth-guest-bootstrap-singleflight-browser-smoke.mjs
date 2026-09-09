import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['scripts/verify-web-auth-guest-bootstrap-singleflight-browser.mjs'], {
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
      reject(new Error(`Guest bootstrap single-flight browser smoke terminated by signal ${signal}`));
      return;
    }
    resolve(code ?? 1);
  });
});

const requiredMarkers = [
  'MyeongHa_WEB_AUTH_GUEST_BOOTSTRAP_SINGLEFLIGHT_BROWSER_PASS',
  'MyeongHa_WEB_AUTH_MEMBER_WINS_GUEST_BOOTSTRAP_BROWSER_PASS',
  'MyeongHa_WEB_AUTH_MEMBER_PERSISTENCE_FAILURE_BROWSER_PASS',
];
const functionalPass = requiredMarkers.every((marker) => stdout.includes(marker));
const cleanupRace =
  stderr.includes('ENOTEMPTY: directory not empty, rmdir') &&
  stderr.includes('/tmp/myeongha-auth-guest-bootstrap-singleflight-browser-');

if (exitCode !== 0) {
  if (functionalPass && cleanupRace) {
    console.warn('MyeongHa Guest bootstrap/Member persistence browser assertions passed; ignoring ephemeral Chrome profile cleanup ENOTEMPTY race.');
  } else {
    process.exit(exitCode);
  }
}

const rollbackChild = spawn(process.execPath, ['scripts/verify-web-auth-storage-rollback-readback-browser.mjs'], {
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let rollbackStdout = '';
let rollbackStderr = '';
rollbackChild.stdout.setEncoding('utf8');
rollbackChild.stderr.setEncoding('utf8');
rollbackChild.stdout.on('data', (chunk) => {
  rollbackStdout += chunk;
  process.stdout.write(chunk);
});
rollbackChild.stderr.on('data', (chunk) => {
  rollbackStderr += chunk;
  process.stderr.write(chunk);
});

const rollbackExitCode = await new Promise((resolve, reject) => {
  rollbackChild.once('error', reject);
  rollbackChild.once('exit', (code, signal) => {
    if (signal) {
      reject(new Error(`Storage rollback read-back browser smoke terminated by signal ${signal}`));
      return;
    }
    resolve(code ?? 1);
  });
});

if (rollbackExitCode !== 0) process.exit(rollbackExitCode);
if (!rollbackStdout.includes('MyeongHa_WEB_AUTH_STORAGE_ROLLBACK_READBACK_BROWSER_PASS')) {
  console.error(rollbackStderr);
  throw new Error('Rollback read-back browser verifier exited successfully without its PASS marker');
}

const replacementChild = spawn(process.execPath, ['scripts/verify-web-auth-member-rollback-replacement-browser.mjs'], {
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let replacementStdout = '';
let replacementStderr = '';
replacementChild.stdout.setEncoding('utf8');
replacementChild.stderr.setEncoding('utf8');
replacementChild.stdout.on('data', (chunk) => {
  replacementStdout += chunk;
  process.stdout.write(chunk);
});
replacementChild.stderr.on('data', (chunk) => {
  replacementStderr += chunk;
  process.stderr.write(chunk);
});

const replacementExitCode = await new Promise((resolve, reject) => {
  replacementChild.once('error', reject);
  replacementChild.once('exit', (code, signal) => {
    if (signal) {
      reject(new Error(`Member rollback replacement browser smoke terminated by signal ${signal}`));
      return;
    }
    resolve(code ?? 1);
  });
});

if (replacementExitCode !== 0) process.exit(replacementExitCode);
if (!replacementStdout.includes('MyeongHa_WEB_AUTH_MEMBER_ROLLBACK_REPLACEMENT_BROWSER_PASS')) {
  console.error(replacementStderr);
  throw new Error('Member rollback replacement verifier exited successfully without its PASS marker');
}
