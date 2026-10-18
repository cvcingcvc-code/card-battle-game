'use strict';

const CARD_PRESENTATIONS = {
  龙: {
    id: 'dragon', art: '/assets/cards/dragon.png', role: '炎息守护', tag: '群体技能',
    description: '以坚韧的生命守住战线。龙焰能同时灼烧所有敌人，适合在敌军齐整时使用。',
  },
  精灵射手: {
    id: 'archer', art: '/assets/cards/archer.png', role: '逐风猎手', tag: '精准爆发',
    description: '攻击凌厉，生命脆弱。精准射击能对指定敌人造成重创，选择目标决定战局。',
  },
  石像鬼: {
    id: 'gargoyle', art: '/assets/cards/gargoyle.png', role: '岩翼卫士', tag: '坚实防线',
    description: '从古老城墙苏醒的守卫。没有主动技能，却能以坚实身躯为队友争取行动机会。',
  },
  骑士: {
    id: 'knight', art: '/assets/cards/knight.png', role: '铁誓先锋', tag: '持续威胁',
    description: '攻守均衡的前线战士。若放任他留在战场，稳定的攻击会逐渐压垮你的阵线。',
  },
  暗影刺客: {
    id: 'assassin', art: '/assets/cards/assassin.png', role: '暮影利刃', tag: '高攻低血',
    description: '生命不高，攻击却最为凶险。及早削减他的威胁，往往比追求总伤害更重要。',
  },
  巨魔: {
    id: 'troll', art: '/assets/cards/troll.png', role: '荒原巨兽', tag: '范围震地',
    description: '生命顽强的荒原守军。当范围伤害更有收益时，他会用震地袭击所有存活的队员。',
  },
};

function getCardPresentation(name) {
  return CARD_PRESENTATIONS[name] || { id: '', art: '', role: '战场单位', tag: '', description: '' };
}

module.exports = { CARD_PRESENTATIONS, getCardPresentation };
