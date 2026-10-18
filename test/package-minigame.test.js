'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  validateMinigame,
  packageMinigame,
  MAX_MINIGAME_PACKAGE_BYTES,
} = require('../scripts/package-minigame');

const SOURCE_FILES = {
  'game.js': 'minigame/entry.js',
  'runtime.js': 'minigame/runtime.js',
  'controller.js': 'minigame/controller.js',
  'renderer.js': 'minigame/renderer.js',
  'rules.js': 'game.js',
  'project.config.json': 'minigame/project.config.json',
  'game.json': 'minigame/game.json',
  'data/app.json': 'data/app.json',
  'data/cards.js': 'data/cards.js',
  'assets/hero.png': 'assets/hero.png',
  ...Object.fromEntries(['dragon', 'archer', 'gargoyle', 'knight', 'assassin', 'troll']
    .map((name) => [`assets/cards/${name}.png`, `assets/cards/${name}.png`])),
};
const EXPORTED_FILES = Object.keys(SOURCE_FILES).sort();

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ember-minigame-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, content) => {
    const destination = path.join(root, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, typeof content === 'string' || Buffer.isBuffer(content)
      ? content : `${JSON.stringify(content, null, 2)}\n`);
  };
  write('minigame/entry.js', [
    'throw new Error("Project entry must never execute during packaging");',
    "const runtime = require('./runtime');",
    "const rules = require('./rules');",
    "const cards = require('./data/cards');",
    "const app = require('./data/app.json');",
  ].join('\n'));
  write('minigame/runtime.js', "module.exports = [require('./controller'), require('./renderer')];\n");
  write('minigame/controller.js', 'module.exports = {};\n');
  write('minigame/renderer.js', 'module.exports = { hero: "/assets/hero.png" };\n');
  write('game.js', 'module.exports = { createGame: () => ({}) };\n');
  write('minigame/project.config.json', { compileType: 'game', miniprogramRoot: './', appid: '' });
  write('minigame/game.json', { deviceOrientation: 'portrait' });
  write('data/app.json', { name: '余烬对决', version: '1.0.0' });
  write('data/cards.js', `module.exports = ${JSON.stringify(['dragon', 'archer', 'gargoyle', 'knight', 'assassin', 'troll']
    .map((name) => ({ id: name, art: `/assets/cards/${name}.png` })))};\n`);
  for (const name of EXPORTED_FILES.filter((name) => name.endsWith('.png'))) {
    write(name, Buffer.from(`fixture image: ${name}`));
  }
  return { root, write };
}

function snapshot(directory, prefix = '') {
  return fs.readdirSync(directory).sort().flatMap((name) => {
    const absolute = path.join(directory, name);
    const relative = path.posix.join(prefix, name);
    return fs.statSync(absolute).isDirectory()
      ? snapshot(absolute, relative)
      : [[relative, fs.readFileSync(absolute)]];
  });
}

function runPackager(root, executableDirectory) {
  return spawnSync(process.execPath, [
    '-e',
    'require(process.argv[1]).packageMinigame(process.argv[2]);',
    require.resolve('../scripts/package-minigame'),
    root,
  ], { encoding: 'utf8', env: { ...process.env, PATH: executableDirectory } });
}

test('minigame validation maps exactly sixteen self-contained files without running project code', (t) => {
  const { root, write } = fixture(t);
  write('app.js', 'App({});');
  write('app.json', { pages: ['pages/home/home'] });
  write('pages/home/home.wxml', '<view>must not ship</view>');
  write('release.local.json', { privateNotes: 'must not ship' });
  write('minigame/project.private.config.json', { privateNotes: 'must not ship' });
  write('minigame/local-helper.js', 'must not ship');
  write('README.md', 'must not ship');
  const result = validateMinigame(root);
  assert.equal(EXPORTED_FILES.length, 16);
  assert.deepEqual(result.files, EXPORTED_FILES);
  assert.deepEqual(result.sourceFiles, SOURCE_FILES);
  assert.equal(result.totalBytes, Object.values(SOURCE_FILES)
    .reduce((total, source) => total + fs.statSync(path.join(root, source)).size, 0));
  assert.equal(result.maxBytes, MAX_MINIGAME_PACKAGE_BYTES);
  assert.equal(result.projectConfig.compileType, 'game');
  assert.equal(result.gameConfig.deviceOrientation, 'portrait');
  assert.equal(fs.existsSync(path.join(root, '.artifacts')), false);
});

