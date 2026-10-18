/* Render the original SVG sources into self-contained, local PNG assets. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('/opt/codex/cua_node/lib/node_modules/playwright');

(async () => {
  const root = path.resolve(__dirname, '../..');
  const assets = path.join(root, 'assets');
  fs.mkdirSync(path.join(assets, 'cards'), { recursive: true });
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    for (const name of ['hero', 'dragon', 'archer', 'gargoyle', 'knight', 'assassin', 'troll']) {
      const hero = name === 'hero';
      const page = await browser.newPage({ viewport: { width: hero ? 1120 : 400, height: hero ? 700 : 500 }, deviceScaleFactor: 1 });
      const source = fs.readFileSync(path.join(__dirname, name + '.svg'), 'utf8');
      await page.setContent('<style>html,body{margin:0;padding:0;overflow:hidden}svg{display:block}</style>' + source);
      const target = path.join(assets, hero ? '' : 'cards', name + '.png');
      await page.screenshot({ path: target, animations: 'disabled' });
      await page.close();
      console.log(path.relative(root, target));
    }
  } finally {
    await browser.close();
  }
})();
