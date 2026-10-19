'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const rules = require('../game');
const catalog = require('../data/cards');
const { createController } = require('../minigame/controller');

const BASE_ATTACK = [[15, 30, 10], [25, 40, 12]];
const BASE_HEALTH = [[100, 40, 80], [60, 25, 90]];
const ACTION_LIMITS = { classic: 9, swift: 8, bastion: 12 };

function objectiveDefinitions(mode = 'classic') {
  return [
    { id: 'victory', label: '赢得本场对决' },
    { id: 'swift', label: `${ACTION_LIMITS[mode]}次行动内取胜` },
    { id: 'survivors', label: '取胜时至少一人保有半数生命' },
  ];
}

function createHarness(ruleOverrides = {}) {
  const active = new Map();
  const scheduled = new Map();
  const changes = [];
  let nextId = 0;
  const controller = createController({
    rules: { ...rules, ...ruleOverrides }, catalog,
    schedule(callback, delay) {
      const id = nextId++;
      const task = { callback, delay };
      active.set(id, task);
      scheduled.set(id, task);
      return id;
    },
    cancel(id) { active.delete(id); },
    onChange(view) { changes.push(view); },
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
      assert.equal(active.size, 1, 'exactly one AI action must be scheduled');
      this.fire(active.keys().next().value);
    },
  };
}

function cardNumbers(cards) {
  return cards.map((card) => ({
    attack: card.attack, hp: card.hp, maxHp: card.maxHp, shield: card.shield || 0,
    skillDamage: card.skill ? card.skill.damage : null,
  }));
}

function expectPreview(view, { mode = 'classic', blessing = 'blade' } = {}) {
  const trial = mode !== 'classic';
  const attackBonus = mode === 'swift' ? 6 : 0;
  const healthBonus = trial && blessing === 'vitality' ? 20 : 0;
  const shield = mode === 'bastion' ? 18 : 0;
  const ownAttackBonus = trial && blessing === 'blade' ? 5 : 0;
  const skillBonus = trial && blessing === 'arcane' ? 8 : 0;
  const previews = [view.teamCards, view.enemyCards];
  for (const [playerIndex, cards] of previews.entries()) {
    assert.deepEqual(cards.map((card) => card.attack), BASE_ATTACK[playerIndex].map((value) => value + attackBonus + (playerIndex === 0 ? ownAttackBonus : 0)));
    assert.deepEqual(cards.map((card) => card.hp), BASE_HEALTH[playerIndex].map((value) => value + (playerIndex === 0 ? healthBonus : 0)));
    assert.deepEqual(cards.map((card) => card.maxHp), cards.map((card) => card.hp));
    assert.deepEqual(cards.map((card) => card.shield || 0), [shield, shield, shield]);
  }
  assert.deepEqual(view.teamCards.map((card) => card.skill ? card.skill.damage : null), [12 + skillBonus, 50 + skillBonus, null]);
  assert.deepEqual(view.enemyCards.map((card) => card.skill ? card.skill.damage : null), [null, null, 18]);
}

function expectObjectives(view, achieved) {
  assert.deepEqual(view.objectives.map(({ id, label }) => ({ id, label })), objectiveDefinitions(view.selectedModeId));
  assert.deepEqual(view.objectives.map((objective) => objective.achieved), achieved);
  if (view.result) {
    assert.deepEqual(view.result.objectives, view.objectives);
    assert.equal(view.result.stars, achieved.filter(Boolean).length);
  }
}

