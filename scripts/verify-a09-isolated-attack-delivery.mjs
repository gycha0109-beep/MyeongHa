import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { executeSecurityObservedRequestV1 } from '../apps/api/src/security-observability.ts';
import { analyzeSecurityEventBaseline, parseSecurityEventText } from './analyze-security-event-baseline.mjs';

const monitorUrl = new URL('../config/security/cloudflare-primary-security-monitor-v1.json', import.meta.url);
const queryUrl = new URL('../config/security/cloudflare-primary-access-security-events.sql', import.meta.url);
const RECENT_MS = 5 * 60_000;
const BASELINE_MS = 4 * 60 * 60_000;
const LAB_ONLY = Object.freeze({
  'api.me.saju.calculation': 60,
  'api.me.saju.preview-reading': 20,
});

async function listenLoopback(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(address.address, '127.0.0.1');
  return 'http://127.0.0.1:' + address.port;
}

async function sendBatch(endpoint, count, headers = {}) {
  const results = [];
  for (let start = 0; start < count; start += 8) {
    const batch = await Promise.all(Array.from({ length: Math.min(8, count - start) }, async () => {
      const response = await fetch(endpoint, { method: 'POST', headers, signal: AbortSignal.timeout(5000) });
      await response.arrayBuffer();
      return response.status;
    }));
    results.push(...batch);
  }
  return results;
}

function baselineStatistic(samples) {
  const mean = samples.reduce((sum, x) => sum + x, 0) / samples.length;
  const variance = samples.reduce((sum, x) => sum + (x - mean) ** 2, 0) / samples.length;
  return { mean, standardDeviation: Math.sqrt(variance) };
}

// This mirrors the documented threshold and lookback duration; it is NOT
// Cloudflare's proprietary internal anomaly-evaluation implementation.
function evaluateMirror({ recentCount, historicalCounts, sensitivity }) {
  const { mean, standardDeviation } = baselineStatistic(historicalCounts);
  const z = (recentCount - mean) / Math.max(standardDeviation, 1);
  return { mean, standardDeviation, zScore: z, detected: recentCount > mean && z > sensitivity };
}

