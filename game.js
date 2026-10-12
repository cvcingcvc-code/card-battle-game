'use strict';

const PLAYER = 0;
const AI = 1;

function createGame() {
  return {
    players: [
      {
        name: '玩家A',
        cards: [
          {
            name: '龙',
            attack: 15,
            hp: 100,
            maxHp: 100,
            skill: { name: '龙焰', description: '对所有存活敌人造成 12 点伤害', damage: 12, used: false },
          },
          { name: '精灵射手', attack: 30, hp: 40, maxHp: 40 },
          { name: '石像鬼', attack: 10, hp: 80, maxHp: 80 },
        ],
      },
      {
        name: '玩家B',
        cards: [
          { name: '骑士', attack: 25, hp: 60, maxHp: 60 },
          { name: '暗影刺客', attack: 40, hp: 25, maxHp: 25 },
          { name: '巨魔', attack: 12, hp: 90, maxHp: 90 },
        ],
      },
    ],
    currentPlayerIdx: PLAYER,
    selectedCardIdx: null,
    gameOver: false,
    winnerIdx: null,
  };
}

function isCardAlive(card) {
  return Boolean(card && card.hp > 0);
}

function getAliveCards(player) {
  return player.cards.filter(isCardAlive);
}

function isPlayerAlive(player) {
  return getAliveCards(player).length > 0;
}

function selectAttacker(game, playerIdx, cardIdx) {
  if (game.gameOver || playerIdx !== PLAYER || game.currentPlayerIdx !== PLAYER) return false;
  if (!Number.isInteger(cardIdx) || !isCardAlive(game.players[PLAYER].cards[cardIdx])) return false;

  game.selectedCardIdx = cardIdx;
  return true;
}

function applyAttack(game, attackerPlayerIdx, attackerCardIdx, targetPlayerIdx, targetCardIdx) {
  const attacker = game.players[attackerPlayerIdx].cards[attackerCardIdx];
  const target = game.players[targetPlayerIdx].cards[targetCardIdx];
  target.hp = Math.max(0, target.hp - attacker.attack);

  return {
    type: 'attack',
    attackerPlayerIdx,
    attackerCardIdx,
    targetPlayerIdx,
    targetCardIdx,
    damage: attacker.attack,
    killedCardName: isCardAlive(target) ? null : target.name,
  };
}

function finishIfDefeated(game, attackerPlayerIdx, targetPlayerIdx) {
  if (isPlayerAlive(game.players[targetPlayerIdx])) return null;

  game.gameOver = true;
  game.winnerIdx = attackerPlayerIdx;
  return { type: 'victory', winnerIdx: attackerPlayerIdx };
}

function playPlayerAttack(game, targetPlayerIdx, targetCardIdx) {
  if (game.gameOver || game.currentPlayerIdx !== PLAYER || game.selectedCardIdx === null) return [];
  if (targetPlayerIdx !== AI || !Number.isInteger(targetCardIdx)) return [];

  const attackerCardIdx = game.selectedCardIdx;
  const attackerCard = game.players[PLAYER].cards[attackerCardIdx];
  const targetCard = game.players[AI].cards[targetCardIdx];
  if (!isCardAlive(attackerCard) || !isCardAlive(targetCard)) {
    game.selectedCardIdx = null;
    return [];
  }

  const events = [applyAttack(game, PLAYER, attackerCardIdx, AI, targetCardIdx)];
  game.selectedCardIdx = null;

  const victory = finishIfDefeated(game, PLAYER, AI);
  if (victory) events.push(victory);
  else game.currentPlayerIdx = AI;

  return events;
}

function useSelectedCardSkill(game) {
  if (game.gameOver || game.currentPlayerIdx !== PLAYER || game.selectedCardIdx === null) return [];

  const attackerCardIdx = game.selectedCardIdx;
  const attacker = game.players[PLAYER].cards[attackerCardIdx];
  if (!isCardAlive(attacker) || !attacker.skill || attacker.skill.used) return [];

  const targets = game.players[AI].cards
    .map((card, cardIdx) => ({ card, cardIdx }))
    .filter(({ card }) => isCardAlive(card));
  if (targets.length === 0) return [];

  attacker.skill.used = true;
  const events = targets.map(({ card, cardIdx }) => {
    card.hp = Math.max(0, card.hp - attacker.skill.damage);
    return {
      type: 'skill',
      skillName: attacker.skill.name,
      attackerPlayerIdx: PLAYER,
      attackerCardIdx,
      targetPlayerIdx: AI,
      targetCardIdx: cardIdx,
      damage: attacker.skill.damage,
      killedCardName: isCardAlive(card) ? null : card.name,
    };
  });
  game.selectedCardIdx = null;

  const victory = finishIfDefeated(game, PLAYER, AI);
  if (victory) events.push(victory);
  else game.currentPlayerIdx = AI;
  return events;
}

function chooseCard(cards, score, preferHigher) {
  return cards.reduce((best, card) => {
    const currentScore = score(card);
    const bestScore = score(best);
    return preferHigher ? (currentScore > bestScore ? card : best) : (currentScore < bestScore ? card : best);
  });
}

function playAiTurn(game) {
  if (game.gameOver || game.currentPlayerIdx !== AI) return [];

  const aiCards = getAliveCards(game.players[AI]);
  const playerCards = getAliveCards(game.players[PLAYER]);
  if (aiCards.length === 0 || playerCards.length === 0) return [];

  const attacker = chooseCard(aiCards, (card) => card.attack, true);
  const target = chooseCard(playerCards, (card) => card.hp, false);
  const events = [
    applyAttack(
      game,
      AI,
      game.players[AI].cards.indexOf(attacker),
      PLAYER,
      game.players[PLAYER].cards.indexOf(target),
    ),
  ];

  const victory = finishIfDefeated(game, AI, PLAYER);
  if (victory) events.push(victory);
  game.currentPlayerIdx = PLAYER;
  return events;
}

const gameApi = {
  createGame,
  isCardAlive,
  isPlayerAlive,
  selectAttacker,
  playPlayerAttack,
  useSelectedCardSkill,
  playAiTurn,
};

if (typeof module !== 'undefined' && module.exports) module.exports = gameApi;
if (typeof window !== 'undefined') window.CardBattleGame = gameApi;
