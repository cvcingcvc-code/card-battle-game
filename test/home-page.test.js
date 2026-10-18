'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createGame } = require('../game');

let pageDefinition;
global.Page = (definition) => {
  pageDefinition = definition;
};
require('../pages/home/home');
delete global.Page;

function createPageHarness() {
  const page = {
    ...pageDefinition,
    data: { ...pageDefinition.data },
    setData(updates) {
      Object.assign(this.data, updates);
    },
  };
  page.onShow();
  return page;
}

function withWx(mock, run) {
  const previousWx = global.wx;
  global.wx = mock;
  try {
    run();
  } finally {
    if (previousWx === undefined) delete global.wx;
    else global.wx = previousWx;
  }
}

test('the start screen presents the cards and skill rules from the playable game', () => {
  const page = createPageHarness();
  const game = createGame();
  for (const [index, roster] of [page.data.teamCards, page.data.enemyCards].entries()) {
    assert.deepEqual(roster.map(({ name, attack, maxHp }) => ({ name, attack, maxHp })),
      game.players[index].cards.map(({ name, attack, maxHp }) => ({ name, attack, maxHp })));
    assert.ok(roster.every((card) => card.art.startsWith('/assets/') && card.role));
  }
  assert.deepEqual(page.data.skills,
    game.players.flatMap((player) => player.cards
      .filter((card) => card.skill)
      .map((card) => ({
        cardName: card.name,
        name: card.skill.name,
        description: card.skill.description,
      }))));
});

test('starting a battle prevents duplicate navigation until the start screen is shown again', () => {
  const requests = [];
  withWx({ navigateTo: (options) => requests.push(options) }, () => {
    const page = createPageHarness();
    assert.equal(page.data.isStarting, false);
    page.onStartBattle();
    page.onStartBattle();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/pages/index/index');
    assert.equal(page.data.isStarting, true);

    page.onShow();
    assert.equal(page.data.isStarting, false);
    page.onStartBattle();
    assert.equal(requests.length, 2);
  });
});

test('failed battle navigation explains the failure and restores the start button for retry', () => {
  const requests = [];
  const toasts = [];
  withWx({
    navigateTo: (options) => requests.push(options),
    showToast: (options) => toasts.push(options),
  }, () => {
    const page = createPageHarness();
    page.onStartBattle();
    requests[0].fail({ errMsg: 'navigateTo:fail' });
    assert.equal(page.data.isStarting, false);
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].icon, 'none');
    assert.match(toasts[0].title, /重试/);
    page.onStartBattle();
    assert.equal(requests.length, 2);
    assert.equal(page.data.isStarting, true);
  });
});

test('the rules disclosure opens and closes without starting a battle', () => {
  const page = createPageHarness();
  assert.equal(page.data.rulesExpanded, false);
  page.onToggleRules();
  assert.equal(page.data.rulesExpanded, true);
  assert.equal(page.data.isStarting, false);
  page.onToggleRules();
  assert.equal(page.data.rulesExpanded, false);
  assert.equal(page.data.isStarting, false);
});

test('the about and battle buttons share a navigation lock and recover after failure or return', () => {
  const requests = [];
  const toasts = [];
  withWx({
    navigateTo: (options) => requests.push(options),
    showToast: (options) => toasts.push(options),
  }, () => {
    const page = createPageHarness();
    page.onAbout();
    page.onAbout();
    page.onStartBattle();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/pages/about/about');
    assert.equal(page.data.isOpeningAbout, true);
    assert.equal(page.data.isStarting, false);

    requests[0].fail({ errMsg: 'navigateTo:fail' });
    assert.equal(page.data.isOpeningAbout, false);
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].icon, 'none');
    assert.match(toasts[0].title, /重试/);
    page.onStartBattle();
    page.onAbout();
    assert.equal(requests.length, 2);
    assert.equal(requests[1].url, '/pages/index/index');

    page.onShow();
    assert.equal(page.data.isStarting, false);
    assert.equal(page.data.isOpeningAbout, false);
    page.onAbout();
    assert.equal(requests.length, 3);
    page.onShow();
    assert.equal(page.data.isStarting, false);
    assert.equal(page.data.isOpeningAbout, false);
  });
});
