'use strict';

const {
  createGame,
  playAiTurn,
  playPlayerAttack,
  selectAttacker,
  useSelectedCardSkill,
} = require('../../game');
const { getCardPresentation } = require('../../data/cards');

function decorateCard(card, playerIndex, cardIndex, game, skillTargeting) {
  const hpPercent = Math.round((card.hp / card.maxHp) * 100);
  const canSelect = playerIndex === 0 && game.currentPlayerIdx === 0 && !game.gameOver && card.hp > 0;
  const canTarget = playerIndex === 1
    && game.currentPlayerIdx === 0
    && game.selectedCardIdx !== null
    && !game.gameOver
    && card.hp > 0;
  const isSelected = playerIndex === 0 && game.selectedCardIdx === cardIndex;
  const targetLabel = skillTargeting ? '可选为技能目标' : '可选为攻击目标';
  const skillStatus = !card.skill
    ? ''
    : card.skill.used
      ? '已用'
      : card.hp > 0 && !game.gameOver
        ? '可用'
        : '不可用';
  const skillLabel = card.skill
    ? `${card.skill.name} · ${skillStatus}`
    : '';
  const skillAnnouncement = card.skill
    ? `，技能 ${card.skill.name} ${skillStatus}`
    : '';
  return {
    ...card,
    ...getCardPresentation(card.name),
    hpPercent,
    isDead: card.hp <= 0,
    isSelected,
    canSelect,
    canTarget,
    hoverClass: canSelect || canTarget ? 'card-pressed' : 'none',
    ariaLabel: `${card.name}，攻击 ${card.attack}，生命 ${card.hp}/${card.maxHp}${card.hp <= 0 ? '，已倒下' : isSelected ? '，已选为攻击者' : canTarget ? `，${targetLabel}` : canSelect ? '，可选为攻击者' : ''}${skillAnnouncement}`,
    healthTone: hpPercent <= 25 ? 'critical' : hpPercent <= 50 ? 'low' : '',
    targetLabel: skillTargeting ? '技能目标' : '可攻击',
    skillLabel,
    skillTone: skillStatus !== '可用' ? 'used' : '',
  };
}

function getStatus(game, skillTargeting) {
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
  if (skillTargeting && attacker.skill) {
    return {
      turnLabel: '你的回合',
      statusText: `选择对手目标释放${attacker.skill.name}`,
      statusTone: 'target',
    };
  }
  return {
    turnLabel: '你的回合',
    statusText: `已选 ${attacker.name}，选择对手目标`,
    statusTone: 'target',
  };
}

