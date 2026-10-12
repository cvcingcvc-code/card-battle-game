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

  assert.equal(page.game.players[0].cards[1].hp, 0);
  assert.equal(page.game.currentPlayerIdx, 0);
  assert.equal(page.data.statusTone, 'ready');
  assert.ok(page.data.logs.some((entry) => entry.message.includes('被击倒')));
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
  assert.equal(page.game.currentPlayerIdx, 0);
  assert.equal(page.data.logs.length, 1);
  page.onUnload();
});
