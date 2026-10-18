'use strict';

const { createGame } = require('../../game');
const { getCardPresentation } = require('../../data/cards');

const openingGame = createGame();

function describeCard(card) {
  return {
    ...getCardPresentation(card.name),
    name: card.name,
    attack: card.attack,
    maxHp: card.maxHp,
  };
}

const teamCards = openingGame.players[0].cards.map(describeCard);
const enemyCards = openingGame.players[1].cards.map(describeCard);
const skills = openingGame.players.reduce((allSkills, player) => {
  player.cards.forEach((card) => {
    if (card.skill) {
      allSkills.push({
        cardName: card.name,
        name: card.skill.name,
        description: card.skill.description,
      });
    }
  });
  return allSkills;
}, []);

Page({
  data: {
    isStarting: false,
    isOpeningAbout: false,
    rulesExpanded: false,
    teamCards,
    enemyCards,
    skills,
  },

  onShow() {
    this.setData({ isStarting: false, isOpeningAbout: false });
  },

  onStartBattle() {
    if (this.data.isStarting || this.data.isOpeningAbout) return;

    this.setData({ isStarting: true });
    wx.navigateTo({
      url: '/pages/index/index',
      fail: () => {
        this.setData({ isStarting: false });
        wx.showToast({ title: '未能进入战场，请重试', icon: 'none' });
      },
    });
  },

  onToggleRules() {
    this.setData({ rulesExpanded: !this.data.rulesExpanded });
  },

  onAbout() {
    if (this.data.isStarting || this.data.isOpeningAbout) return;
    this.setData({ isOpeningAbout: true });
    wx.navigateTo({
      url: '/pages/about/about',
      fail: () => {
        this.setData({ isOpeningAbout: false });
        wx.showToast({ title: '未能打开说明，请重试', icon: 'none' });
      },
    });
  },
});
