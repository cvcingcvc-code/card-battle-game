'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Script } = require('node:vm');
const { scanJavaScript } = require('./package-weapp');

// This project's conservative, uncompressed source budget, not a claim about
// the platform's current maximum. Upload checks remain the platform's decision.
const MAX_MINIGAME_PACKAGE_BYTES = 2 * 1024 * 1024;
const FIXED_TIME = new Date('2000-01-01T00:00:00.000Z');
const SOURCE_FILES = Object.freeze({
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
  'assets/cards/dragon.png': 'assets/cards/dragon.png',
  'assets/cards/archer.png': 'assets/cards/archer.png',
  'assets/cards/gargoyle.png': 'assets/cards/gargoyle.png',
  'assets/cards/knight.png': 'assets/cards/knight.png',
  'assets/cards/assassin.png': 'assets/cards/assassin.png',
  'assets/cards/troll.png': 'assets/cards/troll.png',
});

function exists(filePath) {
  return fs.lstatSync(filePath, { throwIfNoEntry: false });
}

function assertPlainPath(filePath) {
  const absolute = path.resolve(filePath);
  const { root } = path.parse(absolute);
  let current = root;
  for (const part of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const status = exists(current);
    if (status?.isSymbolicLink()) throw new Error('小游戏路径包含符号链接，停止导出。');
  }
}

function inspectTree(filePath, visitor) {
  assertPlainPath(filePath);
  const status = exists(filePath);
  if (!status) return;
  if (status.isDirectory()) {
    for (const name of fs.readdirSync(filePath).sort()) inspectTree(path.join(filePath, name), visitor);
  } else if (status.isFile()) {
    if (visitor) visitor(filePath);
  } else {
    throw new Error('小游戏工程或输出包含不支持的文件类型。');
  }
}

