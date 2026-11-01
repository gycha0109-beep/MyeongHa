// Watchtower-Track: security
// R36 owner-only bootstrap: actual code-derived public Character/Interpreter
// policy frozen in a named disposable database, no user data or Provider IO.
import {afterAll,describe,expect,it} from 'vitest';
import {Pool} from 'pg';
import {
  buildSeyeonR36OfflineAuthoredManifestV1,
} from '../apps/api/src/seyeon-r36-offline-static-authority-manifest-v1.js';

const enabled=process.env.CI==='true'
  &&process.env.SEYEON_POSITIVE_GRANT_REAL_PG==='1'
  &&process.env.PGHOST==='localhost'
  &&process.env.PGUSER==='postgres'
  &&process.env.PGDATABASE==='myeongha_seyeon_positive_pin_candidate_test';
const pool=enabled?new Pool({max:3,connectionTimeoutMillis:5000}):null;
const installSignature=
  'seyeon_positive_candidate.install_interpreter_static_authority_r36(text,jsonb,text,jsonb,jsonb,jsonb,jsonb,jsonb)';
const tableName=
  'seyeon_positive_candidate.interpreter_static_authority_manifest_r36';

describe.skipIf(!enabled)('R36 approved-code-only Interpreter static Owner manifest',()=>{
  afterAll(async()=>{await pool?.end();});
  it('seeds once from actual runtime code and seals strict DB ACL and immutability',async()=>{
    if(!pool)throw Error('R36 named disposable DB required');
    const trusted=buildSeyeonR36OfflineAuthoredManifestV1();
    expect(trusted.interpreterInstructions.length).toBeGreaterThan(1024);
    expect(trusted.bibleSlices.length).toBeGreaterThanOrEqual(8);
    const db=await pool.query<{
      name:string;actor:string;
    }>('select current_database() as name,current_user as actor');
    expect(db.rows).toEqual([{
      name:'myeongha_seyeon_positive_pin_candidate_test',actor:'postgres',
    }]);
    const values=[
      trusted.interpreterInstructions,
      JSON.stringify(trusted.responseSchema),
      trusted.contextSchemaVersion,
      JSON.stringify(trusted.character),
      JSON.stringify(trusted.authorityBoundaries),
      JSON.stringify(trusted.bibleSlices),
      JSON.stringify(trusted.actionPolicy),
      JSON.stringify(trusted.allowedInterpretationVocabulary),
    ];
    const r=await pool.query<{digest:string}>(
      'select seyeon_positive_candidate.install_interpreter_static_authority_r36($1::text,$2::jsonb,$3::text,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb) as digest',
      values,
    );
    expect(r.rows[0]?.digest).toMatch(/^sha256:pg-jsonb:v1:[a-f0-9]{64}$/u);
    const manifest=await pool.query<{
      interpreter_instructions:string;
      response_schema:unknown;context_schema_version:string;
      character:unknown;authority_boundaries:unknown;
      bible_slices:unknown;action_policy:unknown;
      allowed_interpretation_vocabulary:unknown;
      reference_manifest_digest:string;
    }>(
      'select interpreter_instructions,response_schema,context_schema_version,character,authority_boundaries,bible_slices,action_policy,allowed_interpretation_vocabulary,reference_manifest_digest from '+tableName,
    );
    expect(manifest.rows).toHaveLength(1);
    expect(manifest.rows[0]).toMatchObject({
      interpreter_instructions:trusted.interpreterInstructions,
      response_schema:trusted.responseSchema,
      context_schema_version:trusted.contextSchemaVersion,
      character:trusted.character,
      authority_boundaries:trusted.authorityBoundaries,
      bible_slices:trusted.bibleSlices,
      action_policy:trusted.actionPolicy,
      allowed_interpretation_vocabulary:trusted.allowedInterpretationVocabulary,
      reference_manifest_digest:r.rows[0]!.digest,
    });
    await expect(pool.query(
      'select seyeon_positive_candidate.install_interpreter_static_authority_r36($1::text,$2::jsonb,$3::text,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb)',
      values,
    )).rejects.toMatchObject({code:'23505'});
    const forbidden=await pool.query<{
      can_read:boolean;can_insert:boolean;can_install:boolean;
      can_public_install:boolean;
    }>(
      "select has_table_privilege('myeongha_api_executor',$1,'SELECT') as can_read,"+
      " has_table_privilege('myeongha_api_executor',$1,'INSERT') as can_insert,"+
      " has_function_privilege('myeongha_api_executor',$2,'EXECUTE') as can_install,"+
      " has_function_privilege('public',$2,'EXECUTE') as can_public_install",
      [tableName,installSignature],
    );
    expect(forbidden.rows).toEqual([{
      can_read:false,can_insert:false,
      can_install:false,can_public_install:false,
    }]);
    const writer=await pool.connect();
    try{
      await writer.query('BEGIN');
      await expect(writer.query(
        'update '+tableName+" set interpreter_instructions='forged'",
      )).rejects.toMatchObject({
        code:'23514',constraint:'offline_source_set_immutable',
      });
    }finally{
      await writer.query('ROLLBACK').catch(()=>undefined);
      writer.release();
    }
    const reader=await pool.connect();
    try{
      await reader.query('BEGIN');
      await reader.query('SET LOCAL ROLE myeongha_api_executor');
      await expect(reader.query('select * from '+tableName)).rejects.toMatchObject({
        code:'42501',
      });
    }finally{
      await reader.query('ROLLBACK').catch(()=>undefined);
      reader.release();
    }
  },30000);
});
