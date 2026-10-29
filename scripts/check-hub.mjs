import {launchBrowser} from './browser.mjs';
import assert from 'node:assert/strict';
const browser=await launchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1512,height:1100}});
 const response=await page.goto('http://127.0.0.1:7103/studio-assets');assert.equal(response.status(),200);
 const frame=page.frameLocator('iframe[title="Ekza local asset browser"]');
 await frame.locator('.asset-card').first().waitFor();
 await frame.locator('#viewer-status').waitFor({state:'hidden',timeout:60000});
 assert.equal(await frame.locator('.asset-card').count(),60);
 await page.screenshot({path:'test-results/hub.png'});
 console.log('Hub iframe PASS: local route, 60 cards and live 3D');
}finally{await browser.close();}
