import { spawn } from 'node:child_process';

const marker = 'MyeongHa_WEB_CHAT_AUTH_REJECTION_BROWSER_PASS';
const cleanupPrefix = '/tmp/myeongha-chat-auth-browser-';
const child = spawn(process.execPath, ['scripts/verify-web-chat-auth-browser.mjs'], {
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
      reject(new Error(`MyeongHa Chat auth browser smoke terminated by signal ${signal}`));
      return;
    }
    resolve(code ?? 1);
  });
});

if (exitCode === 0) process.exit(0);

const functionalPass = stdout.includes(marker);
const cleanupRace =
  stderr.includes('ENOTEMPTY: directory not empty, rmdir') &&
  stderr.includes(cleanupPrefix);

if (functionalPass && cleanupRace) {
  console.warn('MyeongHa Chat auth browser assertions passed; ignoring ephemeral Chrome profile cleanup ENOTEMPTY race.');
  process.exit(0);
}

process.exit(exitCode);
