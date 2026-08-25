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

  _lastRenderedVersion: -1, // ✅ 新增：页面级版本记录（用于智能刷新）

  onShow() {
    // ✅ 智能刷新：只有数据版本变化才重新请求
    const app = getApp();
    const currentVersion = app.globalData._dataVersion || 0;

    if (currentVersion !== this._lastRenderedVersion) {
      console.log(`[SmartRefresh] 我的页面数据版本变化 (${this._lastRenderedVersion} → ${currentVersion})，执行刷新`);
      this.loadData();
      this._lastRenderedVersion = currentVersion;
    } else {
      // 版本未变，尝试使用缓存快速渲染
      console.log(`[SmartRefresh] 我的页面数据版本未变 (${currentVersion})，尝试缓存渲染`);
      this.tryRenderFromCache();
    }
  },

  /**
   * ✅ 新增：从缓存快速渲染
   */
  tryRenderFromCache() {
    const cachedState = storage.getCachedState && storage.getCachedState();
    if (cachedState) {
      const user = cachedState.user || {};
      const plans = cachedState.plans || [];
      const stats = statsUtil.getUserStats(plans);
      stats.planCount = plans.length;
      const badges = badgesUtil.getBadges(stats);

      // 静默更新
      this.setData({
        user,
        stats,
        badges,
        cloudLogin: storage.getLoginState(),
      });
      console.log(`[SmartRefresh] 我的页面已从缓存渲染`);
    }
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
    // ✅ 优化：使用 forceRefresh 强制刷新缓存，但只请求1次（修复原来重复调用2次的bug）
    storage.getState(true)
      .then((state) => {
        // ✅ 关键优化：直接使用返回的数据渲染，不再调用 loadData（避免第2次冗余请求）
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

  /**
   * 分享个人主页给朋友
   */
  onShareAppMessage() {
    const { stats, badges } = this.data;
    const savingDays = stats.savingDays || 0;
    const planCount = stats.planCount || 0;
    const badgeCount = (badges || []).filter((b) => b.earned).length;

    return {
      title: `我已坚持存钱 ${savingDays} 天，获得 ${badgeCount} 个成就徽章`,
      path: '/pages/index/index',
      imageUrl: '',
    };
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '每日存钱打卡，养成理财好习惯',
      query: '',
      imageUrl: '',
    };
  },
});
