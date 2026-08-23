const storage = require('../../utils/storage');

const TABS = [
  { key: 'progress', name: '进度类' },
  { key: 'checkin', name: '打卡坚持类' },
  { key: 'behavior', name: '行为成就类' },
];

Page({
  data: {
    tabs: TABS,
    currentTab: 'progress',
    badges: [],
    filteredBadges: [],
    showBadgeDetail: false,
    activeBadge: null,
    sharingBadgeId: '',
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    wx.showLoading({ title: '加载中' });
    storage.syncBadgeState()
      .then((res) => {
        this.setData({ badges: res.badges }, () => this.refreshFiltered());
      })
      .catch((err) => {
        wx.showToast({ title: '加载失败', icon: 'none' });
        console.warn('徽章图鉴加载失败', err);
      })
      .finally(() => wx.hideLoading());
  },

  refreshFiltered() {
    const filteredBadges = (this.data.badges || []).filter((badge) => badge.category === this.data.currentTab);
    this.setData({ filteredBadges });
  },

  switchTab(e) {
    this.setData({ currentTab: e.currentTarget.dataset.tab }, () => this.refreshFiltered());
  },

  openBadge(e) {
    const badge = this.data.filteredBadges.find((item) => item.id === e.currentTarget.dataset.id);
    if (!badge) return;
    if (!badge.unlocked) {
      wx.showToast({ title: '暂未达成解锁条件，继续努力吧', icon: 'none' });
      return;
    }

    const openModal = () => {
      this.setData({ showBadgeDetail: true, activeBadge: Object.assign({}, badge, { isViewed: true }) });
    };

    if (badge.isViewed !== false) {
      openModal();
      return;
    }

    storage.syncBadgeState({ markViewedIds: [badge.id] })
      .then((res) => {
        this.setData({ badges: res.badges }, () => {
          this.refreshFiltered();
          openModal();
        });
      })
      .catch(() => openModal());
  },

  closeBadgeDetail() {
    this.setData({ showBadgeDetail: false, activeBadge: null, sharingBadgeId: '' });
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
      (this.data.activeBadge && this.data.activeBadge.id) || '';
    this.setData({ sharingBadgeId: badgeId });
  },

  onShareAppMessage() {
    const shareBadgeId = this.data.sharingBadgeId;
    const badge = (this.data.badges || []).find((item) => item.id === shareBadgeId);
    return {
      title: '我解锁了一枚超酷攒钱徽章！',
      desc: '坚持存钱，慢慢变富，一起来打卡攒钱吧～',
      path: '/pages/index/index',
      success: () => {
        if (!badge || !badge.id) return;
        storage.recordBadgeShare(badge.id).then((res) => {
          if (res.rewarded) wx.showToast({ title: '+10 积分', icon: 'success' });
        });
      },
    };
  },
});
