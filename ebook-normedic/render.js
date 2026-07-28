const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--force-color-profile=srgb'] });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));

  await page.goto('http://127.0.0.1:8377/index.html', { waitUntil: 'networkidle' });

  // wait for paged.js to finish
  await page.waitForFunction(() => window.__pagedDone === true || document.querySelectorAll('.pagedjs_page').length > 0, { timeout: 120000 });
  await page.waitForFunction(() => {
    const pages = document.querySelectorAll('.pagedjs_page');
    if (!pages.length) return false;
    // rendered flag: paged.js adds class to body when done
    return document.body.classList.contains('pagedjs_render_complete') || true;
  });
  // give layout a moment to settle, then count
  await page.waitForTimeout(4000);
  const n = await page.evaluate(() => document.querySelectorAll('.pagedjs_page').length);
  console.log('PAGES:', n);

  await page.pdf({
    path: 'Playbook-Comercial-Normedic.pdf',
    preferCSSPageSize: true,
    printBackground: true,
  });
  await browser.close();
  console.log('PDF OK');
})();
