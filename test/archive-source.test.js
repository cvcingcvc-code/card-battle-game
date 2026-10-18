'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { archiveSource } = require('../scripts/archive-source');

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function createFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ember source archive-'));
  const root = path.join(directory, 'source');
  fs.mkdirSync(root);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const write = (name, source) => {
    const destination = path.join(root, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, source);
  };
  const commit = (message) => {
    git(root, ['add', '--all']);
    git(root, ['-c', 'user.name=Source Archive Fixture', '-c', 'user.email=archive@example.test',
      '-c', 'commit.gpgSign=false', 'commit', '--quiet', '--no-verify', '-m', message]);
    return git(root, ['rev-parse', 'HEAD']).trim();
  };
  git(root, ['init', '--quiet', '--initial-branch=main']);
  write('.gitignore', '.artifacts/\nrelease.local.json\n');
  write('release.config.json', `${JSON.stringify({ version: '1.0.0', name: '余烬对决' })}\n`);
  write('README.md', '# 余烬对决\n完整源码交付。\n');
  write('pages/home/home.js', "Page({ data: { title: '余烬对决' } });\n");
  write('assets/sample.bin', Buffer.from(Array.from({ length: 512 }, (_, index) => index % 256)));
  const initialCommit = commit('Initial source fixture');
  write('release.local.json', '{"appid":"local-only-fixture"}\n');
  return { directory, root, write, commit, initialCommit };
}

