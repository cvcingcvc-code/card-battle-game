# 微信开发者工具导入

主要发布工程现为微信小游戏，首次接入请看 [中文接入指南](../微信小游戏接入指南.md)，发布步骤见 [RELEASE.md](RELEASE.md)。

运行 `npm run package:minigame`，导入 `.artifacts/minigame/ember-duel`。小游戏目录直接包含 `game.js/game.json/project.config.json`，类型为 `game`；选择小游戏 AppID。无需构建npm或配置服务器。

仓库根目录保留先前原生小程序参考工程。仅在开发参考版时使用 `npm run package:weapp` 或根目录的 `app.json`；该工程不是当前小游戏发布入口，账号类型不能混用。

常见问题：

- 找不到入口：选择直接含 `game.js` 和 `game.json` 的目录，不是仓库父目录或ZIP上一级。
- AppID类型或权限错误：在公众平台确认使用小游戏账号，并由管理员授权当前微信号。
- 改源码后导出没变化：重新打包；生成目录是交付副本，日常改动应在源文件维护。
- 图片缺失：运行 `npm run verify` 和重新打包，检查 `assets/` 内容及代码依赖分析。
- 手机触控或字号不同：检查基础库和设备，执行真机调试，把设备/系统/微信版本与复现步骤记录后回源码修正。

源码与Canvas浏览器检查不等于微信平台编译、真机或审核已通过。
