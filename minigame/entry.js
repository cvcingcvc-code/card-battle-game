'use strict';

const { createGameApplication } = require('./runtime');

createGameApplication({
  platform: wx,
  rules: require('./rules'),
  catalog: require('./data/cards'),
  app: require('./data/app.json'),
});
