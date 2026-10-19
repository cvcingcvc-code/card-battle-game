'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { SOURCE_FILES } = require('../scripts/package-minigame');

const root = path.resolve(__dirname, '..');

function startExportedEntry() {
  const modules = new Map();
  const timers = new Map();
  const listeners = new Map();
  const images = [];
  const frames = [];
  const drawnImages = new Set();
  const networkCalls = [];
  const info = { windowWidth: 390, windowHeight: 844, pixelRatio: 2, safeArea: { top: 24, bottom: 824 } };
  let application;
  let timerSequence = 0;
  let depth = 0;
  let currentFrame = [];
  const context2d = {
    font: '14px sans-serif', textAlign: 'left',
    save() { if (depth === 0) { currentFrame = []; frames.push(currentFrame); } depth += 1; },
    restore() { assert.ok(depth > 0); depth -= 1; },
    setTransform() {}, scale() {}, translate() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, rect() {}, clip() {}, fill() {}, stroke() {}, fillRect() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    measureText(value) {
      const size = Number(this.font.match(/([\d.]+)px/)[1]);
      return { width: Array.from(String(value)).reduce((sum, character) =>
        sum + size * (character.codePointAt(0) > 255 ? 1 : 0.55), 0) };
    },
    fillText(value) { currentFrame.push(String(value)); },
    drawImage(image) {
      assert.ok(image.width > 0 && image.height > 0, 'only decoded local images may be drawn');
      drawnImages.add(image.src);
    },
  };
  const canvas = { getContext(type) { assert.equal(type, '2d'); return context2d; } };
  const platform = {
    createCanvas: () => canvas,
    getWindowInfo: () => info,
    createImage() {
      const image = {};
      Object.defineProperty(image, 'src', {
        get() { return this.source; },
        set(source) {
          assert.match(source, /^assets\/[\w/]+\.png$/);
          assert.ok(Object.hasOwn(SOURCE_FILES, source), 'an image must be in the actual export allowlist');
          const bytes = fs.readFileSync(path.join(root, SOURCE_FILES[source]));
          assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
          this.source = source;
          this.width = bytes.readUInt32BE(16);
          this.height = bytes.readUInt32BE(20);
          this.onload();
        },
      });
      images.push(image);
      return image;
    },
  };
  for (const name of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'Hide', 'Show', 'WindowResize']) {
    listeners.set(name, new Set());
    platform[`on${name}`] = (callback) => listeners.get(name).add(callback);
    platform[`off${name}`] = (callback) => listeners.get(name).delete(callback);
  }
  for (const name of ['request', 'connectSocket', 'downloadFile', 'uploadFile', 'login']) {
    platform[name] = () => { networkCalls.push(name); throw new Error(`unexpected online dependency: ${name}`); };
  }
  const sandbox = vm.createContext({
    wx: platform,
    setTimeout(callback, delay) {
      assert.equal(delay, 600, 'the entry must not create background polling');
      const timerId = ++timerSequence;
      timers.set(timerId, callback);
      return timerId;
    },
    clearTimeout: (timerId) => timers.delete(timerId),
    setInterval() { throw new Error('the offline game must not start a perpetual interval'); },
  });

  // Use the exact deployment mapping, including entry.js -> game.js and the
  // shared rules -> rules.js. Compile under the real source filename so V8
  // attributes executed entry/rendering lines to production rather than tests.
  function load(exportName) {
    if (modules.has(exportName)) return modules.get(exportName).exports;
    const sourceName = SOURCE_FILES[exportName];
    assert.ok(sourceName && /\.(?:js|json)$/.test(sourceName), `module is not exported: ${exportName}`);
    const filename = path.join(root, sourceName);
    const source = fs.readFileSync(filename, 'utf8');
    const module = { exports: {} };
    modules.set(exportName, module);
    if (exportName.endsWith('.json')) {
      module.exports = JSON.parse(source);
      return module.exports;
    }
    const localRequire = (reference) => {
      assert.match(reference, /^\.{1,2}\//, 'the real game may require only packaged local modules');
      const relative = path.posix.normalize(path.posix.join(path.posix.dirname(exportName), reference));
      const candidate = [relative, `${relative}.js`, `${relative}.json`, `${relative}/index.js`]
        .find((name) => Object.hasOwn(SOURCE_FILES, name));
      assert.ok(candidate, `unresolved exported dependency: ${exportName} -> ${reference}`);
      return load(candidate);
    };
    const run = vm.compileFunction(source, ['require', 'module', 'exports'], { filename, parsingContext: sandbox });
    run(localRequire, module, module.exports);
    if (exportName === 'runtime.js') {
      const actualFactory = module.exports.createGameApplication;
      module.exports.createGameApplication = (options) => {
        application = actualFactory(options);
        return application;
      };
    }
    return module.exports;
  }
  load('game.js');
  assert.ok(application, 'the real exported entry must start the application');

  function emit(name, event = {}) {
    [...listeners.get(name)].forEach((callback) => callback(event));
  }
  function tapAction(predicate) {
    let region = application.renderer.getHitRegions().find((item) => predicate(item.action));
    assert.ok(region, 'the requested game action must have a real rendered hit region');
    application.scrollTo(region.y + region.height / 2 - info.windowHeight / 2);
    region = application.renderer.getHitRegions().find((item) => predicate(item.action));
    const touch = { clientX: region.x + region.width / 2,
      clientY: region.y + region.height / 2 - application.getScroll() };
    assert.ok(touch.clientY >= info.safeArea.top + 48 && touch.clientY <= info.windowHeight);
    emit('TouchStart', { touches: [touch] });
    emit('TouchEnd', { changedTouches: [touch] });
  }
  return {
    application, modules, timers, images, drawnImages, frames, networkCalls, canvas, info, emit, tapAction,
    text: () => frames.at(-1).join('\n'),
    runAi() {
      assert.equal(timers.size, 1);
      const [timerId, callback] = timers.entries().next().value;
      timers.delete(timerId);
      callback();
    },
  };
}

