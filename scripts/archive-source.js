'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ARCHIVE_PREFIX = 'ember-duel/';
const VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function git(projectRoot, args) {
  const result = spawnSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw new Error(`无法运行 Git：${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`Git ${args[0]} 失败：${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout;
}

function assertClean(projectRoot) {
  const status = git(projectRoot, [
    'status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none',
    '--', '.', ':(exclude).artifacts', ':(exclude)release.local.json',
  ]);
  if (status.length) throw new Error(`源码归档需要干净 Git 工作树，请先审阅并提交修改：\n${status.trimEnd()}`);
}

function readVersion(source) {
  const configuration = JSON.parse(source);
  if (!configuration || typeof configuration.version !== 'string'
    || !VERSION_PATTERN.test(configuration.version)) {
    throw new Error('release.config.json.version 必须为有效版本号。');
  }
  return configuration.version;
}

function inspectOutput(target, { recursive = false } = {}) {
  const status = fs.lstatSync(target, { throwIfNoEntry: false });
  if (!status) return;
  if (status.isSymbolicLink()) throw new Error(`源码归档输出路径包含符号链接：${target}`);
  if (!status.isFile() && !status.isDirectory()) throw new Error(`不支持的源码归档输出类型：${target}`);
  if (recursive && status.isDirectory()) {
    for (const name of fs.readdirSync(target)) inspectOutput(path.join(target, name), { recursive: true });
  }
  return status;
}

function checkSnapshot(projectRoot, expectedCommit, expectedVersion) {
  assertClean(projectRoot);
  if (git(projectRoot, ['rev-parse', 'HEAD']).trim() !== expectedCommit) {
    throw new Error('归档期间 HEAD 已改变，请重新执行源码归档。');
  }
  const version = readVersion(fs.readFileSync(path.join(projectRoot, 'release.config.json'), 'utf8'));
  const committedVersion = readVersion(git(projectRoot, ['show', 'HEAD:release.config.json']));
  if (version !== expectedVersion || committedVersion !== expectedVersion) {
    throw new Error('release.config.json 的工作树版本与 HEAD 版本不一致。');
  }
}

function artifactMetadata(directory, name, kind) {
  const bytes = fs.readFileSync(path.join(directory, name));
  return {
    file: name,
    kind,
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
}

function archiveSource({ projectRoot = path.resolve(__dirname, '..') } = {}) {
  const root = fs.realpathSync(path.resolve(projectRoot));
  const gitRoot = fs.realpathSync(git(root, ['rev-parse', '--show-toplevel']).trim());
  if (gitRoot !== root) throw new Error('projectRoot 必须指向 Git 仓库根目录。');

  assertClean(root);
  const version = readVersion(fs.readFileSync(path.join(root, 'release.config.json'), 'utf8'));
  const commit = git(root, ['rev-parse', 'HEAD']).trim();
  checkSnapshot(root, commit, version);

  // These files must never enter a source delivery, even if force-added to Git.
  const committedPaths = git(root, ['ls-tree', '-r', '-z', '--name-only', 'HEAD']).split('\0').filter(Boolean);
  const forbiddenPath = committedPaths.find((name) => name === 'release.local.json'
    || name === '.artifacts' || name.startsWith('.artifacts/')
    || name.split('/').includes('project.private.config.json')
    || name.split('/').includes('.git'));
  if (forbiddenPath) throw new Error(`HEAD 包含本机配置或生成物，请先移出版本管理：${forbiddenPath}`);
  const privateHistory = git(root, [
    'log', '-1', '--format=%H', '--full-history', '--no-renames', 'HEAD', '--',
    'release.local.json', 'project.private.config.json', ':(glob)**/project.private.config.json',
  ]).trim();
  if (privateHistory) {
    throw new Error('可达 Git 历史曾记录 release.local.json 或 project.private.config.json；请先处理私有配置历史，再生成完整 Git bundle。');
  }

  const artifactRoot = path.join(root, '.artifacts');
  const outputDirectory = path.join(artifactRoot, 'source');
  const artifactRootStatus = inspectOutput(artifactRoot);
  if (artifactRootStatus && !artifactRootStatus.isDirectory()) throw new Error('.artifacts 必须为目录。');
  const outputStatus = inspectOutput(outputDirectory, { recursive: true });
  if (outputStatus && !outputStatus.isDirectory()) throw new Error('源码归档输出必须为目录。');
  if (!artifactRootStatus) fs.mkdirSync(artifactRoot);

  const stagingDirectory = fs.mkdtempSync(path.join(artifactRoot, '.source-staging-'));
  const backupDirectory = path.join(artifactRoot, `.source-previous-${crypto.randomBytes(12).toString('hex')}`);
  const basename = `ember-duel-source-${version}`;
  const zipName = `${basename}.zip`;
  const bundleName = `${basename}.bundle`;
  const manifestName = `${basename}.manifest.json`;
  let movedPrevious = false;
  let installed = false;
  let manifest;

  try {
    git(root, ['archive', '--format=zip', `--prefix=${ARCHIVE_PREFIX}`,
      `--output=${path.join(stagingDirectory, zipName)}`, commit]);
    git(root, ['bundle', 'create', path.join(stagingDirectory, bundleName), 'HEAD']);
    git(root, ['bundle', 'verify', path.join(stagingDirectory, bundleName)]);
    const bundleHead = git(root, ['bundle', 'list-heads', path.join(stagingDirectory, bundleName), 'HEAD']).trim();
    if (bundleHead !== `${commit} HEAD`) {
      throw new Error('Git bundle 的 HEAD 与归档提交不一致，请重新执行源码归档。');
    }

    manifest = {
      schema_version: 1,
      version,
      commit,
      archive_prefix: ARCHIVE_PREFIX,
      artifacts: [
        artifactMetadata(stagingDirectory, zipName, 'source_zip'),
        artifactMetadata(stagingDirectory, bundleName, 'git_bundle'),
      ],
    };
    fs.writeFileSync(path.join(stagingDirectory, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);

    // A concurrent edit or commit invalidates this delivery before any old files move.
    checkSnapshot(root, commit, version);
    inspectOutput(artifactRoot);
    const currentOutput = inspectOutput(outputDirectory, { recursive: true });
    if (currentOutput && !currentOutput.isDirectory()) throw new Error('源码归档输出必须为目录。');
    if (currentOutput) {
      fs.renameSync(outputDirectory, backupDirectory);
      movedPrevious = true;
    }
    fs.renameSync(stagingDirectory, outputDirectory);
    installed = true;
  } catch (error) {
    if (movedPrevious && !installed) fs.renameSync(backupDirectory, outputDirectory);
    throw error;
  } finally {
    if (!installed) fs.rmSync(stagingDirectory, { recursive: true, force: true });
  }

  // Cleanup happens after the complete new delivery is in place. If filesystem
  // cleanup fails, retain the previous backup rather than invalidate the result.
  if (movedPrevious) {
    try { fs.rmSync(backupDirectory, { recursive: true, force: true }); } catch (_) { /* Keep backup. */ }
  }
  return {
    version,
    commit,
    outputDirectory,
    zipOutput: path.join(outputDirectory, zipName),
    bundleOutput: path.join(outputDirectory, bundleName),
    manifestOutput: path.join(outputDirectory, manifestName),
    manifest,
  };
}

module.exports = { archiveSource };

if (require.main === module) {
  try {
    const result = archiveSource();
    console.log(`源码版本：${result.version} · Git 提交：${result.commit}`);
    console.log(`源码 ZIP：${result.zipOutput}`);
    console.log(`可恢复 Git 历史：${result.bundleOutput}`);
    console.log(`SHA-256 与字节数清单：${result.manifestOutput}`);
    console.log('以上文件为本地生成的源码交付物。');
  } catch (error) {
    console.error(`源码归档失败：${error.message}`);
    process.exitCode = 1;
  }
}
