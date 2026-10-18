'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const appMetadata = require('../data/app.json');

let pageDefinition;
global.Page = (definition) => {
  pageDefinition = definition;
};
require('../pages/about/about');
delete global.Page;

function createPageHarness() {
  return { ...pageDefinition, data: { ...pageDefinition.data } };
}

function withWx(mock, run) {
  const previousWx = global.wx;
  global.wx = mock;
  try {
    run();
  } finally {
    if (previousWx === undefined) delete global.wx;
    else global.wx = previousWx;
  }
}

test('the about page displays the shared application name and release version', () => {
  const page = createPageHarness();
  assert.equal(page.data.name, appMetadata.name);
  assert.equal(page.data.version, appMetadata.version);
  const wxml = fs.readFileSync(path.join(__dirname, '../pages/about/about.wxml'), 'utf8');
  assert.match(wxml, /{{\s*name\s*}}/);
  assert.match(wxml, /{{\s*version\s*}}/);
});

test('returning from about first pops the current page without relaunching the app', () => {
  const requests = [];
  const fallbacks = [];
  withWx({
    navigateBack: (options) => requests.push(options),
    reLaunch: (options) => fallbacks.push(options),
  }, () => {
    createPageHarness().onReturn();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].delta, 1);
    assert.equal(fallbacks.length, 0);
  });
});

test('returning from a directly opened about page falls back to the start screen', () => {
  const fallbacks = [];
  withWx({
    navigateBack: (options) => options.fail({ errMsg: 'navigateBack:fail no previous page' }),
    reLaunch: (options) => fallbacks.push(options),
  }, () => {
    createPageHarness().onReturn();
    assert.equal(fallbacks.length, 1);
    assert.equal(fallbacks[0].url, '/pages/home/home');
  });
});