test('all three mode choices show their actual opening stats and start the matching battle', () => {
  const harness = createHarness();
  const modes = rules.getBattleModes();
  let view = harness.controller.getView();
  assert.deepEqual(view.modes.map(({ id, name, description }) => ({ id, name, description })), modes.map(({ id, name, description }) => ({ id, name, description })));
  assert.deepEqual(view.blessings.map((blessing) => blessing.id), ['blade', 'vitality', 'arcane']);
  assert.equal(view.selectedModeId, 'classic');
  assert.equal(view.selectedBlessingId, 'blade');

  for (const mode of modes) {
    harness.dispatch('home');
    view = harness.dispatch('mode', { modeId: mode.id });
    assert.equal(view.selectedModeId, mode.id);
    assert.equal(view.modeName, mode.name);
    assert.equal(view.modeDescription, mode.description);
    assert.equal(view.isTrial, mode.id !== 'classic');
    assert.deepEqual(view.modes.filter((entry) => entry.selected).map((entry) => entry.id), [mode.id]);
    assert.deepEqual(view.blessings.filter((entry) => entry.selected).map((entry) => entry.id), mode.id === 'classic' ? [] : ['blade']);
    assert.equal(view.blessingName, mode.id === 'classic' ? '无祝福' : rules.getBlessings()[0].name);
    expectPreview(view, { mode: mode.id });

    const preview = [cardNumbers(view.teamCards), cardNumbers(view.enemyCards)];
    view = harness.dispatch('start');
    const game = harness.controller.getGame();
    assert.equal(game.modeId, mode.id);
    assert.equal(game.blessingId, mode.id === 'classic' ? null : 'blade');
    assert.deepEqual(game.players.map((player) => cardNumbers(player.cards)), preview);
    assert.equal(view.playerActions, 0);
    assert.equal(harness.active.size, 0);
    for (const player of view.players) {
      for (const card of player.cards) {
        assert.equal(card.shieldLabel, mode.id === 'bastion' ? '护盾18' : '');
        if (mode.id === 'bastion') assert.match(card.aria, /护盾\s*18/);
      }
    }
  }
});

test('each blessing updates all relevant preview stats without affecting the enemy', () => {
  const harness = createHarness();
  harness.dispatch('mode', { modeId: 'bastion' });
  for (const blessing of rules.getBlessings()) {
    const view = harness.dispatch('blessing', { blessingId: blessing.id });
    assert.equal(view.selectedBlessingId, blessing.id);
    assert.equal(view.blessingName, blessing.name);
    assert.deepEqual(view.blessings.filter((entry) => entry.selected).map((entry) => entry.id), [blessing.id]);
    expectPreview(view, { mode: 'bastion', blessing: blessing.id });
    const preview = [cardNumbers(view.teamCards), cardNumbers(view.enemyCards)];
    harness.dispatch('start');
    assert.deepEqual(harness.controller.getGame().players.map((player) => cardNumbers(player.cards)), preview);
    harness.dispatch('home');
  }
});

test('classic preserves the chosen trial blessing while applying only classic stats', () => {
  const harness = createHarness();
  let view = harness.dispatch('blessing', { blessingId: 'arcane' });
  assert.equal(view.selectedBlessingId, 'arcane');
  assert.equal(view.blessingName, '无祝福');
  assert.equal(view.blessings.some((blessing) => blessing.selected), false);
  expectPreview(view);
  harness.dispatch('start');
  assert.equal(harness.controller.getGame().blessingId, null);

  harness.dispatch('home');
  view = harness.dispatch('mode', { modeId: 'swift' });
  expectPreview(view, { mode: 'swift', blessing: 'arcane' });
  assert.equal(view.selectedBlessingId, 'arcane');
  view = harness.dispatch('mode', { modeId: 'classic' });
  assert.equal(view.selectedBlessingId, 'arcane');
  assert.equal(view.blessingName, '无祝福');
  expectPreview(view);
  view = harness.dispatch('mode', { modeId: 'bastion' });
  assert.equal(view.selectedBlessingId, 'arcane');
  expectPreview(view, { mode: 'bastion', blessing: 'arcane' });
});

test('only valid home actions may change mode or blessing settings', () => {
  const harness = createHarness();
  const invalidIds = [null, undefined, '', 'missing', 'constructor', {}, [], 0, true];
  const home = harness.controller.getView();
  for (const id of invalidIds) {
    harness.dispatch('mode', { modeId: id });
    harness.dispatch('blessing', { blessingId: id });
    assert.deepEqual(harness.controller.getView(), home);
  }
  harness.dispatch('mode', { modeId: 'swift' });
  harness.dispatch('blessing', { blessingId: 'vitality' });
  for (const screen of ['rules', 'about', 'battle', 'logs']) {
    if (screen === 'battle') harness.dispatch('start');
    else harness.dispatch(screen);
    const before = harness.controller.getView();
    const game = harness.controller.getGame();
    harness.dispatch('mode', { modeId: 'bastion' });
    harness.dispatch('blessing', { blessingId: 'arcane' });
    assert.deepEqual(harness.controller.getView(), before, `settings must be immutable on ${screen}`);
    assert.equal(harness.controller.getGame(), game);
    if (screen !== 'battle') harness.dispatch('back');
  }
  assert.equal(harness.controller.getView().selectedModeId, 'swift');
  assert.equal(harness.controller.getView().selectedBlessingId, 'vitality');
});