export async function runIsolatedA09Attack() {
  const config = JSON.parse(await readFile(monitorUrl, 'utf8'));
  const sql = (await readFile(queryUrl, 'utf8')).replace(/\r\n/gu, '\n').trimEnd();
  const queryHash = createHash('sha256').update(sql, 'utf8').digest('hex');
  assert.equal(queryHash, config.querySha256Utf8LfTrimEnd);
  assert.equal(config.alertType, 'custom_analytics');
  assert.equal(config.detection.algorithm, 'zscore_spike');
  assert.equal(config.detection.recentWindow, '5m');
  assert.equal(config.detection.baselineWindow, '4h');
  assert.equal(config.detection.repeatNotificationInterval, '1h');
  assert.equal(config.detection.sensitivityStandardDeviations, 3.5);
  assert.deepEqual(config.eventCodes, ['ACCESS_DENIED', 'RATE_LIMITED']);
  assert.match(sql, /"scriptName" = 'myeongha'/u);
  assert.match(sql, /"eventCode":"ACCESS_DENIED"/u);
  assert.match(sql, /"eventCode":"RATE_LIMITED"/u);

  const allEvents = [];
  const historicalCounts = [];
  const start = Date.now();
  const oldRequest = new Request('http://127.0.0.1/attack-lab', { method: 'POST' });

  for (let index = 0; index < BASELINE_MS / RECENT_MS; index++) {
    const count = index % 4 === 0 ? 0 : index % 4 === 3 ? 2 : 1;
    historicalCounts.push(count);
    for (let i = 0; i < count; i++) {
      const timestamp = start - BASELINE_MS + index * RECENT_MS;
      const response = await executeSecurityObservedRequestV1({
        request: oldRequest,
        routeId: 'api.me',
        now: () => timestamp,
        requestIdFactory: randomUUID,
        eventWriter: event => allEvents.push(event),
        execute: () => new Response(null, { status: 401 }),
      });
      assert.equal(response.status, 401);
    }
  }

  const baseline = evaluateMirror({
    recentCount: 1,
    historicalCounts,
    sensitivity: config.detection.sensitivityStandardDeviations,
  });
  assert.equal(baseline.detected, false);
  assert.equal(historicalCounts.length, 48);

  const receivedAlerts = [];
  const sink = createServer(async (req, res) => {
    if (req.url !== '/private-test-sink' || req.method !== 'POST') {
      res.writeHead(404).end();
      return;
    }
    let data = '';
    for await (const chunk of req) {
      data += chunk.toString();
      assert.ok(data.length < 4096);
    }
    const message = JSON.parse(data);
    assert.equal(message.schema, 'myeongha-a09-simulation-v1');
    assert.equal(message.synthetic, true);
    receivedAlerts.push(message);
    res.writeHead(202).end();
  });

  const buckets = new Map();
  const app = createServer(async (req, res) => {
    const path = req.url?.split('?')[0] ?? '';
    const routeId = path === '/api/me' ? 'api.me' :
      path === '/api/me/saju/calculation' ? 'api.me.saju.calculation' :
      path === '/api/me/saju/preview-reading' ? 'api.me.saju.preview-reading' : null;
    if (!routeId || req.method !== 'POST') {
      res.writeHead(404).end();
      return;
    }
    try {
      const request = new Request('http://127.0.0.1' + path, {
        method: 'POST',
        headers: { authorization: req.headers.authorization ?? '' },
      });
      const response = await executeSecurityObservedRequestV1({
        request, routeId,
        requestIdFactory: randomUUID,
        eventWriter: event => allEvents.push(event),
        execute: () => {
          const token = request.headers.get('authorization');
          if (!token) return new Response(null, { status: 401 });
          if (token === 'Bearer lab-revoked') return new Response(null, { status: 403 });
          if (token !== 'Bearer lab-member' && token !== 'Bearer lab-guest') {
            return new Response(null, { status: 403 });
          }
          if (routeId === 'api.me') return new Response(null, { status: 200 });
          const key = token + '|' + routeId;
          const current = buckets.get(key) ?? 0;
          if (current >= LAB_ONLY[routeId]) return new Response(null, { status: 429 });
          buckets.set(key, current + 1);
          return new Response(null, { status: 200 });
        },
      });
      res.writeHead(response.status, { 'Cache-Control': 'no-store' }).end();
    } catch {
      res.writeHead(500).end();
    }
  });

  try {
    const [appUrl, sinkUrl] = await Promise.all([listenLoopback(app), listenLoopback(sink)]);
    const responses = [
      ...await sendBatch(appUrl + '/api/me', 95),
      ...await sendBatch(appUrl + '/api/me', 27, { authorization: 'Bearer lab-revoked' }),
      ...await sendBatch(appUrl + '/api/me/saju/calculation', 72, { authorization: 'Bearer lab-member' }),
      ...await sendBatch(appUrl + '/api/me/saju/preview-reading', 28, { authorization: 'Bearer lab-guest' }),
    ];
    const responseCodes = {};
    for (const status of responses) responseCodes[status] = (responseCodes[status] ?? 0) + 1;
    assert.deepEqual(responseCodes, { 200: 80, 401: 95, 403: 27, 429: 20 });

    const parsed = parseSecurityEventText(allEvents.map(event =>
      'MYEONGHA_SECURITY_EVENT ' + JSON.stringify(event)).join('\n'));
    const report = analyzeSecurityEventBaseline({ events: parsed });
    assert.deepEqual(report.statusDistribution, { 401: 143, 403: 27, 429: 20 });
    const now = Date.now();
    const recent = parsed.filter(event =>
      Date.parse(event.occurredAt) > now - RECENT_MS &&
      (event.eventCode === 'ACCESS_DENIED' || event.eventCode === 'RATE_LIMITED'));
    assert.equal(recent.length, 142);

    const anomaly = evaluateMirror({
      recentCount: recent.length, historicalCounts,
      sensitivity: config.detection.sensitivityStandardDeviations,
    });
    assert.equal(anomaly.detected, true);
    let lastDispatch = null;
    async function evaluateAndDeliver() {
      if (!anomaly.detected) return false;
      if (lastDispatch !== null && Date.now() - lastDispatch < 60 * 60_000) return false;
      const response = await fetch(sinkUrl + '/private-test-sink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schema: 'myeongha-a09-simulation-v1',
          synthetic: true,
          eventCount: recent.length,
          sensitivity: config.detection.sensitivityStandardDeviations,
        }),
        signal: AbortSignal.timeout(5000),
      });
      assert.equal(response.status, 202);
      lastDispatch = Date.now();
      return true;
    }

    assert.equal(await evaluateAndDeliver(), true);
    assert.equal(await evaluateAndDeliver(), false);
    assert.equal(receivedAlerts.length, 1);
    assert.equal(receivedAlerts[0].eventCount, 142);

    const serialized = JSON.stringify(report);
    for (const value of ['lab-member', 'lab-guest', 'lab-revoked', 'Authorization', 'Cookie']) {
      assert.equal(serialized.includes(value), false);
    }

    return {
      schemaVersion: 'myeongha-a09-isolated-attack-evidence-v1',
      mode: 'isolated-simulation-only',
      network: 'loopback-only; Docker --network none required in authoritative execution',
      productionChanged: false,
      realProviderAnomalyTriggered: false,
      actualEmitterImported: true,
      realHttpRequests: responses.length,
      httpStatusDistribution: responseCodes,
      structuredSecurityEvents: parsed.length,
      baseline: {
        simulatedPastDuration: '4h',
        simulatedBuckets: historicalCounts.length,
        baselineQuietDoesNotNotify: !baseline.detected,
      },
      detectorMirror: {
        algorithm: config.detection.algorithm,
        sensitivity: config.detection.sensitivityStandardDeviations,
        recentWindow: config.detection.recentWindow,
        baselineWindow: config.detection.baselineWindow,
        recentSecurityEvents: recent.length,
        approximateZScore: Number(anomaly.zScore.toFixed(2)),
        spikeDetected: anomaly.detected,
        note: 'deterministic local z-score mirror; not Cloudflare internal implementation',
      },
      delivery: { privateLoopbackSinkAccepted: receivedAlerts.length, repeatSuppressedForOneHour: true },
      privacySafe: true,
      monitorConfigurationSha256: queryHash,
      pass: true,
    };
  } finally {
    await Promise.all([new Promise(resolve => app.close(resolve)), new Promise(resolve => sink.close(resolve))]);
  }
}

async function main() {
  const result = await runIsolatedA09Attack();
  const output = JSON.stringify(result, null, 2) + '\n';
  const i = process.argv.indexOf('--output');
  if (i !== -1) {
    assert.equal(process.argv.length, i + 2);
    await writeFile(process.argv[i + 1], output, { flag: 'wx', mode: 0o600 });
  } else process.stdout.write(output);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
