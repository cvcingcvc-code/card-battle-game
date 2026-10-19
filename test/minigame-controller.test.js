'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const rules = require('../game');
const catalog = require('../data/cards');
const { createController } = require('../minigame/controller');

const STARTING_HEALTH = [[100, 40, 80], [60, 25, 90]];

function createHarness(options = {}) {
  const active = new Map();
  const scheduled = new Map();
  const changes = [];
  let nextId = 0;
  const controller = createController({
    rules, catalog,
    schedule(callback, delay) {
      const id = nextId++;
      const task = { callback, delay };
      active.set(id, task);
      scheduled.set(id, task);
      return id;
    },
    cancel(id) { active.delete(id); },
    onChange(view) { changes.push(view); },
    ...options,
  });
  return {
    controller, active, scheduled, changes,
    dispatch(type, fields) { return controller.dispatch({ type, ...fields }); },
    card(playerIndex, cardIndex) { return this.dispatch('card', { playerIndex, cardIndex }); },
    fire(id) {
      assert.ok(scheduled.has(id), `unknown task ${id}`);
      active.delete(id);
      scheduled.get(id).callback();
    },
    runAi() {
      assert.equal(active.size, 1, 'one AI action must be scheduled');
      this.fire(active.keys().next().value);
    },
  };
}

function health(controller) {
  return controller.getGame().players.map((player) => player.cards.map((card) => card.hp));
}

function pickCard(cards, field, higher) {
  return cards.reduce((best, card, index) => {
    if (card.hp <= 0) return best;
    if (best < 0) return index;
    return (higher ? card[field] > cards[best][field] : card[field] < cards[best][field]) ? index : best;
  }, -1);
}

function winningMove(harness) {
  const [own, enemy] = harness.controller.getGame().players.map((player) => player.cards);
  if (own[1].hp > 0 && !own[1].skill.used) {
    harness.card(0, 1);
    harness.dispatch('skill');
    harness.card(1, pickCard(enemy, 'hp', true));
  } else if (own[0].hp > 0 && !own[0].skill.used && enemy.filter((card) => card.hp > 0).length > 1) {
    harness.card(0, 0);
    harness.dispatch('skill');
  } else {
    harness.card(0, pickCard(own, 'attack', true));
    harness.card(1, pickCard(enemy, 'hp', false));
  }
}

function losingMove(harness) {
  const [own, enemy] = harness.controller.getGame().players.map((player) => player.cards);
  harness.card(0, pickCard(own, 'attack', false));
  harness.card(1, pickCard(enemy, 'hp', true));
}

function playMatch(harness, chooseMove) {
  let playerTurns = 0;
  while (!harness.controller.getGame().gameOver && playerTurns < 30) {
    assert.equal(harness.controller.getGame().currentPlayerIdx, 0);
    chooseMove(harness);
    playerTurns += 1;
    if (!harness.controller.getGame().gameOver) harness.runAi();
    const game = harness.controller.getGame();
    const view = harness.controller.getView();
    assert.equal(view.damageDealt, 175 - game.players[1].cards.reduce((sum, card) => sum + card.hp, 0));
    assert.equal(view.damageTaken, 220 - game.players[0].cards.reduce((sum, card) => sum + card.hp, 0));
  }
  assert.equal(harness.controller.getGame().gameOver, true, 'a full match must terminate');
  return playerTurns;
}

