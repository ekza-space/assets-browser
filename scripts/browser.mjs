import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
export async function launchBrowser() {
 const cached=`${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
 const executablePath=process.env.CHROMIUM_PATH||(existsSync(cached)?cached:undefined);
 return chromium.launch({headless:true,executablePath,args:['--no-proxy-server']});
}
