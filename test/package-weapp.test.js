'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { validateProject, packageProject, MAX_MAIN_PACKAGE_BYTES } = require('../scripts/package-weapp');

function createFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'card-battle-export-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, source) => {
    const destination = path.join(root, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, source);
  };
  write('app.js', 'App({});');
  write('app.json', JSON.stringify({ pages: ['pages/home/home'], sitemapLocation: 'sitemap.json' }));
  write('app.wxss', 'page {}');
  write('game.js', 'module.exports = { createGame: () => ({}) };');
  write('project.config.json', JSON.stringify({ compileType: 'miniprogram', miniprogramRoot: './', appid: '' }));
  write('sitemap.json', JSON.stringify({ rules: [] }));
  write('pages/home/home.js', "const rules = require('../../game'); const cards = require('../../data/cards'); Page({data:cards});");
  write('pages/home/home.json', '{}');
  write('pages/home/home.wxml', '<image src="/assets/hero.png"/><image src="{{item.art}}"/>');
  write('pages/home/home.wxss', 'view {}');
  write('data/cards.js', "module.exports = [{art:'/assets/hero.png',description:'测试与debug只是文案'}];");
  write('assets/hero.png', Buffer.from('fixture-image'));
  return { root, write };
}

test('native export is self-contained, repeatable and excludes personal or development files', (t) => {
  const { root, write } = createFixture(t);
  write('release.local.json', '{"appid":"personal-value"}');
  write('index.html', 'browser-only');
  write('assets/.private.png', 'hidden');
  write('pages/home/project.private.config.json', '{}');
  write('design/hero.svg', '<svg/>');
  const validation = validateProject(root);
  assert.equal(fs.existsSync(path.join(root, '.artifacts')), false, 'validation must not write outputs');
  const exported = packageProject(root);
  const manifest = JSON.parse(fs.readFileSync(exported.manifestOutput, 'utf8'));
  assert.deepEqual(manifest.map((file) => file.path), validation.files);
  assert.ok(!manifest.some((file) => /private|release\.local|index\.html|^design\//.test(file.path)));
  for (const file of manifest) {
    const bytes = fs.readFileSync(path.join(exported.projectOutput, file.path));
    assert.ok(bytes.equals(fs.readFileSync(path.join(root, file.path))), file.path);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), file.sha256);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(exported.projectOutput, 'project.config.json'), 'utf8')).appid, '');
  if (exported.zipOutput) {
    const firstZip = fs.readFileSync(exported.zipOutput);
    packageProject(root);
    assert.ok(firstZip.equals(fs.readFileSync(exported.zipOutput)), 'identical sources must produce identical ZIPs');
  }
  // A broken new source must not replace the last known complete delivery.
  const lastManifest = fs.readFileSync(exported.manifestOutput);
  write('pages/home/home.js', "require('../../scripts/local-helper');");
  write('scripts/local-helper.js', 'module.exports = {};');
  assert.throws(() => packageProject(root), /本地模块未进入导出清单/);
  assert.ok(lastManifest.equals(fs.readFileSync(exported.manifestOutput)));
});

test('missing modules, runtime dependencies and dynamic module paths cannot be handed off', (t) => {
  const { root, write } = createFixture(t);
  for (const [source, expected] of [
    ["require('../../missing');", /本地模块未进入导出清单/],
    ["require('node:fs');", /静态本地相对路径/],
    ["const name='../../game'; require(name);", /静态本地相对路径/],
  ]) {
    write('pages/home/home.js', source);
    assert.throws(() => validateProject(root), expected);
  }
});

test('an actual zip failure preserves every previous exported file and cleans the stage', (t) => {
  const { root, write } = createFixture(t);
  const previous = packageProject(root);
  if (!previous.zipOutput) return t.skip('Requires system zip for the initial complete export.');
  const exportRoot = path.dirname(previous.projectOutput);
  const snapshot = (directory, prefix = '') => fs.readdirSync(directory).sort().flatMap((name) => {
    const filePath = path.join(directory, name);
    const relativePath = path.join(prefix, name);
    return fs.statSync(filePath).isDirectory()
      ? snapshot(filePath, relativePath)
      : [[relativePath, fs.readFileSync(filePath)]];
  });
  const before = snapshot(exportRoot);
  write('game.js', 'module.exports = { createGame: () => ({ revision: 2 }) };');
  write('fake-bin/zip', '#!/bin/sh\nprintf "simulated archive failure" >&2\nexit 17\n');
  fs.chmodSync(path.join(root, 'fake-bin/zip'), 0o755);
  const child = spawnSync(process.execPath, [
    '-e',
    'require(process.argv[1]).packageProject(process.argv[2]);',
    require.resolve('../scripts/package-weapp'),
    root,
  ], { encoding: 'utf8', env: { ...process.env, PATH: path.join(root, 'fake-bin') } });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /ZIP 导出失败.*simulated archive failure/);
  assert.deepEqual(snapshot(exportRoot), before, 'directory, ZIP, manifest and filenames must all remain unchanged');
});