test('view metadata, previews, and objectives cannot mutate controller choices or rules', () => {
  const harness = createHarness();
  harness.dispatch('mode', { modeId: 'bastion' });
  harness.dispatch('blessing', { blessingId: 'arcane' });
  const before = harness.controller.getView();
  const view = harness.controller.getView();
  view.modes[2].id = 'changed';
  view.modes[2].description = 'changed';
  view.blessings[2].name = 'changed';
  view.blessings[2].selected = false;
  view.teamCards[0].skill.damage = 999;
  view.teamCards[0].hp = 0;
  view.enemyCards[2].skill.used = true;
  view.players[1].cards[0].shield = 999;
  view.objectives[0].label = 'changed';
  view.objectives[0].achieved = true;
  assert.deepEqual(harness.controller.getView(), before);
  assert.equal(rules.getBattleModes()[2].id, 'bastion');
  assert.notEqual(rules.getBlessings()[2].name, 'changed');
  harness.dispatch('start');
  assert.equal(harness.controller.getGame().modeId, 'bastion');
  assert.equal(harness.controller.getGame().blessingId, 'arcane');
  assert.equal(harness.controller.getGame().players[0].cards[0].skill.damage, 20);
});

test('reset preserves the selected setup and restores shields, skills, and match counters', () => {
  const harness = createHarness();
  harness.dispatch('mode', { modeId: 'bastion' });
  harness.dispatch('blessing', { blessingId: 'arcane' });
  const preview = harness.controller.getView();
  const opening = [cardNumbers(preview.teamCards), cardNumbers(preview.enemyCards)];
  harness.dispatch('start');
  harness.card(0, 0);
  harness.dispatch('skill');
  const oldGame = harness.controller.getGame();
  assert.equal(oldGame.players[0].cards[0].skill.used, true);
  assert.ok(harness.controller.getView().damageDealt > 0);
  const view = harness.dispatch('reset');
  assert.notEqual(harness.controller.getGame(), oldGame);
  assert.equal(view.selectedModeId, 'bastion');
  assert.equal(view.selectedBlessingId, 'arcane');
  assert.equal(view.playerActions, 0);
  assert.equal(view.damageDealt, 0);
  assert.equal(view.damageTaken, 0);
  assert.equal(view.skillsUsed, 0);
  assert.equal(view.result, null);
  assert.equal(view.skillTargeting, false);
  assert.deepEqual(harness.controller.getGame().players.map((player) => cardNumbers(player.cards)), opening);
  assert.equal(harness.controller.getGame().players[0].cards[0].skill.used, false);
  assert.equal(harness.active.size, 0);
  expectObjectives(view, [false, false, false]);
});

