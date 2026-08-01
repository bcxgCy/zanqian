const storage = require('../../utils/storage');
const statsUtil = require('../../utils/stats');
const badgesUtil = require('../../utils/badges');

Page({
  data: {
    user: {},
    stats: {},
    badges: [],
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    const user = storage.getUser();
    const plans = storage.getPlans();
    const stats = statsUtil.getUserStats(plans);
    stats.planCount = plans.length;
    const badges = badgesUtil.getBadges(stats);
    this.setData({ user, stats, badges });
  },

  chooseAvatar() {
    wx.getUserProfile({
      desc: '用于展示头像昵称',
      success: (res) => {
        const user = Object.assign({}, storage.getUser(), {
          nickName: res.userInfo.nickName,
          avatarUrl: res.userInfo.avatarUrl,
        });
        storage.saveUser(user);
        this.setData({ user });
      },
      fail: () => {
        wx.showToast({ title: '授权失败', icon: 'none' });
      },
    });
  },

  goStatistics() {
    wx.navigateTo({ url: '/pages/statistics/statistics' });
  },

  goSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' });
  },

  goHelp() {
    wx.navigateTo({ url: '/pages/help/help' });
  },

  goPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },
});
