'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createGame, getBattleModes, getBlessings, isPlayerAlive,
  selectAttacker, playPlayerAttack, useSelectedCardSkill, playAiTurn,
} = require('../game');

function values(game, playerIndex, key) {
  return game.players[playerIndex].cards.map((card) => card[key]);
}

function attack(game, attackerIndex, targetIndex) {
  assert.equal(selectAttacker(game, 0, attackerIndex), true);
  return playPlayerAttack(game, 1, targetIndex);
}

test('mode and blessing catalogs return independent descriptions and never configure later games by reference', () => {
  const modes = getBattleModes();
  const blessings = getBlessings();
  assert.deepEqual(modes.map((mode) => [mode.id, mode.name]), [
    ['classic', '经典对决'], ['swift', '疾风试炼'], ['bastion', '铁壁试炼'],
  ]);
  assert.deepEqual(blessings.map((blessing) => [blessing.id, blessing.name]), [
    ['blade', '利刃'], ['vitality', '活力'], ['arcane', '灵火'],
  ]);
  [...modes, ...blessings].forEach((entry) => assert.ok(entry.description.length > 0));
  modes[1].attackBonus = 1000;
  modes[0].name = 'changed';
  modes.pop();
  blessings[0].attackBonus = 1000;
  blessings[1].description = 'changed';
  blessings.pop();
  assert.equal(getBattleModes().length, 3);
  assert.equal(getBattleModes()[0].name, '经典对决');
  assert.equal(getBlessings().length, 3);
  assert.notEqual(getBlessings()[1].description, 'changed');
  assert.deepEqual(values(createGame({ modeId: 'swift' }), 0, 'attack'), [26, 41, 21]);
});

test('defaults, unsupported identifiers, and classic blessings are normalized predictably', () => {
  assert.deepEqual(createGame(), createGame({}));
  for (const modeId of ['classic', 'unknown', '__proto__', 'constructor', null]) {
    const game = createGame({ modeId, blessingId: 'arcane' });
    assert.equal(game.modeId, 'classic');
    assert.equal(game.blessingId, null);
    assert.deepEqual(values(game, 0, 'attack'), [15, 30, 10]);
    assert.deepEqual(values(game, 0, 'hp'), [100, 40, 80]);
    assert.equal(game.players[0].cards[0].skill.damage, 12);
  }
  for (const modeId of ['swift', 'bastion']) {
    for (const blessingId of [undefined, 'unknown', '__proto__', 'constructor', null]) {
      const game = createGame({ modeId, blessingId });
      assert.equal(game.modeId, modeId);
      assert.equal(game.blessingId, 'blade');
    }
  }
});

for (const modeId of ['classic', 'swift', 'bastion']) {
  for (const blessingId of ['blade', 'vitality', 'arcane']) {
    test(`${modeId} with ${blessingId} applies only its documented starting bonuses`, () => {
      const game = createGame({ modeId, blessingId });
      const attackBonus = (modeId === 'swift' ? 6 : 0) + (modeId !== 'classic' && blessingId === 'blade' ? 5 : 0);
      const hpBonus = modeId !== 'classic' && blessingId === 'vitality' ? 20 : 0;
      const skillBonus = modeId !== 'classic' && blessingId === 'arcane' ? 8 : 0;
      assert.equal(game.modeId, modeId);
      assert.equal(game.blessingId, modeId === 'classic' ? null : blessingId);
      assert.deepEqual(values(game, 0, 'attack'), [15 + attackBonus, 30 + attackBonus, 10 + attackBonus]);
      assert.deepEqual(values(game, 1, 'attack'), modeId === 'swift' ? [31, 46, 18] : [25, 40, 12]);
      assert.deepEqual(values(game, 0, 'hp'), [100 + hpBonus, 40 + hpBonus, 80 + hpBonus]);
      assert.deepEqual(values(game, 0, 'maxHp'), values(game, 0, 'hp'));
      assert.deepEqual(values(game, 1, 'hp'), [60, 25, 90]);
      assert.deepEqual(values(game, 1, 'maxHp'), [60, 25, 90]);
      game.players.forEach((player) => assert.deepEqual(player.cards.map((card) => card.shield), Array(3).fill(modeId === 'bastion' ? 18 : 0)));
      assert.equal(game.players[0].cards[0].skill.damage, 12 + skillBonus);
      assert.equal(game.players[0].cards[1].skill.damage, 50 + skillBonus);
      assert.equal(game.players[0].cards[0].skill.description, `对所有存活敌人造成 ${12 + skillBonus} 点伤害`);
      assert.equal(game.players[0].cards[1].skill.description, `对选定敌人造成 ${50 + skillBonus} 点伤害`);
      assert.equal(game.players[0].cards[2].skill, undefined);
      assert.equal(game.players[1].cards[2].skill.damage, 18);
      assert.equal(game.players[1].cards[2].skill.description, '对所有存活敌人造成 18 点伤害');
      assert.equal(game.currentPlayerIdx, 0);
      assert.equal(game.selectedCardIdx, null);
      assert.equal(game.gameOver, false);
    });
  }
}

