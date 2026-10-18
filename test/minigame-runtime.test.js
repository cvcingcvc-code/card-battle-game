'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createGameApplication } = require('../minigame/runtime');
const rules = require('../game');
const catalog = require('../data/cards');
const app = require('../data/app.json');

function harness() {
  const callbacks = new Map();
  const art = [];
  const transforms = [];
  const draws = [];
  const sizes = [];
  const hits = [];
  const info = { windowWidth: 390, windowHeight: 844, pixelRatio: 2, safeArea: { top: 24, bottom: 824 } };
  const canvas = { getContext: () => ({ setTransform: (...values) => transforms.push(values) }) };
  const platform = {
    createCanvas: () => canvas,
    getWindowInfo: () => info,
    createImage() { const image = {}; art.push(image); return image; },
  };
  for (const name of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'Hide', 'Show', 'WindowResize']) {
    callbacks.set(`on${name}`, new Set());
    platform[`on${name}`] = callback => callbacks.get(`on${name}`).add(callback);
    platform[`off${name}`] = callback => callbacks.get(`on${name}`).delete(callback);
  }
  let renderOptions;
  const application = createGameApplication({
    platform, rules, catalog, app,
    rendererFactory(options) {
      renderOptions = options;
      return {
        draw: (view, options_) => draws.push({ screen: view.screen, scroll: options_.scroll }),
        getContentHeight: () => 1500,
        setSize: size => sizes.push(size),
        hitTest(x, y, scroll) { hits.push({ x, y, scroll }); return { type: 'start' }; },
      };
    },
  });
  const emit = (name, event = {}) => [...callbacks.get(name)].forEach(callback => callback(event));
  const touch = (x, y, end = false) => ({ [end ? 'changedTouches' : 'touches']: [{ clientX: x, clientY: y }] });
  return { application, platform, info, canvas, art, transforms, draws, sizes, hits, renderOptions, callbacks, emit, touch };
}

test('the game adapter sizes a high-DPI canvas and loads only the seven packaged local images', () => {
  const fixture = harness();
  const { application, canvas, transforms, art, renderOptions, draws } = fixture;
  assert.equal(canvas.width, 780);
  assert.equal(canvas.height, 1688);
  assert.deepEqual(transforms.at(-1), [2, 0, 0, 2, 0, 0]);
  assert.equal(renderOptions.safeTop, 24);
  assert.equal(renderOptions.safeBottom, 20);
  assert.equal(art.length, 7);
  assert.equal(new Set(art.map(image => image.src)).size, 7);
  assert.ok(art.every(image => /^assets\/[\w/]+\.png$/.test(image.src)));
  const before = draws.length;
  art[0].onload();
  assert.equal(draws.length, before + 1);
  assert.equal(renderOptions.images[art[0].src], art[0]);
  application.destroy();
  const afterDestroy = draws.length;
  art[1].onload();
  assert.equal(draws.length, afterDestroy, 'late asset completion must not draw a disposed game');
  for (const listeners of fixture.callbacks.values()) assert.equal(listeners.size, 0);
});

test('a tap dispatches one action but a drag scrolls without accidentally activating a button', () => {
  const { application, emit, touch, hits } = harness();
  emit('onTouchStart', touch(120, 180));
  emit('onTouchEnd', touch(120, 180, true));
  assert.equal(application.getView().screen, 'battle');
  assert.equal(hits.length, 1);
  application.controller.dispatch({ type: 'home' });
  emit('onTouchStart', touch(120, 240));
  emit('onTouchMove', touch(120, 190));
  emit('onTouchEnd', touch(120, 190, true));
  assert.equal(application.getView().screen, 'home');
  assert.equal(application.getScroll(), 50);
  assert.equal(hits.length, 1);
  application.scrollTo(100000);
  assert.equal(application.getScroll(), 656);
  application.scrollTo(-100);
  assert.equal(application.getScroll(), 0);
  application.destroy();
});

test('model changes, cancelled touches, multitouch and backgrounding invalidate pending taps', () => {
  const { application, emit, touch, hits } = harness();
  emit('onTouchStart', touch(0, 0));
  application.controller.dispatch({ type: 'rules' });
  emit('onTouchEnd', touch(0, 0, true));
  assert.equal(hits.length, 0);
  application.controller.dispatch({ type: 'back' });
  emit('onTouchStart', touch(100, 100));
  emit('onTouchCancel');
  emit('onTouchEnd', touch(100, 100, true));
  emit('onTouchStart', { touches: [{ clientX: 1, clientY: 1 }, { clientX: 2, clientY: 2 }] });
  emit('onTouchEnd', touch(1, 1, true));
  assert.equal(hits.length, 0);
  emit('onTouchStart', touch(100, 100));
  emit('onHide');
  emit('onTouchEnd', touch(100, 100, true));
  assert.equal(hits.length, 0);
  emit('onShow');
  emit('onTouchStart', touch(0, 0));
  emit('onTouchEnd', touch(0, 0, true));
  assert.deepEqual(hits.at(-1), { x: 0, y: 0, scroll: 0 });
  assert.equal(application.getView().screen, 'battle');
  application.destroy();
});

test('a resize updates renderer bounds, pixel density and touch coordinates without stale gestures', () => {
  const { application, info, canvas, transforms, sizes, emit, touch, hits } = harness();
  emit('onTouchStart', touch(100, 100));
  Object.assign(info, { windowWidth: 320, windowHeight: 700, pixelRatio: 4, safeArea: { top: 20, bottom: 680 } });
  emit('onWindowResize', { size: { windowWidth: 320, windowHeight: 700 } });
  assert.equal(canvas.width, 960);
  assert.equal(canvas.height, 2100);
  assert.deepEqual(transforms.at(-1), [3, 0, 0, 3, 0, 0]);
  assert.equal(sizes.at(-1).width, 320);
  assert.equal(sizes.at(-1).safeBottom, 20);
  emit('onTouchEnd', touch(100, 100, true));
  assert.equal(hits.length, 0);
  application.destroy();
});
