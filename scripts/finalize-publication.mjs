import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {homedir} from 'node:os';
import Hash from 'ipfs-only-hash';
const catalog=JSON.parse(await readFile('data/publication/catalog.json','utf8'));
const receipts=JSON.parse(await readFile('data/publication/receipts.json','utf8'));
if(catalog.items.length!==459)throw new Error(`Only ${catalog.items.length}/459 assets published`);
const source=JSON.parse(await readFile(join(process.env.ASSETS_LIBRARY||join(homedir(),'Yandex.Disk.localized/models/opensourceavatars'),'manifest.json'),'utf8'));
const originals=new Map(source.avatars.map(i=>[`${i.collection_id}:${i.id}`,i]));
for(const item of catalog.items){delete item.local;item.available=true;item.sourceModelUrl=originals.get(item.key).model_file_url;if(!item.author||!item.license||!item.modelCid||!item.previewCid)throw new Error('Incomplete provenance');}
await mkdir('catalog',{recursive:true});
const bytes=Buffer.from(JSON.stringify(catalog,null,2)+'\n');
const cid=await Hash.of(bytes,{cidVersion:0,rawLeaves:false});
const headers={Authorization:`Bearer ${process.env.PINATA_JWT}`};
let response=await fetch(`https://api.pinata.cloud/data/pinList?status=pinned&hashContains=${cid}`,{headers});
if(!response.ok)throw new Error(`Pin lookup ${response.status}`);
const existing=(await response.json()).rows.find(r=>r.ipfs_pin_hash===cid);let receipt=existing;
if(!existing){
 const form=new FormData();form.append('file',new Blob([bytes],{type:'application/json'}),'ekza-avatar-library.json');
 form.append('pinataOptions',JSON.stringify({cidVersion:0}));form.append('pinataMetadata',JSON.stringify({name:'ekza-assets-manifest-20261030',keyvalues:{project:'ekza-assets-browser',kind:'catalog'}}));
 response=await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS',{method:'POST',headers,body:form});
 if(!response.ok)throw new Error(`Manifest upload ${response.status}`);receipt=await response.json();if(receipt.IpfsHash!==cid)throw new Error('Manifest CID mismatch');
}
await writeFile('catalog/manifest.json',bytes);
const summary={version:1,date:new Date().toISOString(),catalogCid:cid,catalogUri:`ipfs://${cid}`,gatewayUrl:`https://ekza.mypinata.cloud/ipfs/${cid}`,sha256:createHash('sha256').update(bytes).digest('hex'),models:catalog.items.length,previews:catalog.items.length,usdz:catalog.items.filter(i=>i.usdzCid).length,sourceRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sdkRevision:'88432da60940a259a2b3f4163199f983a5584499',languages:['en','zh','ru'],classification:'unclassified'};
await writeFile('catalog/publication.json',JSON.stringify(summary,null,2)+'\n');
await writeFile('data/publication/catalog-receipt.json',JSON.stringify({summary,preexisting:!!existing,receipt},null,2)+'\n');
console.log(JSON.stringify(summary));
