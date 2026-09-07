const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const htmlPath = path.resolve(process.argv[2]);
  const pdfPath = path.resolve(process.argv[3]);
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'));
  await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
  await browser.close();
  console.log('OK', pdfPath);
})();