test('packaging creates an independently valid game root, SHA manifest and reproducible CRC-checked ZIP', (t) => {
  const { root, write } = fixture(t);
  write('release.local.json', '{"secret":"must not ship"}');
  write('app.js', 'App({});');
  write('pages/home/home.wxml', '<view/>');
  const first = packageMinigame(root);
  assert.equal(first.projectOutput, path.join(root, '.artifacts/minigame/ember-duel'));
  assert.deepEqual(snapshot(first.projectOutput).map(([name]) => name), EXPORTED_FILES);
  assert.deepEqual(validateMinigame(first.projectOutput, { exported: true }).files, EXPORTED_FILES);
  for (const [target, source] of Object.entries(SOURCE_FILES)) {
    assert.deepEqual(fs.readFileSync(path.join(first.projectOutput, target)), fs.readFileSync(path.join(root, source)), target);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(first.projectOutput, 'project.config.json'), 'utf8')).appid, '');
  const manifest = JSON.parse(fs.readFileSync(first.manifestOutput, 'utf8'));
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.kind, 'development-export');
  assert.equal(manifest.target, 'game');
  assert.equal(manifest.release_ready, false);
  assert.equal(manifest.platform_checks.status, 'unverified');
  assert.equal(manifest.total_bytes, first.totalBytes);
  assert.equal(manifest.max_bytes, first.maxBytes);
  assert.deepEqual(manifest.files.map((entry) => entry.path), EXPORTED_FILES);
  for (const entry of manifest.files) {
    const bytes = fs.readFileSync(path.join(first.projectOutput, entry.path));
    assert.equal(entry.bytes, bytes.length);
    assert.equal(entry.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
  }
  assert.ok(first.zipOutput, 'system zip must produce the complete handoff archive');
  const zip = fs.readFileSync(first.zipOutput);
  const manifestBytes = fs.readFileSync(first.manifestOutput);
  const integrity = spawnSync('unzip', ['-tqq', first.zipOutput], { encoding: 'utf8' });
  assert.equal(integrity.status, 0, integrity.stderr || integrity.stdout);
  const listing = spawnSync('unzip', ['-Z1', first.zipOutput], { encoding: 'utf8' });
  assert.equal(listing.status, 0, listing.stderr);
  assert.deepEqual(listing.stdout.trim().split('\n').sort(), EXPORTED_FILES.map((name) => `ember-duel/${name}`));
  const second = packageMinigame(root);
  assert.deepEqual(fs.readFileSync(second.zipOutput), zip);
  assert.deepEqual(fs.readFileSync(second.manifestOutput), manifestBytes);
});

test('source validation rejects missing modules, excluded dependencies, external modules and dynamic require', (t) => {
  const { root, write } = fixture(t);
  write('minigame/local-helper.js', 'module.exports = {};');
  for (const source of [
    "require('./missing');",
    "require('./local-helper');",
    "require('node:fs');",
    "require('/absolute/module');",
    "require('../game');",
    "const name = './rules'; require(name);",
    "require('./' + 'rules');",
  ]) {
    write('minigame/entry.js', source);
    assert.throws(() => validateMinigame(root), undefined, source);
  }
  assert.equal(fs.existsSync(path.join(root, '.artifacts')), false);
});

test('native game entry points reject Page/App calls and syntax errors but permit ordinary prose', (t) => {
  const { root, write } = fixture(t);
  for (const source of ['Page({});', 'App({});', 'const broken = ;']) {
    write('minigame/entry.js', source);
    assert.throws(() => validateMinigame(root), undefined, source);
  }
  write('minigame/entry.js', [
    '// Page({}); App({}); require("not-a-module");',
    'const explanation = "Page and App are discussed in this documentation";',
    'const example = /Page\\(\\{\\}\\)/;',
    "require('./runtime'); require('./rules');",
  ].join('\n'));
  assert.doesNotThrow(() => validateMinigame(root));
});

test('invalid game configuration cannot be exported as a mini program or different root/orientation', (t) => {
  const { root, write } = fixture(t);
  for (const config of [
    { compileType: 'miniprogram', miniprogramRoot: './', appid: '' },
    { compileType: 'game', miniprogramRoot: '../', appid: '' },
    { compileType: 'game', miniprogramRoot: 'minigame/', appid: '' },
  ]) {
    write('minigame/project.config.json', config);
    assert.throws(() => validateMinigame(root));
  }
  write('minigame/project.config.json', { compileType: 'game', miniprogramRoot: './', appid: '' });
  for (const config of [{}, { deviceOrientation: 'landscape' }]) {
    write('minigame/game.json', config);
    assert.throws(() => validateMinigame(root));
  }
});

test('missing fixed images and unresolved or nonstatic art paths block export', (t) => {
  const { root, write } = fixture(t);
  const asset = path.join(root, 'assets/cards/dragon.png');
  const image = fs.readFileSync(asset);
  fs.rmSync(asset);
  assert.throws(() => validateMinigame(root));
  write('assets/cards/dragon.png', image);
  for (const source of [
    'module.exports = [{ art: "/assets/cards/missing.png" }];',
    'module.exports = [{ art: "https://example.com/card.png" }];',
    'const image = "/assets/cards/dragon.png"; module.exports = [{ art: image }];',
  ]) {
    write('data/cards.js', source);
    assert.throws(() => validateMinigame(root), undefined, source);
  }
});