test('different matches never share cards, shield values, health bonuses, or modified skills', () => {
  const changed = createGame({ modeId: 'bastion', blessingId: 'arcane' });
  changed.players[0].cards[0].skill.damage = 999;
  changed.players[0].cards[0].skill.used = true;
  changed.players[0].cards[0].shield = 999;
  changed.players[0].cards[0].hp = 0;
  const next = createGame({ modeId: 'bastion', blessingId: 'arcane' });
  assert.notEqual(next.players[0].cards[0], changed.players[0].cards[0]);
  assert.notEqual(next.players[0].cards[0].skill, changed.players[0].cards[0].skill);
  assert.equal(next.players[0].cards[0].skill.damage, 20);
  assert.equal(next.players[0].cards[0].skill.used, false);
  assert.equal(next.players[0].cards[0].shield, 18);
  assert.equal(next.players[0].cards[0].hp, 100);
  assert.deepEqual(values(createGame({ modeId: 'swift', blessingId: 'vitality' }), 0, 'hp'), [120, 60, 100]);
  assert.deepEqual(values(createGame(), 0, 'hp'), [100, 40, 80]);
  assert.equal(createGame().players[0].cards[0].skill.damage, 12);
});

test('classic attack and skill event structures remain exactly compatible', () => {
  const game = createGame({ blessingId: 'arcane' });
  assert.deepEqual(attack(game, 1, 1), [{
    type: 'attack', attackerPlayerIdx: 0, attackerCardIdx: 1,
    targetPlayerIdx: 1, targetCardIdx: 1, damage: 30, killedCardName: '暗影刺客',
  }]);
  const skillGame = createGame();
  selectAttacker(skillGame, 0, 0);
  assert.deepEqual(useSelectedCardSkill(skillGame)[0], {
    type: 'skill', skillName: '龙焰', attackerPlayerIdx: 0, attackerCardIdx: 0,
    targetPlayerIdx: 1, targetCardIdx: 0, damage: 12, killedCardName: null,
  });
});

test('normal attacks consume shield before health, spend a turn when fully blocked, and omit zero absorption fields', () => {
  const game = createGame({ modeId: 'bastion', blessingId: 'blade' });
  let events = attack(game, 2, 0);
  assert.equal(events[0].damage, 0);
  assert.equal(events[0].blockedDamage, 15);
  assert.equal(events[0].killedCardName, null);
  assert.equal(game.players[1].cards[0].hp, 60);
  assert.equal(game.players[1].cards[0].shield, 3);
  assert.equal(game.selectedCardIdx, null);
  assert.equal(game.currentPlayerIdx, 1);
  game.currentPlayerIdx = 0;
  events = attack(game, 1, 0);
  assert.equal(events[0].damage, 32);
  assert.equal(events[0].blockedDamage, 3);
  assert.equal(game.players[1].cards[0].hp, 28);
  assert.equal(game.players[1].cards[0].shield, 0);
  game.currentPlayerIdx = 0;
  events = attack(game, 0, 0);
  assert.equal(events[0].damage, 20);
  assert.equal(Object.hasOwn(events[0], 'blockedDamage'), false);
  assert.equal(game.players[1].cards[0].hp, 8);
});