test('the assembled game entry executes every real module and draws all seven local images without online services', () => {
  const fixture = startExportedEntry();
  const { application, modules, images, drawnImages, canvas, networkCalls, tapAction, text } = fixture;
  try {
    for (const name of ['game.js', 'runtime.js', 'controller.js', 'renderer.js', 'rules.js', 'data/cards.js', 'data/app.json']) {
      assert.ok(modules.has(name), `${name} must execute through the real entry`);
    }
    assert.equal(images.length, 7);
    assert.equal(new Set(images.map((image) => image.src)).size, 7);
    assert.equal(canvas.width, 780);
    assert.equal(canvas.height, 1688);
    assert.equal(application.getView().screen, 'home');
    assert.match(text(), /余烬对决/);
    tapAction((action) => action.type === 'rules');
    assert.equal(application.getView().screen, 'rules');
    assert.match(text(), /精准射击/);
    tapAction((action) => action.type === 'back');
    tapAction((action) => action.type === 'about');
    assert.equal(application.getView().screen, 'about');
    assert.match(text(), /隐私与数据/);
    tapAction((action) => action.type === 'back');
    tapAction((action) => action.type === 'start');
    assert.equal(application.getView().screen, 'battle');
    assert.match(text(), /古境战场/);
    assert.equal(drawnImages.size, 7, 'the real renderer must consume every packaged illustration');
    assert.deepEqual(networkCalls, []);
  } finally { application.destroy(); }
});

test('mode and blessing taps in the real entry reach the engine and keep the chosen trial on restart', () => {
  const fixture = startExportedEntry();
  const { application, tapAction, text } = fixture;
  try {
    tapAction((action) => action.type === 'mode' && action.modeId === 'bastion');
    tapAction((action) => action.type === 'blessing' && action.blessingId === 'vitality');
    tapAction((action) => action.type === 'start');
    let view = application.getView();
    assert.equal(view.selectedModeId, 'bastion');
    assert.equal(view.selectedBlessingId, 'vitality');
    assert.equal(view.players.find((player) => player.playerIndex === 0).cards[0].hp, 120);
    assert.ok(view.players.every((player) => player.cards.every((card) => card.shield === 18)));
    assert.match(text(), /铁壁试炼/);
    assert.match(text(), /活力/);
    assert.match(text(), /护盾\s*18/);
    tapAction((action) => action.type === 'reset');
    view = application.getView();
    assert.equal(view.selectedModeId, 'bastion');
    assert.equal(view.selectedBlessingId, 'vitality');
    assert.equal(view.playerActions, 0);
  } finally { application.destroy(); }
});

test('real Canvas taps, runtime lifecycle and the controller cooperate to pause, resume and reset a battle', () => {
  const fixture = startExportedEntry();
  const { application, timers, tapAction, emit, runAi, text } = fixture;
  try {
    tapAction((action) => action.type === 'start');
    tapAction((action) => action.type === 'card' && action.playerIndex === 0 && action.cardIndex === 1);
    tapAction((action) => action.type === 'card' && action.playerIndex === 1 && action.cardIndex === 0);
    assert.equal(application.getView().damageDealt, 30);
    assert.equal(timers.size, 1);
    const staleAction = timers.values().next().value;
    emit('Hide');
    assert.equal(timers.size, 0);
    const paused = JSON.stringify(application.getView().players);
    emit('Show');
    emit('Show');
    staleAction();
    assert.equal(timers.size, 1);
    assert.equal(JSON.stringify(application.getView().players), paused);
    runAi();
    assert.equal(application.getView().turnLabel, '你的回合');
    assert.equal(application.getView().damageTaken, 54);
    assert.match(text(), /震地/);
    tapAction((action) => action.type === 'reset');
    assert.equal(application.getView().damageDealt, 0);
    assert.equal(application.getView().damageTaken, 0);
    assert.equal(application.getView().roundNumber, 1);
    assert.equal(timers.size, 0);
    assert.equal(application.getView().logs.length, 1);
  } finally { application.destroy(); }
  assert.equal(timers.size, 0);
});

test('the assembled entry reflows and keeps real rendered controls tappable after platform resize and drag', () => {
  const fixture = startExportedEntry();
  const { application, info, canvas, emit, tapAction } = fixture;
  try {
    for (const width of [320, 430, 390]) {
      info.windowWidth = width;
      emit('WindowResize', { size: { windowWidth: width, windowHeight: info.windowHeight } });
      assert.equal(canvas.width, width * 2);
      tapAction((action) => action.type === 'start');
      assert.equal(application.getView().screen, 'battle');
      application.scrollTo(0);
      emit('TouchStart', { touches: [{ clientX: 180, clientY: 420 }] });
      emit('TouchMove', { touches: [{ clientX: 180, clientY: 320 }] });
      emit('TouchEnd', { changedTouches: [{ clientX: 180, clientY: 320 }] });
      assert.ok(application.getScroll() > 0);
      assert.equal(application.getView().playerActions, 0, 'dragging the real battlefield must not select/attack');
      tapAction((action) => action.type === 'home');
      assert.equal(application.getView().screen, 'home');
    }
  } finally { application.destroy(); }
});
