const PRODUCTION_RECORDS_PAGE = 'https://myeongha.vercel.app/records.html';
const PRODUCTION_RECORDS_SCRIPT = 'https://myeongha.vercel.app/records-page.js';
const REQUIRED_PAGE_MARKERS = Object.freeze([
  'id="records-react-root"',
  '/assets/records-',
]);
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
    const requestOptions = {
      method: 'GET',
      redirect: 'error',
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    };
    const cacheBust = `records-boundary=${Date.now()}`;
    const [pageResponse, scriptResponse] = await Promise.all([
      fetch(`${PRODUCTION_RECORDS_PAGE}?${cacheBust}`, requestOptions),
      fetch(`${PRODUCTION_RECORDS_SCRIPT}?${cacheBust}`, requestOptions),
    ]);
    if (pageResponse.ok && scriptResponse.ok) {
      const [page, source] = await Promise.all([pageResponse.text(), scriptResponse.text()]);
      if (REQUIRED_PAGE_MARKERS.every((marker) => page.includes(marker)) && REQUIRED_MARKERS.every((marker) => source.includes(marker))) {
        console.log(`MyeongHa production Records sample-boundary deployment observed after ${attempt} attempt(s).`);
        process.exit(0);
      }
    }
  } catch {}
  if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
}

throw new Error('Production Records sample-boundary deployment marker was not observed before the smoke deadline.');
