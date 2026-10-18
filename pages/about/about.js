'use strict';

const { name, version } = require('../../data/app.json');

Page({
  data: { name, version },

  onReturn() {
    wx.navigateBack({
      delta: 1,
      fail: () => wx.reLaunch({ url: '/pages/home/home' }),
    });
  },
});
