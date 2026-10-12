'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

let pageDefinition;
global.Page = (definition) => {
  pageDefinition = definition;
};
require('../pages/index/index');
delete global.Page;

function createPageHarness() {
  const page = {
    ...pageDefinition,
    data: { ...pageDefinition.data },
    setData(updates) {
      Object.assign(this.data, updates);
    },
  };
  page.onLoad();
  return page;
}

function tapCard(page, playerIndex, cardIndex) {
  page.onCardTap({ currentTarget: { dataset: { playerIndex, cardIndex } } });
}

test('mini-program page runs player and AI attacks and records the exchange', () => {
  const page = createPageHarness();

  tapCard(page, 0, 1);
  assert.equal(page.game.selectedCardIdx, 1);
  tapCard(page, 1, 0);

  assert.equal(page.game.players[1].cards[0].hp, 30);
  assert.equal(page.data.statusTone, 'waiting');
  assert.match(page.data.logs.at(-1).message, /造成 30 点伤害/);

  clearTimeout(page.aiTimer);
  page.runAiTurn();

  assert.deepEqual(page.game.players[0].cards.map((card) => card.hp), [82, 22, 62]);
  assert.equal(page.game.currentPlayerIdx, 0);
  assert.equal(page.data.statusTone, 'ready');
  assert.ok(page.data.logs.some((entry) => entry.message.includes('震地')));
  page.onUnload();
});

test('mini-program logs AI area skill damage and resets the skill for a new battle', () => {
  const page = createPageHarness();
  page.game.currentPlayerIdx = 1;

  page.runAiTurn();

  const skillLogs = page.data.logs.filter((entry) => entry.message.includes('震地'));
  assert.equal(skillLogs.length, 3);
  assert.ok(skillLogs.every((entry) => entry.message.includes('玩家B 的 巨魔')));
  assert.deepEqual(page.game.players[0].cards.map((card) => card.hp), [82, 22, 62]);
  assert.equal(page.game.players[1].cards[2].skill.used, true);
  assert.equal(page.data.statusTone, 'ready');

  page.onReset();
  assert.equal(page.game.players[0].cards[0].hp, 100);
  assert.equal(page.game.players[1].cards[2].skill.used, false);
  page.onUnload();
});

test('restarting restores cards and cancels a pending AI action', () => {
  const page = createPageHarness();
  tapCard(page, 0, 0);
  tapCard(page, 1, 0);

  assert.ok(page.aiTimer);
  page.onReset();

  assert.equal(page.aiTimer, null);
  assert.equal(page.game.players[0].cards[0].hp, 100);
  assert.equal(page.game.players[1].cards[0].hp, 60);
  assert.equal(page.game.players[0].cards[0].skill.used, false);
  assert.equal(page.game.currentPlayerIdx, 0);
  assert.equal(page.data.logs.length, 1);
  page.onUnload();
});

test('mini-program exposes Dragon Flame and logs its area damage', () => {
  const page = createPageHarness();
  tapCard(page, 0, 0);

  assert.equal(page.data.selectedSkill.name, '龙焰');
  assert.equal(page.data.selectedSkill.canUse, true);
  const dragon = page.data.players.find((team) => team.playerIndex === 0).cards[0];
  assert.match(dragon.ariaLabel, /已选为攻击者/);
  page.onUseSkill();

  assert.deepEqual(page.game.players[1].cards.map((card) => card.hp), [48, 13, 78]);
  assert.equal(page.game.players[0].cards[0].skill.used, true);
  assert.equal(page.data.selectedSkill, null);
  assert.equal(page.data.statusTone, 'waiting');
  assert.equal(page.data.logs.filter((entry) => entry.message.includes('龙焰')).length, 3);

  clearTimeout(page.aiTimer);
  page.runAiTurn();
  tapCard(page, 0, 0);
  assert.equal(page.data.selectedSkill.used, true);
  assert.equal(page.data.selectedSkill.canUse, false);
  page.onUnload();
});

test('Precision Shot lets the player choose and cancel a single target', () => {
  const page = createPageHarness();
  tapCard(page, 0, 1);

  assert.equal(page.data.selectedSkill.name, '精准射击');
  assert.equal(page.data.selectedSkill.isTargeted, true);
  assert.equal(page.data.selectedSkill.buttonLabel, '选择目标');
  page.onUseSkill();
  assert.equal(page.data.skillTargeting, true);
  assert.equal(page.data.selectedSkill.buttonLabel, '取消选择');
  assert.match(page.data.statusText, /选择对手目标释放精准射击/);
  const enemy = page.data.players.find((team) => team.playerIndex === 1);
  assert.match(enemy.cards[0].ariaLabel, /可选为技能目标/);

  page.onUseSkill();
  assert.equal(page.data.skillTargeting, false);
  assert.equal(page.game.players[1].cards[0].hp, 60);

  page.onUseSkill();
  tapCard(page, 1, 0);
  assert.equal(page.game.players[1].cards[0].hp, 10);
  assert.equal(page.game.players[1].cards[1].hp, 25);
  assert.equal(page.game.players[0].cards[1].skill.used, true);
  assert.equal(page.data.statusTone, 'waiting');
  assert.ok(page.data.logs.some((entry) => entry.message.includes('精准射击')));

  clearTimeout(page.aiTimer);
  page.onUnload();
});

test('page announces the turn flow and presents a clear terminal state', () => {
  const page = createPageHarness();
  assert.match(page.data.statusText, /选择一张己方卡牌/);

  page.game.players[1].cards[0].hp = 0;
  page.game.players[1].cards[1].hp = 0;
  page.game.players[1].cards[2].hp = 5;
  page.updateView();
  tapCard(page, 0, 1);
  assert.match(page.data.statusText, /选择对手目标/);
  tapCard(page, 1, 2);

  assert.equal(page.data.gameOver, true);
  assert.equal(page.data.turnLabel, '战斗结束');
  assert.equal(page.data.statusTone, 'victory');
  assert.match(page.data.statusText, /玩家A 获胜/);
  const enemy = page.data.players.find((team) => team.playerIndex === 1);
  assert.equal(enemy.cards[2].isDead, true);
  assert.match(enemy.cards[2].ariaLabel, /已倒下/);

  page.onReset();
  assert.equal(page.data.gameOver, false);
  assert.equal(page.data.statusText, '选择一张己方卡牌作为攻击者');
  assert.equal(page.data.logs.length, 1);
  page.onUnload();
});
