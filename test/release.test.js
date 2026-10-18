'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { checkRelease } = require('../scripts/check-release');
const { packageRelease } = require('../scripts/package-release');
const { validateProject, MAX_MAIN_PACKAGE_BYTES } = require('../scripts/package-weapp');

// This syntactically valid value exists only in disposable fixtures. It is not
// a registered account and is never written to the actual project.
const FIXTURE_ID = 'wx0123456789abcdef';
const identity = { WECHAT_APPID: FIXTURE_ID, WECHAT_ACCOUNT_TYPE: 'miniprogram' };

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-release-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, content) => {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof content === 'string' || Buffer.isBuffer(content) ? content : `${JSON.stringify(content, null, 2)}\n`);
  };
  write('package.json', { name: 'fixture', version: '1.0.0' });
  write('release.config.json', { name: '余烬对决', version: '1.0.0', target: 'miniprogram', description: '测试夹具' });
  write('data/app.json', { name: '余烬对决', version: '1.0.0' });
  write('app.js', 'App({});\n');
  write('app.json', { pages: ['pages/index/index'], sitemapLocation: 'sitemap.json' });
  write('app.wxss', 'page { color: #fff; }\n');
  write('sitemap.json', { rules: [{ action: 'allow', page: '*' }] });
  write('game.js', 'module.exports = {};\n');
  write('project.config.json', { compileType: 'miniprogram', miniprogramRoot: './', appid: '' });
  write('pages/index/index.js', "const game = require('../../game'); Page({ data: {} });\n");
  write('pages/index/index.json', {});
  write('pages/index/index.wxml', '<view><image src="/assets/card.png" /></view>\n');
  write('pages/index/index.wxss', 'view { display: flex; }\n');
  write('assets/card.png', Buffer.from('fixture image'));
  return { root, write };
}

test('default release check blocks missing identity; code-only checks never mark release ready', (t) => {
  const { root } = fixture(t);
  const strict = checkRelease({ projectRoot: root, environment: {} });
  assert.equal(strict.ok, false);
  assert.equal(strict.source_checks.status, 'passed');
  assert.equal(strict.identity_checks.status, 'failed');
  const codeOnly = checkRelease({ projectRoot: root, codeOnly: true, environment: {} });
  assert.equal(codeOnly.ok, true);
  assert.equal(codeOnly.candidate_ready, false);
  assert.equal(codeOnly.release_ready, false);
  assert.equal(codeOnly.platform_checks.status, 'unverified');
});

test('identity checks reject placeholders, malformed IDs and mismatched or undeclared runtime', (t) => {
  const { root } = fixture(t);
  for (const appid of ['', 'touristappid', 'wxYOUR_APPID_HERE', 'wx0123456789abcde', 'wx0123456789abcdeg']) {
    assert.equal(checkRelease({ projectRoot: root, environment: { ...identity, WECHAT_APPID: appid } }).ok, false);
  }
  for (const accountType of ['', 'game', 'minigame']) {
    assert.equal(checkRelease({ projectRoot: root, environment: { ...identity, WECHAT_ACCOUNT_TYPE: accountType } }).ok, false);
  }
  const report = checkRelease({ projectRoot: root, environment: identity });
  assert.equal(report.candidate_ready, true);
  assert.equal(report.release_ready, false);
  assert.equal(JSON.stringify(report).includes(FIXTURE_ID), false);
});

test('environment identity overrides local configuration; project AppID is final fallback', (t) => {
  const { root, write } = fixture(t);
  write('release.local.json', { appid: 'wxaaaaaaaaaaaaaaaa', accountType: 'game' });
  const configured = checkRelease({ projectRoot: root, environment: identity });
  assert.equal(configured.ok, true);
  assert.equal(configured.identity_checks.sources.appid, 'environment');
  write('release.local.json', { accountType: 'miniprogram' });
  write('project.config.json', { compileType: 'miniprogram', appid: FIXTURE_ID });
  const fallback = checkRelease({ projectRoot: root, environment: {} });
  assert.equal(fallback.ok, true);
  assert.equal(fallback.identity_checks.sources.appid, 'project.config.json');
});

test('source checks fail on version disagreement, missing local modules and missing images', (t) => {
  const { root, write } = fixture(t);
  write('data/app.json', { name: '余烬对决', version: '2.0.0' });
  assert.equal(checkRelease({ projectRoot: root, codeOnly: true }).ok, false);
  write('data/app.json', { name: '余烬对决', version: '1.0.0' });
  write('pages/index/index.js', "require('../../missing'); Page({});\n");
  assert.equal(checkRelease({ projectRoot: root, codeOnly: true }).ok, false);
  write('pages/index/index.js', 'Page({});\n');
  fs.rmSync(path.join(root, 'assets/card.png'));
  assert.equal(checkRelease({ projectRoot: root, codeOnly: true }).ok, false);
});

