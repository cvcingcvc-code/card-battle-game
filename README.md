# Card Battle Game

A small browser card battle prototype. The root page uses `game.js` for its player-versus-AI rules. `standalone/index.html` preserves an older self-contained auto-battle version.

Open `index.html` in a browser to play. Open `standalone/index.html` to view the older auto-battle version.

## WeChat Mini Program

Import the repository root in WeChat DevTools. The native app entry is `app.json` and the first page is `pages/index/index`. `project.config.json` leaves `appid` empty; set it to an app ID you own when preparing the project in DevTools.

In the mini-program battle, the Dragon can use its once-per-game Flame skill against all living enemies. The Elf Archer can aim its once-per-game Precision Shot at one enemy for 50 damage; select the Archer, choose the skill, then choose a target.

Run the rule tests with Node.js:

```sh
npm test
```
