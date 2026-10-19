'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createRenderer } = require('../minigame/renderer');
const { createController } = require('../minigame/controller');
const rules = require('../game');
const catalog = require('../data/cards');

// Canvas drawing remains real production code. Only the platform primitives
// and font measurements are recorded; this is not a pixel/font conformance test.
function canvasRecorder({ gradients = true, failImages = false } = {}) {
  const text = [];
  const pictures = [];
  const stack = [];
  let transform = { sx: 1, sy: 1, tx: 0, ty: 0 };
  const context = {
    font: '14px sans-serif', textAlign: 'left',
    save() { stack.push({ transform: { ...transform }, font: this.font, textAlign: this.textAlign }); },
    restore() {
      assert.ok(stack.length > 0, 'unbalanced Canvas restore');
      const state = stack.pop();
      transform = state.transform;
      this.font = state.font;
      this.textAlign = state.textAlign;
    },
    scale(x, y) { transform.sx *= x; transform.sy *= y; },
    translate(x, y) { transform.tx += x * transform.sx; transform.ty += y * transform.sy; },
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, rect() {}, clip() {}, fill() {}, stroke() {}, fillRect() {},
    measureText(value) {
      const size = Number(this.font.match(/([\d.]+)px/)[1]);
      return { width: Array.from(String(value)).reduce((sum, character) =>
        sum + size * (character.codePointAt(0) > 255 ? 1 : 0.55), 0) };
    },
    fillText(value, x, y) {
      const width = this.measureText(value).width;
      const height = Number(this.font.match(/([\d.]+)px/)[1]);
      const left = this.textAlign === 'center' ? x - width / 2 : this.textAlign === 'right' ? x - width : x;
      text.push({ value: String(value), x: left, y, width, height,
        screenX: left * transform.sx + transform.tx, screenY: y * transform.sy + transform.ty,
        screenWidth: width * transform.sx, screenHeight: height * transform.sy });
    },
    drawImage(image, ...coordinates) {
      if (failImages) throw new Error('image still decoding');
      assert.ok(coordinates.every(Number.isFinite));
      pictures.push({ image, coordinates });
    },
  };
  if (gradients) context.createLinearGradient = () => ({ addColorStop() {} });
  return { context, text, pictures, depth: () => stack.length,
    reset() { text.length = 0; pictures.length = 0; } };
}

function controllerHarness() {
  const controller = createController({ rules, catalog, schedule: () => 1, cancel() {} });
  return controller;
}

function sceneViews() {
  const controller = controllerHarness();
  const views = { home: controller.getView() };
  views.rules = controller.dispatch({ type: 'rules' });
  views.about = controller.dispatch({ type: 'about' });
  views.battle = controller.dispatch({ type: 'start' });
  views.selected = controller.dispatch({ type: 'card', playerIndex: 0, cardIndex: 1 });
  views.targeting = controller.dispatch({ type: 'skill' });
  views.waiting = controller.dispatch({ type: 'card', playerIndex: 1, cardIndex: 0 });
  views.logs = controller.dispatch({ type: 'logs' });
  controller.dispatch({ type: 'home' });
  controller.dispatch({ type: 'mode', modeId: 'bastion' });
  views.trialHome = controller.dispatch({ type: 'blessing', blessingId: 'vitality' });
  views.trialBattle = controller.dispatch({ type: 'start' });
  views.trialSelected = controller.dispatch({ type: 'card', playerIndex: 0, cardIndex: 1 });
  const terminal = JSON.parse(JSON.stringify(views.battle));
  terminal.gameOver = true;
  terminal.selectedSkill = null;
  terminal.players.forEach((player) => player.cards.forEach((card) => {
    card.canSelect = false;
    card.canTarget = false;
  }));
  terminal.result = {
    won: true, title: '战斗胜利', subtitle: '全部敌人已经倒下。',
    rounds: 8, survivors: 2, damageDealt: 175, damageTaken: 138, skillsUsed: 2,
    stars: 2, objectives: views.battle.objectives.map((objective) => ({
      ...objective, achieved: objective.id !== 'survivors',
    })),
  };
  views.victory = terminal;
  views.defeat = { ...terminal, result: { ...terminal.result, won: false, title: '战斗失利', stars: 0 } };
  controller.destroy();
  return views;
}

