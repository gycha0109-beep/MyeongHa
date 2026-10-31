import { execFile as execFileCb } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  executePostgresSubjectTransactionV1,
} from '../apps/api/src/postgres-subject-execution.js';

const execFile = promisify(execFileCb);
const OWNER_A = '92000000-0000-4000-8000-000000000001';
const OWNER_B = '92000000-0000-4000-8000-000000000002';
const AUTH_A = '91000000-0000-4000-8000-000000000001';
const AUTH_B = '91000000-0000-4000-8000-000000000002';
const LOGIN = 'myeongha_phase7_isolated_login';
const ADMIN = 'myeongha_phase7_isolated_admin';
const GUEST = 'myeongha_phase7_isolated_stranger';
const BIN = process.env.PG_BIN_DIR;
const ext = process.platform === 'win32' ? '.exe' : '';

async function pgTool(name: string, args: string[]) {
  if (!BIN) throw Error('PG_BIN_DIR is required for isolated PostgreSQL integration');
  return execFile(join(BIN, name + ext), args, {
    timeout: 30_000, windowsHide: true, maxBuffer: 512 * 1024,
    env: {
      ...process.env,
      PATH: BIN + (process.platform === 'win32' ? ';' : ':') + (process.env.PATH ?? ''),
    },
  });
}
async function availablePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const info = server.address();
  if (info === null || typeof info === 'string') throw Error('No isolated TCP port');
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return info.port;
}
const sql = `
CREATE ROLE myeongha_api_executor NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE ${LOGIN} LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
CREATE ROLE ${GUEST} LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
GRANT myeongha_api_executor TO ${LOGIN} WITH INHERIT FALSE, SET TRUE;
CREATE TABLE public.phase7_rls_synthetic (
  owner_id uuid NOT NULL,
  payload text NOT NULL
);
INSERT INTO public.phase7_rls_synthetic(owner_id,payload)
VALUES ('${OWNER_A}','synthetic-A'),('${OWNER_B}','synthetic-B');
ALTER TABLE public.phase7_rls_synthetic ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phase7_rls_synthetic FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_only ON public.phase7_rls_synthetic
FOR SELECT TO myeongha_api_executor
USING (owner_id = NULLIF(current_setting('myeongha.subject_id',true),'')::uuid);
GRANT SELECT ON public.phase7_rls_synthetic TO myeongha_api_executor;
REVOKE ALL ON public.phase7_rls_synthetic FROM PUBLIC;
CREATE FUNCTION public.begin_member_subject_context_v1(auth_user uuid)
RETURNS TABLE(subject_id uuid,subject_kind text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public
AS $$
DECLARE target uuid;
BEGIN
  IF auth_user = '${AUTH_A}'::uuid THEN
    target := '${OWNER_A}'::uuid;
  ELSIF auth_user = '${AUTH_B}'::uuid THEN
    target := '${OWNER_B}'::uuid;
  ELSE
    RAISE EXCEPTION 'Unknown synthetic member' USING ERRCODE='28000';
  END IF;
  PERFORM set_config('myeongha.subject_id',target::text,true);
  RETURN QUERY SELECT target,'member'::text;
END;
$$;
CREATE FUNCTION public.assert_myeongha_subject_context_v1(subject uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public
AS $$
BEGIN
  IF NULLIF(current_setting('myeongha.subject_id',true),'')::uuid IS DISTINCT FROM subject THEN
    RAISE EXCEPTION 'Synthetic subject assertion failed' USING ERRCODE='28000';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.begin_member_subject_context_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_myeongha_subject_context_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_member_subject_context_v1(uuid) TO myeongha_api_executor;
GRANT EXECUTE ON FUNCTION public.assert_myeongha_subject_context_v1(uuid) TO myeongha_api_executor;
`;

const isolated = BIN ? describe : describe.skip;

