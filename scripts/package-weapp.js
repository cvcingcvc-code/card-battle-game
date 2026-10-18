'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Script } = require('node:vm');

// Conservative source-size limit for this single-package Mini Program.
// Keep this explicit: ZIP compression must not hide an oversized main package.
const MAX_MAIN_PACKAGE_BYTES = 2 * 1024 * 1024;
const ROOT_FILES = ['app.js', 'app.json', 'app.wxss', 'game.js', 'project.config.json', 'sitemap.json'];
const DIRECTORY_RULES = {
  pages: new Set(['.js', '.json', '.wxml', '.wxss', '.wxs']),
  data: new Set(['.js', '.json']),
  assets: new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.mp3', '.wav', '.aac', '.m4a', '.ttf', '.woff', '.woff2']),
};
const IGNORED_NAMES = new Set(['node_modules', '__MACOSX', 'Thumbs.db', 'project.private.config.json']);
const TEST_DIRECTORY = /^(?:__tests__|__mocks__|__fixtures__|tests?|fixtures?|mocks?|__debug__|debug)$/i;
const TEST_FILE = /(?:[.-](?:test|spec|fixture|mock|debug)\.[^.]+$|^(?:test|spec|fixture|mock|debug|placeholder)(?:[.-]|$))/i;
const FIXED_TIME = new Date('2000-01-01T00:00:00.000Z');

function exists(filePath) {
  return fs.lstatSync(filePath, { throwIfNoEntry: false }) !== undefined;
}

function inspect(filePath) {
  const status = fs.lstatSync(filePath);
  if (status.isSymbolicLink()) throw new Error(`不导出符号链接：${filePath}`);
  return status;
}

function normalized(filePath) {
  return filePath.split(path.sep).join('/');
}

function collectDirectory(root, relativeDirectory, extensions, required) {
  const directoryPath = path.join(root, relativeDirectory);
  if (!exists(directoryPath)) {
    if (required) throw new Error(`缺少目录：${relativeDirectory}`);
    return [];
  }
  if (!inspect(directoryPath).isDirectory()) throw new Error(`不是目录：${relativeDirectory}`);
  return fs.readdirSync(directoryPath).sort().flatMap((name) => {
    if (name.startsWith('.') || IGNORED_NAMES.has(name)) return [];
    const relativePath = normalized(path.join(relativeDirectory, name));
    const status = inspect(path.join(root, relativePath));
    if (status.isDirectory()) return collectDirectory(root, relativePath, extensions, true);
    if (!status.isFile()) throw new Error(`不支持的文件类型：${relativePath}`);
    return extensions.has(path.extname(name).toLowerCase()) ? [relativePath] : [];
  });
}