function validateMinigame(projectRoot = path.resolve(__dirname, '..'), { maxBytes = MAX_MINIGAME_PACKAGE_BYTES, exported = false } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('maxBytes 必须为正安全整数。');
  const root = path.resolve(projectRoot);
  assertPlainPath(root);
  if (!fs.statSync(root).isDirectory()) throw new Error('小游戏工程根路径必须为目录。');
  const files = Object.keys(SOURCE_FILES).sort();
  const fileSet = new Set(files);
  const sourceFiles = Object.fromEntries(files.map((file) => [file, exported ? file : SOURCE_FILES[file]]));
  const contents = new Map();
  for (const file of files) {
    const source = path.join(root, sourceFiles[file]);
    assertPlainPath(source);
    if (!exists(source)?.isFile()) throw new Error(`缺少小游戏源文件：${sourceFiles[file]}`);
    contents.set(file, fs.readFileSync(source));
  }
  if (exported) {
    inspectTree(root, (filePath) => {
      const relative = path.relative(root, filePath).split(path.sep).join('/');
      if (!fileSet.has(relative)) throw new Error(`小游戏导出含允许清单外文件：${relative}`);
    });
  }
  const readJson = (file) => {
    try { return JSON.parse(contents.get(file).toString('utf8')); } catch { throw new Error(`小游戏 JSON 格式无效：${file}`); }
  };
  const projectConfig = readJson('project.config.json');
  const gameConfig = readJson('game.json');
  if (!projectConfig || projectConfig.compileType !== 'game') throw new Error('小游戏 compileType 必须为 game；Page/WXML 小程序是另一运行时。');
  if (!['.', './'].includes(projectConfig.miniprogramRoot)) throw new Error('小游戏 miniprogramRoot 必须为 ./。');
  if (!gameConfig || gameConfig.deviceOrientation !== 'portrait') throw new Error('当前小游戏要求 game.json.deviceOrientation 为 portrait。');
  if (gameConfig.debug === true) throw new Error('小游戏 game.json 仍开启 debug。');
  if (gameConfig.subpackages || gameConfig.subPackages || gameConfig.workers || gameConfig.plugins || gameConfig.openDataContext) throw new Error('新增小游戏入口前，请先扩展小游戏导出允许清单。');
  const totalBytes = [...contents.values()].reduce((total, bytes) => total + bytes.length, 0);
  if (totalBytes > maxBytes) throw new Error(`小游戏主包源码大小 ${totalBytes} 字节，超过项目预算 ${maxBytes} 字节。`);
  const assetReferences = new Set();
  function resource(reference, file) {
    if (typeof reference !== 'string' || !reference.startsWith('/assets/') || reference.includes('\\') || /[?#]/.test(reference)) throw new Error(`小游戏素材须使用静态 /assets/ 本地路径：${file}`);
    const resolved = path.posix.normalize(reference.slice(1));
    if (!/^assets\//.test(resolved) || !fileSet.has(resolved) || !/\.png$/i.test(resolved)) throw new Error(`小游戏素材未进入允许清单：${file} → ${reference}`);
    assetReferences.add(resolved);
  }
  for (const file of files) {
    const extension = path.posix.extname(file);
    const source = contents.get(file).toString('utf8');
    if (extension === '.json') {
      const value = readJson(file);
      const visit = (item, key) => {
        if (key === 'art' && item !== '') resource(item, file);
        if (typeof item === 'string' && item.startsWith('/assets/')) resource(item, file);
        if (item && typeof item === 'object') Object.entries(item).forEach(([childKey, child]) => visit(child, childKey));
      };
      visit(value);
    }
    if (extension !== '.js') continue;
    new Script(source, { filename: file });
    const tokens = scanJavaScript(source);
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      const previous = tokens[index - 1];
      const next = tokens[index + 1];
      if (token.type === 'identifier' && ['App', 'Page'].includes(token.value) && next?.value === '(' && previous?.value !== '.') throw new Error(`小游戏不能使用 ${token.value}() 页面入口：${file}`);
      if (token.type === 'identifier' && token.value === 'debugger' && previous?.value !== '.' && ![':', '('].includes(next?.value)) throw new Error(`小游戏源码含 debugger 语句：${file}`);
      if (token.type === 'identifier' && token.value === 'import' && next?.value === '(') throw new Error(`小游戏不支持动态 import：${file}`);
      if (token.type === 'identifier' && token.value === 'require' && previous?.value !== '.' && next?.value === '(') {
        const argument = tokens[index + 2];
        const reference = argument?.value;
        if (argument?.type !== 'string' || tokens[index + 3]?.value !== ')' || !/^\.{1,2}\//.test(reference) || reference.includes('\\')) throw new Error(`小游戏 require 必须为静态本地相对路径：${file}`);
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), reference));
        const candidates = path.posix.extname(resolved) ? [resolved] : [resolved, `${resolved}.js`, `${resolved}.json`, `${resolved}/index.js`, `${resolved}/index.json`];
        if (!candidates.some((candidate) => /\.(?:js|json)$/.test(candidate) && fileSet.has(candidate))) throw new Error(`小游戏本地模块未进入导出清单：${file} → ${reference}`);
      }
      if (token.value === 'art' && next?.value === ':') {
        const art = tokens[index + 2];
        if (art?.type !== 'string') throw new Error(`小游戏 art 必须为静态本地路径：${file}`);
        if (art.value !== '') resource(art.value, file);
      }
      if (token.type === 'string' && token.value.startsWith('/assets/')) resource(token.value, file);
    }
  }
  return { files, sourceFiles, totalBytes, maxBytes, projectConfig, gameConfig, assetReferences: [...assetReferences].sort() };
}

function ensureDirectory(directory) {
  assertPlainPath(directory);
  const status = exists(directory);
  if (status) {
    if (!status.isDirectory()) throw new Error('小游戏输出路径必须为目录。');
    return;
  }
  ensureDirectory(path.dirname(directory));
  fs.mkdirSync(directory);
}

function promote(entries, stage) {
  const backups = [];
  const installed = [];
  try {
    for (let index = 0; index < entries.length; index += 1) {
      const { destination } = entries[index];
      inspectTree(destination);
      if (exists(destination)) {
        const backup = path.join(stage, `previous-${index}`);
        fs.renameSync(destination, backup);
        backups.push({ backup, destination });
      }
    }
    for (const entry of entries) {
      fs.renameSync(entry.source, entry.destination);
      installed.push(entry.destination);
    }
  } catch (error) {
    let rollbackFailed = false;
    for (const destination of installed.reverse()) {
      try { fs.rmSync(destination, { recursive: true, force: true }); } catch { rollbackFailed = true; }
    }
    for (const { backup, destination } of backups.reverse()) {
      try { fs.renameSync(backup, destination); } catch { rollbackFailed = true; }
    }
    if (rollbackFailed) {
      const failure = new Error('替换小游戏导出失败且回滚未完成；旧产物备份保留在输出的阶段目录。');
      failure.preserveStage = true;
      throw failure;
    }
    throw error;
  }
}

