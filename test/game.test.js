'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createGame,
  isCardAlive,
  isPlayerAlive,
  playAiTurn,
  playPlayerAttack,
  selectAttacker,
  useSelectedCardSkill,
} = require('../game');

test('creates the two starting teams and gives the player the first turn', () => {
  const game = createGame();

  assert.equal(game.players.length, 2);
  assert.equal(game.players[0].cards.length, 3);
  assert.equal(game.players[1].cards.length, 3);
  assert.equal(game.currentPlayerIdx, 0);
  assert.equal(game.selectedCardIdx, null);
  assert.equal(game.gameOver, false);
});

test('allows a living player card to attack a living AI card', () => {
  const game = createGame();
  assert.equal(selectAttacker(game, 0, 1), true);

  const events = playPlayerAttack(game, 1, 1);

  assert.equal(game.players[1].cards[1].hp, 0);
  assert.equal(isCardAlive(game.players[1].cards[1]), false);
  assert.equal(events[0].damage, 30);
  assert.equal(events[0].killedCardName, '暗影刺客');
  assert.equal(game.selectedCardIdx, null);
  assert.equal(game.currentPlayerIdx, 1);
});

test('AI uses its strongest living card against the player card with the least health', () => {
  const game = createGame();
  game.currentPlayerIdx = 1;
  game.players[1].cards[2].skill.used = true;
  game.players[0].cards[0].hp = 100;
  game.players[0].cards[1].hp = 39;
  game.players[0].cards[2].hp = 80;

  const events = playAiTurn(game);

  assert.equal(events[0].attackerCardIdx, 1);
  assert.equal(events[0].targetCardIdx, 1);
  assert.equal(events[0].damage, 40);
  assert.equal(events[0].killedCardName, '精灵射手');
  assert.equal(game.players[0].cards[1].hp, 0);
  assert.equal(game.currentPlayerIdx, 0);
});

test('AI uses Troll Stomp when its effective area damage beats the best attack by 10', () => {
  const game = createGame();
  game.currentPlayerIdx = 1;

  const events = playAiTurn(game);

  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => event.type), ['skill', 'skill', 'skill']);
  assert.deepEqual(events.map((event) => event.damage), [18, 18, 18]);
  assert.deepEqual(game.players[0].cards.map((card) => card.hp), [82, 22, 62]);
  assert.equal(events[0].attackerPlayerIdx, 1);
  assert.equal(events[0].attackerCardIdx, 2);
  assert.equal(game.players[1].cards[2].skill.used, true);
  assert.equal(game.currentPlayerIdx, 0);

  game.currentPlayerIdx = 1;
  const nextTurn = playAiTurn(game);
  assert.equal(nextTurn.length, 1);
  assert.equal(nextTurn[0].type, 'attack');
});

test('AI saves Troll Stomp when its effective damage does not beat a focused attack', () => {
  const game = createGame();
  game.currentPlayerIdx = 1;
  game.players[0].cards[1].hp = 0;
  game.players[0].cards[2].hp = 80;

  const events = playAiTurn(game);

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'attack');
  assert.equal(events[0].attackerCardIdx, 1);
  assert.equal(events[0].targetCardIdx, 2);
  assert.equal(game.players[1].cards[2].skill.used, false);
});

test('AI saves Troll Stomp when only one player card remains', () => {
  const game = createGame();
  game.currentPlayerIdx = 1;
  game.players[0].cards[1].hp = 0;
  game.players[0].cards[2].hp = 0;

  const events = playAiTurn(game);

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'attack');
  assert.equal(game.players[1].cards[2].skill.used, false);
});

test('AI can win with Troll Stomp when it defeats multiple remaining cards', () => {
  const game = createGame();
  game.currentPlayerIdx = 1;
  game.players[0].cards[0].hp = 10;
  game.players[0].cards[1].hp = 18;
  game.players[0].cards[2].hp = 0;

  const events = playAiTurn(game);

  assert.equal(events.length, 3);
  assert.equal(events[0].type, 'skill');
  assert.equal(events[0].killedCardName, '龙');
  assert.equal(game.players[0].cards[1].hp, 0);
  assert.equal(game.gameOver, true);
  assert.equal(game.winnerIdx, 1);
  assert.equal(events.at(-1).type, 'victory');
});

test('Dragon Flame damages every living enemy once and hands the turn to the AI', () => {
  const game = createGame();
  selectAttacker(game, 0, 0);

  const events = useSelectedCardSkill(game);

  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => event.damage), [12, 12, 12]);
  assert.deepEqual(game.players[1].cards.map((card) => card.hp), [48, 13, 78]);
  assert.equal(game.players[0].cards[0].skill.used, true);
  assert.equal(game.selectedCardIdx, null);
  assert.equal(game.currentPlayerIdx, 1);

  playAiTurn(game);
  selectAttacker(game, 0, 0);
  assert.deepEqual(useSelectedCardSkill(game), []);
});

