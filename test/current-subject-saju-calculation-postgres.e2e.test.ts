import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handleCurrentSubjectBirthProfileRequestV1 } from '../apps/api/src/current-subject-birth-profile-http.js';
import { handleCurrentSubjectSajuCalculationRequestV1 } from '../apps/api/src/current-subject-saju-calculation-http.js';
import { handleCurrentSubjectSajuPreviewReadingRequestV1 } from '../apps/api/src/current-subject-saju-preview-reading-http.js';
import { createCurrentSubjectSajuCalculationRouteV1 } from '../api/me/saju/calculation.js';
import { createSajuProductionCalculationHttpAdapterV1 } from '../apps/api/src/saju-production-calculation-http-adapter.js';
import { createSajuPreviewReadingHttpAdapterV1 } from '../apps/api/src/saju-production-reading-http-adapter.js';
import type { IdentityEvidenceVerificationPortV1 } from '../apps/api/src/current-subject-profile-http.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

// Opt-in extension of the existing disposable Saju/Birth fixture. Identity is
// synthetic; PostgreSQL queries, ACL/RLS and both service HTTP hops are real.
// This is neither a hosted-auth test nor Production release evidence.
const enabled = process.env.MYEONGHA_RUN_CURRENT_SAJU_POSTGRES_E2E === '1';
const DB = 'myeongha_saju_subject_local_verify';
const OWNER = '8c310001-0000-4000-8000-000000000001';
const OTHER = '8c310002-0000-4000-8000-000000000002';
const PROFILE = '8c330001-0000-4000-8000-000000000001';
const R1 = '8c340001-0000-4000-8000-000000000001';
const R2 = '8c340002-0000-4000-8000-000000000002';
const trustedOrigin = 'https://saju-disposable-test.invalid';

