import assert from 'node:assert/strict';
import {launchBrowser} from './browser.mjs';
const base=process.env.GALLERY_URL||'http://127.0.0.1:47103/library/';
const browser=await launchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto(base);assert.equal(response.status(),200);
 await page.waitForFunction(()=>document.querySelector('.asset-card')&&document.getElementById('viewer-status').hidden,null,{timeout:120000});
 assert.match(await page.locator('#result-count').innerText(),/459/);assert.equal(await page.locator('#liked-count').innerText(),'0');
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('.asset-card img')).slice(0,8).every(i=>i.complete&&i.naturalWidth>0),null,{timeout:90000});
 assert(!await page.locator('.card-preview').first().evaluate(e=>e.innerText.includes('VIPE')));
 await page.locator('#details [data-rating="5"]').click();await page.waitForFunction(()=>document.querySelector('.rating-label').textContent==='5 / 5');
 await page.selectOption('#language','zh');await page.waitForLoadState('domcontentloaded');await page.waitForFunction(()=>document.documentElement.lang==='zh-CN'&&document.querySelector('.rating-label')?.textContent==='5 / 5');
 await page.waitForFunction(()=>document.getElementById('viewer-status').hidden,null,{timeout:120000});
 assert.match(await page.locator('#heading').innerText(),/全部资源/);
 await page.screenshot({path:'test-results/hosted-zh.png'});
 await page.selectOption('#language','en');await page.waitForLoadState('domcontentloaded');await page.waitForFunction(()=>document.documentElement.lang==='en'&&document.getElementById('viewer-status').hidden,null,{timeout:120000});
 await page.screenshot({path:'test-results/hosted-en.png'});
 const networkAddresses=await page.locator('.asset-card img').evaluateAll(images=>images.slice(0,10).map(i=>i.src));assert(networkAddresses.every(u=>u.startsWith('https://ekza.mypinata.cloud/ipfs/')));
 assert.deepEqual(errors,[]);console.log('Hosted PASS:',base,'459 assets, IPFS previews + live 3D, persistent visitor ratings, EN/中文');
}finally{await browser.close();}
