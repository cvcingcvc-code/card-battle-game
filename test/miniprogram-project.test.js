'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
const appConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8'));
const projectConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'project.config.json'), 'utf8'));
const pageConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'pages/index/index.json'), 'utf8'));
const pageWxml = fs.readFileSync(path.join(projectRoot, 'pages/index/index.wxml'), 'utf8');
const pageWxss = fs.readFileSync(path.join(projectRoot, 'pages/index/index.wxss'), 'utf8');

let pageDefinition;
global.Page = (definition) => {
  pageDefinition = definition;
};
require('../pages/index/index');
delete global.Page;

function getDeclarations(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = pageWxss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  assert.ok(rule, `missing WXSS rule for ${selector}`);
  return rule[1];
}

test('Mini Program route and page files are internally consistent', () => {
  assert.equal(projectConfig.compileType, 'miniprogram');
  assert.ok(appConfig.pages.length > 0);
  appConfig.pages.forEach((route) => {
    ['js', 'json', 'wxml', 'wxss'].forEach((extension) => {
      assert.ok(
        fs.existsSync(path.join(projectRoot, `${route}.${extension}`)),
        `missing ${route}.${extension}`,
      );
    });
  });
  assert.notEqual(pageConfig.disableScroll, true, 'battle page must allow vertical scrolling');
});

test('battle WXML tags are balanced and tap handlers exist on the page', () => {
  const allowedComponents = new Set(['view', 'text', 'button', 'scroll-view']);
  const openTags = [];
  for (const match of pageWxml.matchAll(/<\/?([A-Za-z][\w-]*)\b[^>]*>/g)) {
    const [source, tagName] = match;
    assert.ok(allowedComponents.has(tagName), `unexpected component ${tagName}`);
    if (source.startsWith('</')) {
      assert.equal(openTags.pop(), tagName, `mismatched closing tag ${tagName}`);
    } else if (!source.endsWith('/>')) {
      openTags.push(tagName);
    }
  }
  assert.deepEqual(openTags, [], 'unclosed WXML tags remain');

  const handlers = [...pageWxml.matchAll(/\bbindtap="([A-Za-z_$][\w$]*)"/g)].map((match) => match[1]);
  assert.ok(handlers.length > 0);
  handlers.forEach((handler) => {
    assert.equal(typeof pageDefinition[handler], 'function', `missing Page handler ${handler}`);
  });
  assert.match(pageWxml, /aria-role="status"|aria-live/);
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
  const cardGap = getDeclarations('.card-row').match(/\bgap:\s*(\d+)rpx/);
  assert.ok(cardGap);
  assert.ok(Number(cardGap[1]) >= minimumTouchGap);

  const skillLabel = getDeclarations('.card-skill');
  assert.match(skillLabel, /white-space:\s*nowrap/);
  assert.match(skillLabel, /text-overflow:\s*ellipsis/);
});