test('controller starts on home with injected card metadata and initial team previews', () => {
  let created = 0;
  const harness = createHarness({
    rules: { ...rules, createGame() { created += 1; return rules.createGame(); } },
    catalog(name) { return { art: `/art/${name}.png`, role: '测试角色', tag: '标签', description: '完整说明' }; },
  });
  const view = harness.controller.getView();

  assert.equal(view.screen, 'home');
  assert.equal(created, 1);
  assert.equal(harness.active.size, 0);
  assert.equal(harness.changes.length, 0);
  assert.equal(view.roundNumber, 1);
  assert.equal(view.result, null);
  assert.equal(view.selectedCardDetail, null);
  assert.deepEqual(view.players.map((player) => player.playerIndex), [1, 0]);
  assert.deepEqual(view.players.map((player) => player.aliveCount), [3, 3]);
  assert.deepEqual(view.teamCards.map((card) => card.name), ['龙', '精灵射手', '石像鬼']);
  assert.deepEqual(view.enemyCards.map((card) => card.name), ['骑士', '暗影刺客', '巨魔']);
  assert.deepEqual(view.skills.map((skill) => skill.name), ['龙焰', '精准射击', '震地']);
  assert.equal(view.teamCards[0].description, '完整说明');
  assert.equal(view.players[1].cards[0].art, '/art/龙.png');
  assert.match(view.players[1].cards[0].aria, /生命 100\/100/);
  assert.equal(view.players[1].cards[0].canSelect, false);

  harness.card(0, 1);
  assert.equal(harness.controller.getGame().selectedCardIdx, null);
  harness.dispatch('start');
  assert.equal(created, 2);
  assert.equal(harness.controller.getView().screen, 'battle');
  assert.equal(harness.controller.getGame().currentPlayerIdx, 0);
  assert.deepEqual(health(harness.controller), STARTING_HEALTH);
  assert.equal(harness.changes.length, 2);
});

test('view snapshots cannot change live card skills, logs, or the shared catalog', () => {
  const harness = createHarness();
  harness.dispatch('start');
  harness.card(0, 0);
  const view = harness.controller.getView();
  view.players[1].cards[0].skill.used = true;
  view.selectedCardDetail.skill.used = true;
  view.selectedSkill.used = true;
  view.teamCards[0].skill.used = true;
  view.logs[0].message = 'changed';
  view.players[1].cards[0].description = 'changed';

  const current = harness.controller.getView();
  assert.equal(harness.controller.getGame().players[0].cards[0].skill.used, false);
  assert.equal(current.selectedSkill.used, false);
  assert.match(current.logs[0].message, /选择你的卡牌/);
  assert.notEqual(catalog.getCardPresentation('龙').description, 'changed');
});

test('a player attack schedules one 600ms AI task even when its ID is zero', () => {
  const harness = createHarness();
  harness.dispatch('start');
  harness.card(0, 1);
  harness.card(1, 0);

  assert.equal(harness.active.size, 1);
  assert.equal(harness.active.get(0).delay, 600);
  assert.equal(harness.controller.getView().statusTone, 'waiting');
  assert.equal(harness.controller.getView().playerActions, 1);
  assert.equal(harness.controller.getView().damageDealt, 30);
  assert.match(harness.controller.getView().logs.at(-1).message, /精灵射手.*骑士.*30 点伤害/);
  harness.controller.onShow();
  harness.controller.onShow();
  harness.controller.dispatch({ type: 'unknown' });
  harness.card(0, 0);
  harness.dispatch('skill');
  assert.equal(harness.scheduled.size, 1);
  assert.equal(harness.active.size, 1);

  const changeCount = harness.changes.length;
  harness.runAi();
  const view = harness.controller.getView();
  assert.equal(harness.changes.length, changeCount + 1);
  assert.deepEqual(health(harness.controller), [[82, 22, 62], [30, 25, 90]]);
  assert.equal(view.roundNumber, 2);
  assert.equal(view.damageTaken, 54);
  assert.equal(view.skillsUsed, 0);
  assert.equal(view.logs.filter((entry) => entry.message.includes('震地')).length, 3);
  assert.equal(view.players[0].cards[2].skillLabel, '震地 · 已用');
  assert.equal(harness.active.size, 0);
  const after = JSON.stringify(view);
  harness.fire(0);
  assert.equal(JSON.stringify(harness.controller.getView()), after);
  assert.equal(harness.changes.length, changeCount + 1);
});

