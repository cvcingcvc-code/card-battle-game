'use strict';

function createController({ rules, catalog, schedule = setTimeout, cancel = clearTimeout, onChange = () => {} }) {
  const openingGame = rules.createGame();
  let game = openingGame;
  let screen = 'home';
  let visible = true;
  let destroyed = false;
  let skillTargeting = false;
  let roundNumber = 1;
  let playerActions = 0;
  let statistics = { damageDealt: 0, damageTaken: 0, skillsUsed: 0 };
  let logs = [];
  let logSequence = 0;
  let aiTimer = null;
  let battleVersion = 0;
  let scheduleVersion = 0;

  function presentation(name) {
    if (typeof catalog === 'function') return { ...catalog(name) };
    return catalog && typeof catalog.getCardPresentation === 'function'
      ? { ...catalog.getCardPresentation(name) }
      : { id: '', art: '', role: '战场单位', tag: '', description: '' };
  }

  function describeCard(card) {
    const description = { ...card, ...presentation(card.name) };
    if (card.skill) description.skill = { ...card.skill };
    return description;
  }

  function canAct() {
    return !destroyed && visible && screen === 'battle' && !game.gameOver && game.currentPlayerIdx === 0;
  }

  function decorateCard(card, playerIndex, cardIndex) {
    const hpPercent = Math.round((card.hp / card.maxHp) * 100);
    const isSelected = playerIndex === 0 && game.selectedCardIdx === cardIndex;
    const canSelect = canAct() && playerIndex === 0 && card.hp > 0;
    const canTarget = canAct() && playerIndex === 1 && game.selectedCardIdx !== null && card.hp > 0;
    const skillStatus = !card.skill ? '' : card.skill.used ? '已用' : card.hp > 0 && !game.gameOver ? '可用' : '不可用';
    const targetLabel = skillTargeting ? '技能目标' : '可攻击';
    const aria = `${card.name}，攻击 ${card.attack}，生命 ${card.hp}/${card.maxHp}${card.hp <= 0 ? '，已倒下' : isSelected ? '，已选为攻击者' : canTarget ? `，可选为${skillTargeting ? '技能' : '攻击'}目标` : canSelect ? '，可选为攻击者' : ''}${card.skill ? `，技能 ${card.skill.name} ${skillStatus}` : ''}`;
    return {
      ...describeCard(card), cardIndex, hpPercent, isDead: card.hp <= 0, isSelected, canSelect, canTarget,
      aria, ariaLabel: aria, targetLabel,
      healthTone: hpPercent <= 25 ? 'critical' : hpPercent <= 50 ? 'low' : '',
      skillLabel: card.skill ? `${card.skill.name} · ${skillStatus}` : '',
      skillTone: skillStatus !== '可用' ? 'used' : '',
    };
  }

  function getStatus() {
    if (game.gameOver) {
      return {
        turnLabel: '战斗结束', statusText: `${game.players[game.winnerIdx].name} 获胜`,
        statusTone: game.winnerIdx === 0 ? 'victory' : 'defeat',
      };
    }
    if (game.currentPlayerIdx === 1) {
      return { turnLabel: '对手回合', statusText: '对手正在思考…', statusTone: 'waiting' };
    }
    const selected = game.players[0].cards[game.selectedCardIdx];
    if (!selected) {
      return { turnLabel: '你的回合', statusText: '选择一张己方卡牌作为攻击者', statusTone: 'ready' };
    }
    return {
      turnLabel: '你的回合', statusTone: 'target',
      statusText: skillTargeting && selected.skill
        ? `选择对手目标释放${selected.skill.name}`
        : `已选 ${selected.name}，选择对手目标`,
    };
  }

  function getView() {
    const selected = game.players[0].cards[game.selectedCardIdx];
    const selectedSkill = selected && selected.skill
      ? {
        ...selected.skill,
        canUse: canAct() && selected.hp > 0 && !selected.skill.used,
        isTargeted: selected.skill.targetMode === 'single', targeting: skillTargeting,
        buttonLabel: selected.skill.used ? '本局已使用' : skillTargeting ? '取消选择'
          : selected.skill.targetMode === 'single' ? '选择目标' : '释放技能',
      }
      : null;
    const won = game.winnerIdx === 0;
    const result = game.gameOver
      ? {
        won, title: won ? '战斗胜利' : '战斗失利',
        subtitle: won ? '你击倒了对手的全部卡牌。' : '你的队伍已全部倒下，调整出手顺序，再战一局。',
        rounds: Math.max(1, playerActions), survivors: game.players[0].cards.filter((card) => card.hp > 0).length,
        ...statistics,
      }
      : null;
    return {
      screen, roundNumber, playerActions, ...statistics, ...getStatus(),
      gameOver: game.gameOver, skillTargeting, selectedSkill,
      selectedCardDetail: selected ? describeCard(selected) : null,
      players: game.players.map((player, playerIndex) => ({
        ...player, playerIndex, aliveCount: player.cards.filter((card) => card.hp > 0).length,
        cards: player.cards.map((card, cardIndex) => decorateCard(card, playerIndex, cardIndex)),
      })).reverse(),
      logs: logs.map((entry) => ({ ...entry })), result,
      teamCards: openingGame.players[0].cards.map(describeCard),
      enemyCards: openingGame.players[1].cards.map(describeCard),
      skills: openingGame.players.reduce((skills, player) => {
        player.cards.forEach((card) => {
          if (card.skill) skills.push({ cardName: card.name, name: card.skill.name, description: card.skill.description });
        });
        return skills;
      }, []),
    };
  }

  function notify() {
    const view = getView();
    onChange(view);
    return view;
  }

  function stopAi() {
    if (aiTimer !== null) cancel(aiTimer);
    aiTimer = null;
    scheduleVersion += 1;
  }

  function canRunAi() {
    return !destroyed && visible && screen === 'battle' && !game.gameOver && game.currentPlayerIdx === 1;
  }

  function healthSnapshot() {
    return game.players.map((player) => player.cards.map((card) => card.hp));
  }

  function addLog(message, tone) {
    logs = [...logs, { id: `log-${logSequence++}`, message, tone }].slice(-40);
  }

  function addEvents(events, healthBefore) {
    const remaining = healthBefore.map((cards) => cards.slice());
    const usedSkills = new Set();
    if (events.some((event) => (event.type === 'attack' || event.type === 'skill') && event.attackerPlayerIdx === 0)) {
      playerActions += 1;
    }
    events.forEach((event) => {
      if (event.type === 'attack' || event.type === 'skill') {
        const attacker = game.players[event.attackerPlayerIdx];
        const target = game.players[event.targetPlayerIdx];
        const attackerCard = attacker.cards[event.attackerCardIdx];
        const targetCard = target.cards[event.targetCardIdx];
        const damage = Math.min(event.damage, Math.max(0, remaining[event.targetPlayerIdx][event.targetCardIdx]));
        remaining[event.targetPlayerIdx][event.targetCardIdx] -= damage;
        if (event.attackerPlayerIdx === 0) {
          statistics.damageDealt += damage;
          if (event.type === 'skill') usedSkills.add(`${event.attackerCardIdx}:${event.skillName}`);
        } else statistics.damageTaken += damage;
        const action = event.type === 'skill' ? `施放 ${event.skillName} 攻击` : '攻击';
        addLog(`${attacker.name} 的 ${attackerCard.name} ${action} ${target.name} 的 ${targetCard.name}，造成 ${event.damage} 点伤害。`, event.killedCardName ? 'kill' : 'hit');
        if (event.killedCardName) addLog(`${event.killedCardName} 被击倒！`, 'kill');
      } else if (event.type === 'victory') {
        addLog(`战斗结束，${game.players[event.winnerIdx].name} 获胜！`, 'result');
      }
    });
    statistics.skillsUsed += usedSkills.size;
  }

  function ensureAi() {
    if (!canRunAi() || aiTimer !== null) return;
    const scheduledGame = game;
    const scheduledBattle = battleVersion;
    const scheduledVersion = ++scheduleVersion;
    aiTimer = schedule(() => {
      if (scheduledGame !== game || scheduledBattle !== battleVersion || scheduledVersion !== scheduleVersion || !canRunAi()) return;
      aiTimer = null;
      scheduleVersion += 1;
      const healthBefore = healthSnapshot();
      const events = rules.playAiTurn(game);
      if (events.length === 0) return;
      if (!game.gameOver && events.some((event) => event.type === 'attack' || event.type === 'skill')) roundNumber += 1;
      addEvents(events, healthBefore);
      notify();
    }, 600);
  }

  function startBattle() {
    stopAi();
    battleVersion += 1;
    game = rules.createGame();
    screen = 'battle';
    skillTargeting = false;
    roundNumber = 1;
    playerActions = 0;
    statistics = { damageDealt: 0, damageTaken: 0, skillsUsed: 0 };
    logs = [];
    logSequence = 0;
    addLog('选择你的卡牌，再选择对手目标发起攻击。', 'info');
  }

  function moveTo(nextScreen) {
    if (screen !== nextScreen) stopAi();
    screen = nextScreen;
  }

  function playCard(action) {
    if (!canAct()) return;
    const { playerIndex, cardIndex } = action;
    if ((playerIndex !== 0 && playerIndex !== 1) || !Number.isInteger(cardIndex)) return;
    const card = game.players[playerIndex].cards[cardIndex];
    if (!card || card.hp <= 0) return;
    if (playerIndex === 0) {
      if (rules.selectAttacker(game, 0, cardIndex)) skillTargeting = false;
      return;
    }
    const selected = game.players[0].cards[game.selectedCardIdx];
    if (!selected || selected.hp <= 0) return;
    const healthBefore = healthSnapshot();
    const events = skillTargeting
      ? rules.useSelectedCardSkill(game, cardIndex)
      : rules.playPlayerAttack(game, 1, cardIndex);
    if (events.length === 0) return;
    skillTargeting = false;
    addEvents(events, healthBefore);
  }

  function useSkill() {
    if (!canAct()) return;
    const selected = game.players[0].cards[game.selectedCardIdx];
    if (!selected || selected.hp <= 0 || !selected.skill || selected.skill.used) return;
    if (selected.skill.targetMode === 'single') {
      skillTargeting = !skillTargeting;
      return;
    }
    const healthBefore = healthSnapshot();
    const events = rules.useSelectedCardSkill(game);
    if (events.length === 0) return;
    skillTargeting = false;
    addEvents(events, healthBefore);
  }

  function dispatch(action = {}) {
    if (destroyed) return getView();
    switch (action && action.type) {
      case 'start':
      case 'reset': startBattle(); break;
      case 'home': moveTo('home'); break;
      case 'rules': moveTo('rules'); break;
      case 'about': moveTo('about'); break;
      case 'logs': if (screen === 'battle') moveTo('logs'); break;
      case 'back': moveTo(screen === 'logs' ? 'battle' : 'home'); break;
      case 'card': playCard(action); break;
      case 'skill': useSkill(); break;
      default: break;
    }
    ensureAi();
    return notify();
  }

  function onHide() {
    if (destroyed) return;
    visible = false;
    stopAi();
    notify();
  }

  function onShow() {
    if (destroyed) return;
    visible = true;
    ensureAi();
    notify();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    visible = false;
    stopAi();
  }

  return { dispatch, getView, getGame: () => game, onHide, onShow, destroy };
}

module.exports = { createController };
