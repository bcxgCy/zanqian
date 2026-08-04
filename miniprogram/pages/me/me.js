const storage = require('../../utils/storage');
const statsUtil = require('../../utils/stats');
const badgesUtil = require('../../utils/badges');

Page({
  data: {
    user: {},
    stats: {},
    badges: [],
    cloudLogin: {},
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    wx.showLoading({ title: '加载中' });
    storage.getState()
      .then((state) => {
        const user = state.user;
        const plans = state.plans;
        const stats = statsUtil.getUserStats(plans);
        stats.planCount = plans.length;
        const badges = badgesUtil.getBadges(stats);
        this.setData({
          user,
          stats,
          badges,
          cloudLogin: storage.getLoginState(),
        });
      })
      .catch((err) => {
        wx.showToast({ title: '云端数据加载失败', icon: 'none' });
        console.warn('我的页面加载失败', err);
      })
      .finally(() => {
        wx.hideLoading();
      });
  },

  loginCloud() {
    wx.showLoading({ title: '登录中' });
    storage.getState()
      .then(() => {
        this.loadData();
        wx.showToast({ title: '登录成功', icon: 'success' });
      })
      .catch((err) => {
        wx.showModal({
          title: '登录失败',
          content: err.errMsg || err.message || '请确认云函数 dataService 已上传部署。',
          showCancel: false,
        });
      })
      .finally(() => {
        wx.hideLoading();
      });
  },

  goStatistics() {
    wx.navigateTo({ url: '/pages/statistics/statistics' });
  },

  goProfileEdit() {
    wx.navigateTo({ url: '/pages/profile-edit/profile-edit' });
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
