class Battle {
  constructor(player1, player2) {
    this.player1 = player1;
    this.player2 = player2;
    this.round = 0;
  }

  pickAttacker(player) {
    return player.aliveCards().reduce((best, c) =>
      c.attack > best.attack ? c : best
    );
  }

  pickTarget(player) {
    return player.aliveCards().reduce((lowest, c) =>
      c.hp < lowest.hp ? c : lowest
    );
  }

  // 序列化卡牌快照
  _snapshot(player) {
    return {
      name: player.name,
      cards: player.cards.map((c) => ({
        name: c.name,
        attack: c.attack,
        hp: c.hp,
        maxHp: c.maxHp,
        alive: c.isAlive(),
      })),
    };
  }

  _initialState() {
    return {
      player1: this._snapshot(this.player1),
      player2: this._snapshot(this.player2),
    };
  }

  runWithSteps() {
    const steps = [];
    const initialState = this._initialState();

    let attacker = this.player1;
    let defender = this.player2;

    while (this.player1.isAlive() && this.player2.isAlive()) {
      this.round++;

      const attackCard = this.pickAttacker(attacker);
      const targetCard = this.pickTarget(defender);

      const damage = attackCard.attack;
      targetCard.takeDamage(damage);
      const killed = targetCard.isAlive() ? null : targetCard.name;

      steps.push({
        round: this.round,
        attackerPlayer: attacker.name,
        attackerCard: attackCard.name,
        attackerAtk: attackCard.attack,
        targetPlayer: defender.name,
        targetCard: targetCard.name,
        damage,
        killed,
        state: {
          player1: this._snapshot(this.player1),
          player2: this._snapshot(this.player2),
        },
      });

      [attacker, defender] = [defender, attacker];
    }

    const winner = this.player1.isAlive() ? this.player1 : this.player2;

    return {
      initialState,
      steps,
      winner: winner.name,
      survivors: winner.aliveCards().map((c) => c.name),
      totalRounds: this.round,
    };
  }

  // 兼容旧接口
  run() {
    const result = this.runWithSteps();
    const log = [];
    log.push('=== 战斗开始 ===');
    log.push(`玩家A:\n` + result.initialState.player1.cards.map((c) =>
      `  ${c.name} [ATK:${c.attack} HP:${c.hp}/${c.maxHp}]`).join('\n'));
    log.push(`玩家B:\n` + result.initialState.player2.cards.map((c) =>
      `  ${c.name} [ATK:${c.attack} HP:${c.hp}/${c.maxHp}]`).join('\n'));

    for (const s of result.steps) {
      log.push(`--- 第 ${s.round} 回合 ---`);
      log.push(`[${s.attackerPlayer}] ${s.attackerCard} 攻击 [${s.targetPlayer}] ${s.targetCard}，造成 ${s.damage} 点伤害`);
      if (s.killed) log.push(`${s.killed} 被击倒！`);
    }
    log.push('=== 战斗结束 ===');
    log.push(`胜利者: ${result.winner}`);
    log.push(`存活卡牌: ${result.survivors.join(', ')}`);
    log.push(`总回合数: ${result.totalRounds}`);
    return { ...result, log };
  }

  start() {
    const result = this.run();
    result.log.forEach((line) => console.log(line));
  }
}

module.exports = Battle;
