'use strict';

const { createController } = require('./controller');
const { createRenderer } = require('./renderer');

function createGameApplication({ platform, rules, catalog, app, rendererFactory = createRenderer }) {
  const canvas = platform.createCanvas();
  const context = canvas.getContext('2d');
  const images = {};
  let visible = true;
  let destroyed = false;
  let scroll = 0;
  let gesture = null;
  let revision = 0;
  let view;
  let renderer;
  let dimensions;
  const registrations = [];

  function measure(override = {}) {
    const info = typeof platform.getWindowInfo === 'function'
      ? platform.getWindowInfo()
      : platform.getSystemInfoSync();
    const width = Number(override.windowWidth || info.windowWidth);
    const height = Number(override.windowHeight || info.windowHeight);
    if (!(width > 0 && height > 0)) throw new Error('无法取得小游戏画布尺寸。');
    return {
      width,
      height,
      dpr: Math.max(1, Math.min(3, Number(info.pixelRatio) || 1)),
      safeTop: Math.max(0, Number(info.safeArea && info.safeArea.top) || 0),
      safeBottom: Math.max(0, height - (Number(info.safeArea && info.safeArea.bottom) || height)),
    };
  }

  function maxScroll() {
    return Math.max(0, renderer.getContentHeight() - dimensions.height);
  }

  function draw() {
    if (destroyed || !visible || !renderer) return;
    renderer.draw(view, { scroll });
    const clamped = Math.max(0, Math.min(maxScroll(), scroll));
    if (clamped !== scroll) {
      scroll = clamped;
      renderer.draw(view, { scroll });
    }
  }

  const controller = createController({
    rules,
    catalog,
    onChange(nextView) {
      const resetPosition = !view || nextView.screen !== view.screen || (!view.result && nextView.result);
      view = nextView;
      revision += 1;
      if (resetPosition) scroll = 0;
      draw();
    },
  });
  view = controller.getView();
  dimensions = measure();
  renderer = rendererFactory({ context, images, ...dimensions, app });

  function resize(override) {
    if (destroyed) return;
    dimensions = measure(override);
    canvas.width = Math.round(dimensions.width * dimensions.dpr);
    canvas.height = Math.round(dimensions.height * dimensions.dpr);
    context.setTransform(dimensions.dpr, 0, 0, dimensions.dpr, 0, 0);
    renderer.setSize(dimensions);
    gesture = null;
    draw();
  }

  function point(event, ended = false) {
    const list = ended ? event.changedTouches : event.touches;
    const touch = list && list[0];
    if (!touch) return null;
    const x = Number(touch.clientX === undefined ? touch.pageX : touch.clientX);
    const y = Number(touch.clientY === undefined ? touch.pageY : touch.clientY);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  function onTouchStart(event) {
    if (destroyed || !visible || !event.touches || event.touches.length !== 1) {
      gesture = null;
      return;
    }
    const current = point(event);
    gesture = current ? { ...current, lastY: current.y, moved: false, revision } : null;
  }

  function onTouchMove(event) {
    if (!gesture || destroyed || !visible) return;
    if (!event.touches || event.touches.length !== 1) { gesture = null; return; }
    const current = point(event);
    if (!current) return;
    if (Math.hypot(current.x - gesture.x, current.y - gesture.y) > 8) gesture.moved = true;
    if (gesture.moved) {
      scroll = Math.max(0, Math.min(maxScroll(), scroll + gesture.lastY - current.y));
      draw();
    }
    gesture.lastY = current.y;
  }

  function onTouchEnd(event) {
    if (!gesture || destroyed || !visible) return;
    const started = gesture;
    gesture = null;
    const current = point(event, true);
    if (!current || started.moved || started.revision !== revision) return;
    if (Math.hypot(current.x - started.x, current.y - started.y) > 8) return;
    const action = renderer.hitTest(current.x, current.y, scroll);
    if (!action) return;
    if (action.type === 'reset' || action.type === 'start') scroll = 0;
    controller.dispatch(action);
  }

  function bind(name, callback) {
    if (typeof platform[name] !== 'function') return;
    platform[name](callback);
    registrations.push([`off${name.slice(2)}`, callback]);
  }

  bind('onTouchStart', onTouchStart);
  bind('onTouchMove', onTouchMove);
  bind('onTouchEnd', onTouchEnd);
  bind('onTouchCancel', () => { gesture = null; });
  bind('onHide', () => {
    visible = false;
    gesture = null;
    controller.onHide();
  });
  bind('onShow', () => {
    if (destroyed) return;
    visible = true;
    controller.onShow();
    draw();
  });
  bind('onWindowResize', (event) => resize(event && event.size));

  const sample = rules.createGame();
  const lookup = typeof catalog === 'function' ? catalog : catalog.getCardPresentation;
  const cardPaths = sample.players.reduce((paths, team) => paths.concat(team.cards
    .map((card) => lookup(card.name).art.replace(/^\//, ''))), []);
  const artPaths = ['assets/hero.png', ...cardPaths];
  for (const source of new Set(artPaths)) {
    const image = platform.createImage();
    image.onload = () => {
      if (destroyed) return;
      images[source] = image;
      draw();
    };
    image.onerror = () => {
      if (destroyed) return;
      draw();
    };
    image.src = source;
  }
  resize();

  return {
    canvas,
    controller,
    renderer,
    getView: () => controller.getView(),
    getScroll: () => scroll,
    scrollTo(nextScroll) {
      if (destroyed) return;
      scroll = Math.max(0, Math.min(maxScroll(), Number(nextScroll) || 0));
      draw();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      controller.destroy();
      for (const [name, callback] of registrations) {
        if (typeof platform[name] === 'function') platform[name](callback);
      }
      gesture = null;
    },
  };
}

module.exports = { createGameApplication };