test('shield-adjusted event damage preserves overkill while card health and shield stay nonnegative', () => {
  const game = createGame({ modeId: 'bastion', blessingId: 'vitality' });
  game.players[1].cards[1].hp = 5;
  const events = attack(game, 1, 1);
  assert.equal(events[0].damage, 12, '30 attack minus 18 shield, without capping at 5 HP');
  assert.equal(events[0].blockedDamage, 18);
  assert.equal(events[0].killedCardName, '暗影刺客');
  assert.equal(game.players[1].cards[1].hp, 0);
  assert.equal(game.players[1].cards[1].shield, 0);
  assert.equal(game.gameOver, false);
});

test('area skills resolve each target shield independently and are spent even when fully blocked', () => {
  const game = createGame({ modeId: 'bastion' });
  game.players[1].cards[1].shield = 6;
  game.players[1].cards[2].shield = 0;
  selectAttacker(game, 0, 0);
  const events = useSelectedCardSkill(game);
  assert.deepEqual(events.map((event) => event.damage), [0, 6, 12]);
  assert.equal(events[0].blockedDamage, 12);
  assert.equal(events[1].blockedDamage, 6);
  assert.equal(Object.hasOwn(events[2], 'blockedDamage'), false);
  assert.deepEqual(values(game, 1, 'shield'), [6, 0, 0]);
  assert.deepEqual(values(game, 1, 'hp'), [60, 19, 78]);
  assert.equal(game.players[0].cards[0].skill.used, true);
  assert.equal(game.currentPlayerIdx, 1);
  game.currentPlayerIdx = 0;
  selectAttacker(game, 0, 0);
  assert.deepEqual(useSelectedCardSkill(game), []);

  const fullyBlocked = createGame({ modeId: 'bastion' });
  selectAttacker(fullyBlocked, 0, 0);
  assert.deepEqual(useSelectedCardSkill(fullyBlocked).map((event) => event.damage), [0, 0, 0]);
  assert.equal(fullyBlocked.players[0].cards[0].skill.used, true);
  assert.equal(fullyBlocked.currentPlayerIdx, 1);
  assert.equal(fullyBlocked.gameOver, false);
});

test('arcane modifies skill execution and descriptions while single-target shield damage stays local', () => {
  const game = createGame({ modeId: 'bastion', blessingId: 'arcane' });
  selectAttacker(game, 0, 1);
  const events = useSelectedCardSkill(game, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].damage, 40, '58 skill damage minus 18 shield');
  assert.equal(events[0].blockedDamage, 18);
  assert.deepEqual(values(game, 1, 'hp'), [20, 25, 90]);
  assert.deepEqual(values(game, 1, 'shield'), [0, 18, 18]);
  assert.equal(game.players[0].cards[1].skill.used, true);
  const areaGame = createGame({ modeId: 'bastion', blessingId: 'arcane' });
  selectAttacker(areaGame, 0, 0);
  assert.deepEqual(useSelectedCardSkill(areaGame).map((event) => event.damage), [2, 2, 2]);
  assert.deepEqual(values(areaGame, 1, 'hp'), [58, 23, 88]);
});

