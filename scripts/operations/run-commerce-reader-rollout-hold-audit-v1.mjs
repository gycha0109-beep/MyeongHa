// Watchtower-Track: commerce-payment
// ONE explicitly invoked Commerce release HOLD inspection. No deployment.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildCommerceP2AuditDbTargetV1} from
  './run-commerce-p2-readonly-audit-v1.mjs';
import {inspectCommerceP2SingleSnapshotHoldV1} from
  './commerce-p2-single-snapshot-readiness-hold-v1.mjs';
import {inspectCommerceReaderProductionSchemaHoldV1} from
  './commerce-reader-production-schema-hold-preflight-v1.mjs';
import {inspectCommerceReaderProductionRolloutEvidenceV1} from
  './commerce-reader-production-rollout-evidence-v1.mjs';
import {inspectCommerceReaderStagedSqlIntegrityV1} from
  './commerce-reader-staged-source-integrity-v1.mjs';

function failure(code){
  return Object.freeze({
    exitCode:2,
    output:Object.freeze({
      state:'HOLD_UNVERIFIED',
      code,
      saleAuthorized:false,
      readerDeliveryAuthorized:false,
      refundAuthorized:false,
      migrationAuthorized:false,
      liveAuthorized:false,
      writesPerformed:false,
    }),
  });
}

/**
 * Strictly manual operator call. It uses only the pinned host/role/CA audited
 * connection options already accepted by the P2 operator.
 *
 * Each inspector opens/closes its own REPEATABLE READ READ ONLY transaction;
 * these are independent snapshots, never represented as a cross-checkout
 * atomic admission or a LIVE release.
 *
 * Failures redact all source SQL errors, DSN, credentials and private DB rows.
 */
export async function runCommerceReaderRolloutHoldAuditV1(env,{
  validateCa,
  clientFactory,
  readFile,
}={}){
  const config=buildCommerceP2AuditDbTargetV1(env,{
    ...(validateCa?{validateCa}:{}),
  });
  if(!config)return failure('READER_ROLLOUT_AUDIT_CONFIGURATION_NOT_TRUSTED');
  let manifest;
  try{
    manifest=await inspectCommerceReaderStagedSqlIntegrityV1({
      ...(readFile?{readFile}:{}),
    });
  }catch{return failure('READER_ROLLOUT_STAGED_SOURCE_UNVERIFIED');}
  if(!manifest||manifest.allGitBlobsMatchManifest!==true
    ||manifest.productionMigrationAuthorized!==false
    ||manifest.reviewedMigrationCount!==59)
    return failure('READER_ROLLOUT_STAGED_SOURCE_UNVERIFIED');

  let client;
  try{
    if(clientFactory)client=await clientFactory(config);
    else{
      const {Client}=await import('pg');
      client=new Client(config);
    }
    if(!client||typeof client.connect!=='function'
      ||typeof client.query!=='function'||typeof client.end!=='function')
      return failure('READER_ROLLOUT_AUDIT_CLIENT_INVALID');
    await client.connect();
    // Deliberately separate readonly snapshots; no Authorization results.
    const catalog=await inspectCommerceP2SingleSnapshotHoldV1(client);
    const schema=await inspectCommerceReaderProductionSchemaHoldV1(client);
    const rollout=await inspectCommerceReaderProductionRolloutEvidenceV1(client);
    if(catalog.saleActivationAuthorized!==false||catalog.checkoutAuthorized!==false
      ||catalog.productionReaderFulfillmentAuthorized!==false
      ||catalog.writesPerformed!==false||schema.operationsDatabaseModified!==false
      ||schema.p5LiveLaunchAuthorized!==false
      ||rollout.productSaleAuthorized!==false||rollout.paidReaderDeliveryAuthorized!==false
      ||rollout.customerRefundAuthorized!==false
      ||rollout.productionMigrationAuthorized!==false
      ||rollout.liveAuthorized!==false||rollout.writesPerformed!==false)
      return failure('READER_ROLLOUT_AUDIT_UNTRUSTED_RESULT');

    // Verify the two different schema probes agree. A concurrent deployment
    // between their snapshots is an explicit HOLD, not a false "ready" report.
    const oldMissing=[...schema.missing].sort();
    const newMissing=[...rollout.missingTables].sort();
    if(oldMissing.length!==newMissing.length||
      oldMissing.some((name,i)=>name!==newMissing[i]))
      return failure('READER_ROLLOUT_SCHEMA_SNAPSHOTS_CHANGED');

    const expectedHold=catalog.status==='hold_observed'
      &&schema.state==='schema_incomplete'
      &&rollout.state==='staged_unmounted_hold';
    const state=expectedHold?'CURRENT_STAGED_HOLD_OBSERVED':
      'RELEASE_PRECONDITIONS_UNVERIFIED';
    return Object.freeze({
      exitCode:expectedHold?0:2,
      output:Object.freeze({
        state,
        catalog:Object.freeze({
          status:catalog.status,
          driftKeys:catalog.driftKeys,
          counts:catalog.counts,
        }),
        readerSchema:Object.freeze({
          state:schema.state,
          missing:schema.missing,
          present:schema.present,
        }),
        stagedReader:Object.freeze({
          state:rollout.state,
          localReviewedSqlCount:manifest.reviewedMigrationCount,
          deployedMigrationCount:rollout.appliedStagedMigrations,
          missingMigrationCount:rollout.missingVersions.length,
          missingTables:rollout.missingTables,
          unsafeAclTables:rollout.unsafeAclTables,
          schemaHistoryMismatch:rollout.schemaHistoryMismatch,
          missingFunctions:rollout.missingFunctions,
          unsafeFunctionGrants:rollout.unsafeFunctionGrants,
          functionHistoryMismatch:rollout.functionHistoryMismatch,
        }),
        outstandingAuthority:Object.freeze([
          'P0_CM_03_INDIVIDUAL_PRODUCT_SALE_HOLD',
          'SAJU_PRODUCTION_INTERPRETATION_NOT_ATTESTED',
          'READER_DATABASE_ROLLOUT_NOT_APPROVED',
          'PROVIDER_LEGAL_CUSTOMER_DELIVERY_LIVE_NOT_ATTESTED',
        ]),
        saleAuthorized:false,readerDeliveryAuthorized:false,
        refundAuthorized:false,migrationAuthorized:false,
        liveAuthorized:false,writesPerformed:false,
      }),
    });
  }catch{
    return failure('READER_ROLLOUT_AUDIT_EXECUTION_UNVERIFIED');
  }finally{
    if(client&&typeof client.end==='function'){
      try{await client.end();}catch{/* secrets never logged */}
    }
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const r=await runCommerceReaderRolloutHoldAuditV1(process.env);
  process.stdout.write(JSON.stringify(r.output)+'\n');
  process.exitCode=r.exitCode;
}
