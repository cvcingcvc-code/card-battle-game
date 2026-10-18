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

function withFakeTimers(run) {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const pending = new Map();
  let sequence = 0;
  global.setTimeout = (callback, delay, ...args) => {
    const timerId = ++sequence;
    pending.set(timerId, { callback: () => callback(...args), delay });
    return timerId;
  };
  global.clearTimeout = (timerId) => pending.delete(timerId);
  try {
    run({
      count: () => pending.size,
      callback: (timerId) => pending.get(timerId).callback,
      runNext() {
        const [timerId, timer] = pending.entries().next().value || [];
        assert.ok(timer, 'expected a pending AI action');
        pending.delete(timerId);
        timer.callback();
      },
    });
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
}

function withWx(mock, run) {
  const previousWx = global.wx;
  if (mock === undefined) delete global.wx;
  else global.wx = mock;
  try {
    run();
  } finally {
    if (previousWx === undefined) delete global.wx;
    else global.wx = previousWx;
  }
}

function assertFreshResult(page) {
  assert.equal(page.data.result, null);
  assert.equal(page.data.roundNumber, 1);
  assert.equal(page.data.playerActions, 0);
  assert.equal(page.data.damageDealt, 0);
  assert.equal(page.data.damageTaken, 0);
  assert.equal(page.data.skillsUsed, 0);
  assert.equal(page.data.selectedCardDetail, null);
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
  const { subtitle, ...result } = page.data.result;
  assert.ok(subtitle);
  assert.deepEqual(result, {
    won: true,
    title: '战斗胜利',
    rounds: turns,
    survivors: 1,
    damageDealt: 175,
    damageTaken: 213,
    skillsUsed: 2,
  });
  assert.equal(page.data.roundNumber, turns);
  assert.equal(page.aiTimer, null, 'the victory must not schedule another AI action');

  page.onReset();
  assertFreshResult(page);
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

  const turns = playDeterministicMatch(page, playLosingMove);

  assert.equal(page.game.winnerIdx, 1);
  assert.equal(page.data.statusTone, 'defeat');
  assert.equal(page.game.players[1].cards[2].skill.used, true);
  assert.ok(page.data.logs.some((entry) => entry.message.includes('震地')));
  assert.ok(page.data.logs.some((entry) => entry.message.includes('玩家B 获胜')));
  assert.equal(page.data.result.won, false);
  assert.equal(page.data.result.title, '战斗失利');
  assert.ok(page.data.result.subtitle);
  assert.equal(page.data.result.rounds, turns);
  assert.equal(page.data.roundNumber, turns);
  assert.equal(page.data.result.survivors, 0);
  assert.equal(page.data.result.damageTaken, 220, 'damage totals must exclude overkill');
  assert.equal(page.data.result.damageDealt,
    175 - page.game.players[1].cards.reduce((sum, card) => sum + card.hp, 0));
  assert.equal(page.data.result.skillsUsed, 0);
  assert.equal(page.aiTimer, null);

  page.onReset();
  assertFreshResult(page);
  assert.equal(page.game.gameOver, false);
  assert.equal(page.game.currentPlayerIdx, 0);
  assert.equal(page.game.players[0].cards[1].hp, 40);
  assert.equal(page.game.players[1].cards[2].skill.used, false);
  assert.equal(page.data.logs.length, 1);
  page.onUnload();
});

test('tapping a dead card preserves the attacker, target mode and visible selection', () => {
  withFakeTimers((timers) => {
    const page = createPageHarness();
    page.game.players[0].cards[2].hp = 0;
    page.game.players[1].cards[0].hp = 0;
    page.updateView();
    tapCard(page, 0, 1);

    for (const useSkill of [false, true]) {
      if (useSkill) page.onUseSkill();
      const previousView = JSON.parse(JSON.stringify(page.data));
      const previousGame = JSON.parse(JSON.stringify(page.game));
      tapCard(page, 0, 2);
      tapCard(page, 1, 0);
      assert.deepEqual(page.game, previousGame);
      assert.deepEqual(page.data, previousView);
      assert.equal(page.skillTargeting, useSkill);
      assert.equal(page.game.selectedCardIdx, 1);
      assert.equal(page.data.players.find((team) => team.playerIndex === 0).cards[1].isSelected, true);
      assert.equal(page.data.selectedCardDetail.name, '精灵射手');
      assert.equal(timers.count(), 0);
    }
    page.onUnload();
  });
});

