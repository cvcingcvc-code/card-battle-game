'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');

function createElement() {
  let markup = '';
  const element = {
    className: '',
    children: [],
    style: {},
    textContent: '',
    get innerHTML() { return markup; },
    set innerHTML(value) {
      markup = value;
      this.children.length = 0;
    },
    appendChild(child) { this.children.push(child); },
    get scrollHeight() { return this.children.length; },
  };
  element.classList = {
    add(name) { element.className += ` ${name}`; },
  };
  return element;
}

function createBrowserHarness() {
  const elements = new Map(Array.from(html.matchAll(/\bid="([^"]+)"/g), ([, id]) => [id, createElement()]));
  const timers = new Map();
  let nextTimerId = 0;
  const context = vm.createContext({
    document: {
      getElementById(id) {
        assert.ok(elements.has(id), `page element #${id} must exist`);
        return elements.get(id);
      },
      createElement,
    },
    setTimeout(callback, delay) {
      const timerId = ++nextTimerId;
      timers.set(timerId, { callback, delay });
      return timerId;
    },
    clearTimeout(timerId) { timers.delete(timerId); },
  });
  context.window = context;

  // Classic scripts share a global scope, as they do when the actual page loads.
  for (const [, attributes, inline] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const source = attributes.match(/\bsrc="([^"]+)"/);
    const filename = source ? source[1] : 'index.html:inline';
    vm.runInContext(source ? readFileSync(path.join(root, filename), 'utf8') : inline, context, { filename });
  }

  return {
    context,
    timers,
    element(id) { return elements.get(id); },
    cards(playerIndex) { return elements.get(`cards${playerIndex + 1}`).children; },
    clickCard(playerIndex, cardIndex) {
      const card = this.cards(playerIndex)[cardIndex];
      assert.equal(typeof card.onclick, 'function', 'card should be clickable');
      card.onclick();
    },
    runAiTimer() {
      assert.equal(timers.size, 1, 'exactly one AI action should be pending');
      const [timerId, timer] = timers.entries().next().value;
      timers.delete(timerId);
      timer.callback();
    },
    logs() { return elements.get('log').children.map((entry) => entry.textContent); },
  };
}

function renderedHealth(page, playerIndex) {
  return page.cards(playerIndex).map((card) => Number(card.innerHTML.match(/HP:\s*(\d+)\//)[1]));
}

test('browser classic scripts load together and render both starting teams', () => {
  const page = createBrowserHarness();

  assert.equal(typeof page.context.CardBattleGame.createGame, 'function');
  assert.equal(page.cards(0).length + page.cards(1).length, 6);
  assert.deepEqual(renderedHealth(page, 0), [100, 40, 80]);
  assert.deepEqual(renderedHealth(page, 1), [60, 25, 90]);
  assert.match(page.element('hint').textContent, /选择.*卡牌作为攻击者/);
  assert.match(page.element('zone1').className, /\bactive\b/);
  assert.equal(page.timers.size, 0);
});

test('browser card clicks show player damage and all AI area skill hits', () => {
  const page = createBrowserHarness();

  page.clickCard(0, 1);
  assert.match(page.cards(0)[1].className, /\bselected\b/);
  page.clickCard(1, 0);

  assert.deepEqual(renderedHealth(page, 1), [30, 25, 90]);
  assert.match(page.logs().at(-1), /精灵射手.*骑士.*30 点伤害/);
  assert.match(page.element('hint').textContent, /对手正在思考/);
  assert.equal(page.timers.values().next().value.delay, 800);

  page.runAiTimer();

  assert.deepEqual(renderedHealth(page, 0), [82, 22, 62]);
  const skillLogs = page.logs().filter((message) => message.includes('震地'));
  assert.equal(skillLogs.length, 3);
  assert.ok(skillLogs.every((message) => /玩家B 的 巨魔.*18 点伤害/.test(message)));
  for (const target of ['龙', '精灵射手', '石像鬼']) {
    assert.ok(skillLogs.some((message) => message.includes(`玩家A 的 ${target}`)));
  }
  assert.match(page.element('hint').textContent, /选择.*卡牌作为攻击者/);
  assert.equal(page.timers.size, 0);
});

test('restarting the browser battle cancels the old AI action and resets the view', () => {
  const page = createBrowserHarness();
  page.clickCard(0, 0);
  page.clickCard(1, 0);
  assert.equal(page.timers.size, 1);

  page.context.resetGame();

  assert.equal(page.timers.size, 0, 'the previous battle must leave no AI callback pending');
  assert.deepEqual(renderedHealth(page, 0), [100, 40, 80]);
  assert.deepEqual(renderedHealth(page, 1), [60, 25, 90]);
  assert.deepEqual(page.logs(), ['新战斗开始！']);
  assert.match(page.element('hint').textContent, /选择.*卡牌作为攻击者/);

  page.clickCard(0, 1);
  page.clickCard(1, 0);
  page.runAiTimer();

  assert.deepEqual(renderedHealth(page, 0), [82, 22, 62]);
  assert.deepEqual(renderedHealth(page, 1), [30, 25, 90]);
  assert.equal(page.logs().filter((message) => message.includes('震地')).length, 3);
  assert.equal(page.timers.size, 0);
});
