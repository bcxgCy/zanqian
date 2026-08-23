const storage = require('../../utils/storage');
const badgePoster = require('../../utils/badgePoster');

Page({
  data: {
    user: {},
    stats: {},
    badges: [],
    latestBadges: [],
    cloudLogin: {},
    showBadgeDetail: false,
    activeBadge: null,
    showUnlockPopup: false,
    unlockQueue: [],
    activeUnlockBadge: null,
    sharingBadgeId: '',
    shareImageUrl: '',
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    wx.showLoading({ title: '加载中' });
    storage.getState()
      .then((state) => {
        const user = state.user;
        const cloudLogin = storage.getLoginState();
        this.setData({ user, cloudLogin });
        return storage.syncBadgeState();
      })
      .then((badgeResult) => {
        const unseen = (badgeResult.newUnlockedBadges || []).slice().sort((a, b) =>
          (a.unlockTime || '').localeCompare(b.unlockTime || '')
        );
        this.setData({
          badges: badgeResult.badges,
          latestBadges: badgeResult.latestUnlocked,
          unlockQueue: unseen,
        }, () => {
          if (this.data.unlockQueue.length) this.playUnlockPopup();
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

  playUnlockPopup() {
    const queue = (this.data.unlockQueue || []).slice();
    if (!queue.length) {
      this.setData({ showUnlockPopup: false, activeUnlockBadge: null });
      return;
    }
    const activeUnlockBadge = queue.shift();
    this.setData({
      showUnlockPopup: true,
      activeUnlockBadge,
      unlockQueue: queue,
      sharingBadgeId: activeUnlockBadge.id,
    });
  },

  closeUnlockPopup() {
    this.setData({ showUnlockPopup: false, activeUnlockBadge: null, sharingBadgeId: '' }, () => {
      this.playUnlockPopup();
    });
  },

  openBadgeDetail(e) {
    const badgeId = e.currentTarget.dataset.id;
    const badge = (this.data.badges || []).find((item) => item.id === badgeId && item.unlocked);
    if (!badge) return;
    const needMarkViewed = badge.isViewed === false;

    const openModal = () => {
      const updated = (this.data.badges || []).map((item) => (
        item.id === badgeId ? Object.assign({}, item, { isViewed: true }) : item
      ));
      const latest = updated.filter((item) => item.unlocked)
        .sort((a, b) => (b.unlockTime || '').localeCompare(a.unlockTime || ''))
        .slice(0, 6);
      this.setData({
        badges: updated,
        latestBadges: latest,
        showBadgeDetail: true,
        activeBadge: Object.assign({}, badge, { isViewed: true }),
      });
    };

    if (!needMarkViewed) {
      openModal();
      return;
    }

    storage.syncBadgeState({ markViewedIds: [badgeId] })
      .then((res) => {
        this.setData({ badges: res.badges, latestBadges: res.latestUnlocked }, openModal);
      })
      .catch(() => openModal());
  },

  closeBadgeDetail() {
    this.setData({ showBadgeDetail: false, activeBadge: null, sharingBadgeId: '' });
  },

  noop() {},

  goBadges() {
    wx.navigateTo({ url: '/pages/badges/badges' });
  },

  saveBadgePoster() {
    wx.showToast({
      icon: 'none',
      title: '海报能力为占位实现，请替换 poster 生成逻辑',
      duration: 2200,
    });
  },

  startShareBadge(e) {
    const badgeId = (e && e.currentTarget && e.currentTarget.dataset.id) ||
      (this.data.activeBadge && this.data.activeBadge.id) ||
      (this.data.activeUnlockBadge && this.data.activeUnlockBadge.id) || '';
    this.setData({ sharingBadgeId: badgeId, shareImageUrl: '' });
    const badge = (this.data.badges || []).find((item) => item.id === badgeId);
    if (!badge) return;
    badgePoster.drawBadgeSharePoster(this, {
      badge,
      nickName: this.data.user.nickName || '存钱达人',
    }).then((tempFilePath) => {
      this.setData({ shareImageUrl: tempFilePath });
    }).catch((err) => {
      console.warn('生成徽章分享图失败', err);
    });
  },

  onShareAppMessage() {
    const shareBadgeId = this.data.sharingBadgeId;
    const badge = (this.data.badges || []).find((item) => item.id === shareBadgeId);
    return {
      title: '我解锁了徽章「' + ((badge && badge.name) || '攒钱成就') + '」！',
      desc: '坚持存钱，慢慢变富，一起来打卡攒钱吧～',
      path: '/pages/index/index',
      imageUrl: this.data.shareImageUrl || (badge && badge.image) || '',
      success: () => {
        if (!badge || !badge.id) return;
        storage.recordBadgeShare(badge.id).then((res) => {
          if (res.rewarded) {
            wx.showToast({ title: '+10 积分', icon: 'success' });
          }
        }).catch((err) => {
          console.warn('记录分享奖励失败', err);
        });
      },
      fail: () => {},
    };
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
