import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import Hash from 'ipfs-only-hash';

const root=resolve('data/publication');await mkdir(root,{recursive:true});
const token=process.env.PINATA_JWT;if(!token)throw new Error('PINATA_JWT is required');
const api='https://api.pinata.cloud';
async function jsonRequest(path,options={}) {
 const response=await fetch(api+path,{...options,headers:{Authorization:`Bearer ${token}`,...options.headers},signal:AbortSignal.timeout(180000)});
 if(!response.ok)throw new Error(`Pinata HTTP ${response.status}: ${(await response.text()).slice(0,200)}`);
 return response.json();
}
async function save(path,data){await writeFile(path+'.tmp',JSON.stringify(data,null,2));await rename(path+'.tmp',path);}
let inventory;
try{inventory=JSON.parse(await readFile(join(root,'pins-before.json'),'utf8'));}
catch {
 inventory=[];for(let offset=0;;offset+=100){let page;for(let retry=0;;retry++){try{page=await jsonRequest(`/data/pinList?status=pinned&pageLimit=100&pageOffset=${offset}`);break;}catch(e){if(retry===3)throw e;}}
 inventory.push(...page.rows);if(inventory.length>=page.count)break;}
 await save(join(root,'pins-before.json'),inventory);
}
console.log(`Inventory: ${inventory.length} existing pins`);
const pinned=new Map(inventory.map(i=>[i.ipfs_pin_hash,i]));
const library=process.env.ASSETS_LIBRARY||join(homedir(),'Yandex.Disk.localized/models/opensourceavatars');
const source=JSON.parse(await readFile(join(library,'manifest.json'),'utf8'));
const {items}=await (await fetch('http://127.0.0.1:4178/api/catalog')).json();
const sourceByKey=new Map(source.avatars.map(i=>[`${i.collection_id}:${i.id}`,i]));
let journal;try{journal=JSON.parse(await readFile(join(root,'receipts.json'),'utf8'));}catch{journal={version:1,started:new Date().toISOString(),files:{}};}
let writeQueue=Promise.resolve();const persist=()=>writeQueue=writeQueue.then(()=>save(join(root,'receipts.json'),journal));
async function stage(path,item,kind){
 const bytes=await readFile(path);const sha256=createHash('sha256').update(bytes).digest('hex');const key=`${item.key}:${kind}:${sha256}`;
 if(journal.files[key]?.cid)return journal.files[key];
 const cid=await Hash.of(bytes,{cidVersion:0,rawLeaves:false});
 const old=pinned.get(cid);
 const record={key:item.key,kind,sha256,bytes:bytes.length,cid:null,expectedCid:cid,preexisting:!!old,createdAt:new Date().toISOString()};
 journal.files[key]=record;await persist();
 if(old){record.cid=cid;record.pinId=old.id;record.status='reused-existing-pin';}
 else {
  // A prior interrupted upload is reconciled by its deterministic content CID.
  const found=await jsonRequest(`/data/pinList?status=pinned&hashContains=${encodeURIComponent(cid)}`);
  const known=found.rows.find(r=>r.ipfs_pin_hash===cid);
  if(known){record.cid=cid;record.pinId=known.id;record.status='reconciled-pin';}
  else {
   const form=new FormData();form.append('file',new Blob([bytes]),`${item.token}-${kind}.${kind==='model'?'vrm':kind==='usdz'?'usdz':'png'}`);
   form.append('pinataOptions',JSON.stringify({cidVersion:0,wrapWithDirectory:false}));
   form.append('pinataMetadata',JSON.stringify({name:`ekza-assets-${item.token}-${kind}`,keyvalues:{project:'ekza-assets-browser',sha256,asset:item.token,kind}}));
   const result=await jsonRequest('/pinning/pinFileToIPFS',{method:'POST',body:form});
   if(result.IpfsHash!==cid)throw new Error(`CID mismatch for ${item.name}/${kind}`);
   record.cid=result.IpfsHash;record.status='pinned';record.receipt=result;
  }
 }
 record.completedAt=new Date().toISOString();await persist();return record;
}
let cursor=0,done=0;const available=items.filter(i=>i.local);const published=[];const failures=[];
await Promise.all(Array.from({length:Math.max(1,Math.min(8,Number(process.env.IPFS_CONCURRENCY||6)))},async()=>{
 while(cursor<available.length){const item=available[cursor++],original=sourceByKey.get(item.key);
  try{
   const model=await stage(join(library,original.local_dir,'model.vrm'),item,'model');
   const preview=await stage(resolve('data/renders',item.token+'.png'),item,'preview');
   // USDZ variants remain available where present; the browser uses VRM.
   const usdz=item.usdz?await stage(join(library,original.local_dir,'model.usdz'),item,'usdz'):null;
   const gateway='https://ekza.mypinata.cloud/ipfs/';
   published.push(Object.fromEntries(Object.entries({...item,local:true,model:gateway+model.cid,thumbnail:gateway+preview.cid,render:gateway+preview.cid,usdz:usdz?gateway+usdz.cid:null,modelCid:model.cid,previewCid:preview.cid,usdzCid:usdz?.cid||null,modelUri:'ipfs://'+model.cid,previewUri:'ipfs://'+preview.cid,modelSha256:model.sha256,previewSha256:preview.sha256,classification:null}).filter(([k])=>!['model_file_url'].includes(k))));
  }catch(error){failures.push({key:item.key,error:error.message});console.log('FAILED',item.name,error.message);}
  done++;if(done%20===0)console.log(`Published ${done}/${available.length}; failures ${failures.length}`);
 }
}));
await persist();published.sort((a,b)=>a.name.localeCompare(b.name));
await save(join(root,'catalog.json'),{version:1,publishedAt:new Date().toISOString(),source:source.homepage,items:published});
await save(join(root,'failures.json'),failures);
console.log(JSON.stringify({published:published.length,failed:failures.length,reused:Object.values(journal.files).filter(f=>f.preexisting).length,newPins:Object.values(journal.files).filter(f=>f.status==='pinned').length}));
if(failures.length)process.exitCode=1;
