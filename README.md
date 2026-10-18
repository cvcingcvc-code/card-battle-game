# 余烬对决 · 微信原生卡牌对战

离线人机回合制卡牌对战，使用 WXML、WXSS、`Page()` 和本地规则引擎。不需要服务端、数据库、登录、网络 API、第三方组件或 npm 构建。当前工程类型是微信**小程序**（`miniprogram`）；微信小游戏采用另一套入口和运行环境，需要另行适配。能导入开发者工具并不等于账号类目、资质或审核已经满足发布要求。

## 开发与验证

使用 Node.js 18 或更新版本，在仓库根目录运行：

```sh
npm test
npm run verify
npm run package:weapp
```

项目没有 npm 依赖，不需要 `npm install`。`verify` 执行测试和代码发布检查；它不要求真实 AppID，也不会上传。`package:weapp` 输出可导入的开发工程：

```text
.artifacts/wechat/card-battle-game/               开发者工具导入目录
.artifacts/wechat/card-battle-game.zip            可解压后导入的 ZIP
.artifacts/wechat/card-battle-game.manifest.json  文件大小与 SHA-256 清单
```

导出器检查原生配置、页面、模块、图片等本地资源引用、调试/测试资源和仓库的 2 MiB 保守体积预算。最终包大小以开发者工具分析为准。系统没有 `zip` 时仍会生成工程目录。重复导出会重建生成目录，请在源码或另行解压的工作目录继续开发。

## 微信开发者工具

1. 安装稳定版微信开发者工具，选择「导入项目」。
2. 选择生成的 `card-battle-game` 文件夹，确认其中直接包含 `app.json` 和 `project.config.json`。
3. 项目类型选「小程序」。本地查看可用工具提供的测试号；正式预览和上传使用自己拥有权限且类别符合项目的小程序 AppID。
4. 点击「编译」。无需「构建 npm」，无需选择云开发环境。

日常迭代也可直接导入仓库根目录，项目配置会排除浏览器、测试、设计源文件和导出产物。源码中的 AppID 保持空白；不要把凭据或个人开发者配置提交到仓库。完整操作、验收及故障处理见 [微信导入与验收](docs/WECHAT_IMPORT.md)。

## 发布候选检查

```sh
npm run release:check
npm run package:release
```

发布命令按发布配置和真实 AppID 检查候选资格；缺少要求时会明确失败。详见 [发布候选流程](docs/RELEASE.md)。配置中的 `release.local.json` 用于本机账号信息，不进入运行时工程。`package:release` 产出 release-candidate 源工程，不是微信官方上传包；开发导出、候选检查和上传审核是不同步骤。微信模拟器编译、扫码预览、iOS/Android 真机验收及账号平台要求需另行完成。

## 游戏与工程

从开始页查看规则并进入战斗。选择己方存活卡牌，再选择敌人普通攻击。龙的「龙焰」攻击所有存活敌人；精灵射手的「精准射击」需先选技能，再选目标。技能每局一次，对手自动行动；战斗结束可重开或回到开始页。

| 路径 | 用途 |
| --- | --- |
| `app.*`、`sitemap.json`、`project.config.json` | 原生入口、全局样式、搜索规则及工程配置 |
| `pages/` | 开始页、规则、战斗、结算与关于/隐私说明 |
| `game.js`、`data/` | 共用规则、卡牌文案与素材元数据 |
| `assets/`、`design/` | 发布素材与不打包的设计源文件 |
| `test/`、`scripts/` | 回归测试、工程导出及发布检查 |
| `index.html`、`standalone/` | 浏览器预览与历史原型，不是微信入口 |

浏览器预览可运行 `python3 -m http.server 8000 --bind 0.0.0.0` 后访问 `http://localhost:8000`。浏览器检查和 Node.js 测试不能替代微信官方编译、设备显示和发布验收。
