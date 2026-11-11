/** Synthetic Node client of the same Python/SQLite UNIX gateway, never a model call. */
import net from 'node:net';
const path=process.argv[2];
if (!path?.startsWith('/') || process.argv.length !== 3) throw Error('socket_path_required');
const payload={request_id:'node-synthetic-1',role:'student',model_id:'synthetic/deepseek',
  max_charge_micro_usd:40,fixture:{provider:'fake-provider',model:'synthetic/deepseek',
    actual_micro_usd:10,successful:true}};
const result=await new Promise((resolve,reject)=>{
  const sock=net.createConnection({path});
  let response='';
  sock.setTimeout(3000,()=>sock.destroy(Error('timeout')));
  sock.on('connect',()=>sock.write(JSON.stringify(payload)+'\n'));
  sock.on('data',chunk=>{
    response+=chunk.toString('utf8');
    if(response.length>4096){sock.destroy(Error('oversize_response'));return;}
    if(response.includes('\n')) sock.end();
  });
  sock.on('error',reject);
  sock.on('close',()=>{
    try {resolve(JSON.parse(response.trim()));} catch(e) {reject(e);}
  });
});
if(!result.ok||result.result?.external_calls!==0||result.result?.role!=='student')
  throw Error('gateway_rejected_node_client');
console.log(JSON.stringify({role:'student',client:'node',external_calls:0,accepted:true}));