test('the uncompressed size budget includes every fixed source and rejects invalid limits', (t) => {
  const { root, write } = fixture(t);
  const validation = validateMinigame(root);
  assert.equal(validation.maxBytes, 2 * 1024 * 1024);
  assert.throws(() => validateMinigame(root, { maxBytes: validation.totalBytes - 1 }));
  assert.equal(validateMinigame(root, { maxBytes: validation.totalBytes }).totalBytes, validation.totalBytes);
  for (const maxBytes of [0, -1, 1.5, Infinity, NaN]) {
    assert.throws(() => validateMinigame(root, { maxBytes }));
  }
  write('assets/hero.png', Buffer.alloc(MAX_MINIGAME_PACKAGE_BYTES));
  assert.throws(() => validateMinigame(root));
  assert.equal(fs.existsSync(path.join(root, '.artifacts')), false);
});

test('export validation detects a missing mapped file, additional file and unmapped dependency', (t) => {
  const { root } = fixture(t);
  const output = packageMinigame(root).projectOutput;
  fs.writeFileSync(path.join(output, 'local-helper.js'), 'module.exports = {};');
  assert.throws(() => validateMinigame(output, { exported: true }));
  fs.rmSync(path.join(output, 'local-helper.js'));
  fs.writeFileSync(path.join(output, 'runtime.js'), "require('./local-helper');");
  assert.throws(() => validateMinigame(output, { exported: true }));
  fs.copyFileSync(path.join(root, 'minigame/runtime.js'), path.join(output, 'runtime.js'));
  fs.rmSync(path.join(output, 'assets/cards/troll.png'));
  assert.throws(() => validateMinigame(output, { exported: true }));
});

test('a failed ZIP command preserves the previous complete export and removes staging outputs', (t) => {
  const { root, write } = fixture(t);
  const first = packageMinigame(root);
  const exportRoot = path.dirname(first.projectOutput);
  const before = snapshot(exportRoot);
  write('game.js', 'module.exports = { revision: 2 };');
  write('fake-bin/zip', '#!/bin/sh\nprintf "simulated archive failure" >&2\nexit 17\n');
  fs.chmodSync(path.join(root, 'fake-bin/zip'), 0o755);
  const child = runPackager(root, path.join(root, 'fake-bin'));
  assert.notEqual(child.status, 0);
  assert.deepEqual(snapshot(exportRoot), before);
});

test('a successful ZIP command producing corrupt bytes fails CRC validation before promotion', (t) => {
  const { root, write } = fixture(t);
  const first = packageMinigame(root);
  const exportRoot = path.dirname(first.projectOutput);
  const before = snapshot(exportRoot);
  write('game.js', 'module.exports = { revision: 3 };');
  write('fake-bin/zip', [
    '#!/bin/sh',
    'for argument in "$@"; do',
    '  case "$argument" in *.zip) printf "not a ZIP archive" > "$argument"; exit 0;; esac',
    'done',
    'exit 19',
    '',
  ].join('\n'));
  fs.chmodSync(path.join(root, 'fake-bin/zip'), 0o755);
  const unzip = spawnSync('sh', ['-c', 'command -v unzip'], { encoding: 'utf8' });
  assert.equal(unzip.status, 0, unzip.stderr);
  fs.symlinkSync(unzip.stdout.trim(), path.join(root, 'fake-bin/unzip'));
  const child = runPackager(root, path.join(root, 'fake-bin'));
  assert.notEqual(child.status, 0);
  assert.deepEqual(snapshot(exportRoot), before);
});

test('source file and source directory symlinks are rejected without changing their targets', (t) => {
  for (const source of ['minigame/runtime.js', 'game.js', 'data/cards.js', 'assets/cards/dragon.png', 'minigame', 'assets/cards']) {
    const { root } = fixture(t);
    const original = path.join(root, source);
    const external = `${original}.original`;
    fs.renameSync(original, external);
    const before = fs.statSync(external).isDirectory() ? snapshot(external) : fs.readFileSync(external);
    fs.symlinkSync(external, original);
    assert.throws(() => validateMinigame(root), undefined, source);
    assert.deepEqual(fs.statSync(external).isDirectory() ? snapshot(external) : fs.readFileSync(external), before);
  }
});

test('output symlinks at all export levels are rejected and external files remain intact', (t) => {
  for (const outputKind of ['artifacts', 'exportRoot', 'project', 'zip', 'manifest', 'nested']) {
    const { root } = fixture(t);
    const exported = packageMinigame(root);
    const source = {
      artifacts: path.join(root, '.artifacts'),
      exportRoot: path.dirname(exported.projectOutput),
      project: exported.projectOutput,
      zip: exported.zipOutput,
      manifest: exported.manifestOutput,
      nested: path.join(exported.projectOutput, 'assets/hero.png'),
    }[outputKind];
    const external = path.join(root, `preserved-${outputKind}`);
    fs.renameSync(source, external);
    const before = fs.statSync(external).isDirectory() ? snapshot(external) : fs.readFileSync(external);
    fs.symlinkSync(external, source);
    assert.throws(() => packageMinigame(root), undefined, outputKind);
    assert.deepEqual(fs.statSync(external).isDirectory() ? snapshot(external) : fs.readFileSync(external), before);
  }
});
