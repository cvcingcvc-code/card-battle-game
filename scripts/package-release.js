'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { validateProject } = require('./package-weapp');
const { validateMinigame } = require('./package-minigame');
const { checkRelease, assertPlainPath, chooseIdentity } = require('./check-release');

const FIXED_TIME = new Date('2000-01-01T00:00:00.000Z');

function existing(filePath) {
  return fs.lstatSync(filePath, { throwIfNoEntry: false });
}

function inspectTree(filePath) {
  assertPlainPath(filePath);
  const status = existing(filePath);
  if (!status) return;
  if (status.isDirectory()) {
    for (const name of fs.readdirSync(filePath)) inspectTree(path.join(filePath, name));
  } else if (!status.isFile()) {
    throw new Error('输出路径包含不支持的文件类型。');
  }
}

function ensureDirectory(directory) {
  assertPlainPath(directory);
  const status = existing(directory);
  if (status) {
    if (!status.isDirectory()) throw new Error('发布输出路径必须为目录。');
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
      if (existing(destination)) {
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
      const failure = new Error('替换候选失败且回滚未完成；旧候选备份保留在发布输出的阶段目录。');
      failure.preserveStage = true;
      throw failure;
    }
    throw error;
  }
}

function packageRelease({ projectRoot = path.resolve(__dirname, '..'), environment = process.env } = {}) {
  const root = path.resolve(projectRoot);
  const report = checkRelease({ projectRoot: root, environment });
  if (!report.candidate_ready) {
    const error = new Error('候选包前置检查未通过；旧候选包未修改。');
    error.report = report;
    throw error;
  }
  // The runtime validator is called again before copying. Its allowlist
  // is the only source of runtime files; release/local files are never copied.
  const validate = report.release.target === 'game' ? validateMinigame : validateProject;
  const validation = validate(root);
  const localPath = path.join(root, 'release.local.json');
  assertPlainPath(localPath);
  const local = existing(localPath) ? JSON.parse(fs.readFileSync(localPath, 'utf8')) : {};
  const { appid } = chooseIdentity(environment || {}, local, validation.projectConfig);
  const projectName = `ember-duel-${report.release.version}-rc`;
  const exportRoot = path.join(root, '.artifacts', 'release');
  const projectOutput = path.join(exportRoot, projectName);
  const zipOutput = path.join(exportRoot, `${projectName}.zip`);
  const manifestOutput = path.join(exportRoot, `${projectName}.manifest.json`);
  // Do not replace any successful output until a complete staged project and
  // its archive have both passed validation.
  for (const output of [projectOutput, zipOutput, manifestOutput]) inspectTree(output);
  ensureDirectory(exportRoot);
  const stage = fs.mkdtempSync(path.join(exportRoot, '.release-stage-'));
  const stagedProject = path.join(stage, projectName);
  const stagedZip = path.join(stage, `${projectName}.zip`);
  const stagedManifest = path.join(stage, `${projectName}.manifest.json`);
  let preserveStage = false;
  try {
    fs.mkdirSync(stagedProject);
    for (const relativePath of validation.files) {
      const source = path.join(root, validation.sourceFiles?.[relativePath] || relativePath);
      assertPlainPath(source);
      let bytes = fs.readFileSync(source);
      if (relativePath === 'project.config.json') {
        const configuration = JSON.parse(bytes.toString('utf8'));
        configuration.appid = appid;
        bytes = Buffer.from(`${JSON.stringify(configuration, null, 2)}\n`);
      }
      const destination = path.join(stagedProject, relativePath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, bytes, { mode: 0o644 });
      fs.utimesSync(destination, FIXED_TIME, FIXED_TIME);
    }
    const candidate = validate(stagedProject, { maxBytes: validation.maxBytes, exported: report.release.target === 'game' });
    if (candidate.projectConfig.appid !== appid) throw new Error('候选 AppID 写入校验失败。');
    const files = candidate.files.map((relativePath) => {
      const bytes = fs.readFileSync(path.join(stagedProject, relativePath));
      return { path: relativePath, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
    });
    const manifest = {
      schema_version: 1,
      kind: 'release-candidate',
      name: report.release.name,
      version: report.release.version,
      target: report.release.target,
      release_ready: false,
      platform_checks: report.platform_checks,
      total_bytes: candidate.totalBytes,
      max_bytes: candidate.maxBytes,
      files,
    };
    fs.writeFileSync(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
    const archive = spawnSync('zip', ['-X', '-q', stagedZip, ...files.map((file) => `${projectName}/${file.path}`)], {
      cwd: stage,
      encoding: 'utf8',
      env: { ...process.env, TZ: 'UTC' },
    });
    if (archive.error || archive.status !== 0) throw new Error('ZIP 候选包生成失败，请确认系统 zip 可用；旧候选包未修改。');
    const archiveCheck = spawnSync('unzip', ['-tqq', stagedZip], { encoding: 'utf8' });
    if (archiveCheck.error || archiveCheck.status !== 0) throw new Error('ZIP 完整性检查失败；旧候选包未修改。');
    promote([
      { source: stagedProject, destination: projectOutput },
      { source: stagedZip, destination: zipOutput },
      { source: stagedManifest, destination: manifestOutput },
    ], stage);
    return { ok: true, kind: 'release-candidate', target: report.release.target, release_ready: false, projectOutput, zipOutput, manifestOutput, totalBytes: candidate.totalBytes, platform_checks: report.platform_checks };
  } catch (error) {
    preserveStage = Boolean(error.preserveStage);
    throw error;
  } finally {
    if (!preserveStage) fs.rmSync(stage, { recursive: true, force: true });
  }
}

module.exports = { packageRelease };

if (require.main === module) {
  try {
    if (process.argv.length > 2) throw new Error('用法：node scripts/package-release.js');
    console.log(JSON.stringify(packageRelease(), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, message: error.message, ...(error.report ? { report: error.report } : {}) }, null, 2));
    process.exitCode = 1;
  }
}
