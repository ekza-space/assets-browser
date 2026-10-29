import {launchBrowser} from './browser.mjs';
import assert from 'node:assert/strict';
const browser=await launchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.ASSET_BROWSER_URL||'http://127.0.0.1:4178');
 for(const language of ['en','zh','ru']){
  await page.selectOption('#language',language);await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(()=>document.querySelector('.asset-title h2')&&document.getElementById('viewer-status').hidden);
  assert.equal(await page.getAttribute('html','lang'),language==='zh'?'zh-CN':language);
  const title=await page.locator('#heading').innerText();assert(title.includes({en:'All assets',zh:'全部资源',ru:'Все ассеты'}[language]));
  assert.equal(await page.locator('#collections [data-collection]').count(),0);
  assert(!(await page.locator('body').innerText()).includes('VIPE Heroes'));
  if(language!=='ru'){
   const russian=await page.locator('body').evaluate(e=>e.innerText.match(/[А-Яа-яЁё]{2,}/g));assert.equal(russian,null,`Untranslated text: ${russian}`);
  }
  await page.screenshot({path:`test-results/locale-${language}.png`});
 }
 assert.deepEqual(errors,[]);console.log('Locales PASS: EN / 中文 / RU, no untranslated Cyrillic, no source collection filters or unavailable VIPE cards');
}finally{await browser.close();}