test('single-target skill can be cancelled or switched before spending a turn', () => {
  const harness = createHarness();
  harness.dispatch('start');
  harness.card(0, 1);
  let view = harness.dispatch('skill');
  assert.equal(view.skillTargeting, true);
  assert.equal(view.selectedSkill.canUse, true);
  assert.equal(view.selectedSkill.buttonLabel, '取消选择');
  assert.equal(view.selectedCardDetail.name, '精灵射手');
  assert.equal(view.selectedCardDetail.role, catalog.getCardPresentation('精灵射手').role);
  assert.match(view.statusText, /释放精准射击/);
  assert.match(view.players[0].cards[0].aria, /技能目标/);
  view = harness.dispatch('skill');
  assert.equal(view.skillTargeting, false);
  assert.equal(view.selectedSkill.buttonLabel, '选择目标');
  harness.dispatch('skill');
  harness.card(0, 0);
  assert.equal(harness.controller.getView().skillTargeting, false);
  assert.equal(harness.controller.getView().selectedCardDetail.name, '龙');
  assert.equal(harness.controller.getView().playerActions, 0);
  assert.equal(harness.controller.getView().skillsUsed, 0);
  assert.deepEqual(health(harness.controller), STARTING_HEALTH);
  assert.equal(harness.active.size, 0);
});

test('invalid and dead cards preserve a valid attacker and pending skill selection', () => {
  const harness = createHarness();
  harness.dispatch('start');
  harness.card(0, 1);
  harness.card(1, 1);
  assert.equal(harness.controller.getView().damageDealt, 25, 'overkill only counts remaining health');
  harness.runAi();
  harness.card(0, 1);
  harness.dispatch('skill');
  const before = harness.controller.getView();
  const invalid = [[1, 1], [0, -1], [0, 99], [1, NaN], [2, 0], [1, 0.5], ['1', 0], [0, '1']];
  for (const [playerIndex, cardIndex] of invalid) {
    harness.card(playerIndex, cardIndex);
    assert.deepEqual(harness.controller.getView(), before);
    assert.equal(harness.controller.getGame().selectedCardIdx, 1);
  }
  assert.equal(harness.active.size, 0);
  harness.card(1, 0);
  const after = harness.controller.getView();
  assert.equal(after.damageDealt, 75);
  assert.equal(after.skillsUsed, 1);
  assert.equal(after.playerActions, 2);
  assert.equal(after.skillTargeting, false);
});

test('area skills count one action and one use while dealing damage to every living enemy', () => {
  const harness = createHarness();
  harness.dispatch('start');
  harness.card(0, 0);
  harness.dispatch('skill');
  let view = harness.controller.getView();
  assert.deepEqual(health(harness.controller)[1], [48, 13, 78]);
  assert.equal(view.damageDealt, 36);
  assert.equal(view.skillsUsed, 1);
  assert.equal(view.playerActions, 1);
  assert.equal(view.logs.filter((entry) => entry.message.includes('龙焰')).length, 3);
  harness.runAi();
  harness.card(0, 0);
  view = harness.controller.getView();
  assert.equal(view.selectedSkill.canUse, false);
  assert.equal(view.selectedSkill.buttonLabel, '本局已使用');
  const before = JSON.stringify(view);
  harness.dispatch('skill');
  assert.equal(JSON.stringify(harness.controller.getView()), before);
  assert.equal(harness.active.size, 0);
});

test('a lethal single-target skill counts actual damage and does not hit other enemies', () => {
  const harness = createHarness();
  harness.dispatch('start');
  harness.card(0, 1);
  harness.dispatch('skill');
  harness.card(1, 1);
  const view = harness.controller.getView();
  assert.deepEqual(health(harness.controller)[1], [60, 0, 90]);
  assert.equal(view.damageDealt, 25);
  assert.equal(view.skillsUsed, 1);
  assert.equal(view.players[0].aliveCount, 2);
  assert.match(view.players[0].cards[1].aria, /已倒下/);
});