test('dead cards with remaining shields cannot attack, be targeted by skills, prevent victory, or revive', () => {
  const game = createGame({ modeId: 'bastion', blessingId: 'arcane' });
  game.players[1].cards[1].hp = 0;
  game.players[1].cards[0].hp = 1;
  game.players[1].cards[2].hp = 1;
  selectAttacker(game, 0, 1);
  assert.deepEqual(useSelectedCardSkill(game, 1), []);
  assert.equal(game.players[0].cards[1].skill.used, false);
  selectAttacker(game, 0, 0);
  const events = useSelectedCardSkill(game);
  assert.deepEqual(events.filter((event) => event.type === 'skill').map((event) => event.targetCardIdx), [0, 2]);
  assert.equal(game.players[1].cards[1].shield, 18);
  assert.equal(game.players[1].cards[1].hp, 0);
  assert.equal(isPlayerAlive(game.players[1]), false);
  assert.deepEqual(events.at(-1), { type: 'victory', winnerIdx: 0 });
  assert.deepEqual(playAiTurn(game), []);
  assert.deepEqual(playPlayerAttack(game, 1, 0), []);
  assert.deepEqual(useSelectedCardSkill(game, 0), []);
  assert.deepEqual(values(game, 1, 'hp'), [0, 0, 0]);

  const aiGame = createGame({ modeId: 'bastion' });
  aiGame.currentPlayerIdx = 1;
  aiGame.players[1].cards[1].hp = 0;
  aiGame.players[1].cards[2].hp = 0;
  const aiEvents = playAiTurn(aiGame);
  assert.equal(aiEvents[0].attackerCardIdx, 0);
  assert.equal(selectAttacker({ ...aiGame, currentPlayerIdx: 0 }, 0, 99), false);
  aiGame.players[0].cards[0].hp = 0;
  assert.equal(selectAttacker(aiGame, 0, 0), false);
});

test('AI chooses the least combined health and shield, preserving the original tie order', () => {
  for (const [shields, expectedTarget] of [[[30, 0, 99], 1], [[10, 0, 99], 0]]) {
    const game = createGame({ modeId: 'bastion' });
    game.currentPlayerIdx = 1;
    game.players[1].cards[2].skill.used = true;
    game.players[0].cards.forEach((card, index) => { card.hp = [10, 20, 0][index]; card.shield = shields[index]; });
    const events = playAiTurn(game);
    assert.equal(events[0].type, 'attack');
    assert.equal(events[0].attackerCardIdx, 1);
    assert.equal(events[0].targetCardIdx, expectedTarget);
    assert.equal(game.players[0].cards[2].shield, 99, 'dead card shields are excluded');
  }
});

test('AI values shield removal in area skills even when no HP is lost', () => {
  const game = createGame({ modeId: 'bastion', blessingId: 'vitality' });
  game.currentPlayerIdx = 1;
  const events = playAiTurn(game);
  assert.deepEqual(events.map((event) => event.type), ['skill', 'skill', 'skill']);
  assert.deepEqual(events.map((event) => event.damage), [0, 0, 0]);
  assert.deepEqual(events.map((event) => event.blockedDamage), [18, 18, 18]);
  assert.deepEqual(values(game, 0, 'hp'), [120, 60, 100]);
  assert.deepEqual(values(game, 0, 'shield'), [0, 0, 0]);
  assert.equal(game.players[1].cards[2].skill.used, true);
  assert.equal(game.currentPlayerIdx, 0);
  assert.equal(game.gameOver, false);
});

test('AI area-skill advantage compares combined durability at the exact ten-point threshold', () => {
  for (const [shield, expectedType] of [[9, 'skill'], [8, 'attack']]) {
    const game = createGame({ modeId: 'bastion' });
    game.currentPlayerIdx = 1;
    game.players[0].cards.forEach((card, index) => { card.hp = [1, 1, 0][index]; card.shield = [shield, 0, 99][index]; });
    const events = playAiTurn(game);
    assert.equal(events[0].type, expectedType);
    assert.equal(game.players[1].cards[2].skill.used, expectedType === 'skill');
    if (expectedType === 'skill') {
      assert.equal(game.gameOver, true);
      assert.equal(game.winnerIdx, 1);
      assert.deepEqual(events.at(-1), { type: 'victory', winnerIdx: 1 });
    } else {
      assert.equal(events[0].targetCardIdx, 1);
      assert.equal(game.gameOver, false);
      assert.equal(game.players[0].cards[0].hp, 1);
      assert.equal(game.players[0].cards[0].shield, 8);
    }
    assert.equal(game.players[0].cards[2].shield, 99);
  }
});