describe.skipIf(!enabled)('current Birth -> real PostgreSQL -> real Saju calculation HTTP', () => {
  let runtime: Pool;
  let admin: Pool;
  let server: Server;
  let origin: string;
  let upstreamRequests = 0;
  let failUpstream = false;

  beforeAll(async () => {
    const sajuOrigin = process.env.MYEONGHA_SAJU_CROSS_SERVICE_ORIGIN ?? '';
    const dbPort = Number(process.env.PGPORT);
    if (process.env.PGHOST !== '127.0.0.1' || process.env.PGDATABASE !== DB
      || !Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65535
      || process.env.PGUSER !== 'postgres' || !process.env.PGPASSWORD
      || !process.env.MYEONGHA_LOCAL_SUBJECT_DB_PASSWORD
      || !/^http:\/\/127\.0\.0\.1:\d+$/u.test(sajuOrigin)
      || !process.env.MYEONGHA_SAJU_CROSS_SERVICE_BEARER) {
      throw new Error('Only the named disposable loopback PostgreSQL/Saju fixture is allowed.');
    }
    const config = { host: '127.0.0.1', port: dbPort, database: DB, max: 2,
      connectionTimeoutMillis: 5000, statement_timeout: 5000 };
    admin = new Pool({ ...config, user: 'postgres', password: process.env.PGPASSWORD });
    runtime = new Pool({ ...config, user: 'myeongha_runtime',
      password: process.env.MYEONGHA_LOCAL_SUBJECT_DB_PASSWORD });
    const posture = await runtime.query(`select current_database() as db, current_user as principal,
      (select rolsuper or rolbypassrls from pg_roles where rolname=current_user) as bypass`);
    expect(posture.rows[0]).toEqual({ db: DB, principal: 'myeongha_runtime', bypass: false });
    await admin.query('update public.birth_profiles set current_revision_id=$1 where id=$2', [R1, PROFILE]);

    const pool: PostgresSubjectPoolV1 = {
      async connect() {
        const client = await runtime.connect();
        return {
          async query<Row>(sql: string, values?: readonly unknown[]) {
            const result = await client.query(sql, values === undefined ? undefined : [...values]);
            return { rows: result.rows as readonly Row[] };
          },
          release(error?: unknown) { client.release(error instanceof Error ? error : undefined); },
        };
      },
    };
    const identityEvidenceVerifier: IdentityEvidenceVerificationPortV1 = {
      async verifyRequestIdentity(request) {
        const token = request.headers.get('authorization');
        return token === 'Bearer fixture-owner' || token === 'Bearer fixture.owner.signature' ? { kind: 'member', verifiedAuthUserId: OWNER }
          : token === 'Bearer fixture-other' ? { kind: 'member', verifiedAuthUserId: OTHER } : null;
      },
    };
    const sajuAdapter = createSajuProductionCalculationHttpAdapterV1({
      baseUrl: trustedOrigin,
      bearerToken: process.env.MYEONGHA_SAJU_CROSS_SERVICE_BEARER!,
      async fetchImpl(url, init) {
        expect(url).toBe(trustedOrigin + '/api/calculations');
        upstreamRequests += 1;
        if (failUpstream) throw new TypeError('Disposable Saju transport unavailable');
        return fetch(sajuOrigin + '/api/calculations', init);
      },
    });
    const calculationRoute = createCurrentSubjectSajuCalculationRouteV1({
      handleRequest(input) {
        return handleCurrentSubjectSajuCalculationRequestV1({
          ...input, pool, identityEvidenceVerifier, sajuAdapter,
        });
      },
    });
    const previewAdapter = createSajuPreviewReadingHttpAdapterV1({
      baseUrl: trustedOrigin,
      bearerToken: process.env.MYEONGHA_SAJU_CROSS_SERVICE_BEARER!,
      fetchImpl(url, init) {
        expect(url).toBe(trustedOrigin + '/api/preview/readings');
        return fetch(sajuOrigin + '/api/preview/readings', init);
      },
    });
    server = createServer(async (req, res) => {
      try {
        if (!req.url?.startsWith('/api/')) {
          const root = resolve(process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public');
          const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
          const path = resolve(root, '.' + pathname);
          const types: Record<string, string> = { '.html': 'text/html; charset=utf-8',
            '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml',
            '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
          const contentType = types[extname(path)];
          if (!path.startsWith(root + sep) || !contentType) { res.writeHead(404); res.end(); return; }
          try { const content = await readFile(path); res.writeHead(200, { 'content-type': contentType }); res.end(content); }
          catch { res.writeHead(404); res.end(); }
          return;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const body = Buffer.concat(chunks);
        const request = new Request('http://127.0.0.1' + req.url, {
          method: req.method!, headers: req.headers as Record<string, string>,
          ...(body.length > 0 ? { body } : {}),
        });
        const input = { request, requestId: 'disposable-current-birth-e2e',
          serverTime: new Date().toISOString(), pool, identityEvidenceVerifier };
        const response = req.url === '/api/me/birth-profile'
          ? await handleCurrentSubjectBirthProfileRequestV1(input)
          : req.url === '/api/me/saju/preview-reading'
            ? await handleCurrentSubjectSajuPreviewReadingRequestV1({ ...input, sajuAdapter: previewAdapter })
            : await calculationRoute.fetch(request);
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(await response.text());
      } catch { res.writeHead(500); res.end(); }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Missing loopback API');
    origin = 'http://127.0.0.1:' + address.port;
  });

  afterAll(async () => {
    if (admin) await admin.query('update public.birth_profiles set current_revision_id=$1 where id=$2', [R1, PROFILE]);
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await Promise.all([runtime?.end(), admin?.end()]);
  });

  async function calculate(token = 'fixture-owner', body?: string) {
    return fetch(origin + '/api/me/saju/calculation', { method: 'POST',
      headers: { authorization: 'Bearer ' + token }, ...(body ? { body } : {}) });
  }

  it('reads the actual current Birth and calculates it through the authenticated Saju process', async () => {
    const birth = await fetch(origin + '/api/me/birth-profile', {
      headers: { authorization: 'Bearer fixture-owner' },
    });
    expect(birth.status).toBe(200);
    expect((await birth.json()).data.birthProfile.currentRevision.revisionId).toBe(R1);
    const result = await calculate();
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('no-store');
    const payload = await result.json();
    expect(payload.data.calculation).toMatchObject({ birthRevisionRef: R1,
      semanticAuthority: 'calculation_only', interpretationAuthorized: false });
    expect(payload.data.calculation.snapshot).toBeTruthy();
    expect(upstreamRequests).toBe(1);
  });

  it('binds a newly authoritative revision even when both immutable revisions have identical Birth values', async () => {
    await admin.query('update public.birth_profiles set current_revision_id=$1 where id=$2', [R2, PROFILE]);
    const result = await calculate();
    expect(result.status).toBe(200);
    expect((await result.json()).data.calculation.birthRevisionRef).toBe(R2);
  });

  it('denies unauthenticated, other-owner and client-selected revision requests before Saju', async () => {
    const count = upstreamRequests;
    expect((await calculate('unverified')).status).toBe(401);
    const other = await calculate('fixture-other');
    expect(other.status).toBe(404);
    expect(await other.text()).not.toContain(PROFILE);
    expect((await calculate('fixture-owner', JSON.stringify({ birthRevisionRef: R1 }))).status).toBe(400);
    expect(upstreamRequests).toBe(count);
  });

  it('returns a retryable closed response when the Saju service transport fails', async () => {
    failUpstream = true;
    const result = await calculate();
    expect(result.status).toBe(503);
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(await result.text()).not.toContain('snapshot');
    failUpstream = false;
    expect((await calculate()).status).toBe(200);
  });

  it.skipIf(!process.env.CHROME_BIN)('renders the current Birth, real chart and Korean interpretation in Chrome', async () => {
    // Same headless Chrome/CDP mechanism as verify-web-saju-auth-browser-core.mjs.
    // Only the local member identity proof is seeded; API/DB/engine responses are real.
    const profile = await mkdtemp(join(tmpdir(), 'myeongha-current-saju-browser-'));
    const chrome = spawn(process.env.CHROME_BIN!, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
    ], { stdio: 'ignore' });
    let ws: WebSocket | undefined;
    try {
      let port = '';
      for (let i = 0; i < 100 && !port; i += 1) {
        if (chrome.exitCode !== null) throw new Error('Chrome exited before CDP became ready');
        try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/u)[0]!; }
        catch { await sleep(50); }
      }
      if (!/^\d+$/u.test(port)) throw new Error('Chrome loopback CDP unavailable');
      const target = await (await fetch('http://127.0.0.1:' + port + '/json/new?about%3Ablank', { method: 'PUT' })).json();
      ws = new WebSocket(target.webSocketDebuggerUrl);
      const socket = ws;
      await new Promise<void>((done, reject) => {
        socket.addEventListener('open', () => done(), { once: true });
        socket.addEventListener('error', reject, { once: true });
      });
      let nextId = 0;
      const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
      socket.addEventListener('message', event => {
        const message = JSON.parse(String(event.data));
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result ?? {});
      });
      const send = (method: string, params: Record<string, unknown> = {}) => new Promise<any>((resolve, reject) => {
        const id = ++nextId; pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
      const evaluate = async (expression: string) => {
        const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) throw new Error('Chrome evaluation failed');
        return result.result?.value;
      };
      await send('Page.enable');
      const member = { accessToken: 'fixture.owner.signature', tokenType: 'bearer',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        user: { id: OWNER, email: 'disposable-current-birth@example.invalid' } };
      await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `localStorage.setItem('myeongha.memberSession.v1', ${JSON.stringify(JSON.stringify(member))});`,
      });
      const count = upstreamRequests;
      await send('Page.navigate', { url: origin + '/reading.html' });
      let state: any;
      for (let i = 0; i < 150; i += 1) {
        state = await evaluate(`({ visible: document.querySelector('#saju-hub')?.hidden === false,
          day: document.querySelector('#saju-day-master')?.textContent?.trim(),
          birth: document.querySelector('#saju-birth-summary')?.textContent?.trim() })`);
        if (state?.visible && state.day && state.day !== '—') break;
        await sleep(50);
      }
      expect(state).toMatchObject({ visible: true });
      expect(state.birth).toContain('2024.03.10');
      const result = await (await calculate()).json();
      const stem = result.data.calculation.snapshot.pillars.day.value.stem;
      expect(state.day).toBe(`${stem.hanja || ''}${stem.value || ''}`);
      expect(result.data.calculation.birthRevisionRef).toBe(R2);
      expect(upstreamRequests).toBeGreaterThan(count + 1);

      const previewRequest = await fetch(origin + '/api/me/saju/preview-reading', {
        method: 'POST',
        headers: { authorization: 'Bearer fixture-owner', 'content-type': 'application/json' },
        body: JSON.stringify({ readingText: '재물운' }),
      });
      expect(previewRequest.status).toBe(200);
      const preview = await previewRequest.json();
      const paragraphs: string[] = preview.data.reading.reading.sections
        .filter((section: { sectionType: string }) => section.sectionType === 'wealth')
        .flatMap((section: { blocks: { type: string; text?: string; items?: string[] }[] }) =>
          section.blocks.flatMap(block => block.type === 'paragraph' ? [block.text] : block.items ?? []));
      expect(paragraphs.some(text => /[가-힣]{2}/u.test(text))).toBe(true);

      const wealthLink = await evaluate(`document.querySelector(
        '#saju-hub a[href="reading-detail.html?topic=money"]')?.href ?? ''`);
      expect(wealthLink).toBe(origin + '/reading-detail.html?topic=money');
      await send('Page.navigate', { url: wealthLink });
      let body = '';
      for (let i = 0; i < 150; i += 1) {
        body = await evaluate(`document.body?.dataset.readingRouteState === 'preview' &&
          document.querySelector('[data-reading-stage]')?.hidden === false ?
          document.querySelector('[data-reading-step-body]')?.textContent?.trim() : ''`);
        if (body) break;
        await sleep(50);
      }
      const detailState = await evaluate(`({ path: location.pathname,
        state: document.body?.dataset.readingRouteState,
        title: document.querySelector('[data-reading-state-title]')?.textContent })`);
      expect(body, JSON.stringify(detailState)).not.toBe('');
      expect(paragraphs).toContain(body);
    } finally {
      ws?.close();
      chrome.kill();
      if (chrome.exitCode === null) await Promise.race([new Promise(resolve => chrome.once('exit', resolve)), sleep(2000)]);
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }, 20_000);
});
