# 余烬对决 · 微信小游戏

1.1.0 为三对三单人策略对战，新增战场试炼、战前祝福与星级目标。采用微信小游戏 `game.js/game.json`、Canvas 2D、本地插画和共享规则，包含开始、规则、对局、技能、战报、胜负、再战、关于与隐私。

## 趣味玩法

| 战场 | 玩法 |
| --- | --- |
| 经典对决 | 原有三对三规则与基础数值 |
| 疾风试炼 | 双方普通攻击提高6点，加快交锋节奏 |
| 铁壁试炼 | 双方每张卡牌开局拥有18点护盾，普攻和技能先破盾再扣生命 |

试炼开战前可三选一祝福：利刃（己方普攻+5）、活力（己方生命与上限+20）、灵火（己方技能伤害+8）。结算按取胜、速战、保全战线各授予一颗星。速战上限为经典9、疾风8、铁壁12次行动；保全战线要求至少一人保有半数生命。新一局重新选择战术挑战；星级只记录本局，不依赖登录或存档。

首次接入请看 **[微信小游戏中文接入指南](微信小游戏接入指南.md)**：包含正确分支、下载源码、生成导入包、微信工具接入、账号配置、真机验收和后续同步。

本轮测试与剩余交付事项见 [交付检查报告](docs/DELIVERY_CHECK.md)。使用已验证的 Node.js 24 环境运行 `npm run test:coverage` 可复现覆盖率测量；通过率与覆盖率分别记录。

## 生成小游戏工程

Node.js 18+，无第三方 npm 依赖；导出还需系统 `zip/unzip` 命令：

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