function overlap(first, second) {
  return Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x) > 0.1
    && Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y) > 0.1;
}

function assertDistinctText(text, scene) {
  const visible = text.filter((item) => item.value.trim());
  for (let index = 0; index < visible.length; index += 1) {
    const item = visible[index];
    assert.ok(item.x >= -0.1 && item.x + item.width <= 375.1,
      `${scene}: text exceeds the design width: ${item.value}`);
    for (const other of visible.slice(index + 1)) {
      assert.ok(!overlap(item, other), `${scene}: overlapping text: ${item.value} / ${other.value}`);
    }
  }
}

function assertHitRegions(renderer, height, safeTop) {
  const regions = renderer.getHitRegions();
  const maximumScroll = Math.max(0, renderer.getContentHeight() - height);
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    assert.ok(region.width >= 44 && region.height >= 44, `small touch target: ${JSON.stringify(region.action)}`);
    for (const other of regions.slice(index + 1)) {
      assert.ok(!overlap(region, other), `overlapping actions: ${JSON.stringify(region.action)} / ${JSON.stringify(other.action)}`);
    }
    const centerX = region.x + region.width / 2;
    const centerY = region.y + region.height / 2;
    const scroll = Math.max(0, Math.min(maximumScroll, centerY - height / 2));
    assert.ok(centerY - scroll >= safeTop + 48 && centerY - scroll <= height);
    assert.deepEqual(renderer.hitTest(centerX, centerY - scroll, scroll), region.action,
      'a scrolled tap must activate the region actually drawn at that position');
  }
  return regions;
}

function assertDrawnLabelsMatchRegions(renderer, text, scroll = 0) {
  for (const region of renderer.getHitRegions()) {
    assert.ok(text.some((item) => {
      const centerX = item.screenX + item.screenWidth / 2;
      const centerY = item.screenY + item.screenHeight / 2;
      return item.value.trim() && centerX >= region.x && centerX <= region.x + region.width
        && centerY >= region.y - scroll && centerY <= region.y + region.height - scroll;
    }), `drawn label and touch region disagree after Canvas scaling/scroll: ${JSON.stringify(region.action)}`);
  }
}

test('real Canvas drawing covers every scene without overlapping text or touch targets at supported widths', () => {
  for (const width of [320, 390, 430]) {
    const recorder = canvasRecorder();
    const renderer = createRenderer({ context: recorder.context, width, height: 720, safeTop: 24, safeBottom: 20 });
    for (const [name, view] of Object.entries(sceneViews())) {
      recorder.reset();
      renderer.draw(view);
      assert.ok(recorder.text.length > 0, `${name} must draw actual text`);
      assert.equal(recorder.depth(), 0);
      assert.ok(renderer.getContentHeight() >= 720);
      assertDistinctText(recorder.text, `${width}px ${name}`);
      assertHitRegions(renderer, 720, 24);
      assertDrawnLabelsMatchRegions(renderer, recorder.text);
    }
  }
});

test('resize and scene changes recompute hit regions and reject taps outside the safe viewport', () => {
  const recorder = canvasRecorder();
  const renderer = createRenderer({ context: recorder.context, width: 320, height: 700, safeTop: 20 });
  const views = sceneViews();
  renderer.draw(views.home);
  assert.ok(renderer.getHitRegions().some((region) => region.action.type === 'start'));
  for (const width of [390, 430, 320]) {
    renderer.setSize({ width, height: 700, safeTop: 20, safeBottom: 16 });
    recorder.reset();
    renderer.draw(views.targeting, { scroll: 200 });
    const regions = assertHitRegions(renderer, 700, 20);
    assertDrawnLabelsMatchRegions(renderer, recorder.text, 200);
    assert.ok(regions.some((region) => region.action.type === 'skill'));
    assert.equal(renderer.hitTest(-1, 200), null);
    assert.equal(renderer.hitTest(width + 1, 200), null);
    assert.equal(renderer.hitTest(100, 20), null);
    assert.equal(renderer.hitTest(100, 701), null);
    assert.equal(renderer.hitTest(NaN, 200), null);
  }
  renderer.draw(views.rules);
  assert.ok(renderer.getHitRegions().every((region) => region.action.type === 'back'));
});