test('shield logs distinguish absorbed damage and health loss, including AI skills and overkill', () => {
  const harness = createHarness();
  harness.dispatch('mode', { modeId: 'bastion' });
  harness.dispatch('blessing', { blessingId: 'vitality' });
  harness.dispatch('start');
  harness.card(0, 1);
  harness.card(1, 0);
  let view = harness.controller.getView();
  assert.equal(view.damageDealt, 12);
  assert.equal(harness.controller.getGame().players[1].cards[0].hp, 48);
  assert.equal(view.players[0].cards[0].shieldLabel, '');
  assert.ok(view.logs.some(({ message }) => /护盾.*18/.test(message) && /生命.*12|12.*生命/.test(message)));

  harness.runAi();
  view = harness.controller.getView();
  assert.equal(view.damageTaken, 0, 'AI area damage absorbed by shields must not count as health damage');
  assert.deepEqual(harness.controller.getGame().players[0].cards.map((card) => card.hp), [120, 60, 100]);
  assert.deepEqual(harness.controller.getGame().players[0].cards.map((card) => card.shield), [0, 0, 0]);
  assert.equal(harness.controller.getGame().players[1].cards[2].skill.used, true);
  assert.equal(view.logs.filter(({ message }) => /震地/.test(message) && /护盾.*18/.test(message) && /生命.*0|0.*生命/.test(message)).length, 3);
  assert.equal(view.players[1].cards.every((card) => card.shieldLabel === ''), true);

  harness.card(0, 1);
  harness.dispatch('skill');
  harness.card(1, 0);
  view = harness.controller.getView();
  assert.equal(view.damageDealt, 60, '50 skill damage against 48 health counts the remaining 48 health');
  assert.equal(view.skillsUsed, 1);
  assert.equal(view.playerActions, 2);
  harness.runAi();
  assert.equal(harness.controller.getView().damageTaken, 40);
  assert.equal(harness.controller.getGame().players[0].cards[1].hp, 20);
});

function harmlessAiTurn(game) {
  if (game.gameOver || game.currentPlayerIdx !== 1) return [];
  game.currentPlayerIdx = 0;
  return [{
    type: 'attack', attackerPlayerIdx: 1, attackerCardIdx: 0,
    targetPlayerIdx: 0, targetCardIdx: 1, damage: 0, killedCardName: null,
  }];
}

function winInActions(actionCount, { mode = 'classic', blessing = 'blade', ownHealth } = {}) {
  const harness = createHarness({ playAiTurn: harmlessAiTurn });
  harness.dispatch('mode', { modeId: mode });
  harness.dispatch('blessing', { blessingId: blessing });
  expectObjectives(harness.controller.getView(), [false, false, false]);
  harness.dispatch('start');
  expectObjectives(harness.controller.getView(), [false, false, false]);
  const game = harness.controller.getGame();
  // Only fixture health changes: every counted action uses real attacks and the mode's shields.
  const attack = game.players[0].cards[1].attack;
  game.players[1].cards.forEach((card, index) => {
    const requiredHits = index === 0 ? actionCount - 2 : 1;
    card.hp = attack * requiredHits - card.shield;
    card.maxHp = card.hp;
  });
  if (ownHealth) game.players[0].cards.forEach((card, index) => { card.hp = ownHealth[index]; });
  for (let index = 0; index < actionCount; index += 1) {
    harness.card(0, 1);
    harness.card(1, game.players[1].cards.findIndex((card) => card.hp > 0));
    assert.equal(harness.controller.getView().playerActions, index + 1);
    if (index < actionCount - 1) {
      assert.equal(game.gameOver, false);
      assert.equal(harness.controller.getView().result, null);
      expectObjectives(harness.controller.getView(), [false, false, false]);
      harness.runAi();
    }
  }
  assert.equal(game.gameOver, true);
  assert.equal(game.winnerIdx, 0);
  return harness;
}

test('each mode uses its inclusive action limit and rejects one extra action', () => {
  for (const [mode, limit] of Object.entries(ACTION_LIMITS)) {
    for (const actions of [limit, limit + 1]) {
      const harness = winInActions(actions, { mode });
      const view = harness.controller.getView();
      expectObjectives(view, [true, actions <= limit, true]);
      assert.equal(view.result.rounds, actions);
      assert.equal(view.result.survivors, 3);
      assert.equal(harness.active.size, 0);
    }
  }
});

test('the health objective includes exactly half health and uses the vitality maximum', () => {
  for (const { mode, blessing, ownHealth, achieved } of [
    { mode: 'classic', ownHealth: [50, 19, 39], achieved: true },
    { mode: 'classic', ownHealth: [49, 19, 39], achieved: false },
    { mode: 'swift', blessing: 'vitality', ownHealth: [60, 29, 49], achieved: true },
    { mode: 'swift', blessing: 'vitality', ownHealth: [59, 29, 49], achieved: false },
    { mode: 'bastion', blessing: 'vitality', ownHealth: [60, 29, 49], achieved: true },
    { mode: 'bastion', blessing: 'vitality', ownHealth: [59, 29, 49], achieved: false },
  ]) {
    const harness = winInActions(ACTION_LIMITS[mode], { mode, blessing, ownHealth });
    const view = harness.controller.getView();
    expectObjectives(view, [true, true, achieved]);
    assert.equal(view.result.survivors, 3, 'remaining card count alone cannot satisfy the health objective');
    if (blessing === 'vitality') assert.equal(harness.controller.getGame().players[0].cards[0].maxHp, 120);
  }
});