test('candidate packaging injects AppID only in copy, excludes private inputs and creates repeatable archives', (t) => {
  const { root, write } = fixture(t);
  write('release.local.json', { appid: FIXTURE_ID, accountType: 'miniprogram', privateNotes: 'DO_NOT_SHIP' });
  write('release.local.example.json', { appid: '', accountType: '' });
  write('README.md', 'DO_NOT_SHIP');
  const originalConfig = fs.readFileSync(path.join(root, 'project.config.json'));
  const first = packageRelease({ projectRoot: root, environment: {} });
  assert.deepEqual(fs.readFileSync(path.join(root, 'project.config.json')), originalConfig);
  assert.equal(JSON.parse(fs.readFileSync(path.join(first.projectOutput, 'project.config.json'))).appid, FIXTURE_ID);
  for (const excluded of ['release.local.json', 'release.local.example.json', 'release.config.json', 'package.json', 'README.md']) {
    assert.equal(fs.existsSync(path.join(first.projectOutput, excluded)), false);
  }
  const manifest = JSON.parse(fs.readFileSync(first.manifestOutput));
  assert.equal(manifest.kind, 'release-candidate');
  assert.equal(manifest.version, '1.0.0');
  assert.equal(manifest.release_ready, false);
  assert.equal(manifest.platform_checks.status, 'unverified');
  const archive = fs.readFileSync(first.zipOutput);
  const manifestBytes = fs.readFileSync(first.manifestOutput);
  const second = packageRelease({ projectRoot: root, environment: {} });
  assert.deepEqual(fs.readFileSync(second.zipOutput), archive);
  assert.deepEqual(fs.readFileSync(second.manifestOutput), manifestBytes);
});

test('failed identity or source validation preserves previous successful candidate', (t) => {
  const { root, write } = fixture(t);
  const previous = packageRelease({ projectRoot: root, environment: identity });
  const archive = fs.readFileSync(previous.zipOutput);
  const config = fs.readFileSync(path.join(previous.projectOutput, 'project.config.json'));
  assert.throws(() => packageRelease({ projectRoot: root, environment: {} }), /前置检查/);
  write('pages/index/index.js', "require('../../missing');\n");
  assert.throws(() => packageRelease({ projectRoot: root, environment: identity }), /前置检查/);
  assert.deepEqual(fs.readFileSync(previous.zipOutput), archive);
  assert.deepEqual(fs.readFileSync(path.join(previous.projectOutput, 'project.config.json')), config);
});

test('staged candidate validation also preserves previous successful output', (t) => {
  const { root, write } = fixture(t);
  const previous = packageRelease({ projectRoot: root, environment: identity });
  const archive = fs.readFileSync(previous.zipOutput);
  const originalSize = fs.statSync(path.join(root, 'app.wxss')).size;
  const sourceSize = validateProject(root).totalBytes;
  write('app.wxss', ' '.repeat(MAX_MAIN_PACKAGE_BYTES - sourceSize + originalSize));
  assert.equal(checkRelease({ projectRoot: root, environment: identity }).ok, true);
  // Injecting the AppID makes only the staged project exceed the source limit.
  assert.throws(() => packageRelease({ projectRoot: root, environment: identity }), /超过上限/);
  assert.deepEqual(fs.readFileSync(previous.zipOutput), archive);
  assert.equal(fs.readdirSync(path.dirname(previous.projectOutput)).some((name) => name.startsWith('.release-stage-')), false);
});

test('source and output symlinks are rejected without changing their targets', (t) => {
  const { root, write } = fixture(t);
  write('outside.json', { appid: FIXTURE_ID, accountType: 'miniprogram' });
  fs.symlinkSync(path.join(root, 'outside.json'), path.join(root, 'release.local.json'));
  assert.equal(checkRelease({ projectRoot: root, environment: identity }).ok, false);
  fs.rmSync(path.join(root, 'release.local.json'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-release-external-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'sentinel'), 'preserved');
  fs.symlinkSync(outside, path.join(root, '.artifacts'));
  assert.throws(() => packageRelease({ projectRoot: root, environment: identity }), /符号链接/);
  assert.equal(fs.readFileSync(path.join(outside, 'sentinel'), 'utf8'), 'preserved');
});
