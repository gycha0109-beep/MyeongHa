/**
 * Worker runtime guard, independent of build-time Wrangler bindings.
 *
 * A distinct binding name is NOT evidence of a distinct PostgreSQL login.
 * Access checks run before DB access; afterwards each private capability
 * must resolve to its own least-privilege origin. This guard never prints
 * connection strings or creates a PostgreSQL connection.
 */
const REQUIRED=Object.freeze(['ADMIN_READ_HYPERDRIVE','ADMIN_AUDIT_HYPERDRIVE']);
const OPTIONAL=Object.freeze([
 'ADMIN_COMMAND_HYPERDRIVE',
 'ADMIN_RETENTION_HYPERDRIVE',
 'ADMIN_ANALYTICS_RETENTION_HYPERDRIVE',
]);
export function validateAdminHttpBindingsV1(env){
 const connections=[];
 for(const key of [...REQUIRED,...OPTIONAL]){
  const binding=env?.[key];
  const connection=binding?.connectionString;
  if(REQUIRED.includes(key)&&
    (typeof connection!=='string'||connection.length===0))
   throw Error('Dedicated Admin DB origin unavailable');
  if(binding!==undefined&&
    (typeof connection!=='string'||connection.length===0))
   throw Error('Invalid private Admin DB binding');
  if(typeof connection==='string')connections.push(connection);
 }
 if(new Set(connections).size!==connections.length)
  throw Error('Private Admin DB origins must use distinct credentials');
 return Object.freeze({
  read:true,audit:true,
  command:env.ADMIN_COMMAND_HYPERDRIVE!==undefined,
 });
}