test('backgrounding pauses the AI and returning resumes exactly one action', () => {
  withFakeTimers((timers) => {
    const page = createPageHarness();
    tapCard(page, 0, 1);
    tapCard(page, 1, 0);
    const staleAction = timers.callback(page.aiTimer);
    const initialTimer = page.aiTimer;
    page.scheduleAiTurn();
    assert.equal(page.aiTimer, initialTimer);
    assert.equal(timers.count(), 1);

    page.onHide();
    assert.equal(page.aiTimer, null);
    assert.equal(timers.count(), 0);
    const pausedState = JSON.stringify(page.game);
    staleAction();
    page.scheduleAiTurn();
    assert.equal(JSON.stringify(page.game), pausedState);
    assert.equal(timers.count(), 0);

    page.onShow();
    page.onShow();
    assert.equal(timers.count(), 1);
    const resumedTimer = page.aiTimer;
    staleAction();
    assert.equal(JSON.stringify(page.game), pausedState);
    assert.equal(page.aiTimer, resumedTimer);
    assert.equal(timers.count(), 1);
    timers.runNext();
    assert.deepEqual(page.game.players[0].cards.map((card) => card.hp), [82, 22, 62]);
    assert.equal(page.game.currentPlayerIdx, 0);
    assert.equal(page.data.roundNumber, 2);
    assert.equal(page.data.logs.filter((entry) => entry.message.includes('震地')).length, 3);
    assert.equal(timers.count(), 0);
    page.onShow();
    assert.equal(timers.count(), 0);
    page.onUnload();
  });
});

test('reset and unload make an old AI callback unable to act on a new or disposed battle', () => {
  withFakeTimers((timers) => {
    const page = createPageHarness();
    tapCard(page, 0, 1);
    tapCard(page, 1, 0);
    const oldBattleAction = timers.callback(page.aiTimer);
    page.onReset();
    assertFreshResult(page);
    tapCard(page, 0, 1);
    tapCard(page, 1, 0);
    const activeTimer = page.aiTimer;
    const disposedAction = timers.callback(activeTimer);
    const waitingState = JSON.stringify(page.game);
    oldBattleAction();
    assert.equal(JSON.stringify(page.game), waitingState);
    assert.equal(page.aiTimer, activeTimer);
    assert.equal(timers.count(), 1);

    page.onUnload();
    disposedAction();
    page.runAiTurn();
    page.scheduleAiTurn();
    page.onShow();
    assert.equal(JSON.stringify(page.game), waitingState);
    assert.equal(page.aiTimer, null);
    assert.equal(timers.count(), 0);
  });
});

test('returning to the start screen clears the pending battle task before navigation', () => {
  withFakeTimers((timers) => {
    const navigation = [];
    const page = createPageHarness();
    withWx({
      reLaunch(options) {
        assert.equal(timers.count(), 0);
        navigation.push(options.url);
        options.success();
      },
    }, () => {
      tapCard(page, 0, 0);
      tapCard(page, 1, 0);
      const staleAction = timers.callback(page.aiTimer);
      const waitingState = JSON.stringify(page.game);
      page.onLeave();
      assert.deepEqual(navigation, ['/pages/home/home']);
      staleAction();
      page.onShow();
      assert.equal(JSON.stringify(page.game), waitingState);
      assert.equal(page.aiTimer, null);
      assert.equal(timers.count(), 0);
      page.onUnload();
    });
  });
});

test('a pending return ignores repeat taps and a navigation failure resumes one AI action', () => {
  withFakeTimers((timers) => {
    const requests = [];
    const toasts = [];
    withWx({
      reLaunch: (options) => requests.push(options),
      showToast: (options) => toasts.push(options),
    }, () => {
      const page = createPageHarness();
      tapCard(page, 0, 0);
      tapCard(page, 1, 0);
      const staleAction = timers.callback(page.aiTimer);
      const waitingGame = page.game;
      const waitingState = JSON.stringify(page.game);

      page.onLeave();
      page.onLeave();
      page.onShow();
      page.onReset();
      page.runAiTurn();
      staleAction();
      assert.equal(requests.length, 1);
      assert.equal(page.data.isLeaving, true, 'the view must disable repeated navigation while waiting');
      assert.equal(timers.count(), 0);
      assert.equal(page.game, waitingGame, 'a pending return must not restart the battle');
      assert.equal(JSON.stringify(page.game), waitingState);

      requests[0].fail({ errMsg: 'reLaunch:fail' });
      requests[0].fail({ errMsg: 'reLaunch:fail' });
      assert.equal(page.data.isLeaving, false, 'the view must become interactive after navigation failure');
      assert.equal(timers.count(), 1);
      assert.equal(toasts.length, 1);
      assert.equal(toasts[0].icon, 'none');
      assert.match(toasts[0].title, /重试/);
      timers.runNext();
      assert.equal(page.game.currentPlayerIdx, 0);
      assert.equal(page.data.roundNumber, 2);
      assert.equal(timers.count(), 0);
      assert.equal(page.data.logs.filter((entry) => entry.message.includes('震地')).length, 3);
      page.onUnload();
    });
  });
});

