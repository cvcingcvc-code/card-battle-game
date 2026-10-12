'use strict';

const {
  createGame,
  playAiTurn,
  playPlayerAttack,
  selectAttacker,
} = require('../../game');

function decorateCard(card, playerIndex, cardIndex, game) {
  const hpPercent = Math.round((card.hp / card.maxHp) * 100);
  return {
    ...card,
    hpPercent,
    isDead: card.hp <= 0,
    isSelected: playerIndex === 0 && game.selectedCardIdx === cardIndex,
    canSelect: playerIndex === 0 && game.currentPlayerIdx === 0 && !game.gameOver && card.hp > 0,
    canTarget: playerIndex === 1
      && game.currentPlayerIdx === 0
      && game.selectedCardIdx !== null
      && !game.gameOver
      && card.hp > 0,
    healthTone: hpPercent <= 25 ? 'critical' : hpPercent <= 50 ? 'low' : '',
  };
}

function getStatus(game) {
  if (game.gameOver) {
    return {
      turnLabel: '战斗结束',
      statusText: `${game.players[game.winnerIdx].name} 获胜`,
      statusTone: game.winnerIdx === 0 ? 'victory' : 'defeat',
    };
  }
  if (game.currentPlayerIdx === 1) {
    return { turnLabel: '对手回合', statusText: '对手正在思考…', statusTone: 'waiting' };
  }
  if (game.selectedCardIdx === null) {
    return { turnLabel: '你的回合', statusText: '选择一张己方卡牌作为攻击者', statusTone: 'ready' };
  }
  const attacker = game.players[0].cards[game.selectedCardIdx];
  return {
    turnLabel: '你的回合',
    statusText: `已选 ${attacker.name}，选择对手目标`,
    statusTone: 'target',
  };
}

Page({
  data: {
    players: [],
    logs: [],
    logScrollTarget: '',
    turnLabel: '你的回合',
    statusText: '',
    statusTone: 'ready',
    gameOver: false,
  },

  onLoad() {
    this.game = createGame();
    this.aiTimer = null;
    this.logEntries = [];
    this.logSequence = 0;
    this.addLog('选择你的卡牌，再选择对手目标发起攻击。', 'info');
    this.updateView();
  },

  onUnload() {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.aiTimer = null;
  },

  updateView() {
    const players = this.game.players.map((player, playerIndex) => ({
      ...player,
      playerIndex,
      cards: player.cards.map((card, cardIndex) => (
        decorateCard(card, playerIndex, cardIndex, this.game)
      )),
    })).reverse();
    this.setData({
      players,
      ...getStatus(this.game),
      gameOver: this.game.gameOver,
    });
  },

  onCardTap(event) {
    if (this.game.gameOver) return;
    const playerIndex = Number(event.currentTarget.dataset.playerIndex);
    const cardIndex = Number(event.currentTarget.dataset.cardIndex);
    if (playerIndex === 0) {
      if (selectAttacker(this.game, 0, cardIndex)) this.updateView();
      return;
    }
    if (playerIndex !== 1 || this.game.selectedCardIdx === null) return;

    const events = playPlayerAttack(this.game, 1, cardIndex);
    if (events.length === 0) return;
    this.addEvents(events);
    this.updateView();

    if (this.game.currentPlayerIdx === 1 && !this.game.gameOver) {
      this.aiTimer = setTimeout(() => this.runAiTurn(), 600);
    }
  },

  runAiTurn() {
    this.aiTimer = null;
    const events = playAiTurn(this.game);
    if (events.length === 0) return;
    this.addEvents(events);
    this.updateView();
  },

  addEvents(events) {
    events.forEach((event) => {
      if (event.type === 'attack') {
        const attacker = this.game.players[event.attackerPlayerIdx];
        const target = this.game.players[event.targetPlayerIdx];
        const attackerCard = attacker.cards[event.attackerCardIdx];
        const targetCard = target.cards[event.targetCardIdx];
        this.addLog(
          `${attacker.name} 的 ${attackerCard.name} 攻击 ${target.name} 的 ${targetCard.name}，造成 ${event.damage} 点伤害。`,
          event.killedCardName ? 'kill' : 'hit',
        );
        if (event.killedCardName) this.addLog(`${event.killedCardName} 被击倒！`, 'kill');
      } else if (event.type === 'victory') {
        this.addLog(`战斗结束，${this.game.players[event.winnerIdx].name} 获胜！`, 'result');
      }
    });
  },

  addLog(message, tone) {
    const entry = { id: `log-${this.logSequence++}`, message, tone };
    this.logEntries = [...this.logEntries, entry].slice(-40);
    this.setData({
      logs: this.logEntries,
      logScrollTarget: entry.id,
    });
  },

  onReset() {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.aiTimer = null;
    this.game = createGame();
    this.logEntries = [];
    this.logSequence = 0;
    this.addLog('新战斗开始，轮到你行动。', 'info');
    this.updateView();
  },
});