function pick(cards, score, higher) {
  return cards.reduce((best, card, index) => card.hp <= 0 ? best : best < 0
    || (higher ? score(card) > score(cards[best]) : score(card) < score(cards[best])) ? index : best, -1);
}

for (const winning of [true, false]) {
  test(`classic ${winning ? 'winning' : 'losing'} strategy retains its complete original match`, () => {
    const game = createGame();
    let turns = 0;
    while (!game.gameOver && turns++ < 30) {
      const own = game.players[0].cards;
      const enemy = game.players[1].cards;
      if (winning && own[1].hp > 0 && !own[1].skill.used) {
        selectAttacker(game, 0, 1);
        useSelectedCardSkill(game, pick(enemy, (card) => card.hp, true));
      } else if (winning && own[0].hp > 0 && !own[0].skill.used && enemy.filter((card) => card.hp > 0).length > 1) {
        selectAttacker(game, 0, 0);
        useSelectedCardSkill(game);
      } else {
        attack(game, pick(own, (card) => card.attack, winning), pick(enemy, (card) => card.hp, !winning));
      }
      playAiTurn(game);
    }
    assert.equal(game.gameOver, true);
    assert.equal(turns, winning ? 9 : 7);
    assert.equal(game.winnerIdx, winning ? 0 : 1);
    assert.deepEqual(game.players.map((player) => player.cards.map((card) => card.hp)), winning
      ? [[7, 0, 0], [0, 0, 0]] : [[0, 0, 0], [35, 25, 30]]);
  });
}

test('all trial and blessing combinations finish with no negative durability or resurrection', () => {
  for (const modeId of ['swift', 'bastion']) {
    for (const blessingId of ['blade', 'vitality', 'arcane']) {
      const game = createGame({ modeId, blessingId });
      let turns = 0;
      while (!game.gameOver && turns++ < 100) {
        const before = game.players.map((player) => player.cards.map((card) => ({ hp: card.hp, shield: card.shield })));
        const own = game.players[0].cards;
        const enemy = game.players[1].cards;
        const attackerIndex = pick(own, (card) => card.attack, true);
        const targetIndex = pick(enemy, (card) => card.hp + card.shield, false);
        selectAttacker(game, 0, attackerIndex);
        const attacker = own[attackerIndex];
        const events = attacker.skill && !attacker.skill.used
          ? useSelectedCardSkill(game, targetIndex)
          : playPlayerAttack(game, 1, targetIndex);
        events.push(...playAiTurn(game));
        events.filter((event) => event.type !== 'victory').forEach((event) => {
          assert.ok(event.damage >= 0);
          if (Object.hasOwn(event, 'blockedDamage')) assert.ok(event.blockedDamage > 0);
        });
        game.players.forEach((player, playerIndex) => player.cards.forEach((card, cardIndex) => {
          assert.ok(card.hp >= 0 && card.shield >= 0);
          assert.ok(card.hp <= before[playerIndex][cardIndex].hp);
          assert.ok(card.shield <= before[playerIndex][cardIndex].shield);
          if (card.hp < before[playerIndex][cardIndex].hp) assert.equal(card.shield, 0);
        }));
      }
      assert.equal(game.gameOver, true, `${modeId}/${blessingId} must finish`);
      assert.equal(isPlayerAlive(game.players[game.winnerIdx]), true);
      assert.equal(isPlayerAlive(game.players[1 - game.winnerIdx]), false);
      assert.deepEqual(playAiTurn(game), []);
    }
  }
});
