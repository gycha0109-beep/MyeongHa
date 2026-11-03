import {deriveAdminAnalyticsReferenceV1,type AdminAnalyticsEventStoreV1} from './admin-analytics-pipeline-v1.js';
import type {PostgresAccountDeletionWorkerPortsV1} from './postgres-account-deletion-worker.js';

/** Inject into the existing claimed-lease deletion worker, never a public route.
 * If erasure fails, database finalization/completion must not be acknowledged.
 * Repeated erasure is safe after an uncertain response or a resumed deletion. */
export function withAdminAnalyticsDeletionV1(input:{readonly ports:PostgresAccountDeletionWorkerPortsV1;readonly store:AdminAnalyticsEventStoreV1;readonly secret:string}):PostgresAccountDeletionWorkerPortsV1{
 const erase=async(subjectId:string)=>{
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(subjectId))throw Error('Invalid analytics deletion Subject.');
  await input.store.eraseSubject(deriveAdminAnalyticsReferenceV1(input.secret,'subject',subjectId.toLowerCase()));
 };
 return Object.freeze({...input.ports,
  dbFinalizerPort:{async finalizeDatabase(command:Parameters<PostgresAccountDeletionWorkerPortsV1['dbFinalizerPort']['finalizeDatabase']>[0]){await erase(command.subjectId);return input.ports.dbFinalizerPort.finalizeDatabase(command);}},
  completionPort:{async completeDeletion(command:Parameters<PostgresAccountDeletionWorkerPortsV1['completionPort']['completeDeletion']>[0]){await erase(command.subjectId);return input.ports.completionPort.completeDeletion(command);}},
 });
}
