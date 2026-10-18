# 余烬对决 · 微信小游戏

1.0.0 固定三对三单人策略对战。主要交付现为微信小游戏：`game.js/game.json`、Canvas 2D、本地插画和共享规则。开始、规则、对局、技能、战报、胜负、再战、关于与隐私形成闭环，后续玩法从这个版本迭代。

## 生成小游戏工程

Node.js 18+，无第三方 npm 依赖：

```sh
npm run verify
npm run package:minigame
```

导入 `.artifacts/minigame/ember-duel`，或解压同目录 `ember-duel.zip` 后导入。目录内应直接包含 `game.js`、`game.json`、`project.config.json`，配置类型为 `game`。请选择微信小游戏 AppID；测试账号能力以工具提示为准。

**仓库根目录保留普通小程序参考工程；正式小游戏请导入上述独立目录。** 小游戏打包不会携带 Page/WXML 或普通小程序入口。

## 发布候选与源码保存

```sh
cp release.local.example.json release.local.json
# 在本机填入实际小游戏AppID，accountType为game。
npm run release:check
npm run package:release
```

候选副本中写入 AppID，源配置与本机账号文件不混入运行时交付。AppID 校验只确认格式；平台编译、真机、账号资质和审核需要实际完成。详见 [小游戏发布步骤](docs/RELEASE.md)。

建立干净的源码 Git 提交后运行 `npm run archive:source`，生成完整源码 ZIP、可恢复 Git bundle 和哈希清单。源码归档包含测试、设计源和工具，供后续增加玩法。

## 源码分工

| 路径 | 用途 |
| --- | --- |
| `minigame/entry.js` | 打包后成为小游戏根 `game.js` |
| `minigame/runtime.js` | 微信画布、图片、触摸、滚动、尺寸与生命周期适配 |
| `minigame/controller.js` | 纯JS场景/对局状态，复用规则，管理AI任务 |
| `minigame/renderer.js` | Canvas画面、文本换行与命中区 |
| 根 `game.js` | 共享规则，小游戏包内命名为 `rules.js` |
| `data/`、`assets/` | 版本、卡牌资料和七张本地图片 |
| `scripts/`、`test/` | 导出、发布预检、源码归档与自动化 |
| `design/art-source/` | 原创SVG和PNG重生成工具 |
| `pages/`、`app.*` | 原生小程序参考版，非小游戏发布入口 |
| `index.html`、`standalone/` | 浏览器/历史原型，非小游戏发布入口 |

Canvas 在状态变化、触摸滚动、图片加载或尺寸改变时绘制，空闲时不启动持续动画循环。没有登录、业务网络、广告、支付或存档依赖。玩法与设计入口见 [DESIGN.md](docs/DESIGN.md)，数据事实见 [PRIVACY.md](docs/PRIVACY.md)。
