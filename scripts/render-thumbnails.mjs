import {launchBrowser} from './browser.mjs';
import {writeFile,mkdir} from 'node:fs/promises';
const base=process.env.ASSET_BROWSER_URL||'http://127.0.0.1:4178';
const {items}=await (await fetch(`${base}/api/catalog`)).json();
const limit=Number(process.argv.find(a=>a.startsWith('--limit='))?.split('=')[1]||Infinity);
const queue=items.filter(i=>i.local&&(!i.render||process.argv.includes('--force'))).slice(0,limit);
const report=[];let cursor=0;
const browser=await launchBrowser();
try {
 await Promise.all(Array.from({length:2},async()=>{
  let page;
  const fresh=async()=>{if(page)await page.close();page=await browser.newPage({viewport:{width:384,height:460}});await page.goto(`${base}/render.html`);await page.waitForFunction(()=>!!window.renderAsset);};
  await fresh();
  while(cursor<queue.length){const item=queue[cursor++];let timer;
   try{const result=await Promise.race([page.evaluate(i=>window.renderAsset(i),item),new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Render timed out')),45000))]);report.push({token:item.token,ok:true,...result});}
   catch(error){report.push({token:item.token,name:item.name,ok:false,error:error.message});console.log('FAILED',item.name,error.message);await fresh();}
   finally{clearTimeout(timer);}
   if(report.length%25===0)console.log(`Rendered ${report.length}/${queue.length}`);
  }
 }));
}finally{await browser.close();}
await mkdir('test-results',{recursive:true});
await writeFile('test-results/render-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({rendered:report.filter(r=>r.ok).length,failed:report.filter(r=>!r.ok).length}));
if(report.some(r=>!r.ok))process.exitCode=1;
