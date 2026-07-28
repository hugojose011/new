const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--force-color-profile=srgb'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await page.goto('http://127.0.0.1:8399/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: process.argv[2] || 'wireframe.png', fullPage: true });
  await browser.close();
  console.log('OK');
})();