test('a missing zip tool cannot leave an old archive beside a different new directory', (t) => {
  const { root, write } = createFixture(t);
  const previous = packageProject(root);
  if (!previous.zipOutput) return t.skip('Requires system zip for the initial complete export.');
  const changedRules = 'module.exports = { createGame: () => ({ revision: 3 }) };';
  write('game.js', changedRules);
  fs.mkdirSync(path.join(root, 'empty-bin'));
  const child = spawnSync(process.execPath, [
    '-e',
    'const result=require(process.argv[1]).packageProject(process.argv[2]); if(result.zipOutput!==null) process.exit(2);',
    require.resolve('../scripts/package-weapp'),
    root,
  ], { encoding: 'utf8', env: { ...process.env, PATH: path.join(root, 'empty-bin') } });
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /旧 ZIP 已撤除/);
  assert.equal(fs.existsSync(previous.zipOutput), false);
  assert.equal(fs.readFileSync(path.join(previous.projectOutput, 'game.js'), 'utf8'), changedRules);
  assert.doesNotThrow(() => validateProject(previous.projectOutput));
  const manifest = JSON.parse(fs.readFileSync(previous.manifestOutput, 'utf8'));
  for (const file of manifest) {
    const bytes = fs.readFileSync(path.join(previous.projectOutput, file.path));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), file.sha256);
  }
});

test('missing native images or unverifiable image expressions fail before creating an export', (t) => {
  const { root, write } = createFixture(t);
  write('pages/home/home.wxml', '<image src="/assets/missing.png"/>');
  assert.throws(() => validateProject(root), /资源未进入导出清单/);
  write('pages/home/home.wxml', '<image src="{{item.art}}"/>');
  write('data/cards.js', "module.exports = [{art:'/assets/missing.png'}];");
  assert.throws(() => validateProject(root), /资源未进入导出清单/);
  write('data/cards.js', "module.exports = [{art:'/assets/hero.png'}];");
  write('pages/home/home.wxml', '<image src="{{folder + item.name}}"/>');
  assert.throws(() => validateProject(root), /无法静态核查/);
  write('pages/home/home.wxml', '<image src="/assets/hero.png"/>');
  write('pages/home/home.wxss', 'view {background-image:url("/assets/missing.png");}');
  assert.throws(() => validateProject(root), /资源未进入导出清单/);
  assert.equal(fs.existsSync(path.join(root, '.artifacts')), false);
});

test('release blockers inspect executable code and actual paths, without rejecting ordinary prose', (t) => {
  const { root, write } = createFixture(t);
  const harmless = [
    '// debugger; require("missing");',
    'const description = "debugger; require(\'missing\'); 测试";',
    'const pattern = /debugger; require("missing")/;',
    'const object = {debugger: "ordinary property", require() {}};',
    'const template = `debugger; ${"ordinary prose"}`;',
  ].join('\n');
  write('pages/home/home.js', harmless);
  assert.doesNotThrow(() => validateProject(root));
  write('pages/home/home.js', `${harmless}\ndebugger;`);
  assert.throws(() => validateProject(root), /debugger 语句/);
  write('pages/home/home.js', harmless);
  write('assets/test-card.png', 'placeholder-image');
  assert.throws(() => validateProject(root), /调试或测试资源/);
});

test('the source-size budget cannot be bypassed by highly compressible assets', (t) => {
  const { root, write } = createFixture(t);
  const initial = validateProject(root);
  assert.equal(initial.maxBytes, MAX_MAIN_PACKAGE_BYTES);
  assert.throws(() => validateProject(root, { maxBytes: initial.totalBytes - 1 }), /超过上限/);
  assert.equal(validateProject(root, { maxBytes: initial.totalBytes }).totalBytes, initial.totalBytes);
  write('assets/large.png', Buffer.alloc(MAX_MAIN_PACKAGE_BYTES));
  assert.throws(() => validateProject(root), /超过上限/);
  assert.equal(fs.existsSync(path.join(root, '.artifacts')), false);
});