test('dead cards and unavailable skills never leave clickable battle actions', () => {
  const recorder = canvasRecorder();
  const renderer = createRenderer({ context: recorder.context });
  const controller = controllerHarness();
  controller.dispatch({ type: 'start' });
  controller.getGame().players[0].cards[2].hp = 0;
  controller.dispatch({ type: 'card', playerIndex: 0, cardIndex: 1 });
  controller.getGame().players[0].cards[1].skill.used = true;
  renderer.draw(controller.getView());
  const actions = renderer.getHitRegions().map((region) => region.action);
  assert.ok(!actions.some((action) => action.type === 'card' && action.playerIndex === 0 && action.cardIndex === 2));
  assert.ok(!actions.some((action) => action.type === 'skill'));
  assert.ok(recorder.text.some((item) => item.value.includes('已倒下')));
  assert.ok(recorder.text.some((item) => item.value.includes('本局已使用')));
  controller.destroy();
});

test('mode and blessing choices, shields and star objectives are rendered as actionable game information', () => {
  const recorder = canvasRecorder();
  const renderer = createRenderer({ context: recorder.context });
  const controller = controllerHarness();
  const home = controller.getView();
  renderer.draw(home);
  assert.ok(renderer.getHitRegions().every((region) => region.action.type !== 'blessing'),
    'classic mode must not advertise an active blessing');
  for (const mode of home.modes) {
    assert.ok(renderer.getHitRegions().some((region) => region.action.type === 'mode' && region.action.modeId === mode.id));
    assert.ok(recorder.text.some((item) => item.value.includes(mode.name)));
  }
  controller.dispatch({ type: 'mode', modeId: 'bastion' });
  const trialHome = controller.getView();
  recorder.reset();
  renderer.draw(trialHome);
  for (const blessing of trialHome.blessings) {
    assert.ok(renderer.getHitRegions().some((region) => region.action.type === 'blessing' && region.action.blessingId === blessing.id));
    assert.ok(recorder.text.some((item) => item.value.includes(blessing.name)));
  }
  controller.dispatch({ type: 'start' });
  recorder.reset();
  renderer.draw(controller.getView());
  assert.match(recorder.text.map((item) => item.value).join('\n'), /护盾\s*18/);
  const views = sceneViews();
  for (const [view, stars] of [[views.victory, 2], [views.defeat, 0]]) {
    recorder.reset();
    renderer.draw(view);
    const rendered = recorder.text.map((item) => item.value).join('\n');
    assert.match(rendered, new RegExp(`星级评定.*${stars} / 3`));
    for (const objective of view.result.objectives) assert.ok(rendered.includes(objective.label));
    assert.match(rendered, /未达成/);
    if (view.result.won) assert.match(rendered, /已达成/);
    else assert.doesNotMatch(rendered, /已达成/);
  }
  controller.destroy();
});

test('missing and decoding artwork and empty rules/logs have usable Canvas fallbacks', () => {
  assert.throws(() => createRenderer(), /Canvas 2D context/);
  for (const failImages of [false, true]) {
    const recorder = canvasRecorder({ gradients: false, failImages });
    const images = { 'assets/hero.png': { width: 600, height: 400 } };
    const renderer = createRenderer({ context: recorder.context, images });
    renderer.draw({ screen: 'home', teamCards: [], enemyCards: [] });
    if (!failImages) assert.equal(recorder.pictures.length, 1);
    renderer.draw({ screen: 'rules', skills: [] });
    renderer.draw({ screen: 'logs', logs: [] });
    renderer.draw({ screen: 'battle', players: [], logs: [], selectedCardDetail: null });
    assert.equal(recorder.depth(), 0);
    assert.ok(recorder.text.some((item) => item.value.includes('等待第一声交锋')));
  }
});
