'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateProject } = require('./package-weapp');
const { validateMinigame } = require('./package-minigame');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const APPID_PATTERN = /^wx[0-9a-fA-F]{16}$/;
const VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function assertPlainPath(filePath) {
  const absolute = path.resolve(filePath);
  const { root } = path.parse(absolute);
  let current = root;
  for (const part of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const status = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!status) continue;
    if (status.isSymbolicLink()) throw new Error('路径包含符号链接，停止发布检查。');
  }
}

function readJson(root, relativePath) {
  const filePath = path.join(root, relativePath);
  assertPlainPath(filePath);
  if (!fs.statSync(filePath).isFile()) throw new Error(`${relativePath} 必须为普通文件。`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${relativePath} 不是有效 JSON。`);
    throw error;
  }
}

function platformChecks() {
  return {
    status: 'unverified',
    checks: [
      { id: 'devtools_compile', status: 'unverified', message: '需要在微信开发者工具中编译验收。' },
      { id: 'device_validation', status: 'unverified', message: '需要在微信真机上验证显示与完整对局。' },
      { id: 'account_permission', status: 'unverified', message: 'AppID 格式不能证明账号权限或账号真实类型。' },
      { id: 'service_category', status: 'unverified', message: '需要在平台确认服务类目、备案及所需资质适用当前玩法。' },
      { id: 'platform_review', status: 'unverified', message: '审核结果及发布权限由微信平台确认。' },
    ],
  };
}

function chooseIdentity(environment, local, projectConfig) {
  // An explicitly supplied environment value takes precedence, including an
  // empty value. This prevents an old local identity from overriding CI input.
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const appid = own(environment, 'WECHAT_APPID')
    ? environment.WECHAT_APPID
    : own(local, 'appid') ? local.appid : projectConfig.appid;
  const accountType = own(environment, 'WECHAT_ACCOUNT_TYPE')
    ? environment.WECHAT_ACCOUNT_TYPE
    : local.accountType;
  return {
    appid,
    accountType,
    appidSource: own(environment, 'WECHAT_APPID') ? 'environment' : own(local, 'appid') ? 'release.local.json' : 'project.config.json',
    accountTypeSource: own(environment, 'WECHAT_ACCOUNT_TYPE') ? 'environment' : own(local, 'accountType') ? 'release.local.json' : 'missing',
  };
}

function checkRelease({ projectRoot = PROJECT_ROOT, codeOnly = false, environment = process.env } = {}) {
  const root = path.resolve(projectRoot);
  const source = { status: 'passed', checks: [] };
  const identity = { status: codeOnly ? 'not_checked' : 'passed', checks: [] };
  const record = (section, id, operation) => {
    try {
      const message = operation();
      section.checks.push({ id, status: 'passed', message });
    } catch (error) {
      section.status = 'failed';
      section.checks.push({ id, status: 'failed', message: error.message });
    }
  };
  let validation;
  let metadata;
  let target;
  record(source, 'release_metadata', () => {
    assertPlainPath(root);
    const manifest = readJson(root, 'package.json');
    const release = readJson(root, 'release.config.json');
    const app = readJson(root, 'data/app.json');
    if (!release || typeof release !== 'object' || Array.isArray(release)) throw new Error('release.config.json 必须为对象。');
    if (!['miniprogram', 'game'].includes(release.target)) throw new Error('release.config.json.target 必须为 miniprogram 或 game。');
    target = release.target;
    if (typeof release.version !== 'string' || !VERSION_PATTERN.test(release.version)) throw new Error('release.config.json.version 必须为有效版本号。');
    if (manifest.version !== release.version || app.version !== release.version) throw new Error('package.json、release.config.json、data/app.json 的版本号必须一致。');
    if (typeof release.name !== 'string' || !release.name.trim() || release.name !== app.name) throw new Error('发布名称必须存在，并与 data/app.json 一致。');
    if (typeof release.description !== 'string' || !release.description.trim()) throw new Error('release.config.json.description 不能为空。');
    metadata = { name: release.name, version: release.version, target: release.target, description: release.description };
    return `发布元数据与应用版本一致：${release.version}。`;
  });
  record(source, 'source_project', () => {
    assertPlainPath(root);
    if (!target) throw new Error('无法确认发布目标，未选择运行时校验器。');
    validation = target === 'game' ? validateMinigame(root) : validateProject(root);
    return `${target === 'game' ? '小游戏' : '小程序'}源码、依赖和资源清单通过检查：${validation.files.length} 个文件，${validation.totalBytes}/${validation.maxBytes} 字节。`;
  });

  if (codeOnly) {
    identity.checks.push({ id: 'release_identity', status: 'not_checked', message: '仅检查源码，未检查发布 AppID 与账号类型。' });
  } else {
    let chosen;
    record(identity, 'identity_configuration', () => {
      assertPlainPath(root);
      const localPath = path.join(root, 'release.local.json');
      assertPlainPath(localPath);
      const local = fs.existsSync(localPath) ? readJson(root, 'release.local.json') : {};
      if (!local || typeof local !== 'object' || Array.isArray(local)) throw new Error('release.local.json 必须为对象。');
      const configPath = target === 'game' ? 'minigame/project.config.json' : 'project.config.json';
      const projectConfig = validation ? validation.projectConfig : readJson(root, configPath);
      chosen = chooseIdentity(environment || {}, local, projectConfig);
      if (chosen.appidSource === 'project.config.json') chosen.appidSource = configPath;
      identity.sources = { appid: chosen.appidSource, account_type: chosen.accountTypeSource };
      return '已读取发布身份来源，未输出身份值。';
    });
    if (chosen) {
      record(identity, 'appid_format', () => {
        if (typeof chosen.appid !== 'string' || !APPID_PATTERN.test(chosen.appid)) throw new Error('缺少格式有效的真实 AppID；请在本地 release.local.json 或 WECHAT_APPID 中配置，不使用测试占位值。');
        return 'AppID 格式有效；未验证其真实性或权限。';
      });
      record(identity, 'account_runtime', () => {
        const normalized = chosen.accountType === 'minigame' ? 'game' : chosen.accountType;
        if ((normalized === 'game' && target === 'miniprogram') || (normalized === 'miniprogram' && target === 'game')) throw new Error('账号类型与当前工程运行时不匹配，不能只替换 AppID 发布。');
        if (!target || normalized !== target) throw new Error(`必须显式配置 WECHAT_ACCOUNT_TYPE 或 release.local.json.accountType 为 ${target || '当前发布目标'}，不能默认账号类型。`);
        identity.normalized_account_type = normalized;
        return `配置声明账号类型为 ${normalized}；真实类型仍需在平台核实。`;
      });
    }
  }
  const sourcePassed = source.status === 'passed';
  const identityPassed = identity.status === 'passed';
  return {
    schema_version: 1,
    kind: 'release-preflight',
    ok: sourcePassed && (codeOnly || identityPassed),
    code_only: Boolean(codeOnly),
    candidate_ready: sourcePassed && identityPassed && !codeOnly,
    release_ready: false,
    ...(metadata ? { release: metadata } : {}),
    source_checks: source,
    identity_checks: identity,
    platform_checks: platformChecks(),
  };
}

module.exports = { checkRelease, assertPlainPath, chooseIdentity };

if (require.main === module) {
  const arguments_ = process.argv.slice(2);
  if (arguments_.some((argument) => argument !== '--code-only')) {
    console.error(JSON.stringify({ ok: false, message: '用法：node scripts/check-release.js [--code-only]' }));
    process.exitCode = 1;
  } else {
    const report = checkRelease({ codeOnly: arguments_.includes('--code-only') });
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  }
}