test('a failed return preserves the selected skill and lets the player continue the same battle', () => {
  withFakeTimers((timers) => {
    const requests = [];
    withWx({ reLaunch: (options) => requests.push(options) }, () => {
      const page = createPageHarness();
      tapCard(page, 0, 1);
      page.onUseSkill();
      const targetingState = JSON.stringify(page.game);
      page.onLeave();
      tapCard(page, 0, 0);
      page.onUseSkill();
      tapCard(page, 1, 0);
      assert.equal(JSON.stringify(page.game), targetingState);
      assert.equal(page.data.skillTargeting, true);
      assert.equal(timers.count(), 0);

      requests[0].fail({ errMsg: 'reLaunch:fail' });
      assert.equal(timers.count(), 0);
      tapCard(page, 1, 0);
      assert.equal(page.game.players[1].cards[0].hp, 10);
      assert.equal(page.game.players[0].cards[1].skill.used, true);
      assert.equal(page.data.playerActions, 1);
      assert.equal(page.data.damageDealt, 50);
      assert.equal(timers.count(), 1);
      page.onUnload();
    });
  });
});

test('a return failure while hidden waits until the battle is shown to resume the AI', () => {
  withFakeTimers((timers) => {
    const requests = [];
    withWx({ reLaunch: (options) => requests.push(options) }, () => {
      const page = createPageHarness();
      tapCard(page, 0, 0);
      tapCard(page, 1, 0);
      page.onLeave();
      page.onHide();
      requests[0].fail({ errMsg: 'reLaunch:fail' });
      assert.equal(timers.count(), 0);
      assert.equal(page.game.currentPlayerIdx, 1);
      page.onShow();
      page.onShow();
      assert.equal(timers.count(), 1);
      timers.runNext();
      assert.equal(page.game.currentPlayerIdx, 0);
      assert.equal(page.data.roundNumber, 2);
      page.onUnload();
    });
  });
});

test('a successful return cannot be revived by late navigation or AI callbacks', () => {
  withFakeTimers((timers) => {
    const requests = [];
    const toasts = [];
    withWx({
      reLaunch: (options) => requests.push(options),
      showToast: (options) => toasts.push(options),
    }, () => {
      const page = createPageHarness();
      tapCard(page, 0, 0);
      tapCard(page, 1, 0);
      const staleAction = timers.callback(page.aiTimer);
      const waitingState = JSON.stringify(page.game);
      page.onLeave();
      requests[0].success();
      requests[0].fail({ errMsg: 'reLaunch:fail' });
      requests[0].success();
      staleAction();
      page.onShow();
      page.runAiTurn();
      page.onLeave();
      assert.equal(requests.length, 1);
      assert.equal(toasts.length, 0);
      assert.equal(timers.count(), 0);
      assert.equal(JSON.stringify(page.game), waitingState);
      page.onUnload();
    });
  });
});

test('an unavailable or throwing navigation API leaves the battle playable', () => {
  for (const navigation of [undefined, {}, { reLaunch() { throw new Error('navigation unavailable'); } }]) {
    withFakeTimers((timers) => {
      withWx(navigation, () => {
        const page = createPageHarness();
        tapCard(page, 0, 0);
        tapCard(page, 1, 0);
        const waitingState = JSON.stringify(page.game);
        assert.doesNotThrow(() => page.onLeave());
        assert.equal(JSON.stringify(page.game), waitingState);
        assert.equal(timers.count(), 1);
        timers.runNext();
        assert.equal(page.game.currentPlayerIdx, 0);
        tapCard(page, 0, 0);
        tapCard(page, 1, 0);
        assert.equal(page.game.players[1].cards[0].hp, 30);
        assert.equal(page.data.playerActions, 2);
        assert.equal(timers.count(), 1);
        page.onUnload();
      });
    });
  }
});
