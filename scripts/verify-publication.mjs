import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const catalog=JSON.parse(await readFile('catalog/manifest.json','utf8'));
const publication=JSON.parse(await readFile('catalog/publication.json','utf8'));
const selected=[];const collections=new Set();
for(const item of catalog.items){if(!collections.has(item.collection_id)||item.name==='SHAPEY'){selected.push(item);collections.add(item.collection_id);}}
const largest=[...catalog.items].sort((a,b)=>b.bytes-a.bytes)[0];if(!selected.includes(largest))selected.push(largest);
const results=[];
for(const item of selected){
 for(const [kind,url,expected] of [['model',item.model,item.modelSha256],['preview',item.render,item.previewSha256]]){
  let result;for(let attempt=0;attempt<3;attempt++){try{const response=await fetch(url,{signal:AbortSignal.timeout(90000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);const bytes=Buffer.from(await response.arrayBuffer());const sha256=createHash('sha256').update(bytes).digest('hex');if(sha256!==expected)throw new Error('SHA256 mismatch');result={key:item.key,kind,ok:true,bytes:bytes.length,sha256,cors:response.headers.get('access-control-allow-origin')};break;}catch(e){result={key:item.key,kind,ok:false,error:e.message};}}
  results.push(result);console.log(kind,item.name,result.ok?'verified':result.error);
 }
}
const response=await fetch(publication.gatewayUrl,{signal:AbortSignal.timeout(60000)});const bytes=Buffer.from(await response.arrayBuffer());results.push({kind:'catalog',ok:response.ok&&createHash('sha256').update(bytes).digest('hex')===publication.sha256});
await writeFile('test-results/public-gateway-verification.json',JSON.stringify(results,null,2));
if(results.some(r=>!r.ok))process.exitCode=1;