function attacks(attacker, target, count) {
  return Array.from({ length: count }, () => ['attack', attacker, target]);
}

const THREE_STAR_ROUTES = [
  {
    mode: 'classic', blessing: null, expectedActions: 9,
    moves: [['attack', 1, 1], ['skill', 1, 0], ['skill', 0], ...attacks(0, 2, 6)],
  },
  {
    mode: 'swift', blessing: 'blade', expectedActions: 6,
    moves: [['attack', 0, 1], ['skill', 1, 0], ['skill', 0], ...attacks(0, 2, 3)],
  },
  {
    mode: 'swift', blessing: 'vitality', expectedActions: 7,
    moves: [['attack', 1, 1], ['skill', 1, 0], ['skill', 0], ...attacks(0, 2, 4)],
  },
  {
    mode: 'swift', blessing: 'arcane', expectedActions: 7,
    moves: [['attack', 1, 1], ['skill', 1, 0], ['skill', 0], ...attacks(0, 2, 4)],
  },
  {
    mode: 'bastion', blessing: 'blade', expectedActions: 9,
    moves: [['skill', 1, 1], ...attacks(1, 0, 2), ['skill', 0], ...attacks(0, 2, 5)],
  },
  {
    mode: 'bastion', blessing: 'vitality', expectedActions: 12,
    moves: [['skill', 1, 1], ...attacks(1, 0, 3), ...attacks(0, 2, 8)],
  },
  {
    mode: 'bastion', blessing: 'arcane', expectedActions: 10,
    moves: [['skill', 1, 1], ...attacks(1, 0, 2), ['skill', 0], ...attacks(0, 2, 6)],
  },
];

for (const { mode, blessing, expectedActions, moves } of THREE_STAR_ROUTES) {
  test(`${mode}/${blessing || 'none'} has a legal three-star route against the real AI`, () => {
    const harness = createHarness();
    harness.dispatch('mode', { modeId: mode });
    if (blessing) harness.dispatch('blessing', { blessingId: blessing });
    harness.dispatch('start');
    const game = harness.controller.getGame();
    assert.equal(game.modeId, mode);
    assert.equal(game.blessingId, blessing);
    assert.equal(moves.length, expectedActions);

    // These routes run untouched opening cards, actual skills, shields, and the real AI.
    for (const [index, [type, attacker, target]] of moves.entries()) {
      assert.equal(game.gameOver, false, `battle must still be active before action ${index + 1}`);
      assert.equal(game.currentPlayerIdx, 0);
      expectObjectives(harness.controller.getView(), [false, false, false]);
      harness.card(0, attacker);
      if (type === 'skill') harness.dispatch('skill');
      if (target !== undefined) harness.card(1, target);
      assert.equal(harness.controller.getView().playerActions, index + 1, `action ${index + 1} must be accepted`);
      if (index < moves.length - 1) {
        assert.equal(game.gameOver, false);
        expectObjectives(harness.controller.getView(), [false, false, false]);
        harness.runAi();
        assert.equal(game.gameOver, false, 'the real AI must not defeat this route');
        expectObjectives(harness.controller.getView(), [false, false, false]);
      }
    }

    const view = harness.controller.getView();
    assert.equal(game.gameOver, true);
    assert.equal(game.winnerIdx, 0);
    assert.equal(view.result.won, true);
    assert.equal(view.result.stars, 3);
    assert.equal(view.playerActions, expectedActions);
    assert.equal(view.result.rounds, expectedActions);
    assert.ok(expectedActions <= ACTION_LIMITS[mode]);
    const bestRemainingHealthRatio = Math.max(...game.players[0].cards.map((card) => card.hp / card.maxHp));
    assert.ok(bestRemainingHealthRatio >= 0.5, 'at least one unmodified card must retain half its real maximum health');
    expectObjectives(view, [true, true, true]);
    assert.equal(harness.active.size, 0);
  });
}

