const PRODUCTION_RECORDS_SCRIPT = 'https://myeongha.vercel.app/records-page.js';
const REQUIRED_MARKERS = Object.freeze([
  "const DEVELOPMENT_SAMPLE_HOSTS = Object.freeze(new Set(['localhost', '127.0.0.1', '::1', '[::1]']));",
  'if (allowsDevelopmentSajuSamples())',
  'renderSajuReadingEmpty(target);',
]);
const MAX_ATTEMPTS = 60;
const RETRY_DELAY_MS = 2_000;
const FETCH_TIMEOUT_MS = 10_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  try {
    const response = await fetch(`${PRODUCTION_RECORDS_SCRIPT}?records-boundary=${Date.now()}`, {
      method: 'GET',
      redirect: 'error',
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.ok) {
      const source = await response.text();
      if (REQUIRED_MARKERS.every((marker) => source.includes(marker))) {
        console.log(`MyeongHa production Records sample-boundary deployment observed after ${attempt} attempt(s).`);
        process.exit(0);
      }
    }
  } catch {}
  if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
}

throw new Error('Production Records sample-boundary deployment marker was not observed before the smoke deadline.');
