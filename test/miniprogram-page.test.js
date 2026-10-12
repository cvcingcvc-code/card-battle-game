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

function pickCardIndex(cards, score, preferHigher) {
  return cards.reduce((bestIndex, card, index) => {
    if (card.hp <= 0) return bestIndex;
    if (bestIndex === -1) return index;
    const currentScore = score(card);
    const bestScore = score(cards[bestIndex]);
    return preferHigher
      ? currentScore > bestScore ? index : bestIndex
      : currentScore < bestScore ? index : bestIndex;
  }, -1);
}

function playDeterministicMatch(page, choosePlayerMove) {
  let turns = 0;
  while (!page.game.gameOver && turns < 20) {
    assert.equal(page.game.currentPlayerIdx, 0);
    choosePlayerMove(page);
    if (page.game.currentPlayerIdx === 1 && !page.game.gameOver) {
      clearTimeout(page.aiTimer);
      page.runAiTurn();
    }
    turns += 1;
  }
  assert.ok(page.game.gameOver, 'match should finish within 20 player turns');
  return turns;
}

function playWinningMove(page) {
  const playerCards = page.game.players[0].cards;
  const enemyCards = page.game.players[1].cards;
  const archer = playerCards[1];
  const dragon = playerCards[0];
  const livingEnemyCount = enemyCards.filter((card) => card.hp > 0).length;

  if (archer.hp > 0 && !archer.skill.used) {
    const targetIndex = pickCardIndex(enemyCards, (card) => card.hp, true);
    tapCard(page, 0, 1);
    page.onUseSkill();
    tapCard(page, 1, targetIndex);
  } else if (dragon.hp > 0 && !dragon.skill.used && livingEnemyCount > 1) {
    tapCard(page, 0, 0);
    page.onUseSkill();
  } else {
    const attackerIndex = pickCardIndex(playerCards, (card) => card.attack, true);
    const targetIndex = pickCardIndex(enemyCards, (card) => card.hp, false);
    tapCard(page, 0, attackerIndex);
    tapCard(page, 1, targetIndex);
  }
}

function playLosingMove(page) {
  const attackerIndex = pickCardIndex(page.game.players[0].cards, (card) => card.attack, false);
  const targetIndex = pickCardIndex(page.game.players[1].cards, (card) => card.hp, true);
  tapCard(page, 0, attackerIndex);
  tapCard(page, 1, targetIndex);
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
  let enemy = page.data.players.find((team) => team.playerIndex === 1);
  assert.equal(enemy.cards[2].skillLabel, '震地 · 可用');
  assert.match(enemy.cards[2].ariaLabel, /技能 震地 可用/);
  page.game.players[1].cards[2].hp = 0;
  page.updateView();
  enemy = page.data.players.find((team) => team.playerIndex === 1);
  assert.equal(enemy.cards[2].skillLabel, '震地 · 不可用');
  page.game.players[1].cards[2].hp = 90;
  page.updateView();
  page.game.currentPlayerIdx = 1;

  page.runAiTurn();

  const skillLogs = page.data.logs.filter((entry) => entry.message.includes('震地'));
  assert.equal(skillLogs.length, 3);
  assert.ok(skillLogs.every((entry) => entry.message.includes('玩家B 的 巨魔')));
  assert.deepEqual(page.game.players[0].cards.map((card) => card.hp), [82, 22, 62]);
  assert.equal(page.game.players[1].cards[2].skill.used, true);
  assert.equal(page.data.statusTone, 'ready');
  enemy = page.data.players.find((team) => team.playerIndex === 1);
  assert.equal(enemy.cards[2].skillLabel, '震地 · 已用');
  assert.match(enemy.cards[2].ariaLabel, /技能 震地 已用/);

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

test('a full match can end in player victory after both sides use their skills, then restart cleanly', () => {
  const page = createPageHarness();

  const turns = playDeterministicMatch(page, playWinningMove);

  assert.ok(turns <= 20);
  assert.equal(page.game.winnerIdx, 0);
  assert.equal(page.data.statusTone, 'victory');
  assert.equal(page.game.players[0].cards[0].skill.used, true);
  assert.equal(page.game.players[0].cards[1].skill.used, true);
  assert.equal(page.game.players[1].cards[2].skill.used, true);
  assert.ok(page.data.logs.some((entry) => entry.message.includes('龙焰')));
  assert.ok(page.data.logs.some((entry) => entry.message.includes('精准射击')));
  assert.ok(page.data.logs.some((entry) => entry.message.includes('震地')));
  assert.ok(page.data.logs.some((entry) => entry.message.includes('玩家A 获胜')));

  page.onReset();
  assert.equal(page.game.gameOver, false);
  assert.equal(page.game.currentPlayerIdx, 0);
  assert.deepEqual(page.game.players.map((team) => team.cards.map((card) => card.hp)), [[100, 40, 80], [60, 25, 90]]);
  assert.equal(page.game.players[0].cards[0].skill.used, false);
  assert.equal(page.game.players[0].cards[1].skill.used, false);
  assert.equal(page.game.players[1].cards[2].skill.used, false);
  assert.equal(page.data.logs.length, 1);
  page.onUnload();
});

test('a full match can end in AI victory and restart with a fresh player turn', () => {
  const page = createPageHarness();

  playDeterministicMatch(page, playLosingMove);

  assert.equal(page.game.winnerIdx, 1);
  assert.equal(page.data.statusTone, 'defeat');
  assert.equal(page.game.players[1].cards[2].skill.used, true);
  assert.ok(page.data.logs.some((entry) => entry.message.includes('震地')));
  assert.ok(page.data.logs.some((entry) => entry.message.includes('玩家B 获胜')));

  page.onReset();
  assert.equal(page.game.gameOver, false);
  assert.equal(page.game.currentPlayerIdx, 0);
  assert.equal(page.game.players[0].cards[1].hp, 40);
  assert.equal(page.game.players[1].cards[2].skill.used, false);
  assert.equal(page.data.logs.length, 1);
  page.onUnload();
});