isolated('Phase 7 isolated PostgreSQL real RLS / execution-role transaction boundary', () => {
  it('isolates two subjects across the same pooled connection, rejects bypass, and resets transaction state', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'myeongha-phase7-rls-'));
    const log = join(dir, 'postmaster.log');
    let started = false;
    let admin: Pool | undefined;
    let pool: Pool | undefined;
    let stranger: Pool | undefined;
    try {
      await pgTool('initdb', ['-D',dir,'-U',ADMIN,'--auth-host=trust','--auth-local=trust',
        '--encoding=UTF8','--no-sync','--no-instructions']);
      const port = await availablePort();
      await pgTool('pg_ctl', ['-D',dir,'-l',log,'-o',
        '-h 127.0.0.1 -p '+port+' -c listen_addresses=127.0.0.1',
        '-w','-t','20','start']);
      started = true;
      const base = { host:'127.0.0.1',port,database:'postgres',ssl:false,
        max:1,connectionTimeoutMillis:1500,allowExitOnIdle:true };
      admin = new Pool({ ...base,user:ADMIN });
      pool = new Pool({ ...base,user:LOGIN });
      stranger = new Pool({ ...base,user:GUEST });
      await admin.query(sql);

      const info = await pool.query(`
        SELECT rolname, rolsuper, rolbypassrls, rolcreaterole
        FROM pg_roles WHERE rolname = current_user
      `);
      expect(info.rows[0]).toMatchObject({
        rolname:LOGIN,rolsuper:false,rolbypassrls:false,rolcreaterole:false,
      });
      await expect(pool.query('SELECT payload FROM public.phase7_rls_synthetic'))
        .rejects.toMatchObject({ code:'42501' });

      const subjectPool = {
        connect: async () => {
          const client = await pool!.connect();
          return {
            query: async (query: string, values?: readonly unknown[]) =>
              client.query(query,values ? [...values] : []),
            release: (error?: unknown) => client.release(error instanceof Error ? error : undefined),
          };
        },
      };
      async function readMember(authUser: string) {
        return executePostgresSubjectTransactionV1({
          pool: subjectPool,
          verifiedEvidence: { kind:'member' as const, verifiedAuthUserId:authUser },
          execute: async ({ resolvedSubject, client }) => {
            const rows = await client.query<{owner_id:string,payload:string}>(
              'SELECT owner_id::text,payload FROM public.phase7_rls_synthetic ORDER BY payload');
            const identity = await client.query<{current_role:string}>(
              'SELECT current_user AS current_role');
            expect(identity.rows[0]?.current_role).toBe('myeongha_api_executor');
            return { subject:resolvedSubject.subjectId, records:rows.rows };
          },
        });
      }
      const a = await readMember(AUTH_A);
      expect(a.subject).toBe(OWNER_A);
      expect(a.records.map(x=>x.payload)).toEqual(['synthetic-A']);
      const b = await readMember(AUTH_B);
      expect(b.subject).toBe(OWNER_B);
      expect(b.records.map(x=>x.payload)).toEqual(['synthetic-B']);
      await expect(readMember('91000000-0000-4000-8000-000000000099'))
        .rejects.toThrow();
      const again = await readMember(AUTH_A);
      expect(again.records.map(x=>x.payload)).toEqual(['synthetic-A']);

      const after = await pool.query(
        "SELECT current_user, current_setting('myeongha.subject_id',true) AS subject_id");
      expect(after.rows[0]?.current_user).toBe(LOGIN);
      expect(after.rows[0]?.subject_id ?? '').toBe('');
      await expect(stranger.query('SET ROLE myeongha_api_executor'))
        .rejects.toMatchObject({code:'42501'});
      await expect(pool.query("INSERT INTO public.phase7_rls_synthetic VALUES ($1,'forbidden')",[OWNER_A]))
        .rejects.toMatchObject({code:'42501'});

      console.log('MYEONGHA_ISOLATED_POSTGRES_RLS_PHASE7_PASS',JSON.stringify({
        target:'ephemeral_pg18_loopback',subjectARead:1,subjectBRead:1,
        crossSubjectVisible:0,configuredPoolMax:1,
        loginBypassRls:false,roleReset:true,contextReset:true,
        unauthorizedRoleSetDenied:true,unauthorizedWriteDenied:true,
        productionRlsPolicyProven:false,productionTlsProven:false,
      }));
    } finally {
      await stranger?.end().catch(() => undefined);
      await pool?.end().catch(() => undefined);
      await admin?.end().catch(() => undefined);
      if (started) {
        await pgTool('pg_ctl',['-D',dir,'-m','immediate','-w','-t','20','stop'])
          .catch(() => undefined);
      }
      await rm(dir,{recursive:true,force:true}).catch(() => undefined);
    }
  }, 90_000);
});
