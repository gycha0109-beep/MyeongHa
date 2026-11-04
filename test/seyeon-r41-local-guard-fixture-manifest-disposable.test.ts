// Watchtower-Track: security
import {afterAll,describe,expect,it} from 'vitest';
import {Pool} from 'pg';
import {
  buildSeyeonR41FixtureContextV1,
  buildSeyeonR41LocalGuardFixtureV1,
  SeyeonR41LocalFixtureHoldV1,
} from '../apps/api/src/seyeon-r41-offline-actual-guard-fixture-v1.js';
const enabled=process.env.CI==='true'
  &&process.env.SEYEON_POSITIVE_GRANT_REAL_PG==='1'
  &&process.env.PGHOST==='localhost'
  &&process.env.PGUSER==='postgres'
  &&process.env.PGDATABASE==='myeongha_seyeon_positive_pin_candidate_test';
const pool=enabled?new Pool({max:2,connectionTimeoutMillis:5000}):null;
const table='seyeon_positive_candidate.local_guard_fixture_manifest_r41';

describe('R41 actual Se-yeon guards, PUBLIC fixture only / no Provider',()=>{
  it('builds fixed, no-private, real-domain-guard-passing synthetic witness',()=>{
    const proof=buildSeyeonR41LocalGuardFixtureV1(
      buildSeyeonR41FixtureContextV1(),
    );
    expect(proof).toMatchObject({
      schemaVersion:'seyeon-r41-local-guard-fixture-v1',
      originKind:'code_authored_local_fixture_no_provider',
      providerDispatched:false,providerOutputVerified:false,
      outputGuardVerified:false,permitsProvider:false,
      permitsAtomicCommit:false,permitsHttpReveal:false,
    });
    for(const hash of [
      proof.interpretationOutputDigest,proof.rendererOutputDigest,
      proof.semanticReviewOutputDigest,
    ])expect(hash).toMatch(/^sha256:wire-utf8:v1:[0-9a-f]{64}$/u);
    expect(proof.guardedEnvelopeDigest).toMatch(/^sha256:v1:[0-9a-f]{64}$/u);
    expect(proof.rendererUtteranceHash).toMatch(/^sha256:v1:[0-9a-f]{64}$/u);
    expect(proof.interpretationText).not.toContain('private:');
    expect(proof.rendererText).not.toContain('private:');
    expect(proof.semanticReviewText).not.toContain('private:');
  });
  it('refuses private History or altered Character policy',()=>{
    const c=buildSeyeonR41FixtureContextV1();
    expect(()=>buildSeyeonR41LocalGuardFixtureV1({
      ...c,recentConversation:[{
        messageId:'unapproved-history',role:'assistant',
        text:'unapproved previous text',
      }],
    })).toThrow(SeyeonR41LocalFixtureHoldV1);
    expect(()=>buildSeyeonR41LocalGuardFixtureV1({
      ...c,behaviorPolicy:{...c.behaviorPolicy,
        maxQuestionsPerUtterance:4 as 1,
      },
    })).toThrow(SeyeonR41LocalFixtureHoldV1);
  });
});

describe.skipIf(!enabled)('R41 real isolated DB immutable code-derived bootstrap',()=>{
  afterAll(async()=>{await pool?.end();});
  it('installs one actual-runtime Guard fingerprint, rejects rewrite and executor read',async()=>{
    if(!pool)throw Error('R41 named scratch DB required');
    const data=buildSeyeonR41LocalGuardFixtureV1(
      buildSeyeonR41FixtureContextV1(),
    );
    const values=[
      data.interpretationOutputDigest,data.rendererOutputDigest,
      data.semanticReviewOutputDigest,data.rendererUtteranceHash,
      data.guardedEnvelopeDigest,
    ];
    const db=await pool.query<{name:string;role:string}>(
      'select current_database() as name,current_user as role',
    );
    expect(db.rows).toEqual([{
      name:'myeongha_seyeon_positive_pin_candidate_test',role:'postgres',
    }]);
    const installed=await pool.query<{ok:boolean}>(
      'select seyeon_positive_candidate.install_local_guard_fixture_manifest_r41($1::text,$2::text,$3::text,$4::text,$5::text) as ok',
      values,
    );
    expect(installed.rows).toEqual([{ok:true}]);
    const row=await pool.query<{
      interpretation_output_digest:string;renderer_output_digest:string;
      semantic_review_output_digest:string;renderer_utterance_hash:string;
      guarded_envelope_digest:string;
    }>('select interpretation_output_digest,renderer_output_digest,semantic_review_output_digest,renderer_utterance_hash,guarded_envelope_digest from '+table);
    expect(row.rows).toEqual([{
      interpretation_output_digest:data.interpretationOutputDigest,
      renderer_output_digest:data.rendererOutputDigest,
      semantic_review_output_digest:data.semanticReviewOutputDigest,
      renderer_utterance_hash:data.rendererUtteranceHash,
      guarded_envelope_digest:data.guardedEnvelopeDigest,
    }]);
    await expect(pool.query(
      'select seyeon_positive_candidate.install_local_guard_fixture_manifest_r41($1::text,$2::text,$3::text,$4::text,$5::text)',
      values,
    )).rejects.toMatchObject({code:'23505'});
    await expect(pool.query(
      "update "+table+" set guarded_envelope_digest='sha256:v1:"+'0'.repeat(64)+"'",
    )).rejects.toMatchObject({
      code:'23514',constraint:'offline_source_set_immutable',
    });
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE myeongha_api_executor');
      await expect(client.query('select * from '+table))
        .rejects.toMatchObject({code:'42501'});
      await client.query('ROLLBACK');
    }finally{
      await client.query('ROLLBACK').catch(()=>undefined);
      client.release();
    }
  },30000);
});