test('a complete winning match records exact totals and resets all match state', () => {
  const harness = createHarness();
  harness.dispatch('start');
  assert.equal(playMatch(harness, winningMove), 9);
  let view = harness.controller.getView();
  assert.equal(view.roundNumber, 9);
  assert.deepEqual(health(harness.controller), [[7, 0, 0], [0, 0, 0]]);
  assert.deepEqual(view.result, {
    won: true, title: '战斗胜利', subtitle: '你击倒了对手的全部卡牌。',
    rounds: 9, survivors: 1, damageDealt: 175, damageTaken: 213, skillsUsed: 2,
    stars: 2,
    objectives: [
      { id: 'victory', label: '赢得本场对决', achieved: true },
      { id: 'swift', label: '9次行动内取胜', achieved: true },
      { id: 'survivors', label: '取胜时至少一人保有半数生命', achieved: false },
    ],
  });
  assert.equal(harness.active.size, 0);
  assert.ok(view.logs.some((entry) => entry.message.includes('震地')));
  assert.ok(view.logs.some((entry) => entry.message.includes('玩家A 获胜')));
  assert.equal(view.players.flatMap((player) => player.cards).some((card) => card.canSelect || card.canTarget), false);
  const finished = JSON.stringify(view);
  harness.card(0, 0);
  harness.dispatch('skill');
  assert.equal(JSON.stringify(harness.controller.getView()), finished);
  harness.dispatch('reset');
  view = harness.controller.getView();
  assert.equal(view.result, null);
  assert.equal(view.roundNumber, 1);
  assert.equal(view.playerActions, 0);
  assert.equal(view.damageDealt, 0);
  assert.equal(view.damageTaken, 0);
  assert.equal(view.skillsUsed, 0);
  assert.equal(view.logs.length, 1);
  assert.equal(view.selectedCardDetail, null);
  assert.deepEqual(health(harness.controller), STARTING_HEALTH);
  assert.equal(harness.controller.getGame().players[0].cards[0].skill.used, false);
  assert.equal(harness.controller.getGame().players[0].cards[1].skill.used, false);
  assert.equal(harness.controller.getGame().players[1].cards[2].skill.used, false);
  assert.equal(harness.controller.getGame().currentPlayerIdx, 0);
});

test('a complete losing match ends on the actual round with capped damage totals', () => {
  const harness = createHarness();
  harness.dispatch('start');
  assert.equal(playMatch(harness, losingMove), 7);
  const view = harness.controller.getView();
  assert.equal(view.roundNumber, 7, 'a terminal AI action cannot create a new round');
  assert.deepEqual(health(harness.controller), [[0, 0, 0], [35, 25, 30]]);
  assert.deepEqual(view.result, {
    won: false, title: '战斗失利', subtitle: '你的队伍已全部倒下，调整出手顺序，再战一局。',
    rounds: 7, survivors: 0, damageDealt: 85, damageTaken: 220, skillsUsed: 0,
    stars: 0,
    objectives: [
      { id: 'victory', label: '赢得本场对决', achieved: false },
      { id: 'swift', label: '9次行动内取胜', achieved: false },
      { id: 'survivors', label: '取胜时至少一人保有半数生命', achieved: false },
    ],
  });
  assert.equal(harness.active.size, 0);
  assert.ok(view.logs.some((entry) => entry.message.includes('玩家B 获胜')));
});

test('hide pauses AI and show resumes exactly once without reviving stale callbacks', () => {
  const harness = createHarness();
  harness.dispatch('start');
  harness.card(0, 1);
  harness.card(1, 0);
  harness.controller.onHide();
  assert.equal(harness.active.size, 0);
  const hidden = JSON.stringify(harness.controller.getView());
  const hiddenChanges = harness.changes.length;
  harness.fire(0);
  assert.equal(harness.changes.length, hiddenChanges);
  assert.equal(JSON.stringify(harness.controller.getView()), hidden);
  harness.card(0, 0);
  harness.dispatch('skill');
  assert.equal(JSON.stringify(harness.controller.getView()), hidden);
  harness.controller.onShow();
  harness.controller.onShow();
  assert.equal(harness.active.size, 1);
  assert.ok(harness.active.has(1));
  harness.fire(0);
  assert.ok(harness.active.has(1), 'a stale callback cannot cancel the resumed task');
  harness.runAi();
  assert.deepEqual(health(harness.controller)[0], [82, 22, 62]);
  assert.equal(harness.controller.getView().roundNumber, 2);
});