test('Precision Shot deals 50 damage to one chosen enemy and uses the player turn', () => {
  const game = createGame();
  selectAttacker(game, 0, 1);

  const events = useSelectedCardSkill(game, 0);

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'skill');
  assert.equal(events[0].skillName, '精准射击');
  assert.equal(events[0].targetCardIdx, 0);
  assert.equal(events[0].damage, 50);
  assert.equal(game.players[1].cards[0].hp, 10);
  assert.equal(game.players[1].cards[1].hp, 25);
  assert.equal(game.players[0].cards[1].skill.used, true);
  assert.equal(game.selectedCardIdx, null);
  assert.equal(game.currentPlayerIdx, 1);

  game.currentPlayerIdx = 0;
  selectAttacker(game, 0, 1);
  assert.deepEqual(useSelectedCardSkill(game, 0), []);
});

test('Precision Shot rejects missing or defeated targets without consuming the skill', () => {
  const game = createGame();
  game.players[1].cards[1].hp = 0;
  selectAttacker(game, 0, 1);

  assert.deepEqual(useSelectedCardSkill(game), []);
  assert.deepEqual(useSelectedCardSkill(game, 1), []);
  assert.deepEqual(useSelectedCardSkill(game, 99), []);
  assert.equal(game.players[0].cards[1].skill.used, false);
  assert.equal(game.players[1].cards[0].hp, 60);
});

test('Precision Shot ends the game when it defeats the last living enemy', () => {
  const game = createGame();
  game.players[1].cards[0].hp = 0;
  game.players[1].cards[1].hp = 0;
  game.players[1].cards[2].hp = 40;
  selectAttacker(game, 0, 1);

  const events = useSelectedCardSkill(game, 2);

  assert.equal(game.gameOver, true);
  assert.equal(game.winnerIdx, 0);
  assert.equal(events.at(-1).type, 'victory');
  assert.equal(events.at(-1).winnerIdx, 0);
});

test('Dragon Flame can win the game by defeating the last living enemy', () => {
  const game = createGame();
  game.players[1].cards[0].hp = 0;
  game.players[1].cards[1].hp = 0;
  game.players[1].cards[2].hp = 10;
  selectAttacker(game, 0, 0);

  const events = useSelectedCardSkill(game);

  assert.equal(game.players[1].cards[2].hp, 0);
  assert.equal(game.gameOver, true);
  assert.equal(game.winnerIdx, 0);
  assert.deepEqual(events.at(-1), { type: 'victory', winnerIdx: 0 });
});

test('ends the game when a player attack defeats the last AI card', () => {
  const game = createGame();
  game.players[1].cards[0].hp = 0;
  game.players[1].cards[2].hp = 0;
  game.players[1].cards[1].hp = 5;
  selectAttacker(game, 0, 1);

  const events = playPlayerAttack(game, 1, 1);

  assert.equal(game.gameOver, true);
  assert.equal(game.winnerIdx, 0);
  assert.equal(isPlayerAlive(game.players[1]), false);
  assert.deepEqual(events.at(-1), { type: 'victory', winnerIdx: 0 });
});

test('ends the game when the AI defeats the last player card', () => {
  const game = createGame();
  game.currentPlayerIdx = 1;
  game.players[0].cards[0].hp = 1;
  game.players[0].cards[1].hp = 0;
  game.players[0].cards[2].hp = 0;

  const events = playAiTurn(game);

  assert.equal(game.gameOver, true);
  assert.equal(game.winnerIdx, 1);
  assert.equal(isPlayerAlive(game.players[0]), false);
  assert.deepEqual(events.at(-1), { type: 'victory', winnerIdx: 1 });
});

test('rejects invalid moves without changing card health', () => {
  const game = createGame();
  const originalHealth = game.players[1].cards[0].hp;

  assert.equal(selectAttacker(game, 1, 0), false);
  assert.deepEqual(playPlayerAttack(game, 1, 0), []);
  selectAttacker(game, 0, 0);
  assert.deepEqual(playPlayerAttack(game, 0, 0), []);

  assert.equal(game.players[1].cards[0].hp, originalHealth);
  assert.equal(game.currentPlayerIdx, 0);
});

test('starts a restarted game with fresh cards and the player turn', () => {
  const game = createGame();
  game.players[0].cards[0].hp = 0;
  game.gameOver = true;
  game.winnerIdx = 1;

  const restarted = createGame();

  assert.equal(restarted.players[0].cards[0].hp, 100);
  assert.equal(restarted.currentPlayerIdx, 0);
  assert.equal(restarted.gameOver, false);
  assert.equal(restarted.winnerIdx, null);
});
