import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
export async function launchBrowser() {
 const cached=`${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
 const executablePath=process.env.CHROMIUM_PATH||(existsSync(cached)?cached:undefined);
 const proxy=process.env.BROWSER_PROXY;
 return chromium.launch({headless:true,executablePath,...(proxy?{proxy:{server:proxy,bypass:'127.0.0.1,localhost'}}:{args:['--no-proxy-server']})});
}