// A small lexical scanner keeps comments, prose, strings and regular expressions
// out of executable-token checks. It never executes repository modules.
function scanJavaScript(source) {
  const tokens = [];
  const controlParens = [];
  function add(type, value, start, end) {
    const token = { type, value, start, end };
    tokens.push(token);
    return token;
  }
  function scan(start, stopAtBrace = false) {
    let i = start;
    let braces = 0;
    while (i < source.length) {
      const character = source[i];
      if (/\s/.test(character)) { i += 1; continue; }
      if (source.startsWith('//', i)) {
        const newline = source.indexOf('\n', i + 2);
        i = newline < 0 ? source.length : newline + 1;
        continue;
      }
      if (source.startsWith('/*', i)) {
        const closing = source.indexOf('*/', i + 2);
        if (closing < 0) throw new Error('JavaScript 块注释未关闭。');
        i = closing + 2;
        continue;
      }
      if (character === '"' || character === "'") {
        const begin = i++;
        while (i < source.length && source[i] !== character) {
          i += source[i] === '\\' ? 2 : 1;
        }
        i += 1;
        const literal = source.slice(begin, i);
        const value = new Script(`(${literal})`).runInNewContext(Object.create(null), { timeout: 50 });
        add('string', value, begin, i);
        continue;
      }
      if (character === '`') {
        const begin = i++;
        const token = add('template', '', begin, begin);
        let dynamic = false;
        while (i < source.length && source[i] !== '`') {
          if (source[i] === '\\') { i += 2; continue; }
          if (source.startsWith('${', i)) {
            dynamic = true;
            add('punctuation', '{', i, i + 2);
            i = scan(i + 2, true);
            add('punctuation', '}', i - 1, i);
          } else {
            i += 1;
          }
        }
        i += 1;
        token.end = i;
        if (!dynamic) {
          token.type = 'string';
          token.value = new Script(`(${source.slice(begin, i)})`).runInNewContext(Object.create(null), { timeout: 50 });
        }
        continue;
      }
      const previous = tokens[tokens.length - 1];
      if (character === '/' && (!previous || previous.controlClosing
        || /^[([{=:,;!?&|+*%\^~<>-]$/.test(previous.value)
        || /^(?:return|throw|case|yield|typeof|void|delete|in|of)$/.test(previous.value))) {
        const begin = i++;
        let inClass = false;
        while (i < source.length) {
          if (source[i] === '\\') { i += 2; continue; }
          if (source[i] === '[') inClass = true;
          if (source[i] === ']') inClass = false;
          if (source[i++] === '/' && !inClass) break;
        }
        while (/[A-Za-z]/.test(source[i] || '')) i += 1;
        add('regexp', '', begin, i);
        continue;
      }
      const identifier = source.slice(i).match(/^[A-Za-z_$][\w$]*/);
      if (identifier) {
        add('identifier', identifier[0], i, i + identifier[0].length);
        i += identifier[0].length;
        continue;
      }
      if (stopAtBrace && character === '}' && braces === 0) return i + 1;
      if (character === '{') braces += 1;
      if (character === '}') braces -= 1;
      const token = add('punctuation', character, i, i + 1);
      if (character === '(') controlParens.push(Boolean(previous && /^(?:if|while|for|with|switch|catch)$/.test(previous.value)));
      if (character === ')') token.controlClosing = controlParens.pop() || false;
      i += 1;
    }
    return i;
  }
  scan(0);
  return tokens;
}

function validateProject(projectRoot = path.resolve(__dirname, '..'), { maxBytes = MAX_MAIN_PACKAGE_BYTES } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('maxBytes 必须为正安全整数。');
  const root = path.resolve(projectRoot);
  inspect(root);
  for (const file of ROOT_FILES) {
    if (!inspect(path.join(root, file)).isFile()) throw new Error(`不是文件：${file}`);
  }
  const files = [
    ...ROOT_FILES,
    ...collectDirectory(root, 'pages', DIRECTORY_RULES.pages, true),
    ...collectDirectory(root, 'data', DIRECTORY_RULES.data, false),
    ...collectDirectory(root, 'assets', DIRECTORY_RULES.assets, false),
  ].sort();
  const fileSet = new Set(files);
  const contents = new Map(files.map((file) => [file, fs.readFileSync(path.join(root, file))]));
  const readJson = (file) => JSON.parse(contents.get(file).toString('utf8'));
  const projectConfig = readJson('project.config.json');
  if (projectConfig.compileType !== 'miniprogram') throw new Error('当前导出器仅支持 compileType=miniprogram；小游戏需要独立工程。');
  if (projectConfig.miniprogramRoot && !['.', './'].includes(projectConfig.miniprogramRoot)) throw new Error('当前导出器要求 miniprogramRoot 为 ./。');
  const appConfig = readJson('app.json');
  if (!Array.isArray(appConfig.pages) || appConfig.pages.length === 0) throw new Error('app.json 必须声明页面。');
  for (const route of appConfig.pages) {
    if (typeof route !== 'string' || !/^pages\/[A-Za-z0-9_/-]+$/.test(route) || route.split('/').includes('..')) throw new Error(`不支持的页面路径：${route}`);
    for (const extension of ['js', 'json', 'wxml', 'wxss']) {
      if (!fileSet.has(`${route}.${extension}`)) throw new Error(`缺少页面文件：${route}.${extension}`);
    }
  }
  if (appConfig.subPackages || appConfig.subpackages || appConfig.plugins || appConfig.workers) throw new Error('检测到新原生入口，请先扩展导出允许清单。');
  if (appConfig.debug === true) throw new Error('app.json 仍开启 debug，请关闭后再导出。');
  if (appConfig.sitemapLocation !== 'sitemap.json') throw new Error('app.json.sitemapLocation 必须为 sitemap.json。');
  const totalBytes = [...contents.values()].reduce((total, bytes) => total + bytes.length, 0);
  if (totalBytes > maxBytes) throw new Error(`主包源码大小 ${totalBytes} 字节，超过上限 ${maxBytes} 字节；请压缩素材或规划分包。`);

  const assetReferences = new Set();
  const artReferences = new Set();
  const dynamicImages = [];
  function resource(reference, from, imageOnly = false) {
    if (!reference || reference.includes('\\') || /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)/.test(reference)) throw new Error(`不支持的本地资源引用：${from} → ${reference}`);
    const clean = reference.split(/[?#]/)[0];
    const resolved = path.posix.normalize(reference.startsWith('/') ? clean.slice(1) : path.posix.join(path.posix.dirname(from), clean));
    if (!fileSet.has(resolved)) throw new Error(`资源未进入导出清单：${from} → ${reference}`);
    if (imageOnly && !/\.(?:png|jpe?g|webp|gif|bmp)$/i.test(resolved)) throw new Error(`图片必须引用支持的本地图片文件：${from} → ${reference}`);
    assetReferences.add(resolved);
    return resolved;
  }
  for (const file of files) {
    if (file.split('/').some((part) => TEST_DIRECTORY.test(part)) || TEST_FILE.test(path.posix.basename(file))) throw new Error(`原生工程包含调试或测试资源：${file}`);
    const extension = path.posix.extname(file);
    const source = contents.get(file).toString('utf8');
    if (extension === '.json') {
      const configuration = readJson(file);
      const checkValues = (value, key) => {
        if (key === 'art' && value !== '' && (typeof value !== 'string' || !value.startsWith('/assets/'))) throw new Error(`卡牌 art 必须声明静态 /assets/ 路径：${file}`);
        if (typeof value === 'string' && value.startsWith('/assets/')) {
          const resolved = resource(value, file, key === 'art');
          if (key === 'art') artReferences.add(resolved);
        }
        if (value && typeof value === 'object') Object.entries(value).forEach(([childKey, childValue]) => checkValues(childValue, childKey));
      };
      checkValues(configuration);
      for (const reference of Object.values(configuration.usingComponents || {})) {
        if (typeof reference !== 'string') throw new Error(`组件路径必须为字符串：${file}`);
        for (const suffix of ['.js', '.json', '.wxml', '.wxss']) resource(`${reference}${suffix}`, file);
      }
      if (file === 'app.json') {
        for (const tab of configuration.tabBar?.list || []) {
          for (const key of ['iconPath', 'selectedIconPath']) {
            if (tab[key]) resource(tab[key], file);
          }
        }
      }
    }
    if (extension === '.js' || extension === '.wxs') {
      new Script(source, { filename: file });
      const tokens = scanJavaScript(source);
      for (let i = 0; i < tokens.length; i += 1) {
        const token = tokens[i];
        const previous = tokens[i - 1];
        const next = tokens[i + 1];
        if (token.value === 'art' && next?.value === ':') {
          const art = tokens[i + 2];
          if (art?.type !== 'string' || (art.value !== '' && !art.value.startsWith('/assets/'))) throw new Error(`卡牌 art 必须声明静态 /assets/ 路径：${file}`);
        }
        if (token.type === 'identifier' && token.value === 'debugger' && previous?.value !== '.' && ![':', '('].includes(next?.value)) throw new Error(`原生源码含 debugger 语句：${file}`);
        if (token.type === 'identifier' && token.value === 'import' && next?.value === '(') throw new Error(`不支持动态 import：${file}`);
        if (token.type === 'identifier' && token.value === 'require' && previous?.value !== '.' && next?.value === '(') {
          // A method named "require" is not a CommonJS dependency call.
          let parenthesisDepth = 1;
          let closingIndex = i + 2;
          while (closingIndex < tokens.length && parenthesisDepth > 0) {
            if (tokens[closingIndex].value === '(') parenthesisDepth += 1;
            if (tokens[closingIndex].value === ')') parenthesisDepth -= 1;
            closingIndex += 1;
          }
          const isMethod = ['{', ',', 'static', 'async', 'get', 'set', 'function'].includes(previous?.value)
            && tokens[closingIndex]?.value === '{'
            && !tokens.slice(i + 2, closingIndex - 1).some((parameter) => parameter.type === 'string');
          if (isMethod) continue;
          const argument = tokens[i + 2];
          const closing = tokens[i + 3];
          const reference = argument?.value;
          if (argument?.type !== 'string' || closing?.value !== ')' || !/^\.{1,2}\//.test(reference) || reference.includes('\\')) throw new Error(`require 必须使用静态本地相对路径：${file}`);
          const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), reference));
          const candidates = path.posix.extname(resolved) ? [resolved] : [resolved, `${resolved}.js`, `${resolved}.json`, `${resolved}/index.js`, `${resolved}/index.json`];
          if (!candidates.some((candidate) => /\.(?:js|json|wxs)$/.test(candidate) && fileSet.has(candidate))) throw new Error(`本地模块未进入导出清单：${file} → ${reference}`);
        }
        if (token.type === 'string' && token.value.startsWith('/assets/')) {
          const resolved = resource(token.value, file, previous?.value === ':' && tokens[i - 2]?.value === 'art');
          if (previous?.value === ':' && tokens[i - 2]?.value === 'art') artReferences.add(resolved);
        }
      }
    }
    if (extension === '.wxml') {
      const markup = source.replace(/<!--[\s\S]*?-->/g, '');
      for (const tag of markup.matchAll(/<(?:image|cover-image)\b[^>]*>/gs)) {
        if (!/\bsrc\s*=\s*["']/.test(tag[0])) throw new Error(`图片必须声明可核查的 src 属性：${file}`);
      }
      for (const match of markup.matchAll(/<(image|cover-image|import|include|wxs)\b[^>]*\bsrc\s*=\s*(["'])(.*?)\2[^>]*>/gs)) {
        const [, tag, , reference] = match;
        if (reference.includes('{{')) {
          if (!['image', 'cover-image'].includes(tag) || !/^\{\{\s*[A-Za-z_$][\w$]*\.art\s*\}\}$/.test(reference)) throw new Error(`资源表达式无法静态核查：${file} → ${reference}`);
          dynamicImages.push({ file, expression: reference });
        } else {
          resource(reference, file, ['image', 'cover-image'].includes(tag));
        }
      }
    }
    if (extension === '.wxss') {
      const stylesheet = source.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const match of stylesheet.matchAll(/url\(\s*(["']?)([^'"\s)]+)\1\s*\)|@import\s+(["'])(.*?)\3/g)) resource(match[2] || match[4], file);
    }
  }
  if (dynamicImages.length && artReferences.size === 0) throw new Error('动态图片绑定缺少可核查的本地 art 素材元数据。');
  return { files, totalBytes, appConfig, projectConfig, maxBytes, assetReferences: [...assetReferences].sort(), dynamicImages };
}

function ensureOutputDirectory(directoryPath, root) {
  if (directoryPath !== root) ensureOutputDirectory(path.dirname(directoryPath), root);
  if (exists(directoryPath)) {
    if (!inspect(directoryPath).isDirectory()) throw new Error(`输出路径不是目录：${directoryPath}`);
  } else {
    fs.mkdirSync(directoryPath);
  }
}

function inspectOutputTree(filePath) {
  if (!exists(filePath)) return;
  const status = inspect(filePath);
  if (status.isDirectory()) {
    for (const name of fs.readdirSync(filePath)) inspectOutputTree(path.join(filePath, name));
  } else if (!status.isFile()) {
    throw new Error('导出路径包含不支持的文件类型。');
  }
}

function promoteOutputs(entries, stage) {
  const backups = [];
  const installed = [];
  try {
    for (let index = 0; index < entries.length; index += 1) {
      const { destination } = entries[index];
      inspectOutputTree(destination);
      if (exists(destination)) {
        const backup = path.join(stage, `previous-${index}`);
        fs.renameSync(destination, backup);
        backups.push({ backup, destination });
      }
    }
    for (const entry of entries) {
      // With no zip executable, remove the previous archive transactionally
      // rather than leaving it paired with a different new project directory.
      if (!entry.source) continue;
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
      const failure = new Error(`替换开发导出失败且回滚未完成；旧产物备份保留在 ${stage}`);
      failure.preserveStage = true;
      throw failure;
    }
    throw error;
  }
}

function packageProject(projectRoot = path.resolve(__dirname, '..')) {
  const root = path.resolve(projectRoot);
  const result = validateProject(root);
  const exportRoot = path.join(root, '.artifacts', 'wechat');
  const projectName = 'card-battle-game';
  const projectOutput = path.join(exportRoot, projectName);
  const zipOutput = path.join(exportRoot, `${projectName}.zip`);
  const manifestOutput = path.join(exportRoot, `${projectName}.manifest.json`);
  ensureOutputDirectory(exportRoot, root);
  for (const output of [projectOutput, zipOutput, manifestOutput]) inspectOutputTree(output);
  const stage = fs.mkdtempSync(path.join(exportRoot, '.weapp-stage-'));
  const stagedProject = path.join(stage, projectName);
  const stagedZip = path.join(stage, `${projectName}.zip`);
  const stagedManifest = path.join(stage, `${projectName}.manifest.json`);
  let preserveStage = false;
  try {
    fs.mkdirSync(stagedProject);
    const manifest = result.files.map((file) => {
      const bytes = fs.readFileSync(path.join(root, file));
      const destination = path.join(stagedProject, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, bytes, { mode: 0o644 });
      fs.utimesSync(destination, FIXED_TIME, FIXED_TIME);
      return { path: file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
    });
    const staged = validateProject(stagedProject, { maxBytes: result.maxBytes });
    fs.writeFileSync(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`);
    const archive = spawnSync('zip', ['-X', '-q', stagedZip, ...manifest.map((file) => `${projectName}/${file.path}`)], { cwd: stage, encoding: 'utf8', env: { ...process.env, TZ: 'UTC' } });
    if (archive.error && archive.error.code !== 'ENOENT') throw archive.error;
    if (!archive.error && archive.status !== 0) throw new Error(`ZIP 导出失败：${archive.stderr || archive.stdout}`);
    if (!archive.error) {
      const archiveCheck = spawnSync('unzip', ['-tqq', stagedZip], { encoding: 'utf8' });
      if (archiveCheck.error || archiveCheck.status !== 0) throw new Error('ZIP 完整性检查失败；旧开发导出未修改。');
    }
    promoteOutputs([
      { source: stagedProject, destination: projectOutput },
      { source: archive.error ? null : stagedZip, destination: zipOutput },
      { source: stagedManifest, destination: manifestOutput },
    ], stage);
    console.log(`微信原生开发工程：${projectOutput}`);
    console.log(`允许清单导出 ${manifest.length} 个文件，共 ${staged.totalBytes}/${staged.maxBytes} 字节。`);
    console.log(`SHA-256 清单：${manifestOutput}`);
    console.log(archive.error ? '未找到系统 zip；仅生成已验证的工程目录与清单，旧 ZIP 已撤除。' : `ZIP 压缩包：${zipOutput}`);
    console.log('此为开发导出；AppID、平台类别、真机验收与发布资格由发布检查单独确认。');
    return { ...staged, projectOutput, zipOutput: archive.error ? null : zipOutput, manifestOutput };
  } catch (error) {
    preserveStage = Boolean(error.preserveStage);
    throw error;
  } finally {
    if (!preserveStage) fs.rmSync(stage, { recursive: true, force: true });
  }
}

module.exports = { validateProject, packageProject, MAX_MAIN_PACKAGE_BYTES, scanJavaScript };

if (require.main === module) {
  try {
    packageProject();
  } catch (error) {
    console.error(`导出失败：${error.message}`);
    process.exitCode = 1;
  }
}
