'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
const appConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8'));
const projectConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'project.config.json'), 'utf8'));
const pageConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'pages/index/index.json'), 'utf8'));
const pageWxss = fs.readFileSync(path.join(projectRoot, 'pages/index/index.wxss'), 'utf8');

function loadPageDefinition(route) {
  let pageDefinition;
  global.Page = (definition) => {
    pageDefinition = definition;
  };
  try {
    require(path.join(projectRoot, route));
  } finally {
    delete global.Page;
  }
  assert.ok(pageDefinition, `${route} must register a Page`);
  return pageDefinition;
}

function assertLocalImage(source) {
  assert.match(source, /^\/?assets\/[\w/-]+\.png$/, `expected a packaged PNG: ${source}`);
  const imagePath = path.join(projectRoot, source.replace(/^\//, ''));
  const bytes = fs.readFileSync(imagePath);
  assert.ok(bytes.length > 24, `empty or truncated image: ${source}`);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `invalid PNG: ${source}`);
  assert.equal(bytes.subarray(12, 16).toString(), 'IHDR', `missing image dimensions: ${source}`);
  assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0);
}

function isIgnored(relativePath) {
  return (projectConfig.packOptions?.ignore || []).some((rule) => {
    if (rule.type === 'file') return relativePath === rule.value;
    if (rule.type === 'folder') {
      const folder = rule.value.replace(/^\//, '').replace(/\/$/, '');
      return relativePath === folder || relativePath.startsWith(`${folder}/`);
    }
    return false;
  });
}

function getDeclarations(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = pageWxss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  assert.ok(rule, `missing WXSS rule for ${selector}`);
  return rule[1];
}

test('Mini Program route and page files are internally consistent', () => {
  assert.equal(projectConfig.compileType, 'miniprogram');
  assert.equal(appConfig.pages[0], 'pages/home/home', 'the import must open on the start screen');
  assert.ok(appConfig.pages.includes('pages/index/index'));
  assert.equal(new Set(appConfig.pages).size, appConfig.pages.length, 'routes must be unique');
  appConfig.pages.forEach((route) => {
    ['js', 'json', 'wxml', 'wxss'].forEach((extension) => {
      assert.ok(
        fs.existsSync(path.join(projectRoot, `${route}.${extension}`)),
        `missing ${route}.${extension}`,
      );
    });
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(projectRoot, `${route}.json`), 'utf8')));
  });
  assert.notEqual(pageConfig.disableScroll, true, 'battle page must allow vertical scrolling');

  const sitemapPath = appConfig.sitemapLocation;
  assert.equal(typeof sitemapPath, 'string', 'declare the sitemap for the imported project');
  assert.ok(sitemapPath && !path.isAbsolute(sitemapPath));
  const resolvedSitemap = path.resolve(projectRoot, sitemapPath);
  assert.ok(resolvedSitemap.startsWith(`${projectRoot}${path.sep}`), 'sitemap must remain in the project');
  assert.equal(isIgnored(sitemapPath), false, 'the sitemap must be included in the Mini Program package');
  const sitemap = JSON.parse(fs.readFileSync(resolvedSitemap, 'utf8'));
  assert.ok(Array.isArray(sitemap.rules), 'sitemap rules must be an array');
  for (const rule of sitemap.rules) {
    assert.ok(['allow', 'disallow'].includes(rule.action));
    assert.ok(rule.page === '*' || appConfig.pages.includes(rule.page), `unknown sitemap route: ${rule.page}`);
  }
});

test('every Mini Program page has balanced WXML and resolves its event handlers and literal images', () => {
  const allowedComponents = new Set(['view', 'text', 'button', 'scroll-view', 'image', 'block']);
  for (const route of appConfig.pages) {
    const pageDefinition = loadPageDefinition(route);
    const pageWxml = fs.readFileSync(path.join(projectRoot, `${route}.wxml`), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '');
    const openTags = [];
    for (const match of pageWxml.matchAll(/<\/?([A-Za-z][\w-]*)\b(?:"[^"]*"|'[^']*'|[^'">])*>/g)) {
      const [source, tagName] = match;
      assert.ok(allowedComponents.has(tagName), `${route}: unexpected component ${tagName}`);
      if (source.startsWith('</')) {
        assert.equal(openTags.pop(), tagName, `${route}: mismatched closing tag ${tagName}`);
      } else if (!source.endsWith('/>')) {
        openTags.push(tagName);
      }
      if (tagName === 'image' && !source.startsWith('</')) {
        const imageSource = source.match(/\bsrc="([^"]+)"/);
        assert.ok(imageSource, `${route}: image is missing src`);
        if (!imageSource[1].includes('{{')) assertLocalImage(imageSource[1]);
      }
    }
    assert.deepEqual(openTags, [], `${route}: unclosed WXML tags remain`);

    const handlers = [...pageWxml.matchAll(/\b(?:bind|catch):?[\w-]+="([A-Za-z_$][\w$]*)"/g)]
      .map((match) => match[1]);
    assert.ok(handlers.length > 0, `${route}: expected an interactive page`);
    handlers.forEach((handler) => {
      assert.equal(typeof pageDefinition[handler], 'function', `${route}: missing Page handler ${handler}`);
    });
    if (route === 'pages/index/index') assert.match(pageWxml, /aria-role="status"|aria-live/);
  }
});

test('every game card resolves to local artwork packaged for offline use', () => {
  const { createGame } = require('../game');
  const { getCardPresentation } = require('../data/cards');
  const artPaths = new Set();
  for (const player of createGame().players) {
    for (const card of player.cards) {
      const presentation = getCardPresentation(card.name);
      assert.ok(presentation.role, `${card.name}: missing role`);
      assertLocalImage(presentation.art);
      assert.equal(isIgnored(presentation.art.replace(/^\//, '')), false, `${card.name}: artwork is excluded`);
      artPaths.add(presentation.art);
    }
  }
  assert.equal(artPaths.size, 6, 'each unit needs its own artwork');
});

test('compact-screen touch controls and card spacing meet minimum dimensions', () => {
  const rpxPerCssPixel = 750 / 320;
  const minimumTouchHeight = 44 * rpxPerCssPixel;
  const minimumTouchGap = 8 * rpxPerCssPixel;
  const controlHeight = (selector) => {
    const declaration = getDeclarations(selector).match(/\bheight:\s*(\d+)rpx/);
    assert.ok(declaration, `missing rpx height for ${selector}`);
    return Number(declaration[1]);
  };

  assert.ok(controlHeight('.skill-button') >= minimumTouchHeight);
  assert.ok(controlHeight('.reset-button') >= minimumTouchHeight);
  const flexGap = getDeclarations('.card-row').match(/\bgap:\s*(\d+)rpx/);
  const siblingGap = pageWxss.match(/\.unit-card\s*\+\s*\.unit-card\s*\{[^}]*\bmargin-left:\s*(\d+)rpx/);
  const cardGap = flexGap || siblingGap;
  assert.ok(cardGap, 'adjacent cards need a touch gap');
  assert.ok(Number(cardGap[1]) >= minimumTouchGap);

  const skillLabel = getDeclarations('.card-skill');
  assert.match(skillLabel, /white-space:\s*nowrap/);
  assert.match(skillLabel, /text-overflow:\s*ellipsis/);
});