test('logs pause battle and back restores the pending AI only on a visible battle screen', () => {
  const harness = createHarness();
  harness.dispatch('start');
  harness.card(0, 0);
  harness.card(1, 0);
  const before = health(harness.controller);
  harness.dispatch('logs');
  assert.equal(harness.controller.getView().screen, 'logs');
  assert.equal(harness.active.size, 0);
  const changes = harness.changes.length;
  harness.fire(0);
  assert.equal(harness.changes.length, changes);
  assert.deepEqual(health(harness.controller), before);
  harness.card(0, 1);
  harness.dispatch('skill');
  assert.deepEqual(health(harness.controller), before);
  harness.dispatch('back');
  assert.equal(harness.controller.getView().screen, 'battle');
  assert.equal(harness.active.size, 1);
  harness.dispatch('logs');
  harness.controller.onHide();
  harness.dispatch('back');
  assert.equal(harness.active.size, 0);
  harness.controller.onShow();
  assert.equal(harness.active.size, 1);
  harness.runAi();
  assert.equal(harness.controller.getView().roundNumber, 2);
});

test('rules and about return home and cannot advance an interrupted match', () => {
  const harness = createHarness();
  harness.dispatch('start');
  harness.card(0, 0);
  harness.card(1, 0);
  const before = health(harness.controller);
  for (const screen of ['rules', 'about']) {
    harness.dispatch(screen);
    assert.equal(harness.controller.getView().screen, screen);
    assert.equal(harness.active.size, 0);
    harness.controller.onShow();
    harness.card(0, 1);
    harness.dispatch('skill');
    harness.fire(0);
    assert.deepEqual(health(harness.controller), before);
    harness.dispatch('back');
    assert.equal(harness.controller.getView().screen, 'home');
    assert.equal(harness.active.size, 0);
  }
  harness.dispatch('logs');
  assert.equal(harness.controller.getView().screen, 'home');
  harness.dispatch('start');
  assert.deepEqual(health(harness.controller), STARTING_HEALTH);
  assert.equal(harness.controller.getView().damageDealt, 0);
});

test('reset and home invalidate old battle callbacks without cancelling a newer task', () => {
  const harness = createHarness();
  harness.dispatch('start');
  harness.card(0, 0);
  harness.card(1, 0);
  const oldGame = harness.controller.getGame();
  harness.dispatch('reset');
  assert.notEqual(harness.controller.getGame(), oldGame);
  harness.fire(0);
  assert.deepEqual(health(harness.controller), STARTING_HEALTH);
  harness.card(0, 1);
  harness.card(1, 0);
  harness.fire(0);
  assert.ok(harness.active.has(1));
  harness.dispatch('home');
  assert.equal(harness.active.size, 0);
  const state = JSON.stringify(harness.controller.getView());
  harness.fire(1);
  assert.equal(JSON.stringify(harness.controller.getView()), state);
  harness.dispatch('start');
  harness.card(0, 1);
  harness.card(1, 0);
  harness.fire(1);
  assert.ok(harness.active.has(2));
  harness.runAi();
  assert.equal(harness.controller.getView().roundNumber, 2);
});

test('destroy permanently cancels AI and suppresses future state changes and notifications', () => {
  const harness = createHarness();
  harness.dispatch('start');
  harness.card(0, 0);
  harness.card(1, 0);
  harness.controller.destroy();
  const before = JSON.stringify(harness.controller.getView());
  const changes = harness.changes.length;
  assert.equal(harness.active.size, 0);
  harness.fire(0);
  harness.controller.onShow();
  harness.controller.onHide();
  harness.dispatch('start');
  harness.dispatch('reset');
  harness.dispatch('home');
  harness.card(0, 1);
  harness.controller.destroy();
  assert.equal(JSON.stringify(harness.controller.getView()), before);
  assert.equal(harness.changes.length, changes);
  assert.equal(harness.active.size, 0);
});