Page({
  data: {
    players: [],
    selectedSkill: null,
    selectedCardDetail: null,
    logs: [],
    logScrollTarget: '',
    turnLabel: '你的回合',
    statusText: '',
    statusTone: 'ready',
    gameOver: false,
    skillTargeting: false,
    roundNumber: 1,
    playerActions: 0,
    damageDealt: 0,
    damageTaken: 0,
    skillsUsed: 0,
    result: null,
    isLeaving: false,
  },

  onLoad() {
    this.isVisible = true;
    this.isUnloaded = false;
    this.isLeaving = false;
    this.startBattle('选择你的卡牌，再选择对手目标发起攻击。');
  },

  onShow() {
    if (this.isUnloaded) return;
    this.isVisible = true;
    this.scheduleAiTurn();
  },

  onHide() {
    this.isVisible = false;
    this.cancelAiTurn();
  },

  onUnload() {
    this.isUnloaded = true;
    this.isVisible = false;
    this.isLeaving = false;
    this.leaveVersion = (this.leaveVersion || 0) + 1;
    this.cancelAiTurn();
  },

  startBattle(message) {
    this.cancelAiTurn();
    this.battleVersion = (this.battleVersion || 0) + 1;
    this.game = createGame();
    this.skillTargeting = false;
    this.roundNumber = 1;
    this.playerActions = 0;
    this.statistics = { damageDealt: 0, damageTaken: 0, skillsUsed: 0 };
    this.logEntries = [];
    this.logSequence = 0;
    this.addLog(message, 'info');
    this.updateView();
  },

  cancelAiTurn() {
    if (this.aiTimer !== null && this.aiTimer !== undefined) clearTimeout(this.aiTimer);
    this.aiTimer = null;
    this.aiScheduleVersion = (this.aiScheduleVersion || 0) + 1;
  },

  getHealthSnapshot() {
    return this.game.players.map((player) => player.cards.map((card) => card.hp));
  },

  updateView() {
    const players = this.game.players.map((player, playerIndex) => ({
      ...player,
      playerIndex,
      aliveCount: player.cards.filter((card) => card.hp > 0).length,
      cards: player.cards.map((card, cardIndex) => (
        decorateCard(card, playerIndex, cardIndex, this.game, this.skillTargeting)
      )),
    })).reverse();
    const selectedCard = this.game.selectedCardIdx === null
      ? null
      : this.game.players[0].cards[this.game.selectedCardIdx];
    const selectedCardDetail = selectedCard
      ? { ...selectedCard, ...getCardPresentation(selectedCard.name) }
      : null;
    const selectedSkill = selectedCard && selectedCard.skill
      ? {
        ...selectedCard.skill,
        canUse: !this.game.gameOver && this.game.currentPlayerIdx === 0 && !selectedCard.skill.used,
        isTargeted: selectedCard.skill.targetMode === 'single',
        targeting: this.skillTargeting,
        buttonLabel: selectedCard.skill.used
          ? '本局已使用'
          : this.skillTargeting
            ? '取消选择'
            : selectedCard.skill.targetMode === 'single'
              ? '选择目标'
              : '释放技能',
      }
      : null;
    const won = this.game.winnerIdx === 0;
    const result = this.game.gameOver
      ? {
        won,
        title: won ? '战斗胜利' : '战斗失利',
        subtitle: won ? '你击倒了对手的全部卡牌。' : '你的队伍已全部倒下，调整出手顺序，再战一局。',
        rounds: Math.max(1, this.playerActions),
        survivors: this.game.players[0].cards.filter((card) => card.hp > 0).length,
        ...this.statistics,
      }
      : null;
    this.setData({
      players,
      selectedSkill,
      selectedCardDetail,
      skillTargeting: this.skillTargeting,
      ...getStatus(this.game, this.skillTargeting),
      gameOver: this.game.gameOver,
      roundNumber: this.roundNumber,
      playerActions: this.playerActions,
      ...this.statistics,
      result,
      isLeaving: Boolean(this.isLeaving),
    });
  },

  onCardTap(event) {
    if (this.isUnloaded || this.isLeaving || !this.isVisible || this.game.gameOver || this.game.currentPlayerIdx !== 0) return;
    const playerIndex = Number(event.currentTarget.dataset.playerIndex);
    const cardIndex = Number(event.currentTarget.dataset.cardIndex);
    const player = this.game.players[playerIndex];
    const card = player && player.cards[cardIndex];
    if (!Number.isInteger(cardIndex) || !card || card.hp <= 0) return;
    if (playerIndex === 0) {
      if (selectAttacker(this.game, 0, cardIndex)) {
        this.skillTargeting = false;
        this.updateView();
      }
      return;
    }
    if (playerIndex !== 1 || this.game.selectedCardIdx === null) return;

    const healthBefore = this.getHealthSnapshot();
    const events = this.skillTargeting
      ? useSelectedCardSkill(this.game, cardIndex)
      : playPlayerAttack(this.game, 1, cardIndex);
    if (events.length === 0) {
      this.updateView();
      return;
    }
    this.skillTargeting = false;
    this.addEvents(events, healthBefore);
    this.updateView();
    this.scheduleAiTurn();
  },

  onUseSkill() {
    if (this.isUnloaded || this.isLeaving || !this.isVisible || this.game.gameOver || this.game.currentPlayerIdx !== 0) return;
    const selectedCard = this.game.selectedCardIdx === null
      ? null
      : this.game.players[0].cards[this.game.selectedCardIdx];
    if (!selectedCard || !selectedCard.skill || selectedCard.skill.used || this.game.gameOver) return;
    if (selectedCard.skill.targetMode === 'single') {
      this.skillTargeting = !this.skillTargeting;
      this.updateView();
      return;
    }

    const healthBefore = this.getHealthSnapshot();
    const events = useSelectedCardSkill(this.game);
    if (events.length === 0) {
      this.updateView();
      return;
    }
    this.skillTargeting = false;
    this.addEvents(events, healthBefore);
    this.updateView();
    this.scheduleAiTurn();
  },

  scheduleAiTurn() {
    if (this.isUnloaded || this.isLeaving || !this.isVisible || !this.game || this.game.gameOver || this.game.currentPlayerIdx !== 1) return;
    if (this.aiTimer !== null) return;
    const game = this.game;
    const battleVersion = this.battleVersion;
    const scheduleVersion = this.aiScheduleVersion;
    this.aiTimer = setTimeout(() => {
      if (this.game !== game || this.battleVersion !== battleVersion || this.aiScheduleVersion !== scheduleVersion) return;
      this.runAiTurn();
    }, 600);
  },

  runAiTurn() {
    this.cancelAiTurn();
    if (this.isUnloaded || this.isLeaving || !this.isVisible || !this.game || this.game.gameOver || this.game.currentPlayerIdx !== 1) return;
    const healthBefore = this.getHealthSnapshot();
    const events = playAiTurn(this.game);
    if (events.length === 0) return;
    if (!this.game.gameOver && events.some((event) => event.type === 'attack' || event.type === 'skill')) {
      this.roundNumber += 1;
    }
    this.addEvents(events, healthBefore);
    this.updateView();
  },

  addEvents(events, healthBefore) {
    const healthRemaining = healthBefore
      ? healthBefore.map((cards) => cards.slice())
      : null;
    const usedSkills = new Set();
    if (events.some((event) => (event.type === 'attack' || event.type === 'skill') && event.attackerPlayerIdx === 0)) {
      this.playerActions += 1;
    }
    events.forEach((event) => {
      if (event.type === 'attack' || event.type === 'skill') {
        const attacker = this.game.players[event.attackerPlayerIdx];
        const target = this.game.players[event.targetPlayerIdx];
        const attackerCard = attacker.cards[event.attackerCardIdx];
        const targetCard = target.cards[event.targetCardIdx];
        const effectiveDamage = healthRemaining
          ? Math.min(event.damage, Math.max(0, healthRemaining[event.targetPlayerIdx][event.targetCardIdx]))
          : event.damage;
        if (healthRemaining) {
          healthRemaining[event.targetPlayerIdx][event.targetCardIdx] -= effectiveDamage;
        }
        if (event.attackerPlayerIdx === 0) {
          this.statistics.damageDealt += effectiveDamage;
          if (event.type === 'skill') usedSkills.add(`${event.attackerCardIdx}:${event.skillName}`);
        } else {
          this.statistics.damageTaken += effectiveDamage;
        }
        const action = event.type === 'skill' ? `施放 ${event.skillName} 攻击` : '攻击';
        this.addLog(
          `${attacker.name} 的 ${attackerCard.name} ${action} ${target.name} 的 ${targetCard.name}，造成 ${event.damage} 点伤害。`,
          event.killedCardName ? 'kill' : 'hit',
        );
        if (event.killedCardName) this.addLog(`${event.killedCardName} 被击倒！`, 'kill');
      } else if (event.type === 'victory') {
        this.addLog(`战斗结束，${this.game.players[event.winnerIdx].name} 获胜！`, 'result');
      }
    });
    this.statistics.skillsUsed += usedSkills.size;
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
    if (this.isUnloaded || this.isLeaving) return;
    this.startBattle('新战斗开始，轮到你行动。');
  },

  onLeave() {
    if (this.isUnloaded || this.isLeaving || typeof wx === 'undefined' || typeof wx.reLaunch !== 'function') return;
    const navigation = wx;
    this.isLeaving = true;
    this.setData({ isLeaving: true });
    this.cancelAiTurn();
    this.leaveVersion = (this.leaveVersion || 0) + 1;
    const leaveVersion = this.leaveVersion;
    const recover = () => {
      if (this.isUnloaded || this.leaveVersion !== leaveVersion || !this.isLeaving) return;
      this.isLeaving = false;
      this.setData({ isLeaving: false });
      this.scheduleAiTurn();
      if (typeof navigation.showToast === 'function') {
        navigation.showToast({ title: '返回首页失败，请重试', icon: 'none' });
      }
    };
    try {
      navigation.reLaunch({
        url: '/pages/home/home',
        success: () => {
          if (this.leaveVersion === leaveVersion && this.isLeaving) this.onUnload();
        },
        fail: recover,
      });
    } catch (error) {
      recover();
    }
  },
});
