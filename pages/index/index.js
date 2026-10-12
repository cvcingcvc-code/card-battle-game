'use strict';

const { createGame } = require('../../game');

function decorateCard(card) {
  return {
    ...card,
    hpPercent: Math.round((card.hp / card.maxHp) * 100),
    isDead: card.hp <= 0,
  };
}

function createPageState() {
  const game = createGame();
  return {
    players: game.players.map((player) => ({
      ...player,
      cards: player.cards.map(decorateCard),
    })),
  };
}

Page({
  data: createPageState(),
});