// Read central-directory records and extract stored/deflated files, using only
// Node built-ins. This validates the real git-archive ZIP rather than a mock.
function readZip(filePath) {
  const zip = fs.readFileSync(filePath);
  let endOffset = zip.length - 22;
  while (endOffset >= Math.max(0, zip.length - 65557)
    && zip.readUInt32LE(endOffset) !== 0x06054b50) endOffset -= 1;
  assert.ok(endOffset >= 0, 'ZIP must contain its end-of-central-directory record');
  const entries = zip.readUInt16LE(endOffset + 10);
  let offset = zip.readUInt32LE(endOffset + 16);
  const contents = new Map();
  for (let index = 0; index < entries; index += 1) {
    assert.equal(zip.readUInt32LE(offset), 0x02014b50, 'ZIP central directory is valid');
    const compression = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    assert.equal(zip.readUInt32LE(localOffset), 0x04034b50, 'ZIP local record is valid');
    const contentOffset = localOffset + 30 + zip.readUInt16LE(localOffset + 26)
      + zip.readUInt16LE(localOffset + 28);
    const compressed = zip.subarray(contentOffset, contentOffset + compressedSize);
    assert.ok(compression === 0 || compression === 8, 'git archive uses supported ZIP compression');
    contents.set(name, compression === 8 ? zlib.inflateRawSync(compressed) : compressed);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return contents;
}

function snapshot(directory) {
  return new Map(fs.readdirSync(directory).sort().map((name) => [name, fs.readFileSync(path.join(directory, name))]));
}

function assertSnapshotUnchanged(directory, previous) {
  assert.deepEqual(fs.readdirSync(directory).sort(), [...previous.keys()]);
  for (const [name, bytes] of previous) assert.ok(bytes.equals(fs.readFileSync(path.join(directory, name))), name);
}

function withTransientHeadChange(fixture, command, alternateCommit, operation) {
  const originalPath = process.env.PATH;
  const realGit = originalPath.split(path.delimiter).map((directory) => path.join(directory, 'git'))
    .find((candidate) => {
      try { fs.accessSync(candidate, fs.constants.X_OK); return fs.statSync(candidate).isFile(); } catch (_) { return false; }
    });
  assert.ok(realGit, 'Git executable must exist');
  const wrapperDirectory = path.join(fixture.directory, `git-wrapper-${command}`);
  fs.mkdirSync(wrapperDirectory);
  const wrapper = path.join(wrapperDirectory, 'git');
  fs.writeFileSync(wrapper, `#!${process.execPath}\n'use strict';\n`
    + `const {spawnSync} = require('node:child_process');\n`
    + `const binary = ${JSON.stringify(fs.realpathSync(realGit))};\n`
    + `const args = process.argv.slice(2);\n`
    + `const swap = args[0] === ${JSON.stringify(command)} && (args[0] !== 'bundle' || args[1] === 'create');\n`
    + `function run(parameters) { const result = spawnSync(binary, parameters, {stdio:'inherit'}); if (result.error) throw result.error; return result.status; }\n`
    + `if (swap && run(['update-ref','--no-deref','HEAD',${JSON.stringify(alternateCommit)}])) process.exit(2);\n`
    + `let status; try { status = run(args); } finally { if (swap) run(['update-ref','--no-deref','HEAD',${JSON.stringify(fixture.initialCommit)}]); }\n`
    + `process.exit(status);\n`, { mode: 0o755 });
  process.env.PATH = `${wrapperDirectory}${path.delimiter}${originalPath}`;
  try { return operation(); } finally { process.env.PATH = originalPath; }
}

test('clean source ZIP and complete Git bundle can be verified and restored offline', (t) => {
  const { directory, root, initialCommit } = createFixture(t);
  const result = archiveSource({ projectRoot: root });
  assert.equal(result.version, '1.0.0');
  assert.equal(result.commit, initialCommit);
  assert.equal(path.basename(result.zipOutput), 'ember-duel-source-1.0.0.zip');
  assert.equal(path.basename(result.bundleOutput), 'ember-duel-source-1.0.0.bundle');

  const manifest = JSON.parse(fs.readFileSync(result.manifestOutput, 'utf8'));
  assert.equal(manifest.version, '1.0.0');
  assert.equal(manifest.commit, initialCommit);
  assert.equal(manifest.archive_prefix, 'ember-duel/');
  assert.deepEqual(manifest.artifacts.map((artifact) => artifact.kind), ['source_zip', 'git_bundle']);
  for (const artifact of manifest.artifacts) {
    const bytes = fs.readFileSync(path.join(result.outputDirectory, artifact.file));
    assert.equal(artifact.bytes, bytes.length);
    assert.equal(artifact.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
  }

  const zip = readZip(result.zipOutput);
  const trackedPaths = git(root, ['ls-tree', '-r', '-z', '--name-only', 'HEAD']).split('\0').filter(Boolean);
  assert.deepEqual([...zip.keys()].filter((name) => !name.endsWith('/')).sort(),
    trackedPaths.map((name) => `ember-duel/${name}`).sort());
  for (const [name, bytes] of zip) {
    assert.ok(name.startsWith('ember-duel/'), name);
    assert.ok(!/(?:^|\/)(?:\.git|\.artifacts|release\.local\.json)(?:\/|$)/.test(name), name);
    if (!name.endsWith('/')) assert.ok(bytes.equals(fs.readFileSync(path.join(root, name.slice('ember-duel/'.length)))), name);
  }

  git(root, ['bundle', 'verify', result.bundleOutput]);
  assert.match(git(root, ['bundle', 'list-heads', result.bundleOutput]), new RegExp(`^${initialCommit} HEAD`, 'm'));
  const restored = path.join(directory, 'restored');
  git(root, ['clone', '--quiet', result.bundleOutput, restored]);
  assert.equal(git(restored, ['rev-parse', 'HEAD']).trim(), initialCommit);
  assert.equal(fs.readFileSync(path.join(restored, 'README.md'), 'utf8'), fs.readFileSync(path.join(root, 'README.md'), 'utf8'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(restored, 'release.config.json'), 'utf8')).version, '1.0.0');
  assert.equal(fs.existsSync(path.join(restored, 'release.local.json')), false);

  const originalZip = fs.readFileSync(result.zipOutput);
  archiveSource({ projectRoot: root });
  assert.ok(originalZip.equals(fs.readFileSync(result.zipOutput)), 'a fixed HEAD produces the same source ZIP');
  assert.equal(git(root, ['status', '--porcelain=v1', '--untracked-files=all']), '');
});

test('tracked, staged and untracked changes refuse export and preserve the previous delivery', (t) => {
  const { root, write } = createFixture(t);
  const result = archiveSource({ projectRoot: root });
  const previous = snapshot(result.outputDirectory);
  const originalReadme = fs.readFileSync(path.join(root, 'README.md'));

  write('README.md', 'uncommitted edit');
  assert.throws(() => archiveSource({ projectRoot: root }), /干净 Git 工作树/);
  assertSnapshotUnchanged(result.outputDirectory, previous);

  git(root, ['add', 'README.md']);
  assert.throws(() => archiveSource({ projectRoot: root }), /干净 Git 工作树/);
  assertSnapshotUnchanged(result.outputDirectory, previous);
  write('README.md', originalReadme);
  git(root, ['add', 'README.md']);

  write('notes/untracked.txt', 'must not be silently lost');
  assert.throws(() => archiveSource({ projectRoot: root }), /干净 Git 工作树[\s\S]*notes\/untracked\.txt/);
  assertSnapshotUnchanged(result.outputDirectory, previous);
});

test('HEAD version disagreement is caught even when Git hides a tracked worktree change', (t) => {
  const { root, write } = createFixture(t);
  const result = archiveSource({ projectRoot: root });
  const previous = snapshot(result.outputDirectory);
  git(root, ['update-index', '--assume-unchanged', 'release.config.json']);
  write('release.config.json', '{"version":"2.0.0"}');
  assert.equal(git(root, ['status', '--porcelain=v1']), '');
  assert.throws(() => archiveSource({ projectRoot: root }), /工作树版本与 HEAD 版本不一致/);
  assertSnapshotUnchanged(result.outputDirectory, previous);
});

test('archive paths reject symlinked parents, output directories and output files', (t) => {
  for (const location of ['parent', 'directory', 'file']) {
    const { directory, root } = createFixture(t);
    const outside = path.join(directory, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'preserve.txt'), 'outside directory');
    const artifactRoot = path.join(root, '.artifacts');
    const outputDirectory = path.join(artifactRoot, 'source');
    if (location === 'parent') {
      fs.symlinkSync(outside, artifactRoot, 'dir');
    } else if (location === 'directory') {
      fs.mkdirSync(artifactRoot);
      fs.symlinkSync(outside, outputDirectory, 'dir');
    } else {
      fs.mkdirSync(outputDirectory, { recursive: true });
      fs.symlinkSync(path.join(outside, 'preserve.txt'), path.join(outputDirectory, 'ember-duel-source-1.0.0.zip'));
    }
    assert.throws(() => archiveSource({ projectRoot: root }), /符号链接/);
    assert.equal(fs.readFileSync(path.join(outside, 'preserve.txt'), 'utf8'), 'outside directory');
    assert.deepEqual(fs.readdirSync(outside), ['preserve.txt']);
  }
});