test('a quick real defeat awards no objectives or stars', () => {
  const harness = createHarness();
  harness.dispatch('start');
  let turns = 0;
  while (!harness.controller.getGame().gameOver && turns < 20) {
    const game = harness.controller.getGame();
    const own = game.players[0].cards;
    const enemy = game.players[1].cards;
    const weakest = own.reduce((best, card, index) => card.hp > 0 && (best < 0 || card.attack < own[best].attack) ? index : best, -1);
    const healthiest = enemy.reduce((best, card, index) => card.hp > 0 && (best < 0 || card.hp > enemy[best].hp) ? index : best, -1);
    harness.card(0, weakest);
    harness.card(1, healthiest);
    turns += 1;
    if (!game.gameOver) harness.runAi();
  }
  const view = harness.controller.getView();
  assert.equal(view.gameOver, true);
  assert.equal(view.result.won, false);
  assert.ok(view.playerActions <= ACTION_LIMITS.classic, 'a fast defeat still must not satisfy the speed objective');
  expectObjectives(view, [false, false, false]);
});

test('result objectives are independent snapshots of the public objectives and future views', () => {
  const harness = winInActions(8);
  const view = harness.controller.getView();
  assert.notEqual(view.result.objectives, view.objectives);
  assert.notEqual(view.result.objectives[0], view.objectives[0]);
  view.objectives[0].achieved = false;
  view.objectives[0].label = 'changed';
  assert.equal(view.result.objectives[0].achieved, true);
  assert.equal(view.result.objectives[0].label, objectiveDefinitions()[0].label);
  view.result.objectives[1].achieved = false;
  view.result.objectives[1].label = 'changed';
  assert.equal(view.objectives[1].achieved, true);
  view.result.stars = 0;
  expectObjectives(harness.controller.getView(), [true, true, true]);
});

test('hidden, superseded, and reset trial callbacks cannot alter a new mode or cancel its AI', () => {
  const harness = createHarness();
  harness.dispatch('mode', { modeId: 'bastion' });
  harness.dispatch('blessing', { blessingId: 'arcane' });
  harness.dispatch('start');
  harness.card(0, 1);
  harness.card(1, 0);
  harness.controller.onHide();
  const hidden = harness.controller.getView();
  harness.fire(0);
  assert.deepEqual(harness.controller.getView(), hidden);
  harness.controller.onShow();
  assert.ok(harness.active.has(1));
  harness.fire(0);
  assert.ok(harness.active.has(1));

  harness.dispatch('home');
  harness.dispatch('mode', { modeId: 'swift' });
  harness.dispatch('blessing', { blessingId: 'vitality' });
  const preview = harness.controller.getView();
  expectPreview(preview, { mode: 'swift', blessing: 'vitality' });
  harness.dispatch('start');
  const newGame = harness.controller.getGame();
  const before = harness.controller.getView();
  harness.fire(1);
  assert.deepEqual(harness.controller.getView(), before);
  assert.equal(harness.controller.getGame(), newGame);
  harness.card(0, 1);
  harness.card(1, 0);
  assert.ok(harness.active.has(2));
  harness.dispatch('reset');
  const resetGame = harness.controller.getGame();
  assert.notEqual(resetGame, newGame);
  assert.equal(resetGame.modeId, 'swift');
  assert.equal(resetGame.blessingId, 'vitality');
  harness.card(0, 1);
  harness.card(1, 0);
  const pending = harness.controller.getView();
  for (const id of [0, 1, 2]) {
    harness.fire(id);
    assert.deepEqual(harness.controller.getView(), pending);
    assert.ok(harness.active.has(3), 'an old callback must preserve the current task');
  }
  harness.runAi();
  assert.equal(harness.controller.getView().roundNumber, 2);
  assert.ok(harness.controller.getView().damageTaken > 0);
  assert.equal(harness.active.size, 0);
});