function packageMinigame(projectRoot = path.resolve(__dirname, '..')) {
  const root = path.resolve(projectRoot);
  const source = validateMinigame(root);
  const exportRoot = path.join(root, '.artifacts', 'minigame');
  const projectName = 'ember-duel';
  const projectOutput = path.join(exportRoot, projectName);
  const zipOutput = path.join(exportRoot, `${projectName}.zip`);
  const manifestOutput = path.join(exportRoot, `${projectName}.manifest.json`);
  for (const output of [projectOutput, zipOutput, manifestOutput]) inspectTree(output);
  ensureDirectory(exportRoot);
  const stage = fs.mkdtempSync(path.join(exportRoot, '.minigame-stage-'));
  const stagedProject = path.join(stage, projectName);
  const stagedZip = path.join(stage, `${projectName}.zip`);
  const stagedManifest = path.join(stage, `${projectName}.manifest.json`);
  let preserveStage = false;
  try {
    fs.mkdirSync(stagedProject);
    for (const file of source.files) {
      const original = path.join(root, source.sourceFiles[file]);
      assertPlainPath(original);
      const destination = path.join(stagedProject, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, fs.readFileSync(original), { mode: 0o644 });
      fs.utimesSync(destination, FIXED_TIME, FIXED_TIME);
    }
    const validated = validateMinigame(stagedProject, { maxBytes: source.maxBytes, exported: true });
    const files = validated.files.map((file) => {
      const bytes = fs.readFileSync(path.join(stagedProject, file));
      return { path: file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
    });
    const manifest = {
      schema_version: 1, kind: 'development-export', target: 'game', release_ready: false,
      platform_checks: { status: 'unverified' }, total_bytes: validated.totalBytes, max_bytes: validated.maxBytes, files,
    };
    fs.writeFileSync(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
    const archive = spawnSync('zip', ['-X', '-q', stagedZip, ...files.map((file) => `${projectName}/${file.path}`)], { cwd: stage, encoding: 'utf8', env: { ...process.env, TZ: 'UTC' } });
    if (archive.error || archive.status !== 0) throw new Error('小游戏 ZIP 生成失败，请确认系统 zip 可用；旧产物未修改。');
    const archiveCheck = spawnSync('unzip', ['-tqq', stagedZip], { encoding: 'utf8' });
    if (archiveCheck.error || archiveCheck.status !== 0) throw new Error('小游戏 ZIP 完整性检查失败；旧产物未修改。');
    promote([
      { source: stagedProject, destination: projectOutput },
      { source: stagedZip, destination: zipOutput },
      { source: stagedManifest, destination: manifestOutput },
    ], stage);
    return { ...validated, projectOutput, zipOutput, manifestOutput, kind: manifest.kind, target: 'game', platform_checks: manifest.platform_checks };
  } catch (error) {
    preserveStage = Boolean(error.preserveStage);
    throw error;
  } finally {
    if (!preserveStage) fs.rmSync(stage, { recursive: true, force: true });
  }
}

module.exports = { validateMinigame, packageMinigame, SOURCE_FILES, MAX_MINIGAME_PACKAGE_BYTES };

if (require.main === module) {
  try {
    if (process.argv.length > 2) throw new Error('用法：node scripts/package-minigame.js');
    const result = packageMinigame();
    console.log(JSON.stringify({ ok: true, kind: result.kind, target: result.target, projectOutput: result.projectOutput, zipOutput: result.zipOutput, manifestOutput: result.manifestOutput, files: result.files.length, totalBytes: result.totalBytes, maxBytes: result.maxBytes, platform_checks: result.platform_checks }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, message: error.message }, null, 2));
    process.exitCode = 1;
  }
}