test('a Git failure during staged generation retains all old artifacts and cleans its staging area', (t) => {
  const { root } = createFixture(t);
  const result = archiveSource({ projectRoot: root });
  const previous = snapshot(result.outputDirectory);
  // Only this disposable repository gets an invalid pack setting. No user or
  // global Git configuration is changed, and archive generation reaches staging.
  git(root, ['config', '--local', 'pack.threads', 'not-a-number']);
  assert.throws(() => archiveSource({ projectRoot: root }), /Git (?:bundle|archive) 失败/);
  assertSnapshotUnchanged(result.outputDirectory, previous);
  assert.deepEqual(fs.readdirSync(path.join(root, '.artifacts')), ['source']);
});

test('force-tracked local configuration cannot leak into the source delivery', (t) => {
  const { root, commit } = createFixture(t);
  git(root, ['add', '--force', 'release.local.json']);
  commit('Accidentally tracked local fixture');
  assert.throws(() => archiveSource({ projectRoot: root }), /HEAD 包含本机配置或生成物.*release\.local\.json/);
  assert.equal(fs.existsSync(path.join(root, '.artifacts')), false);
});

test('private development-tool configuration is rejected at any tracked directory depth', (t) => {
  for (const name of ['project.private.config.json', 'pages/home/project.private.config.json']) {
    const { root, write, commit } = createFixture(t);
    write(name, '{"privateFixture":true}');
    commit('Track private development-tool fixture');
    assert.throws(() => archiveSource({ projectRoot: root }), /HEAD 包含本机配置或生成物.*project\.private\.config\.json/);
    assert.equal(fs.existsSync(path.join(root, '.artifacts')), false);
  }
});

test('deleted private configuration in reachable history blocks the complete Git bundle', (t) => {
  for (const name of ['release.local.json', 'project.private.config.json', 'pages/home/project.private.config.json']) {
    const { root, write, commit } = createFixture(t);
    const result = archiveSource({ projectRoot: root });
    const previous = snapshot(result.outputDirectory);
    write(name, '{"privateFixture":true}');
    git(root, ['add', '--force', name]);
    commit('Track private configuration fixture');
    fs.unlinkSync(path.join(root, name));
    commit('Delete private configuration fixture');
    assert.equal(git(root, ['status', '--porcelain=v1']), '');
    assert.throws(() => archiveSource({ projectRoot: root }), /可达 Git 历史曾记录.*先处理私有配置历史/);
    assertSnapshotUnchanged(result.outputDirectory, previous);
  }
});

test('temporary HEAD changes cannot mix the source ZIP, bundle and declared commit', (t) => {
  const fixture = createFixture(t);
  const { root, write, commit, initialCommit } = fixture;
  const originalReadme = fs.readFileSync(path.join(root, 'README.md'));
  write('README.md', 'alternate commit source');
  const alternateCommit = commit('Alternate source fixture');
  git(root, ['checkout', '--quiet', '--detach', initialCommit]);

  const result = withTransientHeadChange(fixture, 'archive', alternateCommit,
    () => archiveSource({ projectRoot: root }));
  assert.equal(result.commit, initialCommit);
  assert.ok(readZip(result.zipOutput).get('ember-duel/README.md').equals(originalReadme),
    'archive must use the captured object ID even when HEAD changes and changes back');
  const previous = snapshot(result.outputDirectory);
  assert.throws(() => withTransientHeadChange(fixture, 'bundle', alternateCommit,
    () => archiveSource({ projectRoot: root })), /bundle 的 HEAD 与归档提交不一致/);
  assertSnapshotUnchanged(result.outputDirectory, previous);
  assert.equal(git(root, ['rev-parse', 'HEAD']).trim(), initialCommit);
});
