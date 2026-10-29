import assert from 'node:assert/strict';
import {launchBrowser} from './browser.mjs';
const browser=await launchBrowser();
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const mutations=[];const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')mutations.push(r.url());});
 await page.route('**/config.js',route=>route.fulfill({contentType:'text/javascript',body:"window.ASSET_BROWSER={public:true,catalogUrl:'/api/catalog'};"}));
 await page.goto('http://127.0.0.1:4178');await page.waitForFunction(()=>document.getElementById('viewer-status').hidden);
 assert.equal(await page.locator('#rated-count').innerText(),'0');assert.equal(await page.locator('#liked-count').innerText(),'0');
 assert(await page.locator('#local-filter').isHidden());
 await page.locator('#details [data-rating="3"]').click();await page.waitForFunction(()=>document.querySelector('.rating-label').textContent==='3 / 5');
 await page.locator('#details [data-like]').click();await page.waitForFunction(()=>document.getElementById('liked-count').textContent==='1');
 await page.reload();await page.waitForFunction(()=>document.querySelector('.rating-label')?.textContent==='3 / 5');assert.equal(await page.locator('#liked-count').innerText(),'1');
 await page.waitForFunction(()=>document.getElementById('viewer-status').hidden);
 const pending=page.waitForEvent('download');await page.locator('#save-preview').click();const download=await pending;assert(download.suggestedFilename().endsWith('-preview.png'));
 assert.deepEqual(mutations,[]);assert.deepEqual(errors,[]);
 console.log('Public mode PASS: empty private ratings, visitor-local persistence, PNG download, no server mutations');
}finally{await browser.close();}